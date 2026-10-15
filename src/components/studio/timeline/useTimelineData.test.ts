import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeTimelineLoadResult } from "@/components/studio/timeline/useTimelineData";
import type { TimelineElement } from "@/components/studio/timeline/types";

function buildElement(id: string): TimelineElement {
  return {
    id,
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
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
}

test("sanitizeTimelineLoadResult normalizes timeline payloads and dedupes lane keys", () => {
  const next = sanitizeTimelineLoadResult(
    {
      elements: [buildElement("a")],
      transitions: [],
      beats: [],
      lane_defaults: { captions_0: { fontPreset: "display_serif" } },
      lane_order_keys: ["visual_0", "visual_0", "visual_1"],
      has_autoplaced: true,
      aspect_ratio: "16:9",
    },
    [{ id: "char-1", name: "Alice" }],
  );

  assert.equal(next.elements.length, 1);
  assert.deepEqual(next.laneOrderKeys, ["visual_0", "visual_1"]);
  assert.equal(next.extraLaneKeys.has("visual_1"), true);
  assert.deepEqual(next.mutedLaneKeys, []);
  assert.equal(next.hasAutoplaced, true);
  assert.equal(next.aspectRatio, "16:9");
  assert.equal(next.characters.get("char-1"), "Alice");
});

test("sanitizeTimelineLoadResult preserves persisted muted lane keys", () => {
  const next = sanitizeTimelineLoadResult(
    {
      elements: [],
      transitions: [],
      beats: [],
      lane_defaults: {},
      lane_order_keys: ["music_0", "sound_effect_0"],
      muted_lane_keys: ["music_0", "music_0", "sound_effect_0"],
      has_autoplaced: false,
      aspect_ratio: "9:16",
    },
    [],
  );

  assert.deepEqual(next.mutedLaneKeys, ["music_0", "sound_effect_0"]);
});

test("sanitizeTimelineLoadResult falls back safely for malformed payloads", () => {
  const next = sanitizeTimelineLoadResult(
    {
      aspect_ratio: "bad-value",
    },
    { characters: [{ id: "char-2" }, { name: "Missing Id" }] },
  );

  assert.deepEqual(next.elements, []);
  assert.deepEqual(next.transitions, []);
  assert.deepEqual(next.laneOrderKeys, []);
  assert.deepEqual(next.mutedLaneKeys, []);
  assert.equal(next.aspectRatio, "9:16");
  assert.equal(next.characters.size, 0);
});
