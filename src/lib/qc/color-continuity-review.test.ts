import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { deriveColorContinuityBoundaries } from "@/lib/qc/color-continuity-review";

function element(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "element",
    project_id: "project",
    type: "video_clip",
    source_url: "/source.mp4",
    props: {},
    beat_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 3,
    lane_key: "visual_presenter",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 0,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

test("samples both edges of a source-derived RGB cutout", () => {
  const boundaries = deriveColorContinuityBoundaries([
    element({
      id: "cutout",
      timeline_start: 2,
      duration: 3,
      props: { has_alpha: true, mask_recipe: "sam2-person-v1" },
    }),
  ], 8);
  assert.deepEqual(boundaries.map((boundary) => boundary.atSeconds), [2, 5]);
  assert.deepEqual(boundaries[0]?.sampleTimes, [1.933, 2, 2.067]);
  assert.ok(boundaries.every((boundary) => boundary.kind === "source_rgb_overlay"));
});

test("ignores ordinary transparent graphics that do not carry source RGB", () => {
  const boundaries = deriveColorContinuityBoundaries([
    element({
      id: "graphic",
      type: "still",
      source_url: "/title.png",
      props: { has_alpha: true, editorial_role: "title-card" },
    }),
  ], 8);
  assert.equal(boundaries.length, 0);
});

test("flags a treatment mismatch between adjacent pieces of the same source", () => {
  const boundaries = deriveColorContinuityBoundaries([
    element({
      id: "before",
      duration: 2,
      props: {
        source_id: "presenter-take",
        color_grade_model: "linear-srgb-v1",
        grade_contrast: 1.2,
      },
    }),
    element({
      id: "after",
      timeline_start: 2,
      duration: 2,
      props: {
        source_id: "presenter-take",
        color_grade_model: "linear-srgb-v1",
        grade_contrast: 1,
      },
    }),
  ], 5);
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0]?.kind, "color_treatment_change");
  assert.equal(boundaries[0]?.atSeconds, 2);
});

test("surfaces internal color-grade keyframes for review", () => {
  const boundaries = deriveColorContinuityBoundaries([
    element({
      id: "graded",
      timeline_start: 1,
      duration: 4,
      props: {
        color_grade_model: "linear-srgb-v1",
        grade_contrast: 1,
        keyframes: {
          grade_contrast: [
            { t: 0, v: 1, ease: "hold" },
            { t: 2, v: 1.25, ease: "linear" },
          ],
        },
      },
    }),
  ], 6);
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0]?.kind, "color_grade_keyframe");
  assert.equal(boundaries[0]?.atSeconds, 3);
});
