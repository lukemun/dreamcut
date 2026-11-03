import assert from "node:assert/strict";
import { test } from "node:test";
import { captionTranscriptRows, captionTranscriptSrt, captionTranscriptTime } from "./caption-transcript";
import { captionTextEditPatch } from "@/lib/timeline/active-word-captions";
import { applyElementPatch } from "@/lib/local-store/element-patch";
import type { TimelineElement } from "./types";

const cue = (id: string, start: number, extra = {}) => ({ id, type: "caption_text", timeline_start: start,
  duration: 2, lane_index: 0, removed_at: null, props: { text: "Hello world", timingMode: "active_word",
    wordTimings: [{ text: "Hello", start: 0, end: 1 }, { text: "world", start: 1, end: 2 }] }, ...extra } as TimelineElement);

test("transcript follows live captions in timeline order without mutating the timeline", () => {
  const rows = [cue("later", 4), cue("removed", 0, { removed_at: "now" }), cue("video", 0, { type: "video_clip" }), cue("first", 1)];
  assert.deepEqual(captionTranscriptRows(rows).map(row => row.id), ["first", "later"]);
  assert.equal(rows[0]!.id, "later");
});

test("transcript text edits use persistence normalization and preserve placement and appearance", () => {
  const element = cue("caption", 4);
  element.props = { ...element.props, fontSizePx: 52, caption_audio_binding: { version: 1 } };
  const edit = captionTextEditPatch("HELLO world!", element.props);
  applyElementPatch(element, { props: edit.patch });
  assert.equal(element.props?.text, "HELLO world!");
  assert.equal(element.props?.fontSizePx, 52);
  assert.equal(element.props?.caption_audio_binding, null);
  assert.equal(element.timeline_start, 4);
  assert.equal(element.duration, 2);
  assert.equal(edit.timingInvalidated, false);
  assert.equal((element.props?.wordTimings as {text:string}[])[1]!.text, "world!");
  const changed = captionTextEditPatch("A different sentence", element.props);
  applyElementPatch(element, { props: changed.patch });
  assert.equal(changed.timingInvalidated, true);
  assert.equal(element.props?.timingMode, "phrase");
  assert.deepEqual(element.props?.wordTimings, []);
});

test("timestamps carry rounded seconds into minutes", () => {
  assert.equal(captionTranscriptTime(59.999), "1:00.00");
  assert.equal(captionTranscriptTime(2.345), "0:02.35");
});

test("subtitles follow live captions at their timeline times", () => {
  const rows = [cue("later", 3661.5), cue("removed", 0, { removed_at: "now" }), cue("empty", 2, { props: { text: "  " } }), cue("first", 1.25)];
  assert.equal(captionTranscriptSrt(rows),
    "1\n00:00:01,250 --> 00:00:03,250\nHello world\n\n2\n01:01:01,500 --> 01:01:03,500\nHello world\n");
});
