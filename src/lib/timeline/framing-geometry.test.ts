import assert from "node:assert/strict";
import test from "node:test";

import { containRect, transformForSourceCenter, transformForSourceRect, visibleSourceRect } from "./framing-geometry";

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

test("transformForSourceRect frames one region of a screen recording inside a cropped half", () => {
  const screen = { width: 3024, height: 1964 }, topHalf = { top: 0, right: 0, bottom: 0.5, left: 0 };
  // The app window on the right of the recording fills the top half of a vertical video.
  const app = transformForSourceRect(screen, portrait, { x: 0.279, y: 0, width: 0.721, height: 1 }, topHalf, "fill");
  assert.deepEqual({ scale: app.scale, offsetX: app.offsetX, offsetY: app.offsetY }, { scale: 1.387, offsetX: -0.387, offsetY: -0.5 });
  const whole = transformForSourceRect(screen, portrait, { x: 0, y: 0, width: 1, height: 1 }, topHalf, "fit");
  assert.deepEqual({ scale: whole.scale, offsetX: whole.offsetX, offsetY: whole.offsetY }, { scale: 1, offsetX: 0, offsetY: -0.5 });
  // The region's centre lands on the visible part's centre, whatever the zoom.
  const zoomed = transformForSourceRect(screen, portrait, { x: 0.3, y: 0.2, width: 0.5, height: 0.5 }, topHalf);
  const shown = visibleSourceRect(screen, portrait, { scale: zoomed.scale, offsetX: zoomed.offsetX, offsetY: zoomed.offsetY });
  assert.ok(shown.width > 0 && !zoomed.clamped);
  assert.equal(transformForSourceRect(screen, portrait, { x: 0.5, y: 0.5, width: 0.01, height: 0.01 }, topHalf).clamped, true, "beyond 3× zoom is reported");
});
