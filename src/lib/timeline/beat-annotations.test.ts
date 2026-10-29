import test from "node:test";
import assert from "node:assert/strict";
import { adjacentMusicalBeats, beatAnnotationSchema, projectBeatAnnotation, projectDownbeats, projectDrops, projectHitAnnotation, type BeatAnnotation } from "./beat-annotations";
const annotation: BeatAnnotation = { schema_version: 1, source_sha256: "a".repeat(64), recipe: "test", analyzed_at: "2026-09-20", source_duration_seconds: 10, tempo_bpm: 120, tempo_confirmed: false, beats_seconds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], downbeats: "unknown" };
const clip = { type: "music", timeline_start: 20, duration: 3, trim_start: 2, trim_end: 2, playback_rate: 2, props: {} };
test("source annotation follows placement, trims and speed without mutation", () => {
  assert.deepEqual(projectBeatAnnotation(clip, annotation).map(b => b.time), [20, 20.5, 21, 21.5, 22, 22.5]);
  assert.deepEqual(projectBeatAnnotation({ ...clip, timeline_start: 5, duration: 1 }, annotation).map(b => b.source_time), [2, 3]);
  assert.equal(annotation.beats_seconds.length, 10);
});
test("grid validation rejects duplicates, unsorted, nonfinite and out-of-source positions", () => {
  for (const beats_seconds of [[1, 1], [2, 1], [NaN], [Infinity], [-1], [10]]) assert.equal(beatAnnotationSchema.safeParse({ ...annotation, beats_seconds }).success, false);
  assert.equal(beatAnnotationSchema.safeParse({ ...annotation, beats_seconds: [] }).success, true);
});
test("detailed rhythm annotations project typed hits through the same media clock", () => {
  const detailed = beatAnnotationSchema.parse({ ...annotation, schema_version: 2, hits: [
    { time_seconds: 2.25, kind: "drum", confidence: 0.9, strength: 1 },
    { time_seconds: 3.5, kind: "synth", confidence: 0.6, strength: 0.7 },
  ] });
  assert.deepEqual(projectHitAnnotation(clip, detailed).map(hit => ({ time: hit.time, kind: hit.kind })), [
    { time: 20.125, kind: "drum" }, { time: 20.75, kind: "synth" },
  ]);
  assert.equal(beatAnnotationSchema.safeParse({ ...detailed, hits: detailed.hits.toReversed() }).success, false);
  assert.equal(beatAnnotationSchema.safeParse({ ...detailed, hits: [{ ...detailed.hits[0], confidence: 2 }] }).success, false);
});
test("speed steps project source beats through the shared media clock", () => {
  const media = { ...clip, playback_rate: 1, duration: 4, props: { source_duration_seconds: 10, keyframes: { playback_rate: [{ t: 2, source_t: 4, v: 2, ease: "hold" }] } } };
  assert.deepEqual(projectBeatAnnotation(media, annotation).map(b => b.time), [20, 21, 22, 22.5, 23, 23.5]);
});
test("held video frames have no musical beats and split edges belong to only one clip", () => {
  const video = { ...clip, type: "video_clip", duration: 8, props: { leading_hold_duration_seconds: 1 } };
  assert.deepEqual(projectBeatAnnotation(video, annotation).map(b => b.time), [21, 21.5, 22, 22.5, 23, 23.5]);
  const left = projectBeatAnnotation({ ...clip, trim_end: 6, duration: 1 }, annotation);
  const right = projectBeatAnnotation({ ...clip, trim_start: 4, timeline_start: 21, duration: 2 }, annotation);
  assert.deepEqual([...left, ...right].map(b => b.source_time), [2, 3, 4, 5, 6, 7]);
});

test("next/previous beat skip every annotation on the currently displayed frame", () => {
  const beats = [3.343, 3.344, 3.95].map((time, index) => ({ time, index, source_time: time }));
  assert.equal(adjacentMusicalBeats(beats, 100 / 30).next?.time, 3.95);
  assert.equal(adjacentMusicalBeats(beats, 100 / 30).previous, undefined);
  assert.equal(adjacentMusicalBeats(beats, 119 / 30).previous?.time, 3.344);
});

test("downbeats and drops follow the clip clock; older maps have none", () => {
  const v3 = beatAnnotationSchema.parse({ ...annotation, schema_version: 3, hits: [], tempo_hint_bpm: 120, beat_source: "fixed_tempo_fit", grid_strength: 0.8,
    downbeats: { meter: 4, seconds: [0, 4, 8], confidence: 0.6 }, drops: [{ time_seconds: 4, bass_rise_db: 12, level_rise_db: 3 }, { time_seconds: 9, bass_rise_db: 10, level_rise_db: 1 }] });
  // Source 2–8 s plays at 20–23 s; the bar at 0 s is trimmed off and the one at 8 s is past the end.
  assert.deepEqual(projectDownbeats(clip, v3), [{ source_time: 4, time: 21, bar: 1 }]);
  assert.deepEqual(projectDrops(clip, v3), [{ source_time: 4, time: 21, time_seconds: 4, bass_rise_db: 12, level_rise_db: 3 }]);
  assert.deepEqual(projectDownbeats(clip, annotation), []);
  assert.deepEqual(projectDrops(clip, annotation), []);
  assert.throws(() => beatAnnotationSchema.parse({ ...v3, downbeats: { meter: 4, seconds: [4, 0], confidence: 0.6 } }));
  assert.throws(() => beatAnnotationSchema.parse({ ...v3, drops: [{ time_seconds: 12, bass_rise_db: 9, level_rise_db: 0 }] }));
});
