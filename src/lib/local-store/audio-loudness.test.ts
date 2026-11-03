import assert from "node:assert/strict";
import test from "node:test";

import { parseIntegratedLufs } from "@/lib/local-store/audio-loudness";

test("parseIntegratedLufs reads the integrated figure from an ebur128 summary", () => {
  const stderr = [
    "[Parsed_ebur128_0 @ 0x] Summary:",
    "",
    "  Integrated loudness:",
    "    I:         -30.8 LUFS",
    "    Threshold: -40.9 LUFS",
    "",
    "  Loudness range:",
    "    LRA:         6.1 LU",
  ].join("\n");
  assert.equal(parseIntegratedLufs(stderr), -30.8);
});

test("parseIntegratedLufs takes the LAST I: so integrated wins over any per-frame line", () => {
  const stderr = [
    "[Parsed_ebur128_0 @ 0x] t: 1  M: -22.0 S: -22.0 I: -19.4 LUFS",
    "[Parsed_ebur128_0 @ 0x] Summary:",
    "    I:         -23.0 LUFS",
  ].join("\n");
  assert.equal(parseIntegratedLufs(stderr), -23);
});

test("parseIntegratedLufs returns null when no integrated figure is present", () => {
  assert.equal(parseIntegratedLufs("no loudness here"), null);
  assert.equal(parseIntegratedLufs(""), null);
});

test("parseIntegratedLufs handles a positive/zero-ish value defensively", () => {
  assert.equal(parseIntegratedLufs("    I:   -0.5 LUFS"), -0.5);
});

import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getOrMeasureLufs, measureIntegratedLufs } from "@/lib/local-store/audio-loudness";

test("loudness decoding yields, deduplicates, bounds concurrency and invalidates replaced sources", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "loudness-test-"));
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  const projectId = "audio-fixture";
  fs.mkdirSync(path.join(root, projectId));
  const source = path.join(root, projectId, "source.wav");
  const second = path.join(root, projectId, "second.wav");
  fs.writeFileSync(source, "fixture");
  fs.writeFileSync(second, "fixture");
  const pending: Array<(error: Error | null, stdout: string, stderr: string) => void> = [];
  const runner = t.mock.method(childProcess, "execFile", (...args: unknown[]) => {
    pending.push(args.at(-1) as typeof pending[number]);
    return {};
  });
  try {
    const first = getOrMeasureLufs(projectId, source, "source.wav");
    const duplicate = getOrMeasureLufs(projectId, source, "source.wav");
    const other = getOrMeasureLufs(projectId, second, "second.wav");
    assert.equal(runner.mock.callCount(), 2);
    assert.equal(await measureIntegratedLufs("over-capacity.wav"), null);
    // A server heartbeat continues while both decoder callbacks remain outstanding.
    await new Promise<void>((resolve) => setImmediate(resolve));
    pending[0](null, "", "I: -23.0 LUFS");
    pending[1](null, "", "I: -18.0 LUFS");
    assert.deepEqual(await Promise.all([first, duplicate, other]), [-23, -23, -18]);
    assert.equal(await getOrMeasureLufs(projectId, source, "source.wav"), -23);
    assert.equal(await getOrMeasureLufs(projectId, second, "second.wav"), -18);
    assert.equal(runner.mock.callCount(), 2, "concurrent completions preserve both cache entries");

    fs.writeFileSync(source, "replacement");
    const replaced = getOrMeasureLufs(projectId, source, "source.wav");
    fs.writeFileSync(source, "changed during analysis");
    pending[2](null, "", "I: -12.0 LUFS");
    assert.equal(await replaced, null, "stale measurement must not attach to replacement bytes");
    const retry = getOrMeasureLufs(projectId, source, "source.wav");
    pending[3](new Error("decoder failed"), "", "I: -12.0 LUFS");
    assert.equal(await retry, null);
    const recovered = getOrMeasureLufs(projectId, source, "source.wav");
    pending[4](null, "", "I: -14.0 LUFS");
    assert.equal(await recovered, -14, "failed measurement is not cached");
  } finally {
    runner.mock.restore();
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("audio placement only reads prepared loudness and preserves requested gain", async (t) => {
  const { POST } = await import("@/app/api/projects/[projectId]/timeline/elements/route");
  const { createProject, readTimeline } = await import("./store");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audio-placement-test-"));
  const previousProjects = process.env.TIMELINE_PROJECTS_DIR;
  const previousProfile = process.env.DREAMCUT_PROFILE_DIR;
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  let finish!: (error: Error | null, stdout: string, stderr: string) => void;
  const runner = t.mock.method(childProcess, "execFile", (...args: unknown[]) => {
    finish = args.at(-1) as typeof finish;
    return {};
  });
  let analysis: Promise<number | null> | undefined;
  try {
    createProject("fixture", "web");
    const source = path.join(root, "projects", "fixture", "media", "source.wav");
    fs.writeFileSync(source, "fixture");
    const place = () => POST(new Request("http://localhost/api/projects/fixture/timeline/elements", {
      method: "POST", headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" },
      body: JSON.stringify({ type: "music", source_url: "/api/projects/fixture/media/source.wav", timeline_start: 0,
        duration: 1, lane_key: "music_0", lane_index: 0, volume: 0.5 }),
    }), { params: Promise.resolve({ projectId: "fixture" }) });
    const missing = await place();
    assert.equal(missing.status, 200);
    assert.equal((await missing.json()).element.props.source_lufs, undefined);
    assert.equal(runner.mock.callCount(), 0, "placement must never launch analysis");

    analysis = getOrMeasureLufs("fixture", source, "source.wav");
    const pending = await place();
    assert.equal(pending.status, 200, "placement does not wait for pending preparation");
    assert.equal((await pending.json()).element.props.source_lufs, undefined);
    const timelineBeforeCompletion = readTimeline("fixture");
    finish(null, "", "I: -23.0 LUFS");
    assert.equal(await analysis, -23);
    assert.deepEqual(readTimeline("fixture"), timelineBeforeCompletion, "analysis does not mutate existing clips");
    const response = await place();
    assert.equal(response.status, 200);
    const { element } = await response.json();
    assert.equal(element.volume, 0.5);
    assert.equal(element.props.source_lufs, -23);
    fs.writeFileSync(source, "replacement source");
    const replaced = await place();
    assert.equal(replaced.status, 200);
    assert.equal((await replaced.json()).element.props.source_lufs, undefined);
    assert.equal(runner.mock.callCount(), 1, "missing or stale cache cannot trigger decoding during placement");
    assert.ok(readTimeline("fixture").elements.every(element => element.volume === 0.5));
  } finally {
    finish?.(new Error("test cleanup"), "", "");
    await analysis;
    runner.mock.restore();
    if (previousProjects === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousProjects;
    if (previousProfile === undefined) delete process.env.DREAMCUT_PROFILE_DIR;
    else process.env.DREAMCUT_PROFILE_DIR = previousProfile;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
