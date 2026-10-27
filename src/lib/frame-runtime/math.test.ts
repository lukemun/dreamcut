import test from "node:test";
import assert from "node:assert/strict";
import { interpolate, Easing, mediaTime } from "./math";
test("source trim is independent of playback rate and local sequence time", () => {
  assert.equal(mediaTime(45, 30, 90, 2), 6);
  assert.equal(mediaTime(0, 30, 90, .5), 3);
  assert.equal(mediaTime(-30, 30, 90, 2), 3);
});
test("piecewise interpolation preserves hold boundaries and extrapolation", () => {
  assert.equal(interpolate(15, [0, 10, 20], [0, 1, 1]), 1);
  assert.equal(interpolate(-2, [0, 10], [0, 100], { extrapolateLeft: "clamp" }), 0);
  assert.equal(interpolate(12, [0, 10], [0, 100]), 120);
  assert.throws(() => interpolate(1, [0, 0], [0, 1]));
});
test("cubic easing solves x rather than using x as the curve parameter", () => {
  const linear = Easing.bezier(.25, .25, .75, .75);
  for (const x of [0,.1,.5,.9,1]) assert.ok(Math.abs(linear(x)-x)<1e-8);
  const ease = Easing.bezier(.42,0,.58,1);
  assert.ok(ease(.25)<.25);
  assert.ok(Math.abs(ease(.5)-.5)<1e-8);
});
