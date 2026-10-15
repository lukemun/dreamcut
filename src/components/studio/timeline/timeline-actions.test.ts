import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBeatDurationUpdates,
  buildLeftEdgeResizeInput,
  calculateBeatBoundaryDurationUpdates,
  calculateFitBeatToVisualContentUpdates,
  calculateMoveElementPatch,
  calculateResolvedGroupMovePatches,
  calculateResolvedMoveElementPatch,
  calculateSpeechSyncedTimingPatch,
  expandSpeechClockMovePatches,
  calculateMoveBeatVisualsToStart,
  calculatePlaybackRatePatch,
  calculateResizeElementPatch,
  findFreeVisualLanePatch,
  resolveEditableSpeechSourceElement,
} from "@/components/studio/timeline/timeline-actions";
import type { TimelineBeatBand } from "@/components/studio/timeline/types";
import type { TimelineElement } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
    project_id: "project-1",
    type: "video_clip",
    source_url: null,
    props: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 4,
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

function buildBeatBand(overrides: Partial<TimelineBeatBand>): TimelineBeatBand {
  return {
    id: overrides.id ?? "beat-1",
    sort_order: overrides.sort_order ?? 0,
    beat_label: overrides.beat_label ?? "Beat 1",
    duration_seconds: overrides.duration_seconds ?? 4,
    startSec: overrides.startSec ?? 0,
    endSec: overrides.endSec ?? 4,
    ...overrides,
  };
}

test("calculateMoveElementPatch updates start and visual lane only when changed", () => {
  const element = buildElement({ timeline_start: 2, lane_key: "visual_0", lane_index: 0 });

  const patch = calculateMoveElementPatch(element, {
    timelineStart: 3.2349,
    laneKey: "visual_2",
  });

  assert.deepEqual(patch, {
    timeline_start: 3.235,
    lane_key: "visual_2",
    lane_index: 2,
  });
});

test("buildLeftEdgeResizeInput expands a clip while preserving its right edge", () => {
  const element = buildElement({ type: "still", timeline_start: 10, duration: 4 });

  assert.deepEqual(buildLeftEdgeResizeInput(element, 8.25), {
    timelineStart: 8.25,
    duration: 5.75,
  });
});

test("resolveEditableSpeechSourceElement follows split descendants under a cutout edge", () => {
  const original = buildElement({
    id: "speech-root",
    timeline_start: 18,
    duration: 17.2,
  });
  const tail = buildElement({
    id: "speech-tail",
    timeline_start: 35.2,
    duration: 4.667,
    props: { split_from_id: "speech-root" },
  });
  const cutout = buildElement({
    id: "cutout",
    timeline_start: 32.867,
    duration: 6.533,
    lane_key: "visual_15",
    lane_index: 15,
    props: {
      has_alpha: true,
      speech_sync_binding: {
        schema_version: 1,
        source_element_id: "speech-root",
        source_sha256: "hash",
        source_start_seconds: 62.29,
        source_end_seconds: 75.187,
        source_playback_rate: 1.2,
      },
    },
  });

  assert.equal(
    resolveEditableSpeechSourceElement(cutout, [original, tail, cutout])?.id,
    "speech-tail",
  );
});

test("buildLeftEdgeResizeInput clamps before the right edge instead of moving the clip", () => {
  const element = buildElement({ type: "still", timeline_start: 10, duration: 4 });
  const input = buildLeftEdgeResizeInput(element, 20);

  assert.equal(input.timelineStart + input.duration, 14);
  assert.equal(input.duration, 0.033);
});

test("calculateMoveElementPatch updates SFX lane when moving between sound effect lanes", () => {
  const element = buildElement({
    type: "sound_effect",
    timeline_start: 2,
    lane_key: "sound_effect_0",
    lane_index: 0,
  });

  const patch = calculateMoveElementPatch(element, {
    laneKey: "sound_effect_2",
  });

  assert.deepEqual(patch, {
    lane_key: "sound_effect_2",
    lane_index: 2,
  });
});

test("calculateMoveElementPatch updates music lane when moving between music audition lanes", () => {
  const element = buildElement({
    type: "music",
    timeline_start: 0.625,
    lane_key: "music_0",
    lane_index: 0,
  });

  const patch = calculateMoveElementPatch(element, {
    laneKey: "music_2",
  });

  assert.deepEqual(patch, {
    lane_key: "music_2",
    lane_index: 2,
  });
});

test("calculateResolvedMoveElementPatch moves a visual clip to a free lane when the target lane conflicts", () => {
  const active = buildElement({
    id: "active",
    type: "video_clip",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 0,
    duration: 4,
  });

  const patch = calculateResolvedMoveElementPatch(
    active,
    { timelineStart: 3, laneKey: "visual_0" },
    [
      active,
      buildElement({ id: "other-1", lane_key: "visual_0", lane_index: 0, timeline_start: 2, duration: 3 }),
      buildElement({ id: "other-2", lane_key: "visual_1", lane_index: 1, timeline_start: 10, duration: 1 }),
    ],
  );

  assert.deepEqual(patch, {
    timeline_start: 3,
    lane_key: "visual_1",
    lane_index: 1,
  });
});

test("calculateResolvedMoveElementPatch falls back to the nearest open slot on the same lane when no free lane exists", () => {
  const active = buildElement({
    id: "active",
    type: "video_clip",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 0,
    duration: 4,
  });

  const patch = calculateResolvedMoveElementPatch(
    active,
    { timelineStart: 3, laneKey: "visual_0" },
    [
      active,
      buildElement({ id: "other-1", lane_key: "visual_0", lane_index: 0, timeline_start: 2, duration: 3 }),
      buildElement({ id: "other-2", lane_key: "visual_1", lane_index: 1, timeline_start: 1, duration: 6 }),
    ],
  );

  assert.deepEqual(patch, {
    timeline_start: 5,
  });
});

test("calculateResolvedMoveElementPatch allows a butt-joined clip when snapped end matches blocker start", () => {
  const active = buildElement({
    id: "active",
    type: "still",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 22.696,
    duration: 1.512,
  });

  const patch = calculateResolvedMoveElementPatch(
    active,
    { timelineStart: 22.791999999999998, laneKey: "visual_0" },
    [
      active,
      buildElement({
        id: "blocker",
        type: "video_clip",
        lane_key: "visual_0",
        lane_index: 0,
        timeline_start: 24.304,
        duration: 5,
      }),
    ],
  );

  assert.deepEqual(patch, {
    timeline_start: 22.792,
  });
});

test("moving a speech-bound cutout slips its source window instead of desynchronizing picture", () => {
  const speech = buildElement({
    id: "speech",
    timeline_start: 0,
    duration: 84.2,
    trim_start: 9.6,
    trim_end: 43.57,
    playback_rate: 1.08,
    props: { source_duration_seconds: 144.17 },
  });
  const cutout = buildElement({
    id: "cutout",
    lane_key: "visual_4",
    lane_index: 4,
    timeline_start: 56.633,
    duration: 4.467,
    trim_start: 3.26,
    trim_end: 2.616,
    playback_rate: 1.08,
    voice_clip_id: "speech",
    props: {
      source_duration_seconds: 10.7,
      custom_cutout_receipt: { source_interval_seconds: [67.5, 78.2] },
      speech_sync_binding: {
        schema_version: 1,
        source_element_id: "speech",
        source_sha256: "same-source",
        source_start_seconds: 70.76,
        source_end_seconds: 75.584,
        source_playback_rate: 1.08,
      },
    },
  });

  const patch = calculateResolvedMoveElementPatch(
    cutout,
    { timelineStart: 55.433 },
    [speech, cutout],
  );

  assert.equal(patch.timeline_start, 55.43333333333333);
  assert.equal(patch.duration, 4.466666666666667);
  assert.ok(Math.abs(Number(patch.trim_start) - 1.966) < 0.04);
  const binding = (patch.props as Record<string, any>).speech_sync_binding;
  assert.ok(Math.abs(binding.source_start_seconds - 69.468) < 0.04);
  assert.ok(Math.abs(binding.source_end_seconds - 74.292) < 0.04);
});

test("pulling a speech-bound cutout's left edge reveals source while keeping its right edge fixed", () => {
  const speech = buildElement({
    id: "speech",
    timeline_start: 0,
    duration: 84.2,
    trim_start: 9.6,
    trim_end: 43.57,
    playback_rate: 1.08,
    props: { source_duration_seconds: 144.17 },
  });
  const cutout = buildElement({
    id: "cutout",
    lane_key: "visual_4",
    lane_index: 4,
    timeline_start: 56.63333333333333,
    duration: 4.466666666666667,
    trim_start: 3.26,
    trim_end: 2.616,
    playback_rate: 1.08,
    voice_clip_id: "speech",
    props: {
      source_duration_seconds: 10.7,
      custom_cutout_receipt: { source_interval_seconds: [67.5, 78.2] },
      speech_sync_binding: {
        schema_version: 1,
        source_element_id: "speech",
        source_sha256: "same-source",
        source_start_seconds: 70.76,
        source_end_seconds: 75.584,
        source_playback_rate: 1.08,
      },
    },
  });

  const patch = calculateSpeechSyncedTimingPatch(
    cutout,
    { timelineStart: 55.433 },
    [speech, cutout],
    "resize",
  )!;

  assert.equal(patch.timeline_start, 55.43333333333333);
  assert.equal(patch.duration, 5.666666666666667);
  const binding = (patch.props as Record<string, any>).speech_sync_binding;
  assert.ok(Math.abs(binding.source_start_seconds - 69.468) < 0.04);
  assert.ok(Math.abs(binding.source_end_seconds - 75.588) < 0.04);
});

test("moving a speech clock bundles pictures and leaves captions to server projection", () => {
  const speech = buildElement({ id: "speech", timeline_start: 10 });
  const cutout = buildElement({
    id: "cutout",
    timeline_start: 12,
    voice_clip_id: "speech",
    props: { speech_sync_binding: { source_element_id: "speech" } },
  });
  const caption = buildElement({
    id: "caption",
    type: "caption_text",
    timeline_start: 12.5,
    lane_key: "captions_0",
    props: { caption_source_element_id: "speech", text: "hello" },
  });
  const unrelated = buildElement({ id: "unrelated", timeline_start: 3 });

  const patches = expandSpeechClockMovePatches(
    speech,
    { timeline_start: 11 },
    [speech, cutout, caption, unrelated],
  );

  assert.deepEqual(Object.fromEntries(patches), {
    speech: { timeline_start: 11 },
    cutout: {
      timeline_start: 13,
      props: {
        speech_sync_binding: { source_element_id: "speech" },
      },
    },
  });
});

test("calculateResolvedGroupMovePatches moves a selected group by a shared delta", () => {
  const lead = buildElement({ id: "lead", lane_key: "visual_0", timeline_start: 1, duration: 2 });
  const tail = buildElement({ id: "tail", lane_key: "visual_1", lane_index: 1, timeline_start: 4, duration: 3 });

  const patches = calculateResolvedGroupMovePatches(
    {
      elementIds: ["lead", "tail"],
      deltaSec: 1.25,
    },
    [lead, tail],
  );

  assert.deepEqual(Object.fromEntries(patches), {
    lead: { timeline_start: 2.25 },
    tail: { timeline_start: 5.25 },
  });
});

test("calculateResolvedGroupMovePatches aborts when a moved visual would collide with an unselected clip", () => {
  const lead = buildElement({ id: "lead", lane_key: "visual_0", timeline_start: 1, duration: 2 });
  const tail = buildElement({ id: "tail", lane_key: "visual_1", lane_index: 1, timeline_start: 4, duration: 3 });
  const blocker = buildElement({ id: "blocker", lane_key: "visual_0", timeline_start: 3, duration: 2 });

  const patches = calculateResolvedGroupMovePatches(
    {
      elementIds: ["lead", "tail"],
      deltaSec: 1.25,
    },
    [lead, tail, blocker],
  );

  assert.equal(patches.size, 0);
});

test("calculateResolvedGroupMovePatches shifts a selected visual group across lanes", () => {
  const lead = buildElement({ id: "lead", lane_key: "visual_0", lane_index: 0, timeline_start: 1, duration: 2 });
  const tail = buildElement({ id: "tail", lane_key: "visual_1", lane_index: 1, timeline_start: 4, duration: 3 });

  const patches = calculateResolvedGroupMovePatches(
    {
      elementIds: ["lead", "tail"],
      deltaSec: 0,
      laneDelta: 1,
      orderedVisualLaneKeys: ["visual_0", "visual_1", "visual_2"],
    },
    [lead, tail],
  );

  assert.deepEqual(Object.fromEntries(patches), {
    lead: { lane_key: "visual_1", lane_index: 1 },
    tail: { lane_key: "visual_2", lane_index: 2 },
  });
});

test("calculateResizeElementPatch trims from the start for trim-resize media", () => {
  const element = buildElement({
    type: "vo_segment",
    timeline_start: 10,
    duration: 4,
    trim_start: 2,
    playback_rate: 2,
  });

  const patch = calculateResizeElementPatch(element, { timelineStart: 9.5 });

  assert.deepEqual(patch, {
    timeline_start: 9.5,
    trim_start: 1,
    duration: 4.5,
  });
});

test("calculateResizeElementPatch caps duration for non-overflow media based on playable window", () => {
  const element = buildElement({
    type: "music",
    duration: 5,
    trim_start: 1,
    trim_end: 3,
    playback_rate: 1,
  });

  const patch = calculateResizeElementPatch(element, { duration: 20 });

  assert.deepEqual(patch, {
    duration: 8,
    trim_end: 0,
  });
});

test("calculateResizeElementPatch re-extends source-backed music after a right-edge trim", () => {
  const element = buildElement({
    type: "music",
    duration: 40,
    trim_start: 0,
    trim_end: 165.793,
    playback_rate: 1,
    _source_duration: 205.793,
    lane_key: "music_0",
    lane_index: 0,
  });

  const patch = calculateResizeElementPatch(element, { duration: 52.111 });

  assert.deepEqual(patch, {
    duration: 52.111,
    trim_end: 153.682,
  });
});

test("calculateResizeElementPatch lets source-backed SFX extend even when trim_end is null", () => {
  const element = buildElement({
    type: "sound_effect",
    duration: 2,
    trim_start: 3,
    trim_end: null,
    playback_rate: 1,
    _source_duration: 12,
    lane_key: "sound_effect_0",
    lane_index: 0,
  });

  const patch = calculateResizeElementPatch(element, { duration: 6 });

  assert.deepEqual(patch, {
    duration: 6,
  });
});

test("calculateResizeElementPatch lets source-backed SFX shrink below half a second", () => {
  const element = buildElement({
    type: "sound_effect",
    duration: 0.5,
    trim_start: 0,
    trim_end: 0.5,
    playback_rate: 1,
    _source_duration: 1,
    lane_key: "sound_effect_0",
    lane_index: 0,
  });

  const patch = calculateResizeElementPatch(element, { duration: 0.08 });

  assert.deepEqual(patch, {
    duration: 0.08,
    trim_end: 0.92,
  });
});

test("calculateResizeElementPatch lets captions extend from the right edge", () => {
  const element = buildElement({
    type: "caption_text",
    lane_key: "captions_0",
    lane_index: 0,
    timeline_start: 4,
    duration: 2,
    trim_end: null,
  });

  const patch = calculateResizeElementPatch(element, { duration: 5 }, [element]);

  assert.deepEqual(patch, {
    duration: 5,
  });
});

test("calculateResizeElementPatch clamps caption right-edge extension against the next blocker", () => {
  const element = buildElement({
    id: "caption-1",
    type: "caption_text",
    lane_key: "captions_0",
    lane_index: 0,
    timeline_start: 4,
    duration: 2,
  });

  const patch = calculateResizeElementPatch(
    element,
    { duration: 5 },
    [
      element,
      buildElement({
        id: "caption-2",
        type: "caption_text",
        lane_key: "captions_0",
        lane_index: 0,
        timeline_start: 7,
        duration: 2,
      }),
    ],
  );

  assert.deepEqual(patch, {
    duration: 3,
  });
});

test("calculateResizeElementPatch preserves overflow-hold metadata for video clips", () => {
  const element = buildElement({
    type: "video_clip",
    duration: 4,
    trim_start: 1,
    trim_end: 1,
    playback_rate: 1,
    _source_duration: 8,
    props: { existing: true },
  });

  const patch = calculateResizeElementPatch(element, { duration: 12 });

  assert.deepEqual(patch, {
    duration: 12,
    trim_end: 0,
    props: {
      existing: true,
      media_limit_duration_seconds: 6,
      source_duration_seconds: 8,
    },
  });
});

test("calculateResizeElementPatch consumes existing tail overflow before trimming video source", () => {
  const element = buildElement({
    type: "video_clip",
    duration: 8,
    trim_start: 1,
    trim_end: null,
    playback_rate: 1,
    _source_duration: 6,
    props: { source_duration_seconds: 6 },
  });

  const patch = calculateResizeElementPatch(element, { duration: 7 });

  assert.deepEqual(patch, {
    duration: 7,
    props: {
      source_duration_seconds: 6,
      media_limit_duration_seconds: 5,
    },
  });
});

test("calculateResizeElementPatch moves a visual right-edge extension to a free lane when the current lane conflicts", () => {
  const active = buildElement({
    id: "active",
    type: "still",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 1,
    duration: 2,
  });

  const patch = calculateResizeElementPatch(
    active,
    { duration: 8 },
    [
      active,
      buildElement({ id: "blocker", type: "still", lane_key: "visual_0", lane_index: 0, timeline_start: 5, duration: 2 }),
    ],
  );

  assert.deepEqual(patch, {
    duration: 8,
    lane_key: "visual_1",
    lane_index: 1,
  });
});

test("calculateResizeElementPatch creates a new visual lane when all existing lanes conflict", () => {
  const active = buildElement({
    id: "active",
    type: "still",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 1,
    duration: 2,
  });

  const patch = calculateResizeElementPatch(
    active,
    { duration: 8 },
    [
      active,
      buildElement({ id: "blocker", type: "still", lane_key: "visual_0", lane_index: 0, timeline_start: 5, duration: 2 }),
      buildElement({ id: "lane-1", type: "still", lane_key: "visual_1", lane_index: 1, timeline_start: 2, duration: 10 }),
    ],
  );

  assert.deepEqual(patch, {
    duration: 8,
    lane_key: "visual_2",
    lane_index: 2,
  });
});

test("calculateResizeElementPatch does not clamp shrink operations when a later clip exists", () => {
  const active = buildElement({
    id: "active",
    type: "still",
    lane_key: "visual_0",
    timeline_start: 1,
    duration: 4,
  });

  const patch = calculateResizeElementPatch(
    active,
    { duration: 2.5 },
    [
      active,
      buildElement({ id: "blocker", type: "still", lane_key: "visual_0", timeline_start: 8, duration: 2 }),
    ],
  );

  assert.deepEqual(patch, {
    duration: 2.5,
  });
});

test("calculateResizeElementPatch preserves requested visual duration by moving to a free lane when overlap already exists", () => {
  const active = buildElement({
    id: "active",
    type: "still",
    lane_key: "visual_0",
    timeline_start: 1,
    duration: 4,
  });

  const patch = calculateResizeElementPatch(
    active,
    { duration: 6 },
    [
      active,
      buildElement({ id: "already-overlapping", type: "still", lane_key: "visual_0", timeline_start: 4, duration: 2 }),
      buildElement({ id: "next-blocker", type: "still", lane_key: "visual_0", timeline_start: 7, duration: 2 }),
    ],
  );

  assert.deepEqual(patch, {
    duration: 6,
    lane_key: "visual_1",
    lane_index: 1,
  });
});

test("calculateResizeElementPatch allows video left extension beyond source using leading hold", () => {
  const element = buildElement({
    type: "video_clip",
    timeline_start: 10,
    duration: 4,
    trim_start: 1,
    trim_end: 1,
    playback_rate: 1,
    props: { existing: true, source_duration_seconds: 8 },
  });

  const patch = calculateResizeElementPatch(element, { timelineStart: 8.5 }, [element]);

  assert.deepEqual(patch, {
    timeline_start: 8.5,
    trim_start: 0,
    duration: 5.5,
    props: {
      existing: true,
      source_duration_seconds: 8,
      media_limit_duration_seconds: 7,
      leading_hold_duration_seconds: 0.5,
    },
  });
});

test("calculateResizeElementPatch collapses existing leading hold before trimming video media on left shrink", () => {
  const element = buildElement({
    type: "video_clip",
    timeline_start: 8.5,
    duration: 5.5,
    trim_start: 0,
    trim_end: 1,
    playback_rate: 1,
    props: {
      existing: true,
      source_duration_seconds: 8,
      media_limit_duration_seconds: 7,
      leading_hold_duration_seconds: 0.5,
    },
  });

  const patch = calculateResizeElementPatch(element, { timelineStart: 9.5 }, [element]);

  assert.deepEqual(patch, {
    timeline_start: 9.5,
    trim_start: 0.5,
    duration: 4.5,
    props: {
      existing: true,
      source_duration_seconds: 8,
      media_limit_duration_seconds: 6.5,
    },
  });
});

test("findFreeVisualLanePatch returns the next available visual lane when current lane conflicts", () => {
  const active = buildElement({ id: "active", lane_key: "visual_0", lane_index: 0, timeline_start: 0, duration: 4 });
  const elements = [
    active,
    buildElement({ id: "other-1", lane_key: "visual_0", lane_index: 0, timeline_start: 3, duration: 4 }),
    buildElement({ id: "other-2", lane_key: "visual_1", lane_index: 1, timeline_start: 1, duration: 1 }),
  ];

  const lanePatch = findFreeVisualLanePatch(active, elements, 5);

  assert.deepEqual(lanePatch, {
    lane_key: "visual_2",
    lane_index: 2,
  });
});

test("calculatePlaybackRatePatch updates duration and lane, preserving video hold metadata", () => {
  const active = buildElement({
    id: "active",
    type: "video_clip",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 0,
    duration: 8,
    trim_start: 1,
    trim_end: 1,
    playback_rate: 1,
    _source_duration: 12,
    props: { source_duration_seconds: 12 },
  });
  const result = calculatePlaybackRatePatch(
    active,
    0.5,
    [
      active,
      buildElement({ id: "conflict", lane_key: "visual_0", lane_index: 0, timeline_start: 10, duration: 10 }),
    ],
  );

  assert.deepEqual(result, {
    patch: {
      playback_rate: 0.5,
      duration: 16,
      lane_key: "visual_1",
      lane_index: 1,
      props: {
        source_duration_seconds: 12,
        media_limit_duration_seconds: 20,
      },
    },
    duration: 16,
    laneChanged: true,
    baseDuration: 16,
  });
});

test("calculatePlaybackRatePatch preserves an existing dragged overflow as a minimum duration when speeding up", () => {
  const active = buildElement({
    id: "active",
    type: "video_clip",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 0,
    duration: 8,
    trim_start: 1,
    trim_end: 5,
    playback_rate: 1,
    _source_duration: 12,
    props: { source_duration_seconds: 12 },
  });

  const result = calculatePlaybackRatePatch(active, 2, [active]);

  assert.deepEqual(result, {
    patch: {
      playback_rate: 2,
      duration: 8,
      props: {
        source_duration_seconds: 12,
        media_limit_duration_seconds: 3,
      },
    },
    duration: 8,
    laneChanged: false,
    baseDuration: 3,
  });
});

test("calculatePlaybackRatePatch strips still-wrapper metadata when speeding up a video clip", () => {
  const active = buildElement({
    id: "active",
    type: "video_clip",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 0,
    duration: 8,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    _source_duration: 8,
    props: {
      source_duration_seconds: 8,
      render_asset_type: "still_video",
      source_still_video_url: "https://example.com/source-still.mp4",
      source_still_video_duration_seconds: 3.2,
    },
  });

  const result = calculatePlaybackRatePatch(active, 2, [active]);
  const patch = result.patch as Record<string, unknown>;
  const props = patch.props as Record<string, unknown>;

  assert.deepEqual(result, {
    patch: {
      playback_rate: 2,
      duration: 4,
      props: {
        source_duration_seconds: 8,
        media_limit_duration_seconds: 4,
      },
    },
    duration: 4,
    laneChanged: false,
    baseDuration: 4,
  });
  assert.equal("render_asset_type" in props, false);
  assert.equal("source_still_video_url" in props, false);
  assert.equal("source_still_video_duration_seconds" in props, false);
});

test("calculatePlaybackRatePatch lets slower playback absorb and remove an old overflow", () => {
  const active = buildElement({
    id: "active",
    type: "video_clip",
    lane_key: "visual_0",
    lane_index: 0,
    timeline_start: 0,
    duration: 5,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    _source_duration: 4,
    props: {
      source_duration_seconds: 4,
      media_limit_duration_seconds: 4,
    },
  });

  const result = calculatePlaybackRatePatch(active, 0.5, [active]);

  assert.deepEqual(result, {
    patch: {
      playback_rate: 0.5,
      duration: 8,
      props: {
        source_duration_seconds: 4,
        media_limit_duration_seconds: 8,
      },
    },
    duration: 8,
    laneChanged: false,
    baseDuration: 8,
  });
});

test("calculateBeatBoundaryDurationUpdates adjusts adjacent beat durations", () => {
  const updates = calculateBeatBoundaryDurationUpdates(
    [
      buildBeatBand({ id: "beat-1", startSec: 0, endSec: 4, duration_seconds: 4 }),
      buildBeatBand({ id: "beat-2", startSec: 4, endSec: 10, duration_seconds: 6 }),
    ],
    "beat-2",
    "start",
    5.5,
  );

  assert.deepEqual([...updates!.entries()], [
    ["beat-1", 5.5],
    ["beat-2", 4.5],
  ]);
});

test("applyBeatDurationUpdates maps duration updates back to beats", () => {
  const next = applyBeatDurationUpdates(
    [
      { id: "beat-1", sort_order: 0, beat_label: "Beat 1", duration_seconds: 4 },
      { id: "beat-2", sort_order: 1, beat_label: "Beat 2", duration_seconds: 6 },
    ],
    new Map([["beat-2", 5]]),
  );

  assert.equal(next[0]?.duration_seconds, 4);
  assert.equal(next[1]?.duration_seconds, 5);
});

test("calculateFitBeatToVisualContentUpdates returns warning reason when no visuals exist", () => {
  const result = calculateFitBeatToVisualContentUpdates(
    [buildBeatBand({ id: "beat-1", startSec: 0, endSec: 4, duration_seconds: 4 })],
    [],
    "beat-1",
  );

  assert.equal(result.reason, "no_visuals");
  assert.equal(result.updates, null);
});

test("calculateFitBeatToVisualContentUpdates fits beat bounds to visual coverage", () => {
  const result = calculateFitBeatToVisualContentUpdates(
    [
      buildBeatBand({ id: "beat-1", startSec: 0, endSec: 4, duration_seconds: 4 }),
      buildBeatBand({ id: "beat-2", startSec: 4, endSec: 9, duration_seconds: 5 }),
    ],
    [
      buildElement({ beat_id: "beat-2", type: "still", timeline_start: 5, duration: 2 }),
      buildElement({ id: "v2", beat_id: "beat-2", type: "video_clip", timeline_start: 7, duration: 2 }),
    ],
    "beat-2",
  );

  assert.equal(result.reason, null);
  assert.deepEqual([...result.updates!.entries()], [
    ["beat-1", 5],
    ["beat-2", 4],
  ]);
});

test("calculateMoveBeatVisualsToStart returns aligned reason when no shift is needed", () => {
  const result = calculateMoveBeatVisualsToStart(
    [buildBeatBand({ id: "beat-1", startSec: 2, endSec: 6, duration_seconds: 4 })],
    [buildElement({ beat_id: "beat-1", type: "still", timeline_start: 2, duration: 2 })],
    "beat-1",
  );

  assert.equal(result.reason, "already_aligned");
});

test("calculateMoveBeatVisualsToStart shifts all visuals assigned to the beat", () => {
  const result = calculateMoveBeatVisualsToStart(
    [buildBeatBand({ id: "beat-1", startSec: 4, endSec: 8, duration_seconds: 4 })],
    [
      buildElement({ id: "v1", beat_id: "beat-1", type: "still", timeline_start: 6, duration: 1 }),
      buildElement({ id: "v2", beat_id: "beat-1", type: "video_clip", timeline_start: 7, duration: 1 }),
      buildElement({ id: "other", beat_id: "beat-2", type: "still", timeline_start: 10, duration: 1 }),
    ],
    "beat-1",
  );

  assert.equal(result.reason, null);
  assert.equal(result.delta, -2);
  assert.deepEqual(
    result.shiftedElements?.map((element) => ({ id: element.id, start: element.timeline_start })),
    [
      { id: "v1", start: 4 },
      { id: "v2", start: 5 },
      { id: "other", start: 10 },
    ],
  );
});
