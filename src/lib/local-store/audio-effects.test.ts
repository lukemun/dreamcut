import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  deepFilterModelBaseDir,
  deepFilterModelCheckpointCandidates,
  findQuietestNoiseWindow,
  localMediaRelPath,
  resolveLocalMediaSource,
  SPEECH_NOISE_REDUCTION_FILTER,
  voiceEnhancementAttenuationLimitDb,
  voiceEnhancementVenvDir,
  launcherInterpreter,
  legacyVoiceEnhancementVenvDirs,
  voiceEnhancerExecutableCandidates,
  voiceEnhancerInstall,
  voiceEnhancerInstallProblem,
} from "@/lib/local-store/audio-effects";

function windowRmsDbfs(sourcePath: string, startSeconds: number, durationSeconds: number) {
  const samples = execFileSync("ffmpeg", [
    "-v", "error",
    "-ss", String(startSeconds),
    "-t", String(durationSeconds),
    "-i", sourcePath,
    "-map", "0:a:0",
    "-ac", "1",
    "-ar", "48000",
    "-f", "f32le",
    "pipe:1",
  ]);
  let sumSquares = 0;
  const sampleCount = Math.floor(samples.length / 4);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = samples.readFloatLE(index * 4);
    sumSquares += sample * sample;
  }
  return 20 * Math.log10(Math.sqrt(sumSquares / sampleCount));
}

test("localMediaRelPath resolves encoded project-local media only", () => {
  assert.equal(
    localMediaRelPath("/api/projects/demo/media/originals/Take%201.MP4", "demo"),
    "originals/Take 1.MP4",
  );
  assert.equal(localMediaRelPath("/api/projects/other/media/take.mp4", "demo"), null);
});

test("resolveLocalMediaSource can opt into a referenced project's media", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-cross-project-media-"));
  const previousProjectsRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = temporaryRoot;
  try {
    const sourcePath = path.join(temporaryRoot, "audition", "media", "sources", "Take 1.MP4");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, "fixture");
    const sourceUrl = "/api/projects/audition/media/sources/Take%201.MP4";

    assert.equal(resolveLocalMediaSource("selected-cut", sourceUrl), null);
    assert.deepEqual(
      resolveLocalMediaSource("selected-cut", sourceUrl, { allowReferencedProject: true }),
      {
        absolutePath: sourcePath,
        relativePath: "sources/Take 1.MP4",
        sourceProjectId: "audition",
      },
    );
    assert.equal(
      resolveLocalMediaSource(
        "selected-cut",
        "/api/projects/../media/source.mp4",
        { allowReferencedProject: true },
      ),
      null,
    );
  } finally {
    if (previousProjectsRoot == null) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousProjectsRoot;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("speech cleanup remains a conservative, versioned filter recipe", () => {
  assert.match(SPEECH_NOISE_REDUCTION_FILTER, /highpass=f=70/);
  assert.match(SPEECH_NOISE_REDUCTION_FILTER, /spectral-gate=reduction_db=15/);
  assert.match(SPEECH_NOISE_REDUCTION_FILTER, /oversubtract=1\.6/);
});

test("voice enhancement maps the user strength to a bounded model attenuation", () => {
  assert.equal(voiceEnhancementAttenuationLimitDb(0), 0);
  assert.equal(voiceEnhancementAttenuationLimitDb(40), 12);
  assert.equal(voiceEnhancementAttenuationLimitDb(55), 17);
  assert.equal(voiceEnhancementAttenuationLimitDb(100), 30);
  assert.equal(voiceEnhancementAttenuationLimitDb(500), 30);
});

test("voice enhancement resolves virtual-environment paths on macOS, Linux, and Windows", () => {
  assert.equal(voiceEnhancementVenvDir("darwin", {}, "/Users/demo"), path.join("/Users/demo", "Library", "Caches", "DreamCut", "voice-enhancement-py311"));
  assert.equal(voiceEnhancementVenvDir("linux", {}, "/home/demo"), path.join("/home/demo", ".cache", "dreamcut", "voice-enhancement-py311"));
  assert.deepEqual(legacyVoiceEnhancementVenvDirs("darwin", {}, "/Users/demo"), ["OpenEdit", "OpenSequence"].map(name => path.join("/Users/demo", "Library", "Caches", name, "voice-enhancement-py311")), "pre-rename installs remain usable");
  assert.deepEqual(legacyVoiceEnhancementVenvDirs("linux", {}, "/home/demo"), ["open-edit", "opensequence"].map(name => path.join("/home/demo", ".cache", name, "voice-enhancement-py311")));
  assert.equal(
    voiceEnhancementVenvDir("win32", { LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local" }, "C:\\Users\\demo"),
    path.join("C:\\Users\\demo\\AppData\\Local", "DreamCut", "Cache", "voice-enhancement-py311"),
  );
  assert.ok(voiceEnhancerExecutableCandidates("win32").some((candidate) => candidate.endsWith(path.join("voice-enhancement-py311", "Scripts", "deepFilter.exe"))));
  assert.ok(deepFilterModelCheckpointCandidates("darwin")[0]?.includes("Library/Caches/DeepFilterNet"));
  assert.ok(deepFilterModelCheckpointCandidates("linux")[0]?.includes("DeepFilterNet/DeepFilterNet3"));
});

test("voice enhancement skips a launcher whose venv folder was renamed and names the fix", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-voice-launcher-"));
  try {
    const python = path.join(root, "DreamCut", "bin", "python");
    fs.mkdirSync(path.dirname(python), { recursive: true });
    fs.writeFileSync(python, "");
    const launcher = (folder: string, body: string) => {
      const file = path.join(root, folder, "bin", "deepFilter");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      return file;
    };
    const renamed = launcher("OpenEdit", `#!${path.join(root, "OpenSequence", "bin", "python")}\nimport sys\n`);
    const working = launcher("DreamCut", `#!${python}\nimport sys\n`);
    const longPath = launcher("Long", `#!/bin/sh\n'''exec' "${path.join(root, "Gone", "bin", "python")}" "$0" "$@"\n' '''\n`);
    const windows = path.join(root, "deepFilter.exe");
    fs.writeFileSync(windows, "MZ\0\0launcher#!C:\\Users\\demo\\venv\\Scripts\\python.exe\r\nPK\u0003\u0004");

    assert.equal(launcherInterpreter(renamed), path.join(root, "OpenSequence", "bin", "python"));
    assert.equal(launcherInterpreter(longPath), path.join(root, "Gone", "bin", "python"));
    assert.equal(launcherInterpreter(windows), "C:\\Users\\demo\\venv\\Scripts\\python.exe");

    assert.deepEqual(voiceEnhancerInstall([path.join(root, "absent"), renamed, working]), { status: "ready", executable: working });
    const broken = voiceEnhancerInstall([renamed, longPath]);
    assert.equal(broken.status, "broken");
    assert.match(voiceEnhancerInstallProblem(broken) ?? "", /OpenEdit.*no longer exists.*pnpm setup:voice/s);
    assert.match(voiceEnhancerInstallProblem(voiceEnhancerInstall([path.join(root, "absent")])) ?? "", /not installed.*pnpm setup:voice/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the shipped voice installer and the editor agree on where voice enhancement lives", async () => {
  const { voiceModelCheckpoint, voiceVenvDirs } = await import("../../../scripts/setup-voice.mjs");
  const windows = { LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local" };
  for (const [platform, env, home] of [["darwin", {}, "/Users/demo"], ["linux", {}, "/home/demo"], ["win32", windows, "C:\\Users\\demo"]] as const) {
    assert.deepEqual(voiceVenvDirs(platform, env, home), [voiceEnhancementVenvDir(platform, env, home), ...legacyVoiceEnhancementVenvDirs(platform, env, home)], platform);
  }
  assert.equal(voiceModelCheckpoint(), deepFilterModelCheckpointCandidates()[0]);
});

test("voice enhancement resolves the installed DeepFilterNet model directory", () => {
  const baseDir = deepFilterModelBaseDir();
  if (baseDir) assert.equal(path.basename(baseDir), "DeepFilterNet3");
});

test("a silent source is probed once for reversed preview sound", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-reverse-silent-"));
  const previousProjectsRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = temporaryRoot;
  try {
    const mediaDir = path.join(temporaryRoot, "demo", "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const silentPath = path.join(mediaDir, "silent.mp4");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=0.5", "-c:v", "libx264", silentPath]);
    assert.equal(ensureReversedPreviewAudio("demo", silentPath), null);
    const receipts = fs.readdirSync(path.join(mediaDir, "audio-effects")).filter(name => name.endsWith(".json"));
    assert.equal(receipts.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(mediaDir, "audio-effects", receipts[0]), "utf8")).source_audio, false);
    // The recorded result answers later requests even if FFprobe is unavailable.
    const previousPath = process.env.PATH;
    process.env.PATH = "";
    try { assert.equal(ensureReversedPreviewAudio("demo", silentPath), null); }
    finally { process.env.PATH = previousPath; }
  } finally {
    if (previousProjectsRoot == null) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousProjectsRoot;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("treated video uses a small audio-only preview clock", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-preview-audio-clock-"));
  const previousProjectsRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = temporaryRoot;
  try {
    const mediaDir = path.join(temporaryRoot, "demo", "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const treatedPath = path.join(mediaDir, "treated.mp4");
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "color=c=black:s=640x360:r=30:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
      "-c:v", "libx264", "-c:a", "aac", "-shortest",
      treatedPath,
    ]);

    const previewAudio = ensurePreviewAudioClock("demo", treatedPath);
    const streams = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type", "-of", "json",
      previewAudio.absolutePath,
    ], { encoding: "utf8" })) as { streams: Array<{ codec_type: string }> };

    assert.deepEqual(streams.streams.map((stream) => stream.codec_type), ["audio"]);
    assert.match(previewAudio.sourceUrl, /\.preview-audio\.m4a$/);
    assert.ok(fs.statSync(previewAudio.absolutePath).size < fs.statSync(treatedPath).size);
  } finally {
    if (previousProjectsRoot == null) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousProjectsRoot;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("noise reduction preserves a video stream and detach emits audio-only media", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-audio-effects-"));
  const previousProjectsRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = temporaryRoot;
  try {
    const mediaDir = path.join(temporaryRoot, "demo", "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const sourcePath = path.join(mediaDir, "fixture.mp4");
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "color=c=black:s=160x284:r=30:d=1",
      "-f", "lavfi", "-i", "aevalsrc=if(lt(t\\,0.5)\\,0.002*random(0)\\,0.08*sin(2*PI*440*t)+0.002*random(0)):s=48000:d=1",
      "-c:v", "libx264", "-c:a", "aac", "-shortest",
      sourcePath,
    ]);

    const profile = findQuietestNoiseWindow(sourcePath);
    const cleaned = ensureNoiseReducedMedia("demo", sourcePath, true);
    const normalized = ensureLoudnessNormalizedMedia("demo", cleaned.absolutePath, true);
    const detached = ensureDetachedAudio("demo", normalized.absolutePath);
    const cleanedStreams = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type", "-of", "json", cleaned.absolutePath,
    ], { encoding: "utf8" })) as { streams: Array<{ codec_type: string }> };
    const detachedStreams = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "stream=codec_type", "-of", "json", detached.absolutePath,
    ], { encoding: "utf8" })) as { streams: Array<{ codec_type: string }> };

    assert.deepEqual(cleanedStreams.streams.map((stream) => stream.codec_type).sort(), ["audio", "video"]);
    assert.deepEqual(detachedStreams.streams.map((stream) => stream.codec_type), ["audio"]);
    assert.ok(profile.startSeconds < 0.5);
    const sourceNoiseDbfs = windowRmsDbfs(
      sourcePath,
      profile.startSeconds,
      profile.endSeconds - profile.startSeconds,
    );
    const cleanedNoiseDbfs = windowRmsDbfs(
      cleaned.absolutePath,
      profile.startSeconds,
      profile.endSeconds - profile.startSeconds,
    );
    assert.ok(
      cleanedNoiseDbfs <= sourceNoiseDbfs - 12,
      `expected at least 12 dB noise reduction, got ${(sourceNoiseDbfs - cleanedNoiseDbfs).toFixed(2)} dB`,
    );
    assert.ok(Number(normalized.outputMeasurement.input_tp) <= -1.4);
  } finally {
    if (previousProjectsRoot == null) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousProjectsRoot;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
