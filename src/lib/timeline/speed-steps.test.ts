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


test("77x preserves the full source window and maps every output frame", () => {
  const source = { duration: 4, trim_start: 10, trim_end: 2, playback_rate: 77, props: { source_duration_seconds: 320 } };
  assert.equal(speedStepDuration(source), 4);
  for (let frame = 0; frame < 120; frame++) {
    const time = frame / 30;
    const expected = 10 + time * 77;
    assert.ok(Math.abs(timelineTimeToSourceTime(source, time) - expected) < 1e-6);
    assert.ok(Math.abs(sourceTimeToTimelineTime(source, expected) - time) < 1e-6);
  }
  assert.equal(timelineTimeToSourceTime(source, 4), 318);
  const reset = setSpeedAtTime(source, 0, 1);
  assert.equal(reset.duration, 308);
  assert.equal(reset.playbackRate, 1);
});

test("speed steps retain a 1x foreground interval before a 77x interval", () => {
  const source = { duration: 156, trim_start: 10, trim_end: 2, playback_rate: 1, props: { source_duration_seconds: 168 } };
  const keyed = toggleSpeedStepAtTime(source, 2);
  const changed = setSpeedAtTime({ ...source, props: keyed.props }, 2, 77);
  const result = { ...source, props: changed.props };
  assert.equal(changed.duration, 4);
  assert.equal(timelineTimeToSourceTime(result, 1), 11);
  assert.equal(timelineTimeToSourceTime(result, 2), 12);
  assert.equal(timelineTimeToSourceTime(result, 3), 89);
  assert.equal(sourceTimeToTimelineTime(result, 166), 4);
});
