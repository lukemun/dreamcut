import assert from "node:assert/strict";
import test from "node:test";

import { shapesFromAlphaMask } from "./font-contour-geometry";

test("alpha contours preserve enclosed glyph counters as holes", () => {
  const width = 12;
  const height = 12;
  const alpha = new Float32Array(width * height);

  for (let y = 2; y <= 9; y += 1) {
    for (let x = 2; x <= 9; x += 1) {
      const insideCounter = x >= 5 && x <= 6 && y >= 5 && y <= 6;
      alpha[y * width + x] = insideCounter ? 0 : 1;
    }
  }

  const shapes = shapesFromAlphaMask(alpha, width, height);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0]!.holes.length, 1);
});
