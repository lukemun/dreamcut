import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createProject } from "./store";
import { ingestMediaPath } from "./media-ingest";
import { enqueueMediaPreparation, readPreparation, writePreparation } from "./media-preparation";
import { getCachedLufs } from "./audio-loudness";
import { POST } from "@/app/api/projects/[projectId]/timeline/elements/route";
import { prepareAudioMedia } from "../media-analysis/prepare-audio-loudness";

const execFile = promisify(childProcess.execFile);

test("superseded audio analysis cannot overwrite a replacement queued while decoding", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audio-preparation-replacement-"));
  const previousProjects = process.env.TIMELINE_PROJECTS_DIR;
  const previousAuto = process.env.MEDIA_PREPARATION_AUTOSTART;
  process.env.TIMELINE_PROJECTS_DIR = root;
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  const completions: Array<(error: Error | null, stdout: string, stderr: string) => void> = [];
  const runner = t.mock.method(childProcess, "execFile", (...args: unknown[]) => {
    completions.push(args.at(-1) as typeof completions[number]);
    return {};
  });
  try {
    createProject("fixture", "web");
    const source = path.join(root, "fixture", "media", "source.wav");
    fs.writeFileSync(source, "original");
    const original = enqueueMediaPreparation("fixture", "source.wav")!;
    const analyzingOriginal = prepareAudioMedia("fixture", original);
    fs.writeFileSync(source, "replacement bytes");
    const replacement = enqueueMediaPreparation("fixture", "source.wav")!;
    assert.notEqual(replacement.size, original.size);
    completions[0](new Error("old decoder failed"), "", "");
    assert.deepEqual(await analyzingOriginal, replacement);
    assert.deepEqual(readPreparation("fixture", "source.wav"), replacement, "old failure must not discard the replacement queue record");
    const analyzingReplacement = prepareAudioMedia("fixture", replacement);
    completions[1](null, "", "I: -20.0 LUFS");
    assert.equal((await analyzingReplacement).loudness?.integrated_lufs, -20);
    assert.equal(readPreparation("fixture", "source.wav")?.state, "ready");
  } finally {
    runner.mock.restore();
    if (previousProjects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previousProjects;
    if (previousAuto === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART; else process.env.MEDIA_PREPARATION_AUTOSTART = previousAuto;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real preparation worker analyzes imported audio; placement reads cache without changing gain", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audio-preparation-test-"));
  const variables = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "MEDIA_PREPARATION_AUTOSTART", "DREAMCUT_IMPORT_ANALYSIS"] as const;
  const previous = variables.map(key => process.env[key]);
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  process.env.DREAMCUT_IMPORT_ANALYSIS = "off";
  try {
    createProject("fixture", "web");
    const project = path.join(root, "projects", "fixture");
    const timeline = fs.readFileSync(path.join(project, "timeline.json"), "utf8");
    const metadata = fs.readFileSync(path.join(project, "metadata.json"), "utf8");
    const source = path.join(root, "tone.wav");
    await execFile("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.5", "-ac", "2", source]);
    const bytes = fs.readFileSync(source);
    const imported = ingestMediaPath({ projectId: "fixture", sourcePath: source });
    const managed = path.join(project, "media", imported.media_path);
    assert.equal(readPreparation("fixture", imported.media_path)?.state, "preparing", "import queues deterministic audio analysis even with model analysis disabled");
    const runWorker = () => execFile(process.execPath, ["--import", "tsx", "scripts/prepare-media.ts", "fixture"], { timeout: 30000 });
    await runWorker();
    const ready = readPreparation("fixture", imported.media_path)!;
    assert.equal(ready.state, "ready");
    assert.equal(ready.loudness?.state, "ready");
    assert.equal(ready.render, imported.media_path);
    assert.equal(ready.preview, imported.media_path);
    assert.equal(getCachedLufs("fixture", managed, imported.media_path), ready.loudness?.integrated_lufs);
    assert.deepEqual(fs.readFileSync(managed), bytes);
    assert.deepEqual(fs.readFileSync(source), bytes);
    assert.equal(fs.readFileSync(path.join(project, "timeline.json"), "utf8"), timeline);
    assert.equal(fs.readFileSync(path.join(project, "metadata.json"), "utf8"), metadata);
    assert.deepEqual(enqueueMediaPreparation("fixture", imported.media_path), ready, "prepared sources reuse cache");

    // Old ready receipts and lost analysis are repaired through the same worker.
    fs.rmSync(path.join(project, "preprocess", "audio-loudness"), { recursive: true });
    const { loudness: _loudness, ...legacy } = ready;
    writePreparation("fixture", legacy);
    assert.equal(enqueueMediaPreparation("fixture", imported.media_path)?.state, "preparing");
    await runWorker();
    const placed = await POST(new Request("http://localhost/api/projects/fixture/timeline/elements", {
      method: "POST", headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
      body: JSON.stringify({ type: "music", source_url: `/api/projects/fixture/media/${imported.media_path}`,
        timeline_start: 0, duration: 0.5, lane_key: "music_0", lane_index: 0, volume: 0.37 }),
    }), { params: Promise.resolve({ projectId: "fixture" }) });
    assert.equal(placed.status, 200);
    const { element } = await placed.json();
    assert.equal(element.volume, 0.37);
    assert.equal(element.props.source_lufs, ready.loudness?.integrated_lufs);

    fs.writeFileSync(path.join(project, "media", "invalid.wav"), "not audio");
    enqueueMediaPreparation("fixture", "invalid.wav");
    await runWorker();
    const unavailable = readPreparation("fixture", "invalid.wav")!;
    assert.equal(unavailable.loudness?.state, "unavailable", "failed optional analysis remains explicit");
    assert.equal(getCachedLufs("fixture", path.join(project, "media", "invalid.wav"), "invalid.wav"), null);
    assert.deepEqual(enqueueMediaPreparation("fixture", "invalid.wav"), unavailable, "do not spin on an unavailable analysis");
    assert.equal(enqueueMediaPreparation("fixture", "invalid.wav", true)?.state, "preparing", "explicit Retry reattempts unavailable analysis");
    await runWorker();

    const beforeReplace = fs.statSync(managed);
    fs.writeFileSync(managed, bytes);
    fs.utimesSync(managed, beforeReplace.atime, beforeReplace.mtime);
    assert.equal(getCachedLufs("fixture", managed, imported.media_path), null, "ctime invalidates same-size source replacement");
    assert.equal(enqueueMediaPreparation("fixture", imported.media_path)?.state, "preparing");
    await runWorker();
    assert.equal(readPreparation("fixture", imported.media_path)?.loudness?.state, "ready");

    // Independent worker processes can publish different sources without lost JSON-map updates.
    fs.copyFileSync(source, path.join(project, "media", "second.wav"));
    fs.rmSync(path.join(project, "preprocess", "audio-loudness"), { recursive: true });
    const runAnalysis = (rel: string) => execFile(process.execPath, ["--import", "tsx", "--eval",
      `const {getOrMeasureLufs}=require('./src/lib/local-store/audio-loudness.ts');getOrMeasureLufs('fixture',${JSON.stringify(path.join(project, "media", rel))},${JSON.stringify(rel)}).then(value=>{if(value==null)process.exitCode=1;});`], { timeout: 30000 });
    await Promise.all([runAnalysis(imported.media_path), runAnalysis("second.wav")]);
    assert.equal(fs.readdirSync(path.join(project, "preprocess", "audio-loudness")).length, 2);
    assert.equal(typeof getCachedLufs("fixture", managed, imported.media_path), "number");
    assert.equal(typeof getCachedLufs("fixture", path.join(project, "media", "second.wav"), "second.wav"), "number");
  } finally {
    variables.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
