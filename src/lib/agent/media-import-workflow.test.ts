import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileHash, importArtifacts, processImportedMedia, validateImportResult, type ImportResult } from "./media-import-workflow";
import { enqueueImportJob, listImportJobs, runImportQueue, updateImportJob } from "../local-store/media-import-jobs";
import { POST as upload } from "../../app/api/projects/[projectId]/uploaded-assets/route";

const valid: ImportResult = { status: "complete", reason: "", media_type: "image", duration_s: null, summary: "A test square", tags: ["square"], coverage: "Whole image inspected", uncertainties: [], speech: "absent", transcription_engine: null, words: [], entries: [{ summary: "Square", start_s: null, end_s: null, evidence_kind: "visible", evidence: "One square in the source", context: "Test artwork", interpretation: null, verification: "frame_checked" }] };
test("live Codex import smoke inspects a synthetic source without project writes", { skip: process.env.DREAMCUT_LIVE_IMPORT_TEST !== "1" }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "import-live-test-"));
  try {
    const source = path.join(temp, "fixture.png");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=128x128", "-frames:v", "1", source]);
    const result = await processImportedMedia({ source, sha256: fileHash(source), skillPath: path.join(os.homedir(), ".agents/skills/media-process/SKILL.md"), timeoutMs: 120000 });
    assert.equal(result.media_type, "image");
    assert.ok(result.entries.some(e => e.verification === "frame_checked"));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test("import validation fails closed on unavailable tools and bad timing", () => {
  assert.throws(() => validateImportResult({ ...valid, status: "blocked", reason: "Missing local transcription" }), /Missing local/);
  assert.throws(() => validateImportResult({ ...valid, media_type: "audio", duration_s: 2, speech: "present" }), /transcript/);
  assert.throws(() => validateImportResult({ ...valid, media_type: "audio", duration_s: 2, speech: "unknown" }), /Speech detection/);
  assert.throws(() => validateImportResult({ ...valid, media_type: "audio", duration_s: 2, speech: "present", transcription_engine: "fixture", words: [{ text: "hello", start: 0, end: 8 }] }), /timing/);
});
test("host creates annotation companions and speech artifacts only for speech", () => {
  const asset = { asset_id: randomUUID(), media_path: "sources/test.png", source_sha256: "a".repeat(64) };
  assert.deepEqual(Object.keys(importArtifacts(valid, asset)), ["annotations.json", "annotations.md"]);
  const speech: ImportResult = { ...valid, media_type: "audio", duration_s: 2, speech: "present", transcription_engine: "fixture", words: [{ text: "Hello", start: 0.1, end: 0.8 }] };
  const files = importArtifacts(speech, asset);
  assert.match(files["transcript.srt"], /00:00:00,100 --> 00:00:00,800/);
  assert.match(files["transcript.vtt"], /^WEBVTT/);
  assert.match(files["annotations.json"], new RegExp(asset.asset_id));
});
test("workflow isolates source and fails closed on hash drift", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "import-workflow-test-"));
  try {
    const source = path.join(temp, "test.png"); fs.writeFileSync(source, "fixture");
    const skillPath = path.join(temp, "SKILL.md"); fs.writeFileSync(skillPath, "fixture skill");
    const input = { source, sha256: fileHash(source), skillPath };
    await processImportedMedia(input, { id: "fixture", access: ["workspace-write"], run: async request => {
      assert.notEqual(request.cwd, temp); assert.match(request.prompt, /import mode/);
      assert.equal(fs.readFileSync(path.join(request.cwd, "source.png"), "utf8"), "fixture");
      return valid;
    } });
    fs.writeFileSync(source, "changed");
    await assert.rejects(processImportedMedia(input), /changed since import/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test("durable import queue deduplicates, persists artifacts, retries failures, and preserves timeline", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "import-queue-test-"));
  const oldRoot = process.env.TIMELINE_PROJECTS_DIR, oldAuto = process.env.DREAMCUT_IMPORT_AUTOSTART;
  process.env.TIMELINE_PROJECTS_DIR = temp; process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
  try {
    fs.mkdirSync(path.join(temp, "test", "media"), { recursive: true });
    const timeline = path.join(temp, "test", "timeline.json"); fs.writeFileSync(timeline, "untouched");
    const source = path.join(temp, "test", "media", "test.png"); fs.writeFileSync(source, "fixture");
    const asset = { asset_id: randomUUID(), media_path: "test.png", source_sha256: fileHash(source) };
    const job = enqueueImportJob("test", asset);
    enqueueImportJob("test", asset);
    assert.equal(listImportJobs("test").length, 1);
    await runImportQueue("test", async () => { throw new Error("No local tools"); });
    assert.equal(listImportJobs("test")[0].status, "failed");
    updateImportJob("test", job.id, "retry");
    await runImportQueue("test", async () => valid);
    const completed = listImportJobs("test")[0];
    assert.equal(completed.status, "complete"); assert.equal(completed.attempt, 2);
    assert.ok(completed.outputs?.every(output => fs.existsSync(path.join(temp, "test", output))));
    assert.equal(fs.readFileSync(timeline, "utf8"), "untouched");
    const cancelled = enqueueImportJob("test", { ...asset, asset_id: randomUUID() });
    updateImportJob("test", cancelled.id, "cancel");
    await runImportQueue("test", async () => { throw new Error("Must not run cancelled job"); });
    assert.equal(listImportJobs("test").find(j => j.id === cancelled.id)?.status, "cancelled");
    const form = new FormData();
    form.set("file", new File(["fixture"], "new-image.png", { type: "image/png" }));
    form.set("asset_type", "still");
    const response = await upload(new Request("http://localhost/api/projects/test/uploaded-assets", { method: "POST", body: form }), { params: Promise.resolve({ projectId: "test" }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.processing.status, "queued");
    assert.equal(body.processing.asset_id, body.asset.asset_id);
    await runImportQueue("test", async () => valid);
    assert.equal(listImportJobs("test").find(j => j.id === body.asset.asset_id)?.status, "complete");
    assert.equal(fs.readFileSync(timeline, "utf8"), "untouched");
  } finally {
    if (oldRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = oldRoot;
    if (oldAuto === undefined) delete process.env.DREAMCUT_IMPORT_AUTOSTART; else process.env.DREAMCUT_IMPORT_AUTOSTART = oldAuto;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("video import performs a second summary pass over every frame, including a late subject", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "video-import-contract-"));
  try {
    const source = path.join(temp, "video.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:r=20:d=2.5", "-c:v", "libx264", source]);
    const skillPath = path.join(temp, "SKILL.md"); fs.writeFileSync(skillPath, "fixture skill");
    const { videoDescriptionTimes } = await import("../media-analysis/video-descriptions");
    const frames = videoDescriptionTimes(2.5).map((time, i) => ({ id: `frame-${i}`, time_seconds: time, description: i < 2 ? "Empty room" : "Cat beside sofa", tags: i < 2 ? ["room"] : ["cat"] }));
    let calls = 0;
    const adapter = { id: "fixture", access: ["workspace-write", "read-only"] as Array<"workspace-write" | "read-only">, run: async (request: { prompt: string; access: string }) => {
      calls++;
      if (calls === 1) return { ...valid, media_type: "video", duration_s: 2.5, frame_descriptions: frames, summary_input_ids: [], entries: [], summary: "", coverage: "" };
      assert.equal(request.access, "read-only");
      for (const frame of frames) assert.ok(request.prompt.includes(JSON.stringify(frame)));
      return { summary: "Room with a cat near the ending.", tags: ["cat", "room"], summary_input_ids: frames.map(f => f.id) };
    } };
    const result = await processImportedMedia({ source, sha256: fileHash(source), skillPath }, adapter);
    assert.equal(calls, 2); assert.match(result.summary, /ending/);
    const artifacts = importArtifacts(result, { asset_id: randomUUID(), media_path: "video.mp4", source_sha256: fileHash(source) });
    const description = JSON.parse(artifacts["video-description.json"]);
    assert.equal(description.frames.length, frames.length);
    assert.equal(description.summary_input_ids.length, frames.length);
    await assert.rejects(processImportedMedia({ source, sha256: fileHash(source), skillPath }, { ...adapter, run: async () => ({ ...valid, media_type: "video", duration_s: 2.5, frame_descriptions: frames.slice(0, 1) }) }), /whole clip/);
    await assert.rejects(processImportedMedia({ source, sha256: fileHash(source), skillPath }, { ...adapter, run: async () => valid }), /cannot be cataloged/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
