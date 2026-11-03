import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LANE_SCALE,
  TIMELINE_CANVAS_RULER_HEIGHT,
  TIMELINE_CANVAS_FOOTER_HEIGHT,
  buildBeatMarkers,
  buildLaneDefs,
  laneSizingConfig,
  resolveFitLaneScale,
} from "@/components/studio/timeline/adapters";
import type { TimelineElement } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: "element-1",
    project_id: "project-1",
    type: "music",
    source_url: null,
    props: null,
    beat_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 1,
    lane_key: "music_0",
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
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

test("timeline lanes use compact editor defaults while retaining expansion headroom", () => {
  assert.deepEqual(laneSizingConfig("visual"), {
    baseHeight: 80,
    minHeight: 32,
    maxHeight: 440,
  });
  assert.deepEqual(laneSizingConfig("audio"), {
    baseHeight: 56,
    minHeight: 32,
    maxHeight: 280,
  });
  assert.deepEqual(laneSizingConfig("music"), {
    baseHeight: 56,
    minHeight: 32,
    maxHeight: 280,
  });
  assert.deepEqual(laneSizingConfig("captions"), {
    baseHeight: 52,
    minHeight: 32,
    maxHeight: 240,
  });
});

test("buildBeatMarkers uses beat durations to build cumulative spans", () => {
  const markers = buildBeatMarkers([
    { id: "beat-1", sort_order: 0, beat_label: "Beat 1", duration_seconds: 6 },
    { id: "beat-2", sort_order: 1, beat_label: "Beat 2", duration_seconds: 4 },
  ]);

  assert.equal(markers[0]?.startSec, 0);
  assert.equal(markers[0]?.endSec, 6);
  assert.equal(markers[1]?.startSec, 6);
  assert.equal(markers[1]?.endSec, 10);
});

test("buildBeatMarkers keeps beat order stable even when durations are short", () => {
  const markers = buildBeatMarkers([
    { id: "beat-1", sort_order: 0, beat_label: "Beat 1", duration_seconds: 3 },
    { id: "beat-2", sort_order: 1, beat_label: "Beat 2", duration_seconds: 3 },
  ]);

  assert.equal(markers[0]?.startSec, 0);
  assert.equal(markers[0]?.endSec, 3);
  assert.equal(markers[1]?.startSec, 3);
  assert.equal(markers[1]?.endSec, 6);
});

test("buildLaneDefs prefers an explicit human lane label without changing the stable lane key", () => {
  const lanes = buildLaneDefs([
    buildElement({
      lane_key: "music_3",
      lane_index: 3,
      props: { timeline_lane_label: "A2A · Connery" },
    }),
  ], new Map(), 1, {});

  const lane = lanes.find((entry) => entry.key === "music_3");
  assert.equal(lane?.label, "A2A · Connery");
  assert.equal(lane?.key, "music_3");
});

test("buildLaneDefs humanizes named visual lanes instead of showing NaN", () => {
  const lanes = buildLaneDefs([
    buildElement({ type: "video_clip", lane_key: "visual_presenter" }),
    buildElement({ id: "element-2", type: "still", lane_key: "visual_author_profiles" }),
    buildElement({ id: "element-3", type: "still", lane_key: "visual_0" }),
  ], new Map(), 1, {});

  assert.equal(lanes.find((entry) => entry.key === "visual_presenter")?.label, "Presenter");
  assert.equal(lanes.find((entry) => entry.key === "visual_author_profiles")?.label, "Author Profiles");
  assert.equal(lanes.find((entry) => entry.key === "visual_0")?.label, "Visual 1");
});

test("buildLaneDefs names synchronized presenter, background, and speech-authority lanes", () => {
  const voice = buildElement({
    id: "voice",
    type: "video_clip",
    lane_key: "visual_99",
    volume: 1,
  });
  const presenter = buildElement({
    id: "presenter",
    type: "video_clip",
    lane_key: "visual_21",
    volume: 0,
    props: {
      compound_clip_label: "Presenter compound · lightweight proxy",
      speech_sync_binding: { source_element_id: "voice" },
    },
  });
  const background = buildElement({
    id: "background",
    type: "still",
    lane_key: "visual_22",
    source_url: "/media/black-background.png",
  });

  const lanes = buildLaneDefs([presenter, background, voice], new Map(), 1, {});

  assert.equal(lanes.find((entry) => entry.key === "visual_21")?.label, "Presenter cutout · V22");
  assert.equal(lanes.find((entry) => entry.key === "visual_22")?.label, "Background · V23");
  assert.equal(lanes.find((entry) => entry.key === "visual_99")?.label, "Original voice · V100");
});

test("resolveFitLaneScale keeps the default scale when the lane stack already fits", () => {
  const scale = resolveFitLaneScale({
    laneTypes: ["visual", "audio"],
    availableHeight: 400,
  });
  assert.equal(scale, DEFAULT_LANE_SCALE);
});

test("resolveFitLaneScale shrinks to the largest scale whose stack fits the viewport", () => {
  const laneTypes = ["visual", "visual", "visual", "audio", "music", "captions"] as const;
  const totalAt = (scale: number) =>
    TIMELINE_CANVAS_RULER_HEIGHT + TIMELINE_CANVAS_FOOTER_HEIGHT + laneTypes.reduce((sum, type) => {
      const sizing = laneSizingConfig(type);
      return sum + Math.round(Math.min(sizing.maxHeight, Math.max(sizing.minHeight, sizing.baseHeight * scale)));
    }, 0);
  const availableHeight = 290;

  const scale = resolveFitLaneScale({ laneTypes: [...laneTypes], availableHeight });

  assert.ok(scale < DEFAULT_LANE_SCALE, `expected a shrink, got ${scale}`);
  assert.ok(totalAt(scale) <= availableHeight, `stack ${totalAt(scale)} overflows ${availableHeight}`);
  // Near-maximal: a slightly larger scale must overflow.
  assert.ok(totalAt(scale + 0.02) > availableHeight, "fit scale is not close to maximal");
});

test("resolveFitLaneScale floors at MIN_LANE_SCALE when even the minimum stack overflows", () => {
  const scale = resolveFitLaneScale({
    laneTypes: ["visual", "visual", "visual", "audio", "music", "captions"],
    availableHeight: 200,
  });
  assert.equal(scale, 0.4);
});

test("resolveFitLaneScale returns the default scale for empty lanes or an unmeasured viewport", () => {
  assert.equal(resolveFitLaneScale({ laneTypes: [], availableHeight: 500 }), DEFAULT_LANE_SCALE);
  assert.equal(resolveFitLaneScale({ laneTypes: ["visual"], availableHeight: 0 }), DEFAULT_LANE_SCALE);
});

test("the lane list is the layer order: picture lanes list front layer first, as the renderer stacks them", async () => {
  const { buildCompositingLaneOrder } = await import("@/lib/timeline/compositing-lanes");
  const elements = [
    buildElement({ id: "a", type: "video_clip", lane_key: "visual_1" }),
    buildElement({ id: "b", type: "video_clip", lane_key: "visual_10" }),
    buildElement({ id: "c", type: "caption_text", lane_key: "captions_3" }),
    buildElement({ id: "d", type: "music", lane_key: "music" }),
  ];
  for (const persisted of [[], ["visual_1", "visual_10"], ["visual_1", "captions_3", "music", "visual_10"]]) {
    const pictureKeys = buildLaneDefs(elements, new Map(), 1, {}, persisted)
      .filter((lane) => lane.type === "visual" || lane.type === "captions").map((lane) => lane.key);
    const stacked = buildCompositingLaneOrder({
      visualLaneKeys: pictureKeys.filter((key) => key.startsWith("visual_")),
      captionLaneKeys: pictureKeys.filter((key) => key.startsWith("captions_") || key === "captions"),
      persistedLaneOrderKeys: persisted,
    }).reverse();
    assert.deepEqual(pictureKeys, stacked, `persisted ${JSON.stringify(persisted)}`);
  }
  // Without a saved order, text sits above every picture, so it is listed first.
  const listed = buildLaneDefs(elements, new Map(), 1, {}).map((lane) => lane.key);
  assert.ok(listed.indexOf("captions_3") < listed.indexOf("visual_10"));
});

test("legacy invalid lane keys remain visible and addressable instead of becoming preview-only actors", () => {
  const rows = [buildElement({ type: "caption_text", lane_key: "captions" }),
    buildElement({ id: "sound", type: "music", lane_key: "music_old" })];
  const lanes = buildLaneDefs(rows, new Map(), 0.5, {}, ["captions_0"]);
  for (const row of rows) {
    const lane = lanes.find(lane => lane.key === row.lane_key);
    assert.equal(lane?.label, "Unassigned");
    assert.ok(lane!.height > 0);
  }
  assert.equal(rows[0]!.lane_key, "captions", "display recovery must not rewrite project data");
});
