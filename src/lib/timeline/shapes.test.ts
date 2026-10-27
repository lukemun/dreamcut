import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

import { contourLength, contourPathD, resolveShapeProps, shapeBoundsAt, shapeContours, shapeFrameAt, shapePresetToPath, type ShapeContour } from "./shapes";
import { fitContoursToUnitBox, parseSvgPath } from "./svg-path";

const near = (actual: number, expected: number, tolerance: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < tolerance, message ?? `${actual} is not within ${tolerance} of ${expected}`);
const perimeter = (contours: ShapeContour[]) => contours.reduce((sum, contour) => sum + contourLength(contour), 0);

test("every preset starts at the top and closes; a line runs left to right", () => {
  const top = (kind: string) => shapeContours(resolveShapeProps({ shape_kind: kind }), 200, 100)[0].points[0];
  for (const kind of ["ellipse", "polygon", "star"]) assert.deepEqual([Math.round(top(kind).x), Math.round(top(kind).y)], [0, -50], kind);
  assert.equal(top("rect").y, -50);
  const line = shapeContours(resolveShapeProps({ shape_kind: "line" }), 200, 100)[0];
  assert.equal(line.closed, false);
  assert.deepEqual(line.points.map((p) => p.x), [-100, 100]);
});

test("perimeters match a circle, a square and a fully rounded square", () => {
  near(perimeter(shapeContours(resolveShapeProps({ shape_kind: "ellipse" }), 100, 100)), Math.PI * 100, 0.1);
  near(perimeter(shapeContours(resolveShapeProps({ shape_kind: "rect" }), 100, 100)), 400, 1e-9);
  near(perimeter(shapeContours(resolveShapeProps({ shape_kind: "rect", shape_corner_radius: 0.5 }), 100, 100)), Math.PI * 100, 0.1);
});

test("polygons and stars take their corner count; an arc is open and spans its angles", () => {
  assert.equal(shapeContours(resolveShapeProps({ shape_kind: "polygon", shape_sides: 6 }), 100, 100)[0].points.length, 6);
  assert.equal(shapeContours(resolveShapeProps({ shape_kind: "star", shape_sides: 5 }), 100, 100)[0].points.length, 10);
  const arc = shapeContours(resolveShapeProps({ shape_kind: "arc", shape_arc_start: 0, shape_arc_end: 180 }), 100, 100)[0];
  assert.equal(arc.closed, false);
  near(contourLength(arc), Math.PI * 50, 0.1);
});

test("props are clamped, colours validated, and null colours mean none", () => {
  const props = resolveShapeProps({ shape_kind: "blob", shape_width: 99, shape_fill: null, shape_stroke: "blue", shape_draw: -1, shape_sides: 99 });
  assert.equal(props.shape_kind, "rect");
  assert.equal(props.shape_width, 4);
  assert.equal(props.shape_fill, null);
  assert.equal(props.shape_stroke, null, "an invalid outline colour falls back to the default (none)");
  assert.equal(props.shape_draw, 0);
  assert.equal(props.shape_sides, 24);
});

test("a frame resolves size from canvas height, position, keyframed rotation, draw and scale", () => {
  const frame = shapeFrameAt({
    shape_kind: "ellipse", shape_width: 0.5, shape_height: 0.5, shape_stroke: "#ffffff", shape_stroke_width: 10,
    media_offset_x: 0.5,
    keyframes: {
      media_rotation: [{ t: 0, v: 0 }, { t: 1, v: 90 }],
      shape_draw: [{ t: 0, v: 0 }, { t: 1, v: 1 }],
      media_scale: [{ t: 0, v: 1 }, { t: 1, v: 2 }],
    },
  }, 0.5, 1920, 1080);
  assert.equal(frame.centerX, 1920 / 2 + 0.5 * 1920 / 2);
  assert.equal(frame.centerY, 540);
  assert.equal(frame.rotationDeg, 45);
  assert.equal(frame.scale, 1.5);
  assert.equal(frame.strokeWidth, 10);
  near(frame.strokeDrawn, frame.perimeter / 2, 1e-6);
  near(frame.perimeter, Math.PI * 540, 1, "a 0.5 × 0.5 ellipse is a 540 px circle on 1080 height");
});

test("drawing on runs through contours in order", () => {
  const props = { shape_kind: "path", shape_width: 1, shape_height: 1, shape_stroke: "#ffffff", shape_draw: 0.75, shape_contours: [
    { closed: false, points: [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }] },
    { closed: false, points: [{ x: -0.5, y: 0.5 }, { x: 0.5, y: 0.5 }] },
  ] };
  const frame = shapeFrameAt(props, 0, 1080, 1080);
  near(frame.contours[0].drawn, 1080, 1e-6);
  near(frame.contours[1].drawn, 540, 1e-6);
  assert.equal(frame.d, "", "open contours are not filled");
});

test("a hand-drawn outline's box hugs its points plus half the line, and is empty before it draws", () => {
  const props = { shape_kind: "path", shape_width: 1, shape_height: 1, shape_fill: null, shape_stroke: "#1c1b19", shape_stroke_width: 4, shape_taper: 0.5, shape_wobble: 0.3, shape_draw: 0.5, shape_contours: [
    { closed: false, points: [{ x: -0.5, y: -0.25 }, { x: 0.25, y: -0.25 }] },
    { closed: false, points: [{ x: 0, y: 0 }, { x: 0, y: 0.5 }] },
  ] };
  const box = shapeBoundsAt(props, 0, 1080, 1080);
  assert.ok(box);
  near(box.x, 540 - 540 - 2, 1e-6);
  near(box.y, 540 - 270 - 2, 1e-6);
  near(box.width, 810 + 4, 1e-6);
  near(box.height, 810 + 4, 1e-6);
  assert.equal(shapeBoundsAt({ ...props, shape_draw: 0 }, 0, 1080, 1080), null, "an unfilled outline is invisible until it draws");
});

test("Edit points keeps the preset's look as a freeform path", () => {
  const star = resolveShapeProps({ shape_kind: "star", shape_width: 0.6, shape_height: 0.3 });
  const path = resolveShapeProps({ ...star, shape_kind: "path", shape_contours: shapePresetToPath(star) });
  assert.equal(contourPathD(shapeContours(path, 600, 300)[0]), contourPathD(shapeContours(star, 600, 300)[0]));
});

test("SVG path data reads every command into editable points", () => {
  const square = parseSvgPath("M0 0 H10 V10 h-10 z");
  assert.deepEqual(square, [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }]);
  const curve = parseSvgPath("M0,0 C 0,5 10,5 10,0 S 20,-5 20,0");
  assert.deepEqual(curve[0].points[1], { x: 10, y: 0, in: [0, 5], out: [0, -5] }, "S reflects the previous handle");
  const quad = parseSvgPath("M0 0 Q 5 10 10 0");
  near(quad[0].points[0].out![1], 20 / 3, 1e-9);
  const circle = parseSvgPath("M 10 0 A 10 10 0 1 1 -10 0 A 10 10 0 1 1 10 0 Z");
  assert.equal(circle[0].closed, true);
  near(contourLength(circle[0]), Math.PI * 20, 0.01);
  const ring = parseSvgPath("M0 0h4v4h-4zM1 1h2v2h-2z");
  assert.equal(ring.length, 2, "a second M starts a hole");
  assert.deepEqual(parseSvgPath("M0 0a5 5 0 105 5")[0].points.at(-1)!.x, 5, "packed arc flags are read one digit at a time");
  assert.throws(() => parseSvgPath("10 10 L 5 5"), /start with a command/);
  assert.throws(() => parseSvgPath("M 0 0 L 5"), /missing or invalid number/);
});

test("fitted contours fill the unit box and keep their aspect ratio", () => {
  const { contours, aspect } = fitContoursToUnitBox(parseSvgPath("M 0 0 H 200 V 100 H 0 Z"));
  assert.equal(aspect, 2);
  assert.deepEqual(contours[0].points.map((p) => [p.x, p.y]), [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]);
});


test("malformed numeric continuation after close-path is rejected without hanging", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", `const assert = require('node:assert/strict'); const {parseSvgPath} = require('./src/lib/timeline/svg-path.ts'); assert.throws(() => parseSvgPath('M0 0 L1 1 Z 2'));`], { timeout: 5000, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});

test("smooth cubics do not reflect synthetic handles from quadratics or arcs", () => {
  for (const before of ["Q10 10 20 0", "Q5 5 10 0 T20 0", "A10 10 0 0 1 20 0"]) {
    const points = parseSvgPath(`M0 0 ${before} S30 10 40 0`)[0].points;
    assert.deepEqual(points.at(-2)!.out, [0, 0], before);
  }
  const points = parseSvgPath("M0 0 C5 5 10 10 20 0 S30 10 40 0")[0].points;
  assert.deepEqual(points[1].out, [10, -10]);
});


test("a two-anchor closed curve retains both halves and its closing command", () => {
  const [contour] = parseSvgPath("M 0 0 C 0 -100 100 -100 100 0 C 100 100 0 100 0 0 Z");
  assert.equal(contour.points.length, 2);
  assert.equal(contourPathD(contour), "M 0 0 C 0 -100 100 -100 100 0 C 100 100 0 100 0 0 Z");
  near(contourLength(contour), 2 * contourLength({ ...contour, closed: false }), 0.001);
});
