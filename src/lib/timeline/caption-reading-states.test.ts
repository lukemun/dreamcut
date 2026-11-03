import assert from "node:assert/strict";
import test from "node:test";

import {
  captionLineOf,
  captionWordReadingState,
  captionReadingSignature,
  captionReadingStatesActive,
  resolveWordReadingLook,
  speechWordEntranceStyle,
  wordReadingState,
  type CaptionReadingStyle,
} from "./caption-reading-states";
import { resolveCaptionProps } from "./captions";

const words = [
  { text: "one", start: 0, end: 0.4 },
  { text: "two", start: 0.8, end: 1.2 },
  { text: "three", start: 1.2, end: 1.6 },
];

const neutral: CaptionReadingStyle = {
  upcomingWords: "shown",
  upcomingWordOpacity: 0.45,
  speakingWordColor: null,
  speakingWordScale: 1,
  speakingWordLiftEm: 0,
  speakingWordOvershoot: 0,
  spokenWordColor: null,
  wordStateSeconds: 0.12,
  speakingWordHoldsGap: true,
  wordStateScope: "word",
  upcomingWordBlurEm: 0,
};

test("a word is upcoming, speaking, then spoken on its own timing", () => {
  assert.deepEqual(wordReadingState(words, 1, 0.5, false), { phase: "upcoming", sincePhaseStart: 0 });
  assert.equal(wordReadingState(words, 1, 0.9, false).phase, "speaking");
  assert.ok(Math.abs(wordReadingState(words, 1, 0.9, false).sincePhaseStart - 0.1) < 1e-9);
  assert.equal(wordReadingState(words, 1, 1.2, false).phase, "spoken");
});

test("holding through a gap keeps the word speaking until the next word starts", () => {
  assert.equal(wordReadingState(words, 0, 0.6, false).phase, "spoken");
  assert.equal(wordReadingState(words, 0, 0.6, true).phase, "speaking");
  assert.equal(wordReadingState(words, 0, 0.8, true).phase, "spoken");
  // The last word has no next word to hold for.
  assert.equal(wordReadingState(words, 2, 1.6, true).phase, "spoken");
});

test("neutral controls draw every word unchanged", () => {
  assert.equal(captionReadingStatesActive(neutral), false);
  for (const t of [0, 0.3, 0.9, 1.5, 2]) {
    for (let index = 0; index < words.length; index += 1) {
      assert.deepEqual(resolveWordReadingLook(neutral, wordReadingState(words, index, t, true)), { opacity: 1, color: null, scale: 1, liftEm: 0, blurEm: 0 });
    }
  }
});

test("hidden upcoming words fade in over the state time and colours switch at the change", () => {
  const style = { ...neutral, upcomingWords: "hidden" as const, speakingWordColor: "#ffd400", spokenWordColor: "#ffffff" };
  assert.equal(captionReadingStatesActive(style), true);
  assert.equal(resolveWordReadingLook(style, { phase: "upcoming", sincePhaseStart: 0 }).opacity, 0);
  const entering = resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: 0.06 });
  assert.equal(entering.color, "#ffd400");
  assert.ok(entering.opacity > 0 && entering.opacity < 1);
  assert.equal(resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: 0.12 }).opacity, 1);
  assert.equal(resolveWordReadingLook(style, { phase: "spoken", sincePhaseStart: 0 }).color, "#ffffff");
});

test("dimmed upcoming words use the dim opacity", () => {
  const style = { ...neutral, upcomingWords: "dimmed" as const, upcomingWordOpacity: 0.3 };
  assert.equal(resolveWordReadingLook(style, { phase: "upcoming", sincePhaseStart: 0 }).opacity, 0.3);
});

test("the speaking punch grows, overshoots only when asked, and settles once said", () => {
  const style = { ...neutral, speakingWordScale: 1.3, speakingWordLiftEm: 0.1 };
  const mid = resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: 0.06 });
  assert.ok(mid.scale > 1 && mid.scale < 1.3);
  const held = resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: 1 });
  assert.equal(held.scale, 1.3);
  assert.equal(held.liftEm, 0.1);
  const samples = [0.02, 0.04, 0.06, 0.08, 0.1].map((s) => resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: s }).scale);
  assert.ok(samples.every((scale) => scale <= 1.3 + 1e-9), "no overshoot at 0");
  const bouncy = { ...style, speakingWordOvershoot: 1 };
  const peak = Math.max(...[0.02, 0.04, 0.06, 0.08, 0.1].map((s) => resolveWordReadingLook(bouncy, { phase: "speaking", sincePhaseStart: s }).scale));
  assert.ok(peak > 1.3);
  assert.equal(resolveWordReadingLook(style, { phase: "spoken", sincePhaseStart: 0.12 }).scale, 1);
});

test("zero state time is a cut", () => {
  const style = { ...neutral, upcomingWords: "hidden" as const, speakingWordScale: 1.4, wordStateSeconds: 0 };
  assert.deepEqual(resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: 0 }), { opacity: 1, color: null, scale: 1.4, liftEm: 0, blurEm: 0 });
  assert.equal(resolveWordReadingLook(style, { phase: "spoken", sincePhaseStart: 0 }).scale, 1);
});

test("speech word entrances start when each word is said", () => {
  assert.ok(speechWordEntranceStyle("word_fade", words[1]!, 0.5, 0.25).opacity < 1e-6);
  const halfway = speechWordEntranceStyle("word_rise", words[1]!, 0.925, 0.25);
  assert.ok(halfway.opacity > 0 && halfway.opacity < 1 && halfway.translateYEm > 0);
  assert.deepEqual(speechWordEntranceStyle("word_rise", words[1]!, 1.05, 0.25), { opacity: 1, translateYEm: 0, scale: 1 });
  assert.equal(speechWordEntranceStyle("word_pop", words[1]!, 0.8, 0).opacity, 1);
});

test("the cache signature holds while states are settled and moves during transitions", () => {
  const style = { ...neutral, upcomingWords: "hidden" as const };
  const settledA = captionReadingSignature(words, 0.3, style, null);
  const settledB = captionReadingSignature(words, 0.35, style, null);
  assert.equal(settledA, settledB);
  assert.notEqual(captionReadingSignature(words, 0.82, style, null), captionReadingSignature(words, 0.86, style, null));
  assert.notEqual(captionReadingSignature(words, 0.3, null, { preset: "word_fade", seconds: 0.25 }), captionReadingSignature(words, 0.9, null, { preset: "word_fade", seconds: 0.25 }));
});

test("line scope lights a whole line together and keeps the next line upcoming", () => {
  const timings = [
    { text: "one", start: 0, end: 0.3 }, { text: "two", start: 0.3, end: 0.6, rowBreakAfter: true },
    { text: "three", start: 0.8, end: 1.1 }, { text: "four", start: 1.1, end: 1.4 },
  ];
  assert.deepEqual(captionLineOf(timings, 0), [0, 1]);
  assert.deepEqual(captionLineOf(timings, 3), [2, 3]);
  const line = { wordStateScope: "line" as const, speakingWordHoldsGap: false };
  assert.equal(captionWordReadingState(timings, 1, 0.1, line).phase, "speaking");
  assert.equal(captionWordReadingState(timings, 2, 0.1, line).phase, "upcoming");
  assert.equal(captionWordReadingState(timings, 0, 0.9, line).phase, "spoken");
  assert.equal(captionWordReadingState(timings, 3, 0.9, line).phase, "speaking");
  assert.equal(captionWordReadingState(timings, 1, 0.1, { ...line, wordStateScope: "word" }).phase, "upcoming");
});

test("upcoming words blur and sharpen as they are said", () => {
  const style = { ...resolveCaptionProps({ text: "a b" }), upcomingWordBlurEm: 0.2, wordStateSeconds: 0.2 };
  assert.equal(captionReadingStatesActive(style), true);
  assert.equal(resolveWordReadingLook(style, { phase: "upcoming", sincePhaseStart: 0 }).blurEm, 0.2);
  const mid = resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: 0.1 }).blurEm;
  assert.ok(mid > 0 && mid < 0.2);
  assert.equal(resolveWordReadingLook(style, { phase: "speaking", sincePhaseStart: 0.3 }).blurEm, 0);
});

test("word flip turns each word down onto the line and word wipe uncovers it left to right", () => {
  const word = { text: "hello", start: 1, end: 1.4 };
  const flipStart = speechWordEntranceStyle("word_flip", word, 1.02, 0.3);
  const flipDone = speechWordEntranceStyle("word_flip", word, 1.4, 0.3);
  assert.ok((flipStart.rotateXDeg ?? 0) < -60);
  assert.equal(flipDone.rotateXDeg, -0);
  const wipeMid = speechWordEntranceStyle("word_wipe", word, 1.1, 0.3);
  assert.ok((wipeMid.clipRight ?? 0) > 0 && (wipeMid.clipRight ?? 0) < 1);
  assert.equal(speechWordEntranceStyle("word_wipe", word, 0.9, 0.3).opacity, 0);
  assert.equal(speechWordEntranceStyle("word_wipe", word, 1.4, 0.3).clipRight, 0);
});

test("line scope follows the caption's words per line", () => {
  const timings = [{ text: "a", start: 0, end: 0.2 }, { text: "b", start: 0.2, end: 0.4 }, { text: "c", start: 0.4, end: 0.6 }, { text: "d", start: 0.6, end: 0.8 }];
  assert.deepEqual(captionLineOf(timings, 3, 2), [2, 3]);
  assert.equal(captionWordReadingState(timings, 0, 0.5, { wordStateScope: "line", speakingWordHoldsGap: false, wordsPerLine: 2 }).phase, "spoken");
  assert.equal(captionWordReadingState(timings, 3, 0.5, { wordStateScope: "line", speakingWordHoldsGap: false, wordsPerLine: 2 }).phase, "speaking");
});

test("the reading signature tells a word being said from one already said", () => {
  const timings = [{ text: "a", start: 0, end: 0.3 }, { text: "b", start: 0.6, end: 0.9 }];
  const style = { ...resolveCaptionProps({ speakingWordColor: "#ffd400" }), speakingWordHoldsGap: false } as unknown as CaptionReadingStyle;
  assert.notEqual(captionReadingSignature(timings, 0.2, style, null), captionReadingSignature(timings, 0.45, style, null));
});
