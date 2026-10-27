import assert from "node:assert/strict";
import { test } from "node:test";

import { boundsOfRgbDifference } from "@/lib/instruments/rendered-ink";

test("boundsOfRgbDifference reports visible pixels, not their surrounding layout box", () => {
  const canvas = { width: 6, height: 5 };
  const rgb = Buffer.alloc(canvas.width * canvas.height * 3);
  const mark = (x: number, y: number, value: number) => {
    const offset = (y * canvas.width + x) * 3;
    rgb.fill(value, offset, offset + 3);
  };
  mark(2, 1, 255);
  mark(4, 3, 64);
  mark(0, 0, 4); // below the antialias/noise threshold

  assert.deepEqual(boundsOfRgbDifference(rgb, canvas), {
    left: 2,
    top: 1,
    right: 4,
    bottom: 3,
  });
});

test("boundsOfRgbDifference returns null when the caption contributes no visible pixels", () => {
  assert.equal(boundsOfRgbDifference(Buffer.alloc(3 * 2 * 3), { width: 3, height: 2 }), null);
});

test("boundsOfRgbDifference rejects truncated frame data", () => {
  assert.throws(
    () => boundsOfRgbDifference(Buffer.alloc(4), { width: 2, height: 2 }),
    /expected at least 12/,
  );
});
