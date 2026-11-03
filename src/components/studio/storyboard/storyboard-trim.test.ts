import assert from "node:assert/strict";
import test from "node:test";
import { sourceLastFrame, trimDuration, trimEdge, trimFromRange } from "./storyboard-trim";

const shot = { start: 1, duration: 2 };

test("range writes frame-snapped start and duration inside the source", () => {
  assert.deepEqual(trimFromRange(shot, 0.51, 4.49, 10), { start: 15 / 30, duration: (135 - 15) / 30 });
  assert.deepEqual(trimFromRange(shot, -3, 99, 10), { start: 0, duration: 10 });
  assert.equal(trimFromRange(shot, 1, 3, 10), null, "unchanged range is a no-op");
});

test("range keeps at least one frame and never starts on the last frame", () => {
  assert.deepEqual(trimFromRange(shot, 5, 5, 10), { start: 5, duration: 1 / 30 });
  assert.deepEqual(trimFromRange(shot, 10, 10, 10), { start: 299 / 30, duration: 1 / 30 });
  assert.equal(trimFromRange(shot, 0, 1, 0), null, "unknown source duration cannot be trimmed");
});

test("set in / set out at the playhead push the opposite edge rather than inverting", () => {
  assert.deepEqual(trimEdge(shot, "in", 2, 10), { start: 2, duration: 1 });
  assert.deepEqual(trimEdge(shot, "in", 4, 10), { start: 4, duration: 1 / 30 });
  assert.deepEqual(trimEdge(shot, "out", 0.5, 10), { start: 14 / 30, duration: 1 / 30 });
  assert.deepEqual(trimEdge(shot, "out", 20, 10), { start: 1, duration: 9 });
});

test("duration keeps the in point and is bounded by the source end", () => {
  assert.deepEqual(trimDuration(shot, 4, 10), { start: 1, duration: 4 });
  assert.deepEqual(trimDuration(shot, 30, 10), { start: 1, duration: 9 });
  assert.equal(sourceLastFrame(10), 300);
});
