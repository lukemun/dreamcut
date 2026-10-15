import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { applyElementPatch } from "@/lib/local-store/element-patch";

const element = (overrides: Partial<TimelineElement> = {}): TimelineElement => ({
  id: "00000000-0000-4000-8000-000000000001",
  project_id: "project",
  type: "video_clip",
  source_url: "/source.mp4",
  props: { source_duration_seconds: 12, volume_envelope: [{ time_seconds: 0, volume: 1 }, { time_seconds: 6, volume: 0.5 }] },
  beat_id: null,
  character_id: null,
  timeline_start: 0,
  duration: 6,
  lane_key: "visual_0",
  lane_index: 0,
  trim_start: 0,
  trim_end: 6,
  volume: 1,
  fade_in: 0,
  fade_out: 0,
  playback_rate: 1,
  position_locked: false,
  removed_at: null,
  removed_reason: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

test("playback-rate updates derive duration and preserve merged props", () => {
  const actual = element();
  applyElementPatch(actual, { playback_rate: 2, props: { media_scale: 1.2 } });
  assert.equal(actual.duration, 3);
  assert.equal(actual.props?.media_scale, 1.2);
  assert.equal(actual.props?.source_duration_seconds, 12);
});

test("duration changes adjust an existing volume envelope", () => {
  const actual = element({ type: "vo_full", lane_key: "audio_narrator" });
  applyElementPatch(actual, { duration: 3 });
  const envelope = actual.props?.volume_envelope as Array<{ time_seconds: number }>;
  assert.equal(envelope.at(-1)?.time_seconds, 3);
});

test("unsupported element types strip volume envelopes", () => {
  const actual = element({ type: "caption_text", lane_key: "captions_0" });
  applyElementPatch(actual, { props: { text: "hello", volume_envelope: [{ time: 0, volume: 1 }] } });
  assert.equal(actual.props?.volume_envelope, undefined);
});

test("partial visual props patches preserve unrelated existing properties", () => {
  const actual = element({
    type: "caption_text",
    lane_key: "captions_0",
    props: { text: "STAND OUT", fontPreset: "anton", animationIn: "drop_in" },
  });
  applyElementPatch(actual, { props: { animationIn: "fade" } });
  assert.equal(actual.props?.text, "STAND OUT");
  assert.equal(actual.props?.fontPreset, "anton");
  assert.equal(actual.props?.animationIn, "fade");
});

test("locked elements reject timing mutations but allow content props", () => {
  const actual = element({ position_locked: true });
  assert.throws(() => applyElementPatch(actual, { timeline_start: 2 }), /locked/);
  applyElementPatch(actual, { props: { label: "safe" } });
  assert.equal(actual.props?.label, "safe");
});

const activeCaption = () => element({
  type: "caption_text",
  lane_key: "captions_0",
  duration: 1,
  trim_end: null,
  props: {
    text: "One two",
    timingMode: "active_word",
    wordTimings: [
      { text: "One", start: 0, end: 0.4 },
      { text: "two", start: 0.5, end: 0.9 },
    ],
  },
});

test("active-word captions can move or extend without changing cue-local timings", () => {
  const moved = activeCaption();
  applyElementPatch(moved, { timeline_start: 2 });
  assert.equal(moved.timeline_start, 2);

  const extended = activeCaption();
  applyElementPatch(extended, { duration: 1.5 });
  assert.equal(extended.duration, 1.5);
});

test("active-word captions reject start resize and truncation through shared patch semantics", () => {
  assert.throws(
    () => applyElementPatch(activeCaption(), { timeline_start: 0.2, duration: 0.8 }),
    /cannot be resized from the start/i,
  );
  assert.throws(
    () => applyElementPatch(activeCaption(), { duration: 0.7 }),
    /ends after the caption/i,
  );
});
