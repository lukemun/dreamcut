import assert from "node:assert/strict";
import test from "node:test";

import { containRect, transformForSourceCenter, visibleSourceRect } from "./framing-geometry";

const portrait = { width: 1080, height: 1920 };

test("containRect preserves source aspect ratio inside the viewport", () => {
  assert.deepEqual(containRect({ width: 1920, height: 1080 }, portrait), {
    x: 0,
    y: 656.25,
    width: 1080,
    height: 607.5,
  });
});

test("visibleSourceRect matches an untransformed portrait source", () => {
  assert.deepEqual(visibleSourceRect(portrait, portrait, { scale: 1, offsetX: 0, offsetY: 0 }), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
});

test("visibleSourceRect returns the centered source window after zoom", () => {
  assert.deepEqual(visibleSourceRect(portrait, portrait, { scale: 2, offsetX: 0, offsetY: 0 }), {
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
});

test("dragging the crop center round-trips through renderer offsets", () => {
  const transform = transformForSourceCenter(portrait, portrait, 2, { x: 0.65, y: 0.7 });
  assert.deepEqual(transform, { scale: 2, offsetX: -0.6, offsetY: -0.8 });
  const crop = visibleSourceRect(portrait, portrait, transform);
  assert.ok(Math.abs(crop.x + crop.width / 2 - 0.65) < 0.001);
  assert.ok(Math.abs(crop.y + crop.height / 2 - 0.7) < 0.001);
});
