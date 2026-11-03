import assert from "node:assert/strict";
import test from "node:test";

import { resolveShelfPlacementPayload } from "@/components/studio/timeline/timeline-shelf-placement";
import type { ElementCreatePayload } from "@/components/studio/timeline/AssetShelf";
import type { LaneDef, TimelineElement } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
    project_id: "project-1",
    type: overrides.type ?? "still",
    source_url: "https://example.com/asset.png",
    props: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: overrides.timeline_start ?? 0,
    duration: overrides.duration ?? 2,
    lane_key: overrides.lane_key ?? "visual_0",
    lane_index: overrides.lane_index ?? 0,
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

function buildPayload(overrides: Partial<ElementCreatePayload> = {}): ElementCreatePayload {
  return {
    type: overrides.type ?? "still",
    source_url: overrides.source_url ?? "https://example.com/asset.png",
    beat_id: overrides.beat_id ?? null,
    voice_clip_id: overrides.voice_clip_id ?? null,
    character_id: overrides.character_id ?? null,
    timeline_start: overrides.timeline_start ?? 8,
    duration: overrides.duration === undefined ? 2 : overrides.duration,
    lane_key: overrides.lane_key ?? "visual_0",
    lane_index: overrides.lane_index ?? 0,
    props: overrides.props,
  };
}

const lanes: LaneDef[] = [
  { key: "visual_0", label: "Visual 1", color: "#fff", type: "visual", height: 120, minHeight: 80, maxHeight: 200 },
  { key: "visual_1", label: "Visual 2", color: "#fff", type: "visual", height: 120, minHeight: 80, maxHeight: 200 },
];

test("resolveShelfPlacementPayload snaps supported assets to the playhead", async () => {
  const payload = await resolveShelfPlacementPayload({
    payload: buildPayload({ timeline_start: 100 }),
    playheadSec: 3.25,
    lanes,
    elements: [],
    addLane: async () => null,
  });

  assert.equal(payload?.timeline_start, 3.25);
});

test("resolveShelfPlacementPayload reuses an open visual lane before adding one", async () => {
  const payload = await resolveShelfPlacementPayload({
    payload: buildPayload({ type: "video_clip", lane_key: "visual_0" }),
    playheadSec: 1,
    lanes,
    elements: [buildElement({ lane_key: "visual_0", timeline_start: 1, duration: 2 })],
    addLane: async () => {
      throw new Error("should not add lane");
    },
  });

  assert.equal(payload?.lane_key, "visual_1");
});

test("resolveShelfPlacementPayload asks for a new visual lane when none are free", async () => {
  const payload = await resolveShelfPlacementPayload({
    payload: buildPayload({ type: "still", lane_key: "visual_0" }),
    playheadSec: 1,
    lanes,
    elements: [
      buildElement({ lane_key: "visual_0", timeline_start: 1, duration: 2 }),
      buildElement({ id: "el-2", lane_key: "visual_1", timeline_start: 1, duration: 2 }),
    ],
    addLane: async () => "visual_2",
  });

  assert.equal(payload?.lane_key, "visual_2");
  assert.equal(payload?.lane_index, 2);
});

test("resolveShelfPlacementPayload stacks audio-type additions onto the next lane slot", async () => {
  const payload = await resolveShelfPlacementPayload({
    payload: buildPayload({ type: "music", lane_key: "music_0" }),
    playheadSec: 1,
    lanes,
    elements: [
      buildElement({ id: "music-1", type: "music", lane_key: "music_0", timeline_start: 1, duration: 2 }),
      buildElement({ id: "music-2", type: "music", lane_key: "music_1", lane_index: 1, timeline_start: 1, duration: 2 }),
    ],
    addLane: async () => {
      throw new Error("should not add visual lane for stacked audio");
    },
  });

  assert.equal(payload?.timeline_start, 1);
  assert.equal(payload?.lane_key, "music_2");
  assert.equal(payload?.lane_index, 2);
});

test("resolveShelfPlacementPayload stacks sound effects onto dedicated SFX lanes", async () => {
  const payload = await resolveShelfPlacementPayload({
    payload: buildPayload({ type: "sound_effect", lane_key: "sound_effect_0" }),
    playheadSec: 1,
    lanes,
    elements: [
      buildElement({ id: "sfx-1", type: "sound_effect", lane_key: "sound_effect_0", timeline_start: 1, duration: 2 }),
      buildElement({ id: "sfx-2", type: "sound_effect", lane_key: "sound_effect_1", lane_index: 1, timeline_start: 1, duration: 2 }),
    ],
    addLane: async () => {
      throw new Error("should not add visual lane for stacked SFX");
    },
  });

  assert.equal(payload?.timeline_start, 1);
  assert.equal(payload?.lane_key, "sound_effect_2");
  assert.equal(payload?.lane_index, 2);
});

test("resolveShelfPlacementPayload keeps a video of unknown length clear of later clips", async () => {
  const payload = await resolveShelfPlacementPayload({
    payload: buildPayload({ type: "video_clip", lane_key: "visual_0", duration: null }),
    playheadSec: 1,
    lanes,
    elements: [buildElement({ lane_key: "visual_0", timeline_start: 10, duration: 2 })],
    addLane: async () => {
      throw new Error("should not add lane");
    },
  });

  assert.equal(payload?.lane_key, "visual_1");
  assert.equal(payload?.duration, null);
});
