import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRenderedTimelineElements,
  buildTimelineCompositionElements,
  buildTimelineNormalizedState,
  collectTimelineLaneKeys,
  selectFirstRenderableVisual,
  selectLaneElements,
  selectTimelineSelection,
} from "@/components/studio/timeline/timeline-selectors";
import type { BeatMarker, TimelineElement } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
    project_id: "project-1",
    type: "video_clip",
    source_url: "https://example.com/video.mp4",
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

function buildBeat(overrides: Partial<BeatMarker>): BeatMarker {
  return {
    id: overrides.id ?? "beat-1",
    sort_order: overrides.sort_order ?? 0,
    beat_label: overrides.beat_label ?? "Beat 1",
    duration_seconds: overrides.duration_seconds ?? 4,
    ...overrides,
  };
}

test("buildTimelineNormalizedState indexes elements and beats", () => {
  const state = buildTimelineNormalizedState(
    [
      buildElement({ id: "el-1", lane_key: "visual_0" }),
      buildElement({ id: "el-2", lane_key: "audio_0" }),
      buildElement({ id: "el-3", lane_key: "visual_0" }),
    ],
    [buildBeat({ id: "beat-1", beat_label: "Intro" }), buildBeat({ id: "beat-2", beat_label: "Hook" })],
  );

  assert.equal(state.elementsById["el-2"]?.lane_key, "audio_0");
  assert.deepEqual(state.orderedElementIds, ["el-1", "el-2", "el-3"]);
  assert.deepEqual(state.laneElementIds.visual_0, ["el-1", "el-3"]);
  assert.deepEqual(state.laneBuckets.audio_0.map((element) => element.id), ["el-2"]);
  assert.equal(state.beatsById["beat-2"]?.beat_label, "Hook");
});

test("selectTimelineSelection resolves selected element and beat label", () => {
  const state = buildTimelineNormalizedState(
    [buildElement({ id: "el-1", beat_id: "beat-2" })],
    [buildBeat({ id: "beat-1", beat_label: "Intro" }), buildBeat({ id: "beat-2", beat_label: "Hook" })],
  );

  const selection = selectTimelineSelection(state, "el-1", "beat-2");

  assert.equal(selection.selectedElement?.id, "el-1");
  assert.equal(selection.selectedBeat?.id, "beat-2");
  assert.equal(selection.selectedBeatLabel, "Hook");
});

test("collectTimelineLaneKeys merges normalized lanes and extra lanes", () => {
  const state = buildTimelineNormalizedState([buildElement({ lane_key: "visual_0" })], []);
  const keys = collectTimelineLaneKeys(state, new Set(["visual_2", "music_0"]));

  assert.deepEqual([...keys].sort(), ["music_0", "visual_0", "visual_2"]);
});

test("selectLaneElements returns lane members in input order", () => {
  const state = buildTimelineNormalizedState(
    [
      buildElement({ id: "el-1", lane_key: "visual_0" }),
      buildElement({ id: "el-2", lane_key: "audio_0" }),
      buildElement({ id: "el-3", lane_key: "visual_0" }),
    ],
    [],
  );

  assert.deepEqual(
    selectLaneElements(state, "visual_0").map((element) => element.id),
    ["el-1", "el-3"],
  );
});

test("buildRenderedTimelineElements injects overflow hold frames", () => {
  const rendered = buildRenderedTimelineElements(
    [buildElement({ id: "el-1", props: { existing: true } })],
    { "el-1": "data:image/jpeg;base64,start" },
    { "el-1": "data:image/jpeg;base64,end" },
  );

  assert.deepEqual(rendered[0]?.props, {
    existing: true,
    overflow_hold_start_frame_url: "data:image/jpeg;base64,start",
    overflow_hold_frame_url: "data:image/jpeg;base64,end",
  });
});

test("selectFirstRenderableVisual returns the first still or video clip with a source", () => {
  const element = selectFirstRenderableVisual([
    buildElement({ id: "el-1", type: "music", source_url: null }),
    buildElement({ id: "el-2", type: "still", source_url: "https://example.com/still.jpg" }),
    buildElement({ id: "el-3", type: "video_clip", source_url: "https://example.com/video.mp4" }),
  ]);

  assert.equal(element?.id, "el-2");
});

test("buildTimelineCompositionElements filters muted sound, hidden pictures and disabled elements", () => {
  const composition = buildTimelineCompositionElements(
    [
      buildElement({ id: "el-1", lane_key: "visual_0", props: null }),
      buildElement({ id: "el-2", lane_key: "audio_0", props: { disabled: true } }),
      buildElement({ id: "el-3", type: "music", lane_key: "music_0" }),
      buildElement({ id: "el-4", type: "still", lane_key: "visual_1" }),
      buildElement({ id: "el-5", type: "still", lane_key: "visual_2" }),
    ],
    new Set(["music_0", "visual_1"]),
    new Set(["visual_2"]),
  );

  // Mute removes sound only (the muted still keeps drawing); hide removes pictures.
  assert.deepEqual(composition.map((element) => element.id), ["el-1", "el-4"]);
});
