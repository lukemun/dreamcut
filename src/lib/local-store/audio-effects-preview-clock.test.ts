import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensurePreviewAudioClock, relocatableSourceKey } from "@/lib/local-store/audio-effects";

const RECIPE = "preview-audio-clock-v1:aac-packet-copy:timing-preserved";

function makeTreatedVideo(file: string, seconds = 1, frequency = 440) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=black:s=160x90:r=30:d=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000:duration=${seconds}`,
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

/** Fails the call if it starts FFmpeg: a cache hit must not spawn anything. */
function withoutFfmpeg<T>(run: () => T): T {
  const previous = process.env.PATH;
  process.env.PATH = "";
  try { return run(); } finally { process.env.PATH = previous; }
}

function scratch(name: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `timeline-preview-clock-${name}-`));
}

test("preview audio clock is reused after the projects folder moves", () => {
  const first = scratch("first");
  const moved = scratch("moved");
  try {
    const treated = path.join(first, "demo", "media", "audio-effects", "take.voice-enhanced.mp4");
    makeTreatedVideo(treated);
    const original = withProjectsRoot(first, () => ensurePreviewAudioClock("demo", treated));
    assert.ok(fs.existsSync(original.absolutePath));

    // A relocation keeps relative paths, sizes and mtimes (cp -p, Library move, profiling clone).
    fs.cpSync(path.join(first, "demo"), path.join(moved, "demo"), { recursive: true, preserveTimestamps: true });
    const movedTreated = path.join(moved, "demo", "media", "audio-effects", "take.voice-enhanced.mp4");
    const reused = withProjectsRoot(moved, () => withoutFfmpeg(() => ensurePreviewAudioClock("demo", movedTreated)));
    assert.equal(reused.relativePath, original.relativePath);
    assert.equal(reused.sourceUrl, original.sourceUrl);
    assert.equal(reused.absolutePath, path.join(moved, "demo", "media", original.relativePath));
    assert.deepEqual(
      fs.readdirSync(path.join(moved, "demo", "media", "audio-effects")).filter((name) => name.endsWith(".preview-audio.m4a")),
      [path.basename(original.relativePath)],
    );
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(moved, { recursive: true, force: true });
  }
});

test("preview audio clock regenerates when its treated input changes", () => {
  const root = scratch("changed");
  try {
    const treated = path.join(root, "demo", "media", "audio-effects", "take.normalized.mp4");
    makeTreatedVideo(treated, 1, 440);
    const before = withProjectsRoot(root, () => ensurePreviewAudioClock("demo", treated));
    const beforeBytes = fs.readFileSync(before.absolutePath);

    makeTreatedVideo(treated, 2, 660);
    const after = withProjectsRoot(root, () => ensurePreviewAudioClock("demo", treated));
    assert.notEqual(after.relativePath, before.relativePath);
    assert.ok(fs.existsSync(after.absolutePath));
    assert.notDeepEqual(fs.readFileSync(after.absolutePath), beforeBytes);
    const duration = Number(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", after.absolutePath,
    ], { encoding: "utf8" }));
    assert.ok(duration > 1.5, `expected the regenerated clock to follow the new 2 s input, got ${duration}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("preview audio clocks are never shared between different sources", () => {
  const root = scratch("distinct");
  try {
    const one = path.join(root, "demo", "media", "audio-effects", "take.normalized.mp4");
    const sameNameElsewhere = path.join(root, "demo", "media", "other", "take.normalized.mp4");
    const otherProject = path.join(root, "audition", "media", "audio-effects", "take.normalized.mp4");
    makeTreatedVideo(one);
    // Identical bytes, size and mtime: only the source's place may tell them apart.
    for (const copy of [sameNameElsewhere, otherProject]) {
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(one, copy);
      const stat = fs.statSync(one);
      fs.utimesSync(copy, stat.atime, stat.mtime);
    }
    const outputs = withProjectsRoot(root, () => [one, sameNameElsewhere, otherProject]
      .map((source) => ensurePreviewAudioClock("demo", source).relativePath));
    assert.equal(new Set(outputs).size, 3);
    assert.equal(
      withProjectsRoot(root, () => relocatableSourceKey(otherProject)),
      "projects:audition/media/audio-effects/take.normalized.mp4",
    );
    assert.match(
      withProjectsRoot(root, () => relocatableSourceKey(path.join(os.tmpdir(), "outside.mp4"))),
      /^absolute:\//,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an existing absolute-path-keyed clock is linked, not re-rendered", () => {
  const root = scratch("legacy");
  try {
    const treated = path.join(root, "demo", "media", "audio-effects", "take.normalized.mp4");
    makeTreatedVideo(treated);
    const stat = fs.statSync(treated);
    const legacyFingerprint = createHash("sha256")
      .update(`${treated}\0${stat.size}\0${stat.mtimeMs}\0${RECIPE}`)
      .digest("hex")
      .slice(0, 16);
    const legacyPath = path.join(root, "demo", "media", "audio-effects", `take.normalized.${legacyFingerprint}.preview-audio.m4a`);
    fs.writeFileSync(legacyPath, "previously rendered clock");

    const clock = withProjectsRoot(root, () => withoutFfmpeg(() => ensurePreviewAudioClock("demo", treated)));
    assert.notEqual(clock.absolutePath, legacyPath);
    assert.equal(fs.readFileSync(clock.absolutePath, "utf8"), "previously rendered clock");
    assert.equal(fs.statSync(clock.absolutePath).ino, fs.statSync(legacyPath).ino);
    assert.ok(fs.existsSync(legacyPath), "the old name stays valid for timelines that store it");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
