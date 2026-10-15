import assert from "node:assert/strict";
import test from "node:test";
import { projectNormalizedSourceBox, projectSourceToComposition, projectVisibleNormalizedSourceBox, resolveCompositionTransformLayout } from "./source-projection";

test("golden: contain, trim, rate, transforms, and masks share one projection", () => {
  const projection = projectSourceToComposition({
    source_width: 1920, source_height: 1080, composition_width: 1080, composition_height: 1920,
    fit: "contain", timeline_time_seconds: 4, timeline_start_seconds: 1,
    source_trim_start_seconds: 2, playback_rate: 0.5, media_scale: 2,
    media_offset_x: 0.5, media_offset_y: -0.25,
    mask_inset: { top: 0.1, right: 0.2, bottom: 0.1, left: 0.2 },
  });
  assert.equal(projection.source_time_seconds, 3.5);
  assert.deepEqual(projection.base_rect, { x: 0, y: 656.25, width: 1080, height: 607.5 });
  assert.deepEqual(projection.transformed_rect, { x: -270, y: 112.5, width: 2160, height: 1215 });
  assert.deepEqual(projection.visible_rect, { x: 216, y: 192, width: 648, height: 1135.5 });
});

test("renderer layout and projector use the same full-composition mask geometry", () => {
  assert.deepEqual(resolveCompositionTransformLayout({
    composition_width: 1080,
    composition_height: 1920,
    media_scale: 2,
    media_offset_x: 0.5,
    media_offset_y: -0.25,
    mask_inset: { top: 0.1, right: 0.2, bottom: 0.1, left: 0.2 },
  }), {
    translate_x: 270,
    translate_y: -240,
    scale: 2,
    mask_rect: { x: 216, y: 192, width: 648, height: 1536 },
  });
});

test("visible detector projection clips against composition and mask", () => {
  const projection = projectSourceToComposition({
    source_width: 100, source_height: 100, composition_width: 100, composition_height: 100,
    fit: "contain", mask_inset: { top: 0.25, right: 0.25, bottom: 0.25, left: 0.25 },
    timeline_time_seconds: 0, timeline_start_seconds: 0,
  });
  assert.deepEqual(projectVisibleNormalizedSourceBox({ x: 0, y: 0, width: 0.5, height: 1 }, projection), {
    x: 25, y: 25, width: 25, height: 50,
  });
  assert.equal(projectVisibleNormalizedSourceBox({ x: 0, y: 0, width: 0.1, height: 0.1 }, projection), null);
});

test("golden: portrait rotation and non-square pixels affect display geometry", () => {
  const projection = projectSourceToComposition({
    source_width: 720, source_height: 576, sample_aspect_ratio: { num: 16, den: 15 },
    display_rotation_degrees: 90, composition_width: 1080, composition_height: 1920,
    fit: "contain", timeline_time_seconds: 0, timeline_start_seconds: 0,
  });
  assert.deepEqual(projection.display_source_size, { width: 576, height: 768 });
  assert.deepEqual(projection.base_rect, { x: 0, y: 240, width: 1080, height: 1440 });
});

test("golden: canonical top-left detector boxes project into composition pixels", () => {
  const projection = projectSourceToComposition({
    source_width: 100, source_height: 100, composition_width: 1000, composition_height: 500,
    fit: "cover", timeline_time_seconds: 0, timeline_start_seconds: 0,
  });
  assert.deepEqual(projectNormalizedSourceBox({ x: 0.25, y: 0.2, width: 0.5, height: 0.4 }, projection), {
    x: 250, y: -50, width: 500, height: 400,
  });
});
