import assert from "node:assert/strict";
import test from "node:test";

import { assertActiveWordTimingPatch, captionTimingFindings } from "./caption-timing-validation";
import type { TimelineElement } from "@/components/studio/timeline/types";

const element = (): TimelineElement => ({
  id: "caption", project_id: "project", type: "caption_text", source_url: null,
  props: { text: "one two", timingMode: "active_word", wordTimings: [
    { text: "one", start: 0, end: 0.4 }, { text: "two", start: 0.4, end: 0.8 },
  ] },
  beat_id: null, character_id: null, timeline_start: 1, duration: 1, lane_key: "captions_0",
  lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0,
  playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
  created_at: "", updated_at: "",
});

test("active-word captions may move or extend but cannot start-resize or truncate timings", () => {
  assert.doesNotThrow(() => assertActiveWordTimingPatch(element(), { timeline_start: 2 }));
  assert.doesNotThrow(() => assertActiveWordTimingPatch(element(), { duration: 1.2 }));
  assert.throws(() => assertActiveWordTimingPatch(element(), { timeline_start: 1.1, duration: 0.9 }), /cannot be resized from the start/);
  assert.throws(() => assertActiveWordTimingPatch(element(), { duration: 0.5 }), /ends after the caption/);
});

test("active-word colour must be a six-digit hex value when supplied", () => {
  const invalid = captionTimingFindings({
    type: "caption_text",
    duration: 1,
    props: {
      text: "One two",
      timingMode: "active_word",
      activeWordColor: "red",
      wordTimings: [
        { text: "One", start: 0, end: 0.4 },
        { text: "two", start: 0.5, end: 0.9 },
      ],
    },
  });
  assert.ok(invalid.some((finding) => finding.code === "invalid_active_word_color"));
});

test("single-word captions require valid alignment but ignore active-word highlight color", () => {
  const findings = captionTimingFindings({
    type: "caption_text",
    duration: 1,
    props: {
      text: "One two",
      timingMode: "single_word",
      activeWordColor: "not-used",
      wordTimings: [
        { text: "One", start: 0, end: 0.4 },
        { text: "two", start: 0.5, end: 0.9 },
      ],
    },
  });
  assert.deepEqual(findings, []);
});
