import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureDetachedAudio,
  ensureLoudnessNormalizedMedia,
  ensureNoiseReducedMedia,
  ensurePreviewAudioClock,
  ensureReversedPreviewAudio,
  ensureVoiceEnhancedMedia,
  measureLoudnessForNormalization,
} from "@/lib/local-store/audio-effects";

/** Quiet noise, then a tone: enough for the noise-window search and loudness measurement. */
function makeSource(file: string, tone = 440, seconds = 1) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=black:s=160x90:r=30:d=${seconds}`,
    "-f", "lavfi", "-i", `aevalsrc=if(lt(t\\,0.5)\\,0.002*random(0)\\,0.08*sin(2*PI*${tone}*t)+0.002*random(0)):s=48000:d=${seconds}`,
    "-c:v", "libx264", "-c:a", "aac", "-shortest",
    file,
  ]);
}

function withProjectsRoot<T>(root: string, run: () => T): T {
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try { return run(); } finally {
    if (previous == null) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
  }
}

/** FFmpeg, FFprobe and Python are unreachable: a call that needs any of them throws. */
function withoutFfmpeg<T>(run: () => T): T {
  const previous = process.env.PATH;
  process.env.PATH = "";
  try { return run(); } finally { process.env.PATH = previous; }
}

/** Stands in for DeepFilterNet: copies its input to the file name the real tool writes. */
function withFakeVoiceEnhancer<T>(root: string, run: () => T): T {
  const script = path.join(root, "fake-deepfilter.sh");
  fs.writeFileSync(script, '#!/bin/sh\nwhile [ "$1" != "--output-dir" ]; do shift; done\ncp "$3" "$2/original_DeepFilterNet3.wav"\n');
  fs.chmodSync(script, 0o755);
  const previous = process.env.AUDIO_ENHANCE_EXECUTABLE;
  process.env.AUDIO_ENHANCE_EXECUTABLE = script;
  try { return run(); } finally {
    if (previous == null) delete process.env.AUDIO_ENHANCE_EXECUTABLE;
    else process.env.AUDIO_ENHANCE_EXECUTABLE = previous;
  }
}

function scratch(name: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `timeline-audio-relocatable-${name}-`));
}

function treatAll(sourcePath: string) {
  const noise = ensureNoiseReducedMedia("demo", sourcePath, true);
  const voice = ensureVoiceEnhancedMedia("demo", sourcePath, true, 60);
  const loudness = ensureLoudnessNormalizedMedia("demo", sourcePath, true);
  const detached = ensureDetachedAudio("demo", sourcePath);
  const reversed = ensureReversedPreviewAudio("demo", sourcePath);
  return { noise, voice, loudness, detached, reversed };
}

/** What a caller stores or shows, without the absolute paths that differ after a move. */
function portable(result: ReturnType<typeof treatAll>) {
  const strip = (value: object | null) => value && Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "absolutePath" && key !== "previewAudioAbsolutePath"));
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, strip(value)]));
}

const SOURCE = ["demo", "media", "sources", "take.mp4"];

test("every audio treatment is reused after the projects folder moves, without FFmpeg", () => {
  const first = scratch("first");
  const moved = scratch("moved");
  try {
    makeSource(path.join(first, ...SOURCE));
    const original = withFakeVoiceEnhancer(first, () => withProjectsRoot(first, () => treatAll(path.join(first, ...SOURCE))));
    const repeated = withProjectsRoot(first, () => withoutFfmpeg(() => treatAll(path.join(first, ...SOURCE))));
    assert.deepEqual(portable(repeated), portable(original), "a cache hit answers from the output and its receipt");

    // A relocation keeps relative paths, sizes and mtimes (cp -p, Library move, profiling clone).
    fs.cpSync(path.join(first, "demo"), path.join(moved, "demo"), { recursive: true, preserveTimestamps: true });
    const listing = () => fs.readdirSync(path.join(moved, "demo", "media", "audio-effects")).sort();
    const before = listing();
    const reused = withProjectsRoot(moved, () => withoutFfmpeg(() => treatAll(path.join(moved, ...SOURCE))));
    assert.deepEqual(portable(reused), portable(original));
    assert.equal(reused.noise.absolutePath, path.join(moved, "demo", "media", original.noise.relativePath));
    assert.deepEqual(listing(), before, "nothing was rendered or re-measured");
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(moved, { recursive: true, force: true });
  }
});

test("a changed source or recipe regenerates instead of reusing", () => {
  const root = scratch("changed");
  try {
    const source = path.join(root, ...SOURCE);
    makeSource(source, 440, 1);
    const before = withFakeVoiceEnhancer(root, () => withProjectsRoot(root, () => treatAll(source)));

    makeSource(source, 660, 2);
    const after = withFakeVoiceEnhancer(root, () => withProjectsRoot(root, () => treatAll(source)));
    for (const key of ["noise", "voice", "loudness", "detached", "reversed"] as const) {
      assert.notEqual(after[key]!.relativePath, before[key]!.relativePath, key);
      assert.notDeepEqual(fs.readFileSync(after[key]!.absolutePath), fs.readFileSync(before[key]!.absolutePath), key);
    }
    assert.ok(after.reversed!.sourceDurationSeconds > 1.5, "the reversed track's receipt follows the new input");
    assert.notDeepEqual(after.loudness.measured, before.loudness.measured);

    // Recipe changes: another loudness target or voice strength is a different output.
    const quieter = withProjectsRoot(root, () => ensureLoudnessNormalizedMedia("demo", source, true, -20));
    assert.notEqual(quieter.relativePath, after.loudness.relativePath);
    assert.ok(Number(quieter.outputMeasurement.input_i) < Number(after.loudness.outputMeasurement.input_i) - 2);
    assert.throws(
      () => withProjectsRoot(root, () => withoutFfmpeg(() => ensureVoiceEnhancedMedia("demo", source, true, 40))),
      "a new strength must render, not answer from the strength-60 receipt",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("outputs and receipts are never shared between different sources", () => {
  const root = scratch("distinct");
  try {
    const one = path.join(root, ...SOURCE);
    const sameNameElsewhere = path.join(root, "demo", "media", "other", "take.mp4");
    const otherProject = path.join(root, "audition", "media", "sources", "take.mp4");
    makeSource(one);
    // Identical bytes, size and mtime: only the source's place may tell them apart.
    for (const copy of [sameNameElsewhere, otherProject]) {
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(one, copy);
      const stat = fs.statSync(one);
      fs.utimesSync(copy, stat.atime, stat.mtime);
    }
    withProjectsRoot(root, () => ensureLoudnessNormalizedMedia("demo", one, true));
    withProjectsRoot(root, () => ensureNoiseReducedMedia("demo", one, true));
    for (const copy of [sameNameElsewhere, otherProject]) {
      assert.throws(() => withProjectsRoot(root, () => withoutFfmpeg(() => ensureLoudnessNormalizedMedia("demo", copy, true))));
      assert.throws(() => withProjectsRoot(root, () => withoutFfmpeg(() => ensureNoiseReducedMedia("demo", copy, true))));
      assert.throws(() => withProjectsRoot(root, () => withoutFfmpeg(() => ensureDetachedAudio("demo", copy))));
    }
    const outputs = withProjectsRoot(root, () => [one, sameNameElsewhere, otherProject]
      .flatMap((source) => [
        ensureLoudnessNormalizedMedia("demo", source, true).relativePath,
        ensureNoiseReducedMedia("demo", source, true).relativePath,
        ensureDetachedAudio("demo", source).relativePath,
      ]));
    assert.equal(new Set(outputs).size, 9);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function legacyName(sourcePath: string, recipe: string, suffix: string, extension: string) {
  const stat = fs.statSync(sourcePath);
  const fingerprint = createHash("sha256")
    .update(`${sourcePath}\0${stat.size}\0${stat.mtimeMs}\0${recipe}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(path.dirname(sourcePath), "..", "audio-effects", `take.${fingerprint}.${suffix}${extension}`);
}

test("outputs under their old absolute-path names are linked, not re-rendered, and keep resolving", () => {
  const root = scratch("legacy");
  try {
    const source = path.join(root, ...SOURCE);
    makeSource(source);
    const detachedLegacy = path.resolve(legacyName(source, "detach-audio-v1:aac-192k", "detached-audio", ".m4a"));
    const reverseRecipe = "preview-audio-reverse-v1:areverse:aac-160k";
    const reversedLegacy = path.resolve(legacyName(source, reverseRecipe, "preview-audio-reverse", ".m4a"));
    fs.mkdirSync(path.dirname(detachedLegacy), { recursive: true });
    fs.writeFileSync(detachedLegacy, "previously detached");
    fs.writeFileSync(reversedLegacy, "previously reversed");
    fs.writeFileSync(`${reversedLegacy}.json`, JSON.stringify({ recipe: reverseRecipe, source_duration_seconds: 1 }));

    const { detached, reversed } = withProjectsRoot(root, () => withoutFfmpeg(() => ({
      detached: ensureDetachedAudio("demo", source),
      reversed: ensureReversedPreviewAudio("demo", source),
    })));
    for (const [result, legacy, bytes] of [[detached, detachedLegacy, "previously detached"], [reversed!, reversedLegacy, "previously reversed"]] as const) {
      assert.notEqual(result.absolutePath, legacy);
      assert.equal(fs.readFileSync(result.absolutePath, "utf8"), bytes);
      assert.equal(fs.statSync(result.absolutePath).ino, fs.statSync(legacy).ino);
      assert.ok(fs.existsSync(legacy), "the old name stays valid for timelines that store it");
    }
    assert.equal(reversed!.sourceDurationSeconds, 1);

    // Loudness names depend on its first-pass measurement, which still runs once to find the old file.
    const measured = measureLoudnessForNormalization(source);
    const secondPass = [
      "loudnorm=I=-16", "LRA=7", "TP=-1.5",
      `measured_I=${measured.input_i}`, `measured_LRA=${measured.input_lra}`, `measured_TP=${measured.input_tp}`,
      `measured_thresh=${measured.input_thresh}`, `offset=${measured.target_offset}`,
      "linear=true", "print_format=summary",
    ].join(":");
    const loudnessLegacy = path.resolve(legacyName(source, `narrator-loudnorm-v1:${secondPass}`, "normalized", ".mp4"));
    fs.copyFileSync(source, loudnessLegacy);
    const loudness = withProjectsRoot(root, () => ensureLoudnessNormalizedMedia("demo", source, true));
    assert.notEqual(loudness.absolutePath, loudnessLegacy);
    assert.equal(fs.statSync(loudness.absolutePath).ino, fs.statSync(loudnessLegacy).ino);
    assert.ok(fs.existsSync(loudnessLegacy));
    const again = withProjectsRoot(root, () => withoutFfmpeg(() => ensureLoudnessNormalizedMedia("demo", source, true)));
    assert.deepEqual(again.outputMeasurement, loudness.outputMeasurement);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a preview clock named with the truncated mtime (2026-10-25) is linked, not re-rendered", () => {
  const root = scratch("truncated");
  try {
    const treated = path.join(root, "demo", "media", "audio-effects", "take.normalized.mp4");
    makeSource(treated);
    // A sub-millisecond part above one half: truncating and rounding give different milliseconds.
    fs.utimesSync(treated, 1792979000.0127, 1792979000.0127);
    const stat = fs.statSync(treated);
    assert.notEqual(Math.trunc(stat.mtimeMs), Math.round(stat.mtimeMs));
    const recipe = "preview-audio-clock-v1:aac-packet-copy:timing-preserved";
    const fingerprint = createHash("sha256")
      .update(`relocatable-v1\0projects:demo/media/audio-effects/take.normalized.mp4\0${stat.size}\0${Math.trunc(stat.mtimeMs)}\0${recipe}`)
      .digest("hex")
      .slice(0, 16);
    const earlier = path.join(path.dirname(treated), `take.normalized.${fingerprint}.preview-audio.m4a`);
    fs.writeFileSync(earlier, "clock from earlier today");
    const clock = withProjectsRoot(root, () => withoutFfmpeg(() => ensurePreviewAudioClock("demo", treated)));
    assert.notEqual(clock.absolutePath, earlier);
    assert.equal(fs.statSync(clock.absolutePath).ino, fs.statSync(earlier).ino);
    assert.ok(fs.existsSync(earlier));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
