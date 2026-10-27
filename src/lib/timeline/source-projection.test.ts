import assert from "node:assert/strict";
import test from "node:test";
import { canvasTrackFrameAt, canvasTrackOriginAt, canvasTrackOriginForFrame, projectNormalizedSourceBox, projectSourceToComposition, readSourceCanvasRect, projectVisibleNormalizedSourceBox, resolveCompositionTransformLayout } from "./source-projection";

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

test("a cropped render fills its window's place on the canvas, and the clip's scale and offset act as on the whole frame", () => {
  const track = { canvas: { width: 1920, height: 1080 }, size: { width: 480, height: 540 }, keys: [{ t: 0, x: 960, y: 270 }] };
  const rect = readSourceCanvasRect({ source_canvas_track: track });
  assert.deepEqual(rect, { x: 0.5, y: 0.25, width: 0.25, height: 0.5 });
  const base = { source_width: 480, source_height: 540, composition_width: 1920, composition_height: 1080, fit: "contain" as const, timeline_time_seconds: 0, timeline_start_seconds: 0, source_canvas_rect: rect };
  assert.deepEqual(projectSourceToComposition(base).transformed_rect, { x: 960, y: 270, width: 480, height: 540 });
  // Scale is about the canvas centre and offset is in half-canvas units, as for an uncropped clip.
  assert.deepEqual(projectSourceToComposition({ ...base, media_scale: 2, media_offset_x: 0.5 }).transformed_rect, { x: 1440, y: 0, width: 960, height: 1080 });
  // The same picture uncropped, full frame, lands in the same place.
  const whole = projectSourceToComposition({ ...base, source_width: 1920, source_height: 1080, source_canvas_rect: null, media_scale: 2, media_offset_x: 0.5 });
  assert.deepEqual(projectNormalizedSourceBox({ x: 0.5, y: 0.25, width: 0.25, height: 0.5 }, whole), { x: 1440, y: 0, width: 960, height: 1080 });
  assert.equal(readSourceCanvasRect({ source_canvas_track: { ...track, size: { width: 4000, height: 10 } } }), null);
  assert.equal(readSourceCanvasRect({}), null);
});

test("a moving crop window is read at the frame the decoder shows", () => {
  const track = { canvas: { width: 1920, height: 1080 }, size: { width: 400, height: 300 }, fps: 30,
    keys: [{ t: 0, x: 0, y: 0 }, { t: 1, x: 300, y: 600 }] };
  // Between keys the window moves in a straight line, landing on even pixels.
  assert.deepEqual(canvasTrackOriginForFrame(track, 15), { x: 150, y: 300 });
  // Frame 2 is stamped 67 ms in WebM, just after its exact time, so at 2/30 s frame 1 is still shown.
  assert.equal(canvasTrackFrameAt(track, 2 / 30), 1);
  assert.equal(canvasTrackFrameAt(track, 0.067), 2);
  assert.equal(canvasTrackFrameAt(track, 1 / 30), 1);
  assert.deepEqual(canvasTrackOriginAt(track, 2 / 30), canvasTrackOriginForFrame(track, 1));
  // Past the last key it holds; the window never leaves the canvas.
  assert.deepEqual(canvasTrackOriginAt(track, 5), { x: 300, y: 600 });
  assert.deepEqual(canvasTrackOriginAt({ ...track, keys: [{ t: 0, x: 3000, y: -40 }] }, 0), { x: 1520, y: 0 });
});
