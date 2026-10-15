import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { unexpectedBlackIntervals } from "@/lib/qc/intentional-black";

function stage(id: string, start: number, duration: number, intentional = true): TimelineElement {
  return {
    id,
    project_id: "fixture",
    type: "caption_text",
    beat_id: null,
    character_id: null,
    lane_key: "captions_0",
    lane_index: 0,
    timeline_start: start,
    duration,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    source_url: null,
    props: intentional ? { intentional_black_stage: true } : {},
    created_at: "2026-07-21T00:00:00.000Z",
    updated_at: "2026-07-21T00:00:00.000Z",
    removed_at: null,
    removed_reason: null,
    position_locked: false,
  };
}

test("adjacent declared black-stage elements can cover one detected interval", () => {
  const black = [{ start: 55.57, end: 56.5, duration: 0.93 }];
  const elements = [stage("a", 55.57, 0.27), stage("b", 55.84, 0.34), stage("c", 56.18, 0.45)];
  assert.deepEqual(unexpectedBlackIntervals(black, elements), []);
});

test("an undeclared gap remains a delivery finding", () => {
  const black = [{ start: 10, end: 11, duration: 1 }];
  const elements = [stage("a", 10, 0.3), stage("b", 10.6, 0.4)];
  assert.deepEqual(unexpectedBlackIntervals(black, elements), black);
});
