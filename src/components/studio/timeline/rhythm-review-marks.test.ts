import assert from "node:assert/strict";
import test from "node:test";
import { rhythmReviewMarks } from "./rhythm-review-marks";
import type { FrameTag } from "@/lib/review/frame-tag-types";
import type { TimelineElement } from "./types";

const clip = { timeline_start: 5, duration: 10, trim_start: 14.45, playback_rate: 1, props: {} } as TimelineElement;
const mark = (time: number) => ({ id: String(time), label: "M1", timeline_seconds: time } as FrameTag);
test("projects timeline marks into trimmed source time, not their potentially stale anchor", () => {
  const result = rhythmReviewMarks(clip, [mark(9.67)], 14.45, 24.45);
  assert.ok(Math.abs(result[0]!.sourceTime - 19.12) < 1e-8);
});
test("respects playback speed and zoom bounds", () => {
  const fast = { ...clip, playback_rate: 2 };
  const result = rhythmReviewMarks(fast, [mark(6), mark(8)], 19, 22);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.sourceTime, 20.45);
});
test("omits marks outside the clip, at its exclusive end, or without a timeline context", () => {
  assert.deepEqual(rhythmReviewMarks(clip, [mark(4), mark(15)], 0, 100), []);
  assert.deepEqual(rhythmReviewMarks(undefined, [mark(9)], 0, 100), []);
});
