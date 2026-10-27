import test from "node:test";
import assert from "node:assert/strict";

import { clampElementToActualSourceDuration } from "./source-duration";
import type { TimelineElement } from "./types";

function buildElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: "music-1",
    project_id: "project-1",
    type: "music",
    source_url: "https://example.com/track.wav",
    props: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 44.474,
    lane_key: "music_0",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 0.35,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

test("clampElementToActualSourceDuration caps audio clips to decoded source duration", () => {
  const result = clampElementToActualSourceDuration(
    buildElement({ _source_duration: 32.7682 }),
  );

  assert.equal(result.duration, 32.768);
});

test("clampElementToActualSourceDuration preserves shorter clips", () => {
  const element = buildElement({ duration: 12, _source_duration: 32.7682 });
  const result = clampElementToActualSourceDuration(element);

  assert.equal(result, element);
});

test("clampElementToActualSourceDuration ignores non-audio element types", () => {
  const element = buildElement({
    type: "video_clip",
    lane_key: "visual_0",
    duration: 40,
    _source_duration: 5,
  });

  const result = clampElementToActualSourceDuration(element);
  assert.equal(result, element);
});
