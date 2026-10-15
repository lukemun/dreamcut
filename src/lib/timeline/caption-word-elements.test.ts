import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { resolveActiveWordIndex } from "./active-word-captions";
import { captionWordElementId, captionWordElements, splitSingleWordCaptions } from "./caption-word-elements";

function speechCaption(overrides: Record<string, unknown> = {}): TimelineElement {
  return {
    id: "830d2262-0428-4330-bc96-a08df13be65c",
    type: "caption_text",
    timeline_start: 53.09,
    duration: 1.44,
    lane_key: "captions_0",
    lane_index: 0,
    removed_at: null,
    props: {
      text: "fund, Pershing Capital,",
      timingMode: "single_word",
      hidePunctuation: true,
      caption_source_text: "fund, Pershing Capital,",
      caption_source_element_id: "speech",
      caption_source_start_seconds: 56.59,
      caption_source_end_seconds: 58.03,
      caption_source_playback_rate: 1,
      caption_word_count: 3,
      caption_word_limit: 4,
      caption_follow_audio: true,
      wordTimings: [
        { text: "fund,", start: 0, end: 0.4 },
        { text: "Pershing", start: 0.4, end: 0.76 },
        { text: "Capital,", start: 0.76, end: 1.44 },
      ],
      caption_audio_binding: {
        version: 1, start: 56.59, end: 58.03, text: "fund, Pershing Capital,",
        words: [
          { text: "fund,", start: 56.59, end: 56.99 },
          { text: "Pershing", start: 56.99, end: 57.35 },
          { text: "Capital,", start: 57.35, end: 58.03 },
        ],
      },
      ...overrides,
    },
  } as unknown as TimelineElement;
}

test("a multi-word one-word-at-a-time caption becomes one caption per word on the same clock", () => {
  const words = captionWordElements(speechCaption())!;
  assert.equal(words.length, 3);
  assert.deepEqual(words.map((word) => word.props!.text), ["fund,", "Pershing", "Capital,"]);
  assert.deepEqual(words.map((word) => [word.timeline_start, word.duration]), [[53.09, 0.4], [53.49, 0.36], [53.85, 0.68]]);
  // The first word keeps the caption's identity; the rest get stable ids.
  assert.equal(words[0]!.id, "830d2262-0428-4330-bc96-a08df13be65c");
  assert.equal(words[2]!.id, captionWordElementId("830d2262-0428-4330-bc96-a08df13be65c", 2));
  assert.equal(words[2]!.props!.split_from_id, "830d2262-0428-4330-bc96-a08df13be65c");
  for (const word of words) {
    assert.equal(word.lane_key, "captions_0");
    assert.equal(word.props!.timingMode, "single_word");
    assert.equal(word.props!.hidePunctuation, true);
    assert.equal(word.props!.caption_word_count, 1);
    assert.deepEqual((word.props!.wordTimings as unknown[]).length, 1);
  }
  // Each word carries its own speech-clock window and audio binding.
  assert.deepEqual([words[1]!.props!.caption_source_start_seconds, words[1]!.props!.caption_source_end_seconds], [56.99, 57.35]);
  assert.equal(words[1]!.props!.caption_source_text, "Pershing");
  assert.deepEqual((words[1]!.props!.caption_audio_binding as { words: unknown[] }).words, [{ text: "Pershing", start: 56.99, end: 57.35 }]);
});

test("each word shows on the same frames as before the split", () => {
  const caption = speechCaption();
  const words = captionWordElements(caption)!;
  for (let t = caption.timeline_start; t < caption.timeline_start + caption.duration; t += 1 / 30) {
    const before = resolveActiveWordIndex(caption.props!.wordTimings as never, t - caption.timeline_start);
    const after = words.findIndex((word) => resolveActiveWordIndex(word.props!.wordTimings as never, t - word.timeline_start) === 0);
    assert.equal(after, before, `t=${t}`);
  }
});

test("one-word, phrase, invalid and removed captions are left alone", () => {
  assert.equal(captionWordElements(speechCaption({ timingMode: "phrase" })), null);
  assert.equal(captionWordElements(speechCaption({ text: "Capital,", wordTimings: [{ text: "Capital,", start: 0, end: 0.68 }] })), null);
  assert.equal(captionWordElements(speechCaption({ text: "something else entirely" })), null);
  assert.equal(captionWordElements({ ...speechCaption(), removed_at: "2026-10-13T00:00:00Z" }), null);
});

test("splitting is in place, keeps order and is idempotent", () => {
  const before = { id: "a", type: "video_clip", timeline_start: 0, duration: 2, props: {} } as unknown as TimelineElement;
  const elements = [before, speechCaption()];
  const changed = splitSingleWordCaptions(elements);
  assert.equal(changed.length, 3);
  assert.deepEqual(elements.map((element) => element.props?.text ?? element.id), ["a", "fund,", "Pershing", "Capital,"]);
  assert.deepEqual(splitSingleWordCaptions(elements), []);
});

test("only changed captions split when a filter is given, and a repeated split never duplicates words", async () => {
  const { changedSince } = await import("./caption-word-elements");
  const untouched = speechCaption();
  const elements = [untouched];
  assert.deepEqual(splitSingleWordCaptions(elements, { only: changedSince([structuredClone(untouched)]) }), []);
  assert.equal(elements.length, 1);
  const split = [speechCaption()];
  splitSingleWordCaptions(split);
  // A stale copy writes the three-word caption back over the first word: still three captions, not five.
  const stale = [speechCaption(), ...split.slice(1)];
  splitSingleWordCaptions(stale);
  assert.deepEqual(stale.map((element) => element.props?.text), ["fund,", "Pershing", "Capital,"]);
  assert.equal(new Set(stale.map((element) => element.id)).size, 3);
});
