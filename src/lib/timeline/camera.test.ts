import assert from "node:assert/strict";
import test from "node:test";

import { cameraFor, cameraPoint, cameraViewAt } from "./camera";
import { shapeFrameInTimeline } from "./shapes";

const W = 1920, H = 1080;
const camera = {
  id: "cam", type: "shape", timeline_start: 2, duration: 4,
  props: { shape_kind: "camera", keyframes: {
    media_scale: [{ t: 0, v: 1 }, { t: 2, v: 2 }],
    media_offset_x: [{ t: 0, v: 0 }, { t: 2, v: 0.5 }],
  } },
};
const dot = { id: "dot", type: "shape", timeline_start: 0, duration: 10, props: { shape_kind: "ellipse", shape_width: 0.1, shape_height: 0.1, media_offset_x: 0.5, camera_id: "cam" } };

test("a camera at rest is the plain canvas", () => {
  const view = cameraViewAt({ ...camera, props: { shape_kind: "camera" } }, 3, W, H);
  assert.deepEqual(cameraPoint(view, 100, 200, W, H), [100, 200]);
});

test("a push-in brings the point it looks at to the centre and scales around it", () => {
  const end = cameraViewAt(camera, 4, W, H);
  assert.deepEqual([end.focusX, end.zoom], [1440, 2]);
  assert.deepEqual(cameraPoint(end, 1440, 540, W, H), [960, 540]);
  assert.deepEqual(cameraPoint(end, 1540, 540, W, H), [1160, 540]);
});

test("a camera zooms past a picture's 3x size, up to its own limit", () => {
  const deep = { ...camera, props: { shape_kind: "camera", keyframes: { media_scale: [{ t: 0, v: 1 }, { t: 2, v: 6.2 }] } } };
  assert.equal(cameraViewAt(deep, 4, W, H).zoom, 6.2);
  assert.equal(cameraViewAt({ ...camera, props: { shape_kind: "camera", media_scale: 40 } }, 3, W, H).zoom, 10);
});

test("outside its clip the camera holds its first and last view", () => {
  assert.equal(cameraViewAt(camera, 0, W, H).zoom, 1);
  assert.equal(cameraViewAt(camera, 9, W, H).zoom, 2);
});

test("a follower is drawn through the camera; a removed camera leaves it in place", () => {
  const moved = shapeFrameInTimeline(dot, [camera, dot], 5, 5, W, H);
  assert.deepEqual([moved.centerX, moved.centerY, moved.scale], [960, 540, 2]);
  const removed = { ...camera, removed_at: "2026-10-24T00:00:00Z" };
  assert.equal(cameraFor(dot, [removed, dot]), null);
  assert.equal(shapeFrameInTimeline(dot, [removed, dot], 5, 5, W, H).centerX, 1440);
});
