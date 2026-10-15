import assert from "node:assert/strict";
import test from "node:test";

import {
  insertTimelineElement,
  mergePatchIntoElementList,
  pickElementPatchBeforeState,
  replaceAndInsertTimelineElements,
} from "@/components/studio/timeline/editor-helpers";
import type { TimelineElement } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    project_id: "project-1",
    type: "still",
    source_url: null,
    props: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 1,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-03-18T00:00:00.000Z",
    updated_at: "2026-03-18T00:00:00.000Z",
    ...overrides,
  };
}

test("insertTimelineElement keeps elements ordered by lane, start, then created_at", () => {
  const elements = [
    buildElement({ id: "b", lane_index: 1, lane_key: "audio_narrator", timeline_start: 0, created_at: "2026-03-18T00:00:01.000Z" }),
    buildElement({ id: "a", lane_index: 0, lane_key: "visual_0", timeline_start: 4, created_at: "2026-03-18T00:00:02.000Z" }),
  ];

  const inserted = buildElement({
    id: "c",
    lane_index: 0,
    lane_key: "visual_0",
    timeline_start: 2,
    created_at: "2026-03-18T00:00:03.000Z",
  });

  const next = insertTimelineElement(elements, inserted);

  assert.deepEqual(next.map((element) => element.id), ["c", "a", "b"]);
});

test("mergePatchIntoElementList only patches the targeted element", () => {
  const elements = [
    buildElement({ id: "a", timeline_start: 1, duration: 2 }),
    buildElement({ id: "b", timeline_start: 5, duration: 3 }),
  ];

  const next = mergePatchIntoElementList(elements, "b", { timeline_start: 8, duration: 4 });

  assert.equal(next[0]?.timeline_start, 1);
  assert.equal(next[1]?.timeline_start, 8);
  assert.equal(next[1]?.duration, 4);
});

test("replaceAndInsertTimelineElements replaces one element and inserts another in sorted order", () => {
  const elements = [
    buildElement({ id: "original", timeline_start: 4, created_at: "2026-03-18T00:00:02.000Z" }),
    buildElement({ id: "other", timeline_start: 9, created_at: "2026-03-18T00:00:03.000Z" }),
  ];

  const updated = buildElement({ id: "original", timeline_start: 4, duration: 1.5, created_at: "2026-03-18T00:00:02.000Z" });
  const inserted = buildElement({ id: "inserted", timeline_start: 5.5, created_at: "2026-03-18T00:00:04.000Z" });

  const next = replaceAndInsertTimelineElements(elements, "original", updated, inserted);

  assert.deepEqual(next.map((element) => element.id), ["original", "inserted", "other"]);
  assert.equal(next[0]?.duration, 1.5);
});

test("pickElementPatchBeforeState captures only the patched fields", () => {
  const element = buildElement({
    timeline_start: 3,
    duration: 6,
    props: { disabled: false, label: "Intro" },
  });

  const before = pickElementPatchBeforeState(element, {
    duration: 4,
    props: { disabled: true },
  });

  assert.deepEqual(before, {
    duration: 6,
    props: { disabled: false, label: "Intro" },
  });
});

test("pickElementPatchBeforeState marks newly introduced props so undo can clear a merged setting", () => {
  const element = buildElement({ props: { disabled: false } });

  const before = pickElementPatchBeforeState(element, {
    props: { disabled: true, keyframes: { media_offset_x: [{ t: 0, v: 0 }] } },
  });

  assert.deepEqual(before, {
    props: { disabled: false, keyframes: null },
  });
});
