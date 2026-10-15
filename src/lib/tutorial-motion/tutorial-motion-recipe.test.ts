import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompiledTutorialMotion,
  assertTutorialMotionPreflight,
  compileTutorialMotionRecipe,
  preflightTutorialMotion,
  tutorialCameraPoseForSourceWindow,
  type TutorialMotionRecipe,
} from "./tutorial-motion-recipe";
import type { TimelineFile } from "@/lib/local-store/store";
import { resolveNumberKeyframe } from "@/lib/timeline/keyframes";

const recipe = (): TutorialMotionRecipe => ({
  id: "tutorial-test-v1",
  projectId: "tutorial-test",
  duration: 8,
  assets: {
    backgroundUrl: "/background.svg",
    cursorUrl: "/cursor.png",
    eventReceipt: "preprocess/clicks.json",
  },
  camera: {
    initial: { scale: 1.4, offsetX: 0.4, offsetY: 0.4 },
    operations: [
      { kind: "move", start: 0.4, end: 1.2, to: { scale: 1.6, offsetX: 0.6, offsetY: 0.6 } },
      {
        kind: "hiddenReframe", fadeStart: 2, hiddenAt: 2.25, switchAt: 2.3,
        revealStart: 2.45, revealEnd: 2.7, to: { scale: 1.7, offsetX: -0.7, offsetY: 0.7 },
      },
    ],
  },
  clicks: [
    { time: 1.5, x: 0.25, y: -0.2 },
    { time: 4.5, x: -0.4, y: 0.2 },
  ],
  steps: [
    { start: 0, end: 2, text: "STEP 1 / 2 · CHOOSE" },
    { start: 2.7, end: 8, text: "STEP 2 / 2 · REVIEW" },
  ],
});

test("source-window framing crops unused shell chrome deterministically", () => {
  assert.deepEqual(tutorialCameraPoseForSourceWindow({ scale: 1.8, left: 0.055, top: 0 }), {
    scale: 1.8,
    offsetX: 0.602,
    offsetY: 0.8,
  });
});

test("compiles reusable camera, cursor, background, and step-label layers", () => {
  const compiled = compileTutorialMotionRecipe(recipe());
  assert.equal(compiled.preflight.ok, true);
  assert.deepEqual(compiled.laneOrderKeys, ["visual_cursor", "captions_0", "visual_0", "visual_background"]);
  assert.equal(compiled.elements.filter((element) => element.lane_key === "visual_cursor").length, 1);
  assert.equal(compiled.elements.filter((element) => element.lane_key === "captions_0").length, 2);
  assert.equal(compiled.elements.filter((element) => element.lane_key === "visual_background").length, 1);
});

test("dense cursor clicks settle on every measured hotspot before contact", () => {
  const dense = recipe();
  dense.clicks = [
    { time: 1, x: -0.44, y: -0.39 },
    { time: 1.4, x: -0.44, y: -0.273 },
  ];
  const cursor = compileTutorialMotionRecipe(dense).elements.find((element) => element.lane_key === "visual_cursor");
  assert.ok(cursor);
  assert.equal(resolveNumberKeyframe(cursor.props, "media_offset_x", 1.4, 0), -0.44);
  assert.equal(resolveNumberKeyframe(cursor.props, "media_offset_y", 1.4, 0), -0.273);
});

test("rejects camera poses outside renderer bounds before timeline mutation", () => {
  const invalid = recipe();
  invalid.camera.initial.offsetX = 1.1;
  assert.throws(() => compileTutorialMotionRecipe(invalid), /offset/);
});

test("preflight catches a visible held camera snap", () => {
  const preflight = preflightTutorialMotion({
    keyframes: {
      media_scale: [{ t: 0, v: 1, ease: "hold" }, { t: 1, v: 2, ease: "hold" }],
      media_offset_x: [{ t: 0, v: 0, ease: "hold" }, { t: 1, v: 0.8, ease: "hold" }],
      media_offset_y: [{ t: 0, v: 0, ease: "hold" }, { t: 1, v: 0.8, ease: "hold" }],
      media_opacity: [{ t: 0, v: 1, ease: "hold" }],
    },
  }, 2);
  assert.equal(preflight.ok, false);
  assert.ok(preflight.findings.some((finding) => finding.code === "visible_camera_snap"));
  assert.throws(() => assertTutorialMotionPreflight(preflight), /visible_camera_snap/);
});

test("preflight catches staircase motion even when no individual step is large", () => {
  const frames = [0, 1, 2, 3, 4].map((frame) => ({
    t: frame / 30,
    v: [1, 1.01, 1.01, 1.02, 1.02][frame]!,
    ease: "linear" as const,
  }));
  const preflight = preflightTutorialMotion({
    keyframes: {
      media_scale: frames,
      media_offset_x: frames.map((entry) => ({ ...entry, v: 0 })),
      media_offset_y: frames.map((entry) => ({ ...entry, v: 0 })),
    },
  }, 4 / 30);
  assert.equal(preflight.ok, false);
  assert.ok(preflight.findings.some((finding) => finding.code === "visible_camera_jitter"));
});

test("applying a compiled recipe is idempotent for recipe-owned overlays", () => {
  const compiled = compileTutorialMotionRecipe(recipe());
  const now = new Date().toISOString();
  const timeline = {
    elements: [{
      id: "video", project_id: "tutorial-test", type: "video_clip", source_url: "/video.mp4", props: {},
      beat_id: null, voice_clip_id: null, character_id: null, timeline_start: 0, duration: 8,
      lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1,
      fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null,
      removed_reason: null, created_at: now, updated_at: now,
    }],
    transitions: [],
  } as TimelineFile;
  applyCompiledTutorialMotion(timeline, compiled);
  applyCompiledTutorialMotion(timeline, compiled);
  assert.equal(timeline.elements.filter((element) => element.lane_key === "visual_cursor").length, 1);
  assert.equal(timeline.elements.filter((element) => element.lane_key === "visual_background").length, 1);
  assert.equal(timeline.elements.filter((element) => element.lane_key === "captions_0").length, 2);
});
