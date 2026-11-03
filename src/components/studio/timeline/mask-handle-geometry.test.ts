import test from "node:test";
import assert from "node:assert/strict";
import { maskShapeLabel, maskEdgeHandlePosition, moveMaskEdge, moveMaskEdgeByDelta } from "./mask-handle-geometry";

test("off-canvas ellipse grab targets stay reachable without changing geometry", () => {
  const mask = { top: -.4, right: -.3, bottom: -.2, left: -.69 };
  const before = { ...mask };
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const { x, y } = maskEdgeHandlePosition(mask, edge);
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
    assert.deepEqual(moveMaskEdgeByDelta(mask, edge, 0, "ellipse"), mask);
  }
  assert.deepEqual(mask, before);
  assert.equal(maskEdgeHandlePosition(mask, "left").x, 0);
  assert.equal(maskEdgeHandlePosition(mask, "right").x, 1);
});

test("displaced handle drags preserve pointer delta, opposite edges and opening", () => {
  const mask = { top: .15, right: .15, bottom: .15, left: -.69 };
  const moved = moveMaskEdgeByDelta(mask, "left", .1, "ellipse");
  assert.ok(Math.abs(moved.left + .59) < 1e-12);
  assert.equal(moved.right, mask.right);
  assert.equal(moveMaskEdgeByDelta(mask, "left", -2, "ellipse").left, -1);
  assert.equal(moveMaskEdgeByDelta(mask, "left", 3, "ellipse").left, .84);
  const right = moveMaskEdgeByDelta(mask, "right", .1, "ellipse");
  assert.ok(Math.abs(right.right - .05) < 1e-12);
  assert.equal(right.left, mask.left);
});

test("ordinary on-canvas handles preserve geometry and relative movement", () => {
  const mask = { top: .2, right: .2, bottom: .2, left: .2 };
  assert.deepEqual(maskEdgeHandlePosition(mask, "top"), { x: .5, y: .2 });
  assert.deepEqual(maskEdgeHandlePosition(mask, "left"), { x: .2, y: .5 });
  assert.deepEqual(moveMaskEdgeByDelta(mask, "top", 0), mask);
  assert.equal(moveMaskEdgeByDelta(mask, "bottom", .1).bottom, 1 - .9);
  assert.equal(moveMaskEdgeByDelta(mask, "left", -1).left, 0);
});
test("line handles remain single-edged at drag limits", () => {
  const lower = { top: .5, right: 0, bottom: 0, left: 0 };
  assert.equal(moveMaskEdge(lower, "top", -1).top, .05);
  assert.equal(moveMaskEdge(lower, "top", 2).top, .95);
  const upper = { top: 0, right: 0, bottom: .5, left: 0 };
  assert.equal(moveMaskEdge(upper, "bottom", 2).bottom, .05);
  assert.equal(maskShapeLabel(moveMaskEdge(upper, "bottom", 2)), "Line");
});
test("line position moves the same divider on either inverted side", () => {
  const lower = moveMaskEdge({ top: .5, right: 0, bottom: 0, left: 0 }, "top", .653);
  const upper = moveMaskEdge({ top: 0, right: 0, bottom: .5, left: 0 }, "bottom", .653);
  assert.equal(lower.top, .653);
  assert.equal(1 - upper.bottom, .653);
  assert.equal(maskShapeLabel(lower), "Line");
  assert.equal(maskShapeLabel(upper), "Line");
});
test("shape selection reflects saved geometry, including Undo and keyframes", () => {
  assert.equal(maskShapeLabel({ top: 0, right: 0, bottom: 0, left: 0 }), "None");
  assert.equal(maskShapeLabel({ top: .2, right: 0, bottom: .3, left: 0 }), "Rectangle");
  assert.equal(maskShapeLabel({ top: .5, right: 0, bottom: 0, left: 0 }), "Line");
  assert.equal(maskShapeLabel({ top: 0, right: 0, bottom: .5, left: 0 }), "Line");
  assert.equal(maskShapeLabel({ top: .2, right: .1, bottom: .3, left: 0 }), "Rectangle");
});
test("handles use composition coordinates and preserve the opposite edge", () => {
  const mask = { top: .1, right: .2, bottom: .3, left: .1 };
  assert.deepEqual(moveMaskEdge(mask, "right", .7), { ...mask, right: 1 - .7 });
  assert.deepEqual(moveMaskEdge(mask, "top", -.1), { ...mask, top: 0 });
  assert.equal(moveMaskEdge(mask, "top", .95).top, .69);
  assert.equal(moveMaskEdge(mask, "left", 1).left, .79);
});

test("ellipse handles extend past the canvas without acquiring line constraints", () => {
  const mask = {top: .5, right: 0, bottom: 0, left: 0};
  assert.equal(moveMaskEdge(mask, "top", -.7, "ellipse").top, -.7);
  assert.equal(moveMaskEdge(mask, "left", -2, "ellipse").left, -1);
  assert.equal(moveMaskEdge(mask, "right", 1.7, "ellipse").right, 1 - 1.7);
  assert.equal(moveMaskEdge(mask, "bottom", 2.5, "ellipse").bottom, -1);
  assert.equal(moveMaskEdge(mask, "left", -.7).left, 0);
});
