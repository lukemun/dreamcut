import assert from "node:assert/strict";
import test from "node:test";

import { resolveSpeedStepSegments, setSpeedAtTime, sourceTimeToTimelineTime, speedStepDuration, timelineTimeToSourceTime, toggleSpeedStepAtTime } from "./speed-steps";

const media = { duration: 10, trim_start: 0, trim_end: 0, playback_rate: 1, props: { source_duration_seconds: 10 } };

test("speed steps retain one source window and derive hard-cut segment durations", () => {
  const keyed = toggleSpeedStepAtTime(media, 4);
  const changed = setSpeedAtTime({ ...media, props: keyed.props }, 4, 2);
  const segments = resolveSpeedStepSegments({ ...media, props: changed.props });
  assert.deepEqual(segments.map(({ sourceStart, sourceEnd, timelineStart, timelineEnd, playbackRate }) => (
    { sourceStart, sourceEnd, timelineStart, timelineEnd, playbackRate }
  )), [
    { sourceStart: 0, sourceEnd: 4, timelineStart: 0, timelineEnd: 4, playbackRate: 1 },
    { sourceStart: 4, sourceEnd: 10, timelineStart: 4, timelineEnd: 7, playbackRate: 2 },
  ]);
  assert.equal(changed.duration, 7);
});

test("changing the first segment reprojects later diamonds from source authority", () => {
  const keyed = toggleSpeedStepAtTime(media, 4);
  const changed = setSpeedAtTime({ ...media, props: keyed.props }, 0, 2);
  const point = (changed.props.keyframes as any).playback_rate[0];
  assert.equal(point.source_t, 4);
  assert.equal(point.t, 2);
});

test('reverse maps timeline and source time in both directions', () => {
  const media = { duration: 2, trim_start: 1, trim_end: 1, playback_rate: 2, props: { source_duration_seconds: 6, playback_reverse: true } };
  assert.equal(timelineTimeToSourceTime(media, 0), 5);
  assert.equal(timelineTimeToSourceTime(media, 1), 3);
  assert.equal(timelineTimeToSourceTime(media, 9), 1);
  assert.equal(sourceTimeToTimelineTime(media, 3), 1);
  assert.equal(speedStepDuration(media), 2);
});
