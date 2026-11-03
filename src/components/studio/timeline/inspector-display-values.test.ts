import test from "node:test";
import assert from "node:assert/strict";
import { mediaOffsetToPercent, percentToMediaOffset, fractionToPercent, percentToFraction } from "./inspector-display-values";

test("position percentages use a shared top-left origin without changing persisted units", () => {
  for (const [offset, percent] of [[-1, 0], [-0.5, 25], [0, 50], [0.5, 75], [1, 100]]) {
    assert.equal(mediaOffsetToPercent(offset), percent);
    assert.equal(percentToMediaOffset(percent), offset);
    assert.equal(fractionToPercent(percentToFraction(percent)), percent);
  }
});
test("size percentages preserve precise scale round trips", () => {
  for (const scale of [0.1, 0.16, 1, 1.75, 3]) assert.ok(Math.abs(percentToFraction(fractionToPercent(scale)) - scale) < 1e-12);
});
