import test from "node:test";
import assert from "node:assert/strict";
import { maskShapeLabel, moveMaskEdge } from "./mask-handle-geometry";
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
