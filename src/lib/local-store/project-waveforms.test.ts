import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createProject, readPeaks } from "./store";
import { ingestMediaPath } from "./media-ingest";
import { mediaUrl } from "./media";
import { projectDir, projectMediaDir } from "./paths";
import { prepareProjectWaveforms } from "./project-waveforms";
import { POST } from "../../app/api/projects/[projectId]/timeline/peaks/prepare/route";

test("unused managed audio prepares and persists once without changing the edit; unsafe/stale sources fail", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-waveforms-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  const previousPreparation = process.env.MEDIA_PREPARATION_AUTOSTART;
  const previousImport = process.env.DREAMCUT_IMPORT_AUTOSTART;
  // This fixture exercises explicit waveform preparation. Detached ingestion
  // workers otherwise race its temporary-directory cleanup and outlive the test.
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  try {
    createProject("fixture", "web");
    createProject("other", "web");
    const source = path.join(root, "sound.wav");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=duration=0.2", source]);
    const original = fs.readFileSync(source);
    const asset = ingestMediaPath({ projectId: "fixture", sourcePath: source });
    const other = ingestMediaPath({ projectId: "other", sourcePath: source });
    const url = mediaUrl("fixture", asset.media_path);
    const timeline = fs.readFileSync(path.join(projectDir("fixture"), "timeline.json"));
    const metadata = fs.readFileSync(path.join(projectDir("fixture"), "metadata.json"));
    const request = (body: string) => POST(new Request("http://localhost/prepare", { method: "POST", body }), { params: Promise.resolve({ projectId: "fixture" }) });
    assert.equal((await request("bad json")).status, 400);
    assert.equal((await request(JSON.stringify({ sources: Array(21).fill(url) }))).status, 400);
    const result = await (await request(JSON.stringify({ sources: [url, url] }))).json();
    assert.deepEqual(result.errors, []);
    assert.equal(result.items.length, 1);
    assert.ok(result.items[0].peaks.some((p: number) => p > 0));
    assert.ok(Math.abs(result.items[0].source_duration_seconds - .2) < .01);
    assert.deepEqual(readPeaks("fixture")[url].peaks, result.items[0].peaks);
    const cache = path.join(projectDir("fixture"), "preprocess", "waveforms");
    const cacheFiles = fs.readdirSync(cache);
    const reused = await prepareProjectWaveforms("fixture", [url]);
    assert.deepEqual(reused, result);
    assert.deepEqual(fs.readdirSync(cache), cacheFiles);
    const unregistered = path.join(projectMediaDir("fixture"), "unregistered.wav");
    fs.copyFileSync(source, unregistered);
    const denied = await prepareProjectWaveforms("fixture", [
      mediaUrl("other", other.media_path), mediaUrl("fixture", "unregistered.wav"),
      `https://example.com${url}`, "/api/projects/fixture/media/%2e%2e%2fsecret.wav", source,
    ]);
    assert.equal(denied.items.length, 0);
    assert.equal(denied.errors.length, 5);
    const managed = path.join(projectMediaDir("fixture"), asset.media_path);
    fs.appendFileSync(managed, "changed");
    assert.match((await prepareProjectWaveforms("fixture", [url])).errors[0].error, /changed/);
    fs.unlinkSync(managed);
    fs.symlinkSync(source, managed);
    assert.match((await prepareProjectWaveforms("fixture", [url])).errors[0].error, /escapes/);
    assert.deepEqual(fs.readFileSync(source), original);
    assert.deepEqual(fs.readFileSync(path.join(projectDir("fixture"), "timeline.json")), timeline);
    assert.deepEqual(fs.readFileSync(path.join(projectDir("fixture"), "metadata.json")), metadata);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    if (previousPreparation === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART;
    else process.env.MEDIA_PREPARATION_AUTOSTART = previousPreparation;
    if (previousImport === undefined) delete process.env.DREAMCUT_IMPORT_AUTOSTART;
    else process.env.DREAMCUT_IMPORT_AUTOSTART = previousImport;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
