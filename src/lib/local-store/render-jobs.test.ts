import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-jobs-"));
process.env.TIMELINE_PROJECTS_DIR = root;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");

import { getJob, listJobs, startRender, type LocalRenderJob } from "@/lib/local-store/render-jobs";
import { createProject } from "./store";

const jobsDir = path.join(root, ".cache", "render-jobs");

function writeJobFile(job: LocalRenderJob) {
  fs.mkdirSync(jobsDir, { recursive: true });
  fs.writeFileSync(path.join(jobsDir, `${job.id}.json`), JSON.stringify(job));
}

function job(overrides: Partial<LocalRenderJob>): LocalRenderJob {
  return {
    id: "job-1", projectId: "proj-a", targetType: "render", status: "completed",
    statusLabel: "Completed", error: null, fileName: "out.mp4",
    createdAt: "2026-07-22T01:00:00.000Z", completedAt: "2026-07-22T01:01:00.000Z",
    ...overrides,
  };
}

test("a completed job survives a restart (read from disk, not the Map)", () => {
  writeJobFile(job({ id: "done-1" }));
  const loaded = getJob("done-1");
  assert.equal(loaded?.status, "completed");
  assert.equal(loaded?.fileName, "out.mp4");
});

test("a processing job whose process died reads back as failed-interrupted", () => {
  writeJobFile(job({ id: "orphan-1", status: "processing", statusLabel: "Rendering", fileName: null, completedAt: null, pid: 99999999 }));
  const loaded = getJob("orphan-1");
  assert.equal(loaded?.status, "failed");
  assert.match(loaded?.error ?? "", /interrupted by a server restart/);
  // The failure is persisted, so the next read agrees without re-deriving.
  const onDisk = JSON.parse(fs.readFileSync(path.join(jobsDir, "orphan-1.json"), "utf8"));
  assert.equal(onDisk.status, "failed");
});

test("a processing job whose process is alive stays processing", () => {
  writeJobFile(job({ id: "live-1", status: "processing", statusLabel: "Rendering", fileName: null, completedAt: null, pid: process.pid }));
  assert.equal(getJob("live-1")?.status, "processing");
});

test("listJobs sees disk jobs, filters by project and activity, newest first", () => {
  writeJobFile(job({ id: "a-old", projectId: "proj-b", createdAt: "2026-07-22T00:00:00.000Z" }));
  writeJobFile(job({ id: "a-new", projectId: "proj-b", createdAt: "2026-07-22T02:00:00.000Z" }));
  const forB = listJobs({ projectId: "proj-b" });
  assert.deepEqual(forB.map((entry) => entry.id), ["a-new", "a-old"]);
  assert.equal(listJobs({ projectId: "proj-b", activeOnly: true }).length, 0);
});

test("unknown and hostile job ids fail closed", () => {
  assert.equal(getJob("no-such-job"), undefined);
  assert.equal(getJob("../escape"), undefined);
});

test("checkpoint failure blocks encoding instead of silently omitting the retrospective", () => {
  createProject("checkpoint-error", "web");
  const skills = path.join(root, "broken-skills");
  fs.mkdirSync(skills);
  fs.writeFileSync(path.join(skills, "catalog.json"), "invalid-json");
  process.env.DREAMCUT_SKILLS_DIR = skills;
  try {
    const result = startRender("checkpoint-error", [], "http://127.0.0.1:1");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(String(result.body.error), /retrospective checkpoint/);
    assert.equal(listJobs({ projectId: "checkpoint-error" })[0]?.status, "failed");
  } finally { delete process.env.DREAMCUT_SKILLS_DIR; }
});

test("CLI delivery uses the same tracked job entry point as UI delivery", () => {
  const source = fs.readFileSync(path.resolve("scripts/render.ts"), "utf8");
  assert.match(source, /startRender\(projectId,/);
  assert.doesNotMatch(source, /await renderProjectVideo\(/);
});

test('Rust exports fail before creating a job when the server feature is disabled',()=>{
 const before=process.env.DREAMCUT_NATIVE_PREVIEW;delete process.env.DREAMCUT_NATIVE_PREVIEW;
 try{const result=startRender('disabled-rust',[],'http://localhost:3143',{backend:'rust'});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.status,400);assert.equal(listJobs({projectId:'disabled-rust'}).length,0);}
 finally{if(before!==undefined)process.env.DREAMCUT_NATIVE_PREVIEW=before;}
});

test('running exports keep their engine and cannot silently satisfy a different engine request',()=>{
 const before=process.env.DREAMCUT_NATIVE_PREVIEW;process.env.DREAMCUT_NATIVE_PREVIEW='1';
 writeJobFile(job({id:'native-active',projectId:'native-dedup',backend:'rust',status:'processing',pid:process.pid,completedAt:null}));
 try{
  const same=startRender('native-dedup',[],'http://localhost:3143',{backend:'rust'});assert.equal(same.ok,true);if(same.ok){assert.equal(same.alreadyInProgress,true);assert.equal(same.job.backend,'rust');}
  const other=startRender('native-dedup',[],'http://localhost:3143',{backend:'standard'});assert.equal(other.ok,false);if(!other.ok)assert.equal(other.status,409);
 }finally{if(before===undefined)delete process.env.DREAMCUT_NATIVE_PREVIEW;else process.env.DREAMCUT_NATIVE_PREVIEW=before;}
});

test('GPU export jobs preserve their renderer and reject requests for a different renderer',()=>{
 writeJobFile(job({id:'gpu-active',projectId:'gpu-dedup',backend:'gpu',status:'processing',pid:process.pid,completedAt:null}));
 const same=startRender('gpu-dedup',[],'http://localhost:3143',{backend:'gpu'});assert.equal(same.ok,true);if(same.ok)assert.equal(same.job.backend,'gpu');
 const different=startRender('gpu-dedup',[],'http://localhost:3143',{backend:'standard'});assert.equal(different.ok,false);if(!different.ok)assert.equal(different.status,409);
});
