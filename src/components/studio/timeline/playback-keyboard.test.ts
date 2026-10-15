import assert from "node:assert/strict";
import test from "node:test";

import { clampSteppedFrame, frameStepForKey, reviewInputCapturesKeys } from "./playback-keyboard";

test("left and right arrows map to one-frame steps", () => {
  assert.equal(frameStepForKey("ArrowLeft"), -1);
  assert.equal(frameStepForKey("ArrowRight"), 1);
  assert.equal(frameStepForKey(" "), 0);
});

test("one-frame stepping clamps to the composition bounds", () => {
  assert.equal(clampSteppedFrame(12, -1, 30), 11);
  assert.equal(clampSteppedFrame(12, 1, 30), 13);
  assert.equal(clampSteppedFrame(0, -1, 30), 0);
  assert.equal(clampSteppedFrame(29, 1, 30), 29);
  assert.equal(clampSteppedFrame(0, 1, 1), 0);
});

test("review shortcuts survive slider focus but preserve typing", () => {
  for (const type of ["range", "checkbox", "radio", "button", "submit", "reset"]) {
    assert.equal(reviewInputCapturesKeys(type), false, type);
  }
  for (const type of ["text", "number", "search", "email", "password", "color"]) {
    assert.equal(reviewInputCapturesKeys(type), true, type);
  }
});
