import assert from "node:assert/strict";
import test from "node:test";

import {
  collectTimelineEditPointFrames,
  nextTimelineEditPointFrame,
  previousTimelineEditPointFrame,
} from "./timeline-edit-points";
import type { TimelineElement } from "./types";

function element(id: string, start: number, duration: number): TimelineElement {
  return {
    id, project_id: "project", type: "still", lane_key: "visual_0", lane_index: 0,
    timeline_start: start, duration, trim_start: 0, trim_end: 0, playback_rate: 1,
    fade_in: 0, fade_out: 0, volume: 1, position_locked: false, source_url: null,
    props: {}, beat_id: null, character_id: null, removed_at: null, removed_reason: null,
    created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  };
}

test("collects sorted unique clip boundaries plus timeline bounds", () => {
  assert.deepEqual(
    collectTimelineEditPointFrames([element("a", 1, 2), element("b", 3, 2)], 181),
    [0, 30, 90, 150, 180],
  );
});

test("previous and next navigation move strictly away from the current edit", () => {
  const points = [0, 30, 90, 150, 180];
  assert.equal(previousTimelineEditPointFrame(points, 90), 30);
  assert.equal(nextTimelineEditPointFrame(points, 90, 181), 150);
});

test("navigation falls back to the timeline bounds", () => {
  const points = [0, 180];
  assert.equal(previousTimelineEditPointFrame(points, 0), 0);
  assert.equal(nextTimelineEditPointFrame(points, 180, 181), 180);
});
