import assert from "node:assert/strict";
import test from "node:test";

import { selectBackwardElementIds, selectForwardElementIds } from "./select-forward";
import type { TimelineElement } from "./types";

function element(id: string, start: number, duration = 2): TimelineElement {
  return {
    id,
    project_id: "project",
    type: "still",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: start,
    duration,
    trim_start: 0,
    trim_end: 0,
    playback_rate: 1,
    fade_in: 0,
    fade_out: 0,
    volume: 1,
    position_locked: false,
    source_url: null,
    props: {},
    beat_id: null,
    character_id: null,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

test("select forward includes items beginning on or after the playhead", () => {
  assert.deepEqual(
    selectForwardElementIds([element("before", 1), element("at", 5), element("after", 8)], 5),
    ["at", "after"],
  );
});

test("select forward excludes a clip crossing the playhead until it is split", () => {
  assert.deepEqual(selectForwardElementIds([element("crossing", 4, 4), element("after", 9)], 5), ["after"]);
});

test("select forward ignores removed and disabled items", () => {
  const removed = { ...element("removed", 6), removed_at: "2026-01-02T00:00:00.000Z" };
  const disabled = { ...element("disabled", 7), props: { disabled: true } };
  assert.deepEqual(selectForwardElementIds([removed, disabled, element("active", 8)], 5), ["active"]);
});

test("select backward includes items ending on or before the playhead", () => {
  assert.deepEqual(
    selectBackwardElementIds([element("before", 1, 2), element("at", 3, 2), element("after", 8)], 5),
    ["before", "at"],
  );
});

test("select backward excludes a clip crossing the playhead until it is split", () => {
  assert.deepEqual(selectBackwardElementIds([element("before", 1), element("crossing", 4, 4)], 5), ["before"]);
});
