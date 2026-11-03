import assert from "node:assert/strict";
import test from "node:test";

import { contourLength, encodeShapePoints, shapeContoursAt, type ShapeContour } from "./shapes";
import { deletePoint, deletePointEverywhere, insertPoint, insertPointEverywhere, matchOutlines, pointEditPatch, moveHandle, movePoint, nearestSegment, segmentPointAt, toggleSmooth } from "./shape-point-edit";

const square: ShapeContour[] = [{ closed: true, points: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }] }];
const curve: ShapeContour[] = [{ closed: false, points: [{ x: -0.5, y: 0, out: [0.2, -0.4] }, { x: 0.5, y: 0, in: [-0.2, -0.4] }] }];

test("moving a point carries its handles and leaves the input unchanged", () => {
  const moved = movePoint(curve, { contour: 0, point: 0 }, -0.4, 0.1);
  assert.deepEqual(moved[0].points[0], { x: -0.4, y: 0.1, out: [0.2, -0.4] });
  assert.equal(curve[0].points[0].x, -0.5);
});

test("dragging a handle turns its partner to keep the curve smooth, unless it is independent", () => {
  const smooth = [{ closed: false, points: [{ x: 0, y: 0, in: [-0.1, 0], out: [0.2, 0] }, { x: 1, y: 0 }] }];
  assert.deepEqual(moveHandle(smooth, { contour: 0, point: 0 }, "out", [0, 0.3])[0].points[0].in, [0, -0.1]);
  assert.deepEqual(moveHandle(smooth, { contour: 0, point: 0 }, "out", [0, 0.3], true)[0].points[0].in, [-0.1, 0]);
});

test("adding a point on an edge keeps the outline", () => {
  const { contours, ref } = insertPoint(curve, 0, 0, 0.5);
  assert.equal(ref.point, 1);
  assert.equal(contours[0].points.length, 3);
  assert.ok(Math.abs(contourLength(contours[0]) - contourLength(curve[0])) < 1e-3);
  const [x, y] = segmentPointAt(curve[0], 0, 0.5);
  assert.deepEqual([contours[0].points[1].x, contours[0].points[1].y], [Number(x.toFixed(5)), Number(y.toFixed(5))]);
  const straight = insertPoint(square, 0, 3, 0.5).contours[0];
  assert.deepEqual(straight.points[4], { x: -0.5, y: 0 }, "a point on the closing edge of a straight outline");
});

test("the nearest edge is found in pixel space", () => {
  const hit = nearestSegment(square, [0.5, 0], [100, 100]);
  assert.equal(hit?.segment, 1);
  assert.ok(hit!.distance < 1e-9);
});

test("deleting keeps two points; toggling makes a corner smooth and back", () => {
  const triangle = deletePoint(square, { contour: 0, point: 0 });
  assert.equal(triangle[0].points.length, 3);
  assert.equal(deletePoint(deletePoint(triangle, { contour: 0, point: 0 }), { contour: 0, point: 0 })[0].points.length, 2);
  const rounded = toggleSmooth(square, { contour: 0, point: 1 });
  assert.ok(rounded[0].points[1].in && rounded[0].points[1].out);
  assert.deepEqual(toggleSmooth(rounded, { contour: 0, point: 1 })[0].points[1], { x: 0.5, y: -0.5 });
});

test("editing a keyframed shape keys the playhead moment; an unkeyed shape changes its outline", () => {
  const moved = movePoint(square, { contour: 0, point: 0 }, -0.4, -0.5);
  assert.deepEqual(pointEditPatch({ shape_kind: "path", shape_contours: square }, 1, moved), { shape_contours: moved });
  const keyed = { shape_kind: "path", shape_contours: square, keyframes: { shape_contours: [{ t: 0, v: encodeShapePoints(square) }] } };
  const patch = pointEditPatch(keyed, 1, moved) as { keyframes: Record<string, { t: number }[]> };
  assert.deepEqual(patch.keyframes.shape_contours.map((key) => key.t), [0, 1]);
  const props = { ...keyed, ...patch };
  assert.equal(shapeContoursAt(props, 0.5)[0].points[0].x, -0.45, "halfway between the keys");
});

test("adding or deleting a point changes the outline and every key the same way", () => {
  const wide: ShapeContour[] = [{ closed: true, points: square[0].points.map((p) => ({ x: p.x, y: p.y / 2 })) }];
  const props = { shape_kind: "path", shape_contours: square, keyframes: { shape_contours: [{ t: 0, v: encodeShapePoints(square) }, { t: 1, v: encodeShapePoints(wide) }] } };
  const added = { ...props, ...insertPointEverywhere(props, 0, 0, 0.5).patch };
  assert.equal((added.shape_contours as ShapeContour[])[0].points.length, 5);
  assert.deepEqual((added.keyframes as Record<string, { v: number[] }[]>).shape_contours.map((key) => key.v.length), [30, 30]);
  assert.deepEqual(shapeContoursAt(added, 1)[0].points[1], { x: 0, y: -0.25 }, "the new point sits on the wide key's top edge");
  const removed = { ...added, ...deletePointEverywhere(added, { contour: 0, point: 1 }) };
  assert.deepEqual(shapeContoursAt(removed, 1)[0].points, wide[0].points);
  assert.equal(deletePointEverywhere({ shape_kind: "path", shape_contours: [{ closed: false, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] }, { contour: 0, point: 0 }), null);
});

test("outlines with different point and contour counts are matched without changing their shapes", () => {
  const triangle: ShapeContour[] = [{ closed: true, points: [{ x: 0, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }] }];
  const ring: ShapeContour[] = [square[0], { closed: true, points: [{ x: -0.2, y: -0.2 }, { x: 0.2, y: -0.2 }, { x: 0.2, y: 0.2 }, { x: -0.2, y: 0.2 }] }];
  const [a, b] = matchOutlines([triangle, ring]);
  assert.deepEqual(a.map((c) => c.points.length), [4, 4]);
  assert.deepEqual(b.map((c) => c.points.length), [4, 4]);
  assert.ok(Math.abs(contourLength(a[0]) - contourLength(triangle[0])) < 1e-3, "the triangle keeps its outline");
  assert.ok(a[1].points.every((p) => p.x === a[1].points[0].x && p.y === a[1].points[0].y), "the hole grows from a point");
  const shifted: ShapeContour[] = [{ closed: true, points: [...square[0].points.slice(2), ...square[0].points.slice(0, 2)] }];
  assert.deepEqual(matchOutlines([square, shifted])[1][0].points, square[0].points, "a closed contour starts where it lines up best");
});
