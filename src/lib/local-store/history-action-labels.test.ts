import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { HISTORY_ACTION_HEADER, HISTORY_LABEL_HEADER } from "@/lib/timeline/history-label";
import { withEditRequestActor } from "./edit-attribution";
import { listHistoryPage } from "./history-list";
import { captureProjectHistorySnapshot, createProject, restoreProjectHistorySnapshot, writeTimeline } from "./store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-action-labels-"));
process.env.TIMELINE_PROJECTS_DIR = root;

function cat(props: Record<string, unknown> = {}, removed = false): TimelineElement {
  const now = "2026-10-10T00:00:00.000Z";
  return {
    id: "22222222-2222-4222-8222-222222222222", project_id: "labels", type: "video_clip", source_url: "/media/sources/cat.mp4",
    props: { timeline_label: "Cat", ...props }, beat_id: null, voice_clip_id: null, character_id: null, timeline_start: 0, duration: 2,
    lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: removed ? now : null, removed_reason: null, created_at: now, updated_at: now,
  };
}

/** Run a write inside the same request-attribution wrapper the editor routes use. */
async function asEditorRequest(run: () => void, history?: { action: string; label: string }) {
  const headers = new Headers({ "x-dreamcut-client": "editor" });
  if (history) { headers.set(HISTORY_ACTION_HEADER, history.action); headers.set(HISTORY_LABEL_HEADER, encodeURIComponent(history.label)); }
  const handler = withEditRequestActor(async () => { run(); return new Response("ok"); });
  await handler(new Request("http://localhost/api/projects/labels/timeline/elements/x", { method: "PATCH", headers }));
}

async function tick() { await new Promise(resolve => setTimeout(resolve, 5)); }

test("saved history names the change, and undo/redo replays name the step they reverse", async () => {
  createProject("labels", "web");
  await asEditorRequest(() => writeTimeline("labels", { elements: [cat()], transitions: [] }, "element_create")); await tick();
  await asEditorRequest(() => writeTimeline("labels", { elements: [cat({ media_mirror: "horizontal" })], transitions: [] }, "element_patch")); await tick();
  // Undo replays the inverse patch through the ordinary route.
  await asEditorRequest(() => writeTimeline("labels", { elements: [cat({ media_mirror: "none" })], transitions: [] }, "element_patch"), { action: "undo", label: "Flip clip" }); await tick();
  await asEditorRequest(() => writeTimeline("labels", { elements: [cat({ media_mirror: "horizontal" })], transitions: [] }, "element_patch"), { action: "redo", label: "Flip clip" }); await tick();
  // Undo of the add soft-deletes the clip; it must not read as a new "Remove" edit.
  await asEditorRequest(() => writeTimeline("labels", { elements: [cat({ media_mirror: "horizontal" }, true)], transitions: [] }, "element_delete"), { action: "undo", label: "Add Cat" }); await tick();
  await asEditorRequest(() => writeTimeline("labels", { elements: [cat({ media_mirror: "horizontal" })], transitions: [] }, "element_restore"), { action: "redo", label: "Add Cat" });

  const labels = listHistoryPage("labels").entries.map(entry => entry.label).reverse();
  assert.deepEqual(labels.slice(-6), ["Add Cat", "Flip Cat", "Undo: Flip Cat", "Redo: Flip Cat", "Undo: Add Cat", "Redo: Add Cat"]);
  const undo = listHistoryPage("labels").entries.find(entry => entry.label === "Undo: Flip Cat");
  assert.equal(undo?.kind, "History");
});

test("snapshot restores keep their safety path and are labelled as Undo of the restored step", async () => {
  createProject("restore-labels", "web");
  writeTimeline("restore-labels", { elements: [cat()], transitions: [] }, "seed"); await tick();
  const before = captureProjectHistorySnapshot("restore-labels", "generate_captions_before"); await tick();
  writeTimeline("restore-labels", { elements: [cat({ media_opacity: 0.5 })], transitions: [] }, "generate_captions_after"); await tick();
  await asEditorRequest(() => { restoreProjectHistorySnapshot("restore-labels", before.id, "history_restore"); }, { action: "undo", label: "Generate captions" });
  const [latest] = listHistoryPage("restore-labels").entries;
  assert.equal(latest!.label, "Undo: Generate captions");
  assert.equal(latest!.kind, "History");
});

test("older restores without a recorded action are named from the snapshot they returned to", () => {
  createProject("legacy-restore", "web");
  const dir = path.join(root, "legacy-restore", "history"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "2026-10-10T00-00-00-000Z-history_restore.json"), JSON.stringify({ op: "history_restore", at: "2026-10-10T00:00:00Z", restores_snapshot_id: "2026-10-09T00-00-00-000Z-generate_captions_before.json", timeline: {} }));
  fs.writeFileSync(path.join(dir, "2026-10-10T00-00-01-000Z-history_restore.json"), JSON.stringify({ op: "history_restore", at: "2026-10-10T00:00:01Z", restores_snapshot_id: "2026-10-09T00-00-00-000Z-generate_captions_after.json", timeline: {} }));
  const labels = listHistoryPage("legacy-restore").entries.map(entry => entry.label);
  assert.deepEqual(labels, ["Redo: Generate captions", "Undo: Generate captions"]);
});
