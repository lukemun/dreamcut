import assert from "node:assert/strict";
import test from "node:test";

import { cutoutIntervalWithEditableHandles } from "./custom-cutout-handles";

test("adds editable source handles around a short cutout selection", () => {
  assert.deepEqual(cutoutIntervalWithEditableHandles({
    visibleStartSeconds: 70.5,
    visibleEndSeconds: 75.6,
    sourceDurationSeconds: 144.17,
  }), {
    startSeconds: 68.5,
    endSeconds: 77.6,
  });
});

test("clips handles to the original source bounds", () => {
  assert.deepEqual(cutoutIntervalWithEditableHandles({
    visibleStartSeconds: 1,
    visibleEndSeconds: 9,
    sourceDurationSeconds: 10,
  }), {
    startSeconds: 0,
    endSeconds: 10,
  });
});

test("does not silently exceed the cutout processor's maximum interval", () => {
  assert.deepEqual(cutoutIntervalWithEditableHandles({
    visibleStartSeconds: 5,
    visibleEndSeconds: 79,
    sourceDurationSeconds: 120,
  }), {
    startSeconds: 5,
    endSeconds: 79,
  });
});
