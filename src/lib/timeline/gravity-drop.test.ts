import test from "node:test";
import assert from "node:assert/strict";
import { deriveGravityDrop, EARTH_GRAVITY } from "./gravity-drop";
import { resolveNumberKeyframe } from "./keyframes";

test("gravity starts from rest, follows g t² / 2, and preserves unrelated motion", () => {
  const seconds = Math.sqrt(4 / EARTH_GRAVITY);
  const input = { media_offset_y: -.4, keyframes: {
    media_offset_y: [{ t: 0, v: -.4, ease: "hold" }],
    media_offset_x: [{ t: 0, v: 0 }, { t: 1, v: -.48, ease: "hold" }],
  } };
  const result = deriveGravityDrop(input, 4.5, seconds);
  assert.deepEqual(result.keyframes.media_offset_x, input.keyframes.media_offset_x);
  for (const elapsed of [0, .1, .2, .4, .6]) {
    const actual = resolveNumberKeyframe(result, "media_offset_y", 4.5 + elapsed, 0);
    // Offset units equal half a canvas height. Here a canvas is two meters.
    assert.ok(Math.abs(actual - (-.4 + EARTH_GRAVITY * elapsed ** 2 / 2)) < 1e-6);
  }
  assert.equal(resolveNumberKeyframe(result, "media_offset_y", 4.4, 0), -.4);
  assert.ok(Math.abs(result.gravity_drop_receipt.canvas_height_meters - 2) < 1e-10);
  const lower = deriveGravityDrop({ media_offset_y: .4 }, 4.5, seconds);
  const upperDelta = resolveNumberKeyframe(result, "media_offset_y", 4.8, 0) + .4;
  const lowerDelta = resolveNumberKeyframe(lower, "media_offset_y", 4.8, 0) - .4;
  assert.ok(Math.abs(upperDelta - lowerDelta) < 1e-6);
  assert.deepEqual(deriveGravityDrop(result, 4.5, seconds).keyframes, result.keyframes);
});
