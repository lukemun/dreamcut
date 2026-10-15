import assert from "node:assert/strict";
import test from "node:test";

import {
  activeWordForegroundColor,
  captionRenderParts,
  captionTextAppliedToWordTimings,
  captionTextEditPatch,
  captionTextMatchesWordTimings,
  normalizeWordTimings,
  resolveActiveWordIndex,
  resolveSingleWordScaleX,
  splitActiveWordCaptionProps,
  validateWordTimings,
} from "./active-word-captions";

test("active word foreground stays legible on bright and dark highlight colors", () => {
  assert.equal(activeWordForegroundColor("#FCDF17"), "#111111");
  assert.equal(activeWordForegroundColor("#111111"), "#ffffff");
  assert.equal(activeWordForegroundColor("not-a-color"), "#ffffff");
});

const timings = [
  { text: "We", start: 0, end: 0.2 },
  { text: "already", start: 0.3, end: 0.6 },
  { text: "have", start: 0.6, end: 0.8 },
  { text: "this.", start: 0.8, end: 1.1 },
];

test("active word uses half-open aligned intervals and leaves real gaps empty", () => {
  assert.equal(resolveActiveWordIndex(timings, 0), 0);
  assert.equal(resolveActiveWordIndex(timings, 0.2), -1);
  assert.equal(resolveActiveWordIndex(timings, 0.3), 1);
  assert.equal(resolveActiveWordIndex(timings, 0.6), 2);
  assert.equal(resolveActiveWordIndex(timings, 1.1), -1);
});

test("single-word squeeze expands, holds, and collapses around each aligned word", () => {
  const word = { text: "ACCIDENT", start: 1, end: 1.8 };
  assert.equal(resolveSingleWordScaleX(word, 0.999), 0);
  assert.equal(resolveSingleWordScaleX(word, 1), 0.025);
  assert.ok(resolveSingleWordScaleX(word, 1.06) > 0.45);
  assert.equal(resolveSingleWordScaleX(word, 1.2), 1);
  assert.equal(resolveSingleWordScaleX(word, 1.68), 1);
  assert.ok(resolveSingleWordScaleX(word, 1.75) < 0.45);
  assert.equal(resolveSingleWordScaleX(word, 1.8), 0);
});

test("line breaks, case, and terminal punctuation do not invalidate acoustic timing", () => {
  assert.equal(captionTextMatchesWordTimings("WE already\nhave this!", timings), true);
  assert.deepEqual(captionRenderParts("WE already\nhave"), [
    { text: "WE", wordIndex: 0 },
    { text: " ", wordIndex: null },
    { text: "already", wordIndex: 1 },
    { text: "\n", wordIndex: null },
    { text: "have", wordIndex: 2 },
  ]);
});

test("punctuation and case edits update timed display words without changing timing or emphasis", () => {
  const emphasized = [{ text: "how.", start: 0, end: 0.4, color: "#d63b3b", scale: 1.4 }];
  const updated = captionTextAppliedToWordTimings("HOW?", emphasized);
  assert.deepEqual(updated, [{ text: "HOW?", start: 0, end: 0.4, color: "#d63b3b", scale: 1.4 }]);
  assert.deepEqual(captionTextEditPatch("HOW?", { wordTimings: emphasized }).patch, {
    text: "HOW?",
    wordTimings: updated,
  });
  assert.deepEqual(validateWordTimings("HOW?", 0.5, emphasized).timings, updated);
});

test("lexical caption edits invalidate timings", () => {
  const result = validateWordTimings("We never have this", 1.2, timings);
  assert.ok(result.findings.some((finding) => finding.code === "word_timing_text_mismatch"));
  assert.deepEqual(captionTextEditPatch("We never have this", { wordTimings: timings }).patch, {
    text: "We never have this",
    timingMode: "phrase",
    wordTimings: [],
  });
});

test("validation catches overlap, out-of-range, and words with no output frame", () => {
  const result = validateWordTimings("one two three", 0.2, [
    { text: "one", start: 0.001, end: 0.01 },
    { text: "two", start: 0.005, end: 0.1 },
    { text: "three", start: 0.1, end: 0.3 },
  ]);
  assert.ok(result.findings.some((finding) => finding.code === "word_timing_no_render_frame"));
  assert.ok(result.findings.some((finding) => finding.code === "word_timing_overlap"));
  assert.ok(result.findings.some((finding) => finding.code === "word_timing_out_of_range"));
});

test("active-word captions split only at an aligned word boundary and rebase the right side", () => {
  const result = splitActiveWordCaptionProps({ text: "We already have this.", timingMode: "active_word", wordTimings: timings }, 1.2, 0.6);
  assert.equal(result?.left.text, "We already");
  assert.equal(result?.right.text, "have this.");
  assert.equal((result?.right.wordTimings as typeof timings)[0]?.start, 0);
  assert.equal(splitActiveWordCaptionProps({ text: "We already have this.", timingMode: "active_word", wordTimings: timings }, 1.2, 0.5), null);
});

test("single-word captions preserve their display mode when split on a word boundary", () => {
  const result = splitActiveWordCaptionProps({
    text: "We already have this.",
    timingMode: "single_word",
    wordTimings: timings,
  }, 1.2, 0.6);
  assert.equal(result?.left.timingMode, "single_word");
  assert.equal(result?.right.timingMode, "single_word");
  assert.equal(result?.right.text, "have this.");
});

test("word timing normalization preserves optional emphasis metadata", () => {
  const result = normalizeWordTimings([
    {
      text: "important",
      start: 0,
      end: 0.4,
      color: "#FFD166",
      scale: 1.6,
      rowBreakBefore: true,
      rowBreakAfter: true,
    },
  ]);
  assert.deepEqual(result, [{
    text: "important",
    start: 0,
    end: 0.4,
    color: "#FFD166",
    scale: 1.6,
    rowBreakBefore: true,
    rowBreakAfter: true,
  }]);
});
