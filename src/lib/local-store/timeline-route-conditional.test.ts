import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { GET } from "@/app/api/projects/[projectId]/timeline/route";
import { createProject, readTimeline } from "./store";
import { timelinePayload } from "./timeline-payload";
import { preparationDir } from "./media-preparation";
import { writePreviewSettings } from "./preview-settings";

function clip(id: string, source: string) {
  return { id, type: "video_clip", lane_key: "video_0", lane_index: 0, timeline_start: 0, duration: 2, trim_start: 0, trim_end: 0,
    source_url: source, volume: 1, props: {}, created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z", removed_at: null, removed_reason: null };
}

function withProjects(run: (root: string) => Promise<void>) {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-timeline-etag-"));
    const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, profile: process.env.DREAMCUT_PROFILE_DIR, autostart: process.env.MEDIA_PREPARATION_AUTOSTART };
    process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
    process.env.MEDIA_PREPARATION_AUTOSTART = "0";
    try {
      for (const id of ["fixture", "other"]) {
        createProject(id, "web");
        fs.mkdirSync(path.join(root, "projects", id, "media", "sources"), { recursive: true });
        fs.writeFileSync(path.join(root, "projects", id, "media", "sources", "clip.mp4"), `not really a video ${id}`);
      }
      await run(root);
    } finally {
      for (const [name, value] of [["TIMELINE_PROJECTS_DIR", previous.projects], ["DREAMCUT_PROFILE_DIR", previous.profile], ["MEDIA_PREPARATION_AUTOSTART", previous.autostart]] as const) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

async function get(etag?: string | null) {
  const response = await GET(new Request("http://localhost/api/projects/fixture/timeline", { headers: { "accept-encoding": "identity", ...(etag ? { "if-none-match": etag } : {}) } }),
    { params: Promise.resolve({ projectId: "fixture" }) });
  return { status: response.status, etag: response.headers.get("etag"), text: await response.text() };
}

/** Reads until the body settles (the first read queues preparation records), then checks the 304. */
async function settled(previousEtag?: string | null) {
  let last = await get(previousEtag);
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = await get(last.etag);
    if (next.status === 304) {
      assert.equal(next.text, "", "a 304 carries no body");
      assert.equal(next.etag, last.etag);
      return last;
    }
    last = next;
  }
  assert.fail("an unchanged timeline never answered 304");
}

function reference() {
  const filename = path.join(process.env.TIMELINE_PROJECTS_DIR!, "fixture", "timeline.json");
  const revision = createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
  return JSON.stringify({ ...timelinePayload("fixture", readTimeline("fixture")), revision });
}

function writeTimeline(root: string, elements: unknown[]) {
  fs.writeFileSync(path.join(root, "projects", "fixture", "timeline.json"), JSON.stringify({ elements, transitions: [] }, null, 1));
}

/** Replace every preparation record of a project with `change(record)`. */
function editRecords(projectId: string, change: (record: Record<string, unknown>) => Record<string, unknown>) {
  const dir = preparationDir(projectId);
  const records = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  assert.ok(records.length > 0, `${projectId} has a preparation record`);
  for (const name of records) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(change(JSON.parse(fs.readFileSync(file, "utf8")))));
  }
}
const fail = (error: string) => (record: Record<string, unknown>) => ({ ...record, state: "failed", error });

test("the timeline answers 304 while unchanged and a new tag after each input it reads changes", withProjects(async (root) => {
  writeTimeline(root, [clip("a", "/api/projects/fixture/media/sources/clip.mp4"), clip("b", "/api/projects/other/media/sources/clip.mp4")]);
  await get(); // queues preparation records for both clips; a preparing project is never cached
  editRecords("fixture", fail("First failure"));
  editRecords("other", fail("First failure"));
  const first = await settled();
  assert.equal(first.status, 200);
  assert.ok(first.etag);
  assert.equal(first.text, reference(), "the cached body is the uncached payload, byte for byte");

  // A timeline edit.
  writeTimeline(root, [clip("a", "/api/projects/fixture/media/sources/clip.mp4"), clip("b", "/api/projects/other/media/sources/clip.mp4"), clip("c", "/api/projects/fixture/media/sources/clip.mp4")]);
  const edited = await settled(first.etag);
  assert.equal(edited.status, 200);
  assert.notEqual(edited.etag, first.etag);
  assert.equal(edited.text, reference());

  // A preparation record of this project changes (the worker finished or failed).
  editRecords("fixture", fail("Preview could not be made"));
  const prepared = await settled(edited.etag);
  assert.notEqual(prepared.etag, edited.etag);
  assert.match(prepared.text, /Preview could not be made/);
  assert.equal(prepared.text, reference());

  // A preparation record of another project whose media the timeline uses.
  const before = prepared.text.match(/Preview could not be made/g)!.length;
  editRecords("other", fail("Preview could not be made"));
  const referenced = await settled(prepared.etag);
  assert.notEqual(referenced.etag, prepared.etag);
  assert.equal(referenced.text.match(/Preview could not be made/g)!.length, before + 1);

  // The preview size changes (a profile setting, outside the project).
  writePreviewSettings("fixture", "hd");
  const requeued = await get(referenced.etag);
  assert.equal(requeued.status, 200, "a new preview size re-prepares this project's clip");
  assert.notEqual(requeued.etag, referenced.etag);
  editRecords("fixture", (record) => record.state === "preparing" ? fail("Larger preview could not be made")(record) : record);
  const quality = await settled(requeued.etag);
  assert.notEqual(quality.etag, referenced.etag);
  assert.match(quality.text, /"quality":"hd"/);
  assert.equal(quality.text, reference());
}));

test("a project whose preparation is still running is rebuilt on every read until it settles", withProjects(async (root) => {
  writeTimeline(root, [clip("a", "/api/projects/fixture/media/sources/clip.mp4")]);
  const first = await get();
  assert.equal(first.status, 200);
  assert.match(first.text, /"state":"preparing"/, "the first read queues the clip's preparation");
  // Unchanged inputs, the tag sent back: still a full rebuild and body, so the read keeps the worker going.
  for (let read = 0; read < 3; read++) {
    const again = await get(first.etag);
    assert.equal(again.status, 200);
    assert.equal(again.etag, first.etag);
    assert.equal(again.text, reference());
  }

  // The worker finishes: a ready package with its files on disk.
  const prepared = path.join(root, "projects", "fixture", "media", ".prepared");
  fs.mkdirSync(prepared, { recursive: true });
  for (const name of ["preview.mp4", "render.mp4"]) fs.writeFileSync(path.join(prepared, name), name);
  editRecords("fixture", (record) => ({ ...record, state: "ready", stage: undefined, preview: ".prepared/preview.mp4", render: ".prepared/render.mp4" }));
  const ready = await settled(first.etag);
  assert.notEqual(ready.etag, first.etag);
  assert.doesNotMatch(ready.text, /"state":"preparing"/);
  assert.equal(ready.text, reference());
}));
