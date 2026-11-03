import assert from "node:assert/strict";
import test from "node:test";

import { breakCaptionLines, captionsFromAlignment, likelyProperNouns, validateAlignment } from "./captions";
import { CAPTION, FPS, isAllowedCaptionGapFrames } from "@/lib/qc/standards";

test("validateAlignment rejects overlapping words", () => {
  assert.throws(() => validateAlignment([{ word: "one", start: 0, end: 1 }, { word: "two", start: 0.5, end: 2 }]), /overlaps/);
});

test("breakCaptionLines honors the 42 character and two-line limits", () => {
  const broken = breakCaptionLines("This sentence is long enough to require a careful two line break");
  assert.ok(broken?.includes("\n"));
  assert.ok(broken!.split("\n").every((line) => line.length <= 42));
});

test("captionsFromAlignment preserves exact words and meets reading duration", () => {
  const cues = captionsFromAlignment(validateAlignment([
    { word: "A", start: 0, end: 0.2 },
    { word: "readable", start: 0.2, end: 0.6 },
    { word: "caption.", start: 0.6, end: 1.1 },
  ]));
  assert.equal(cues[0].text, "A readable caption.");
  assert.ok(cues[0].end - cues[0].start >= 20 / 30);
});

test("captionsFromAlignment defaults to three words or fewer per cue", () => {
  const words = Array.from({ length: 12 }, (_, index) => ({
    word: index === 5 ? `word${index}.` : `word${index}`,
    start: index * 0.5,
    end: index * 0.5 + 0.35,
  }));
  const cues = captionsFromAlignment(words);
  assert.ok(cues.every((cue) => cue.text.split(/\s+/).length <= 3));
});

test("rapid social fragments preserve the three-word ceiling during dense speech", () => {
  const words = Array.from({ length: 18 }, (_, index) => ({
    word: index === 8 || index === 17 ? `word${index}.` : `word${index}`,
    start: index * 0.22,
    end: index * 0.22 + 0.16,
  }));
  const cues = captionsFromAlignment(words, {
    allowFastVerbatim: true,
    allowRapidFragments: true,
  });
  assert.ok(cues.every((cue) => cue.text.split(/\s+/).length <= 3));
  assert.deepEqual(cues.flatMap((cue) => cue.text.split(/\s+/)), words.map((word) => word.word));
});

test("captionsFromAlignment prefers natural sentence endings over mechanical full chunks", () => {
  const words = validateAlignment([
    { word: "A", start: 0, end: 0.35 },
    { word: "clear", start: 0.4, end: 0.75 },
    { word: "point.", start: 0.8, end: 1.15 },
    { word: "Then", start: 1.4, end: 1.75 },
    { word: "we", start: 1.8, end: 2.15 },
    { word: "continue.", start: 2.2, end: 2.7 },
  ]);
  const cues = captionsFromAlignment(words);
  assert.deepEqual(cues.map((cue) => cue.text), ["A clear point.", "Then we continue."]);
});

test("active-word cue generation retains the exact aligned word records", () => {
  const words = validateAlignment([
    { word: "A", start: 1, end: 1.2 },
    { word: "timed", start: 1.25, end: 1.55 },
    { word: "caption.", start: 1.55, end: 1.9 },
  ]);
  const cues = captionsFromAlignment(words, { includeWordTimings: true });
  assert.deepEqual(cues[0].words, words);
});

test("likelyProperNouns skips sentence-initial capitalization", () => {
  assert.deepEqual(likelyProperNouns("Feyre met Rhysand. Then Amazon called."), ["Rhysand"]);
});

test("captionsFromAlignment never emits a gap the QC gate would reject", () => {
  const words = Array.from({ length: 24 }, (_, i) => ({
    word: `word${i}`,
    start: i * 0.4,
    end: i * 0.4 + 0.3,
  }));
  const cues = captionsFromAlignment(words);
  assert.ok(cues.length > 1, "expected multiple cues");
  for (let i = 0; i < cues.length - 1; i += 1) {
    const gap = Math.round((cues[i + 1].start - cues[i].end) * FPS);
    assert.ok(
      isAllowedCaptionGapFrames(gap),
      `cue ${i} -> ${i + 1} gap of ${gap} frames is not in Netflix's allowed set (exactly 2, or >= 15)`,
    );
  }
});

test("a cue is never planned at the minimum and then shortened under it", () => {
  const words = Array.from({ length: 24 }, (_, i) => ({
    word: `w${i}`,
    start: i * 0.4,
    end: i * 0.4 + 0.3,
  }));
  for (const cue of captionsFromAlignment(words)) {
    const frames = Math.round((cue.end - cue.start) * FPS);
    assert.ok(frames >= CAPTION.minDurationFrames, `cue of ${frames} frames is below the ${CAPTION.minDurationFrames}-frame floor`);
  }
});
