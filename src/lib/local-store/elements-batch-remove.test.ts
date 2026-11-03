import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { createProject, readTimeline, writeTimeline } from "./store";
import { POST as batchRoute } from "@/app/api/projects/[projectId]/timeline/elements/batch/route";

// Cutting a copied timeline down (a vertical short from a finished tutorial) removed 1,600+
// elements; elements_batch advertised removed_at but refused it (2026-10-28 retro).
function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id, project_id: "test", type: "vo_full", source_url: "/speech.wav",
    props: { source_duration_seconds: 10 }, beat_id: null, character_id: null, voice_clip_id: null,
    timeline_start: 0, duration: 4, trim_start: 0, trim_end: null, lane_key: "audio_narrator", lane_index: 0,
    volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
    removed_at: null, removed_reason: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const SPEECH = "11111111-1111-4111-8111-111111111111";
const CAPTION = "22222222-2222-4222-8222-222222222222";
const KEEP = "33333333-3333-4333-8333-333333333333";
const LOCKED = "44444444-4444-4444-8444-444444444444";

async function withProject(run: () => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements-batch-remove-"));
  const prior = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("test", "web");
    writeTimeline("test", { elements: [
      element(SPEECH),
      element(CAPTION, { type: "caption_text", source_url: null, lane_key: "captions_0",
        props: { text: "One two", caption_source_element_id: SPEECH, caption_follow_audio: true } }),
      element(KEEP, { timeline_start: 4, lane_key: "audio_other" }),
      element(LOCKED, { timeline_start: 8, lane_key: "audio_other", position_locked: true }),
    ], transitions: [] }, "fixture");
    await run();
  } finally {
    if (prior === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const post = (operations: unknown[]) => batchRoute(new Request("http://localhost/test", {
  method: "POST", body: JSON.stringify({ operations }),
}), { params: Promise.resolve({ projectId: "test" }) });

test("elements_batch removes elements in one call, and their linked captions follow", async () => {
  await withProject(async () => {
    const response = await post([{ element_id: SPEECH, remove: true }]);
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual((await response.json()).removed_element_ids, [SPEECH]);
    const byId = new Map(readTimeline("test").elements.map(item => [item.id, item]));
    assert.ok(byId.get(SPEECH)!.removed_at);
    assert.ok(byId.get(CAPTION)!.removed_at, "the speech clip's caption is removed with it");
    assert.equal(byId.get(KEEP)!.removed_at, null);
  });
});

test("elements_batch refuses a locked removal or a removal mixed with a patch, writing nothing", async () => {
  await withProject(async () => {
    const before = readTimeline("test");
    const locked = await post([{ element_id: KEEP, remove: true }, { element_id: LOCKED, remove: true }]);
    assert.equal(locked.status, 400);
    assert.match((await locked.json()).error, /locked/);
    const mixed = await post([{ element_id: KEEP, remove: true, patch: { volume: 0.5 } }]);
    assert.equal(mixed.status, 400);
    assert.deepEqual(readTimeline("test").elements, before.elements);
  });
});
