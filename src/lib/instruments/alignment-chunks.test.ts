import assert from "node:assert/strict";
import test from "node:test";
import {
  alignSequences, asrWords, assignWordsToChunks, chunkText, dropMarkerIntervals, findSilences, frameLevels, mergeWithNeighbour,
  pcm16Wav, planCuts, readPcm16Wav, reconcileDuplicateWords, scriptTokens, sliceText, stitchAlignments, trimToSpeech, unscriptedMarkerPositions,
  UNSCRIPTED_MARKER, verbalizeNumber,
} from "@/lib/instruments/alignment-chunks";

const words = (text: string) => scriptTokens(text).map((t) => t.text);

test("silences are runs of quiet frames at least the minimum length", () => {
  const rate = 1000, samples = new Int16Array(3000);
  for (let i = 0; i < 3000; i++) samples[i] = (i < 1000 || i >= 1300) && (i < 2000 || i >= 2100) ? (i % 2 ? 8000 : -8000) : 0;
  const levels = frameLevels(samples, rate, 0.01);
  assert.deepEqual(findSilences(levels, 0.01, { minSeconds: 0.2, thresholdDb: -40 }), [{ start: 1, end: 1.3 }]);
  assert.equal(findSilences(levels, 0.01, { minSeconds: 0.05, thresholdDb: -40 }).length, 2);
});

test("cuts land at the longest pause in range, chunks stay within bounds, and a short tail joins the previous chunk", () => {
  const silences = [
    { start: 11, end: 11.3 }, { start: 19.6, end: 20.4 }, { start: 30, end: 30.2 },
    { start: 44, end: 44.5 }, { start: 58, end: 58.3 }, { start: 66, end: 66.25 },
  ];
  const cuts = planCuts(silences, 70, { minSeconds: 10, targetSeconds: 25, maxSeconds: 40 });
  assert.deepEqual(cuts, [20, 44.25]);
  const edges = [0, ...cuts, 70];
  for (let i = 1; i < edges.length; i++) assert.ok(edges[i] - edges[i - 1] >= 10);
  assert.deepEqual(planCuts(silences, 30), [], "a recording within the maximum is one chunk");
  assert.deepEqual(planCuts([{ start: 52, end: 52.5 }], 80), [52.25], "no pause in range takes the next one");
});

test("ASR numbers are verbalized for matching only", () => {
  assert.equal(verbalizeNumber("3.5%"), "three point five percent");
  assert.equal(verbalizeNumber("84"), "eighty four");
  assert.equal(verbalizeNumber("1,250"), "one thousand two hundred fifty");
  assert.deepEqual(asrWords(" The Dow was up 0.64% [BLANK_AUDIO]"), ["the", "dow", "was", "up", "zero", "point", "six", "four", "percent"]);
});

test("sequence alignment matches identical words in order", () => {
  assert.deepEqual(alignSequences(["a", "b", "c", "d"], ["a", "x", "c", "d", "e"]), [0, -1, 2, 3]);
});

test("reviewed words are assigned to the chunk they were heard in; unpinnable cuts merge", () => {
  const script = words("One two three four. Five six seven eight. Nine ten eleven twelve.");
  const spans = [{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 20, end: 30 }];
  const clean = assignWordsToChunks(script, spans, [["one", "two", "three", "four"], ["five", "six", "seven", "eight"], ["nine", "ten", "eleven", "twelve"]]);
  assert.deepEqual(clean.groups.map((g) => [g.audio_start, g.audio_end, g.word_start, g.word_end]), [[0, 10, 0, 4], [10, 20, 4, 8], [20, 30, 8, 12]]);
  assert.deepEqual(clean.dropped_cuts, []);

  // "four five" unheard at the first cut: nothing tells which side they were spoken on.
  const ambiguous = assignWordsToChunks(script, spans, [["one", "two", "three"], ["six", "seven", "eight"], ["nine", "ten", "eleven", "twelve"]]);
  assert.deepEqual(ambiguous.dropped_cuts, [10]);
  assert.deepEqual(ambiguous.groups.map((g) => [g.audio_start, g.audio_end, g.word_start, g.word_end]), [[0, 20, 0, 8], [20, 30, 8, 12]]);

  // Unmatched words between the anchors go to the side whose ASR heard something unmatched.
  const placed = assignWordsToChunks(script, spans, [["one", "two", "three"], ["for", "fife", "six", "seven", "eight"], ["nine", "ten", "eleven", "twelve"]]);
  assert.deepEqual(placed.groups.map((g) => g.word_end), [3, 8, 12]);
  const placedLeft = assignWordsToChunks(script, spans, [["one", "two", "three", "for", "fife"], ["six", "seven", "eight"], ["nine", "ten", "eleven", "twelve"]]);
  assert.deepEqual(placedLeft.groups.map((g) => g.word_end), [5, 8, 12]);

  // Every word lands in exactly one group, in order (the count invariant).
  for (const result of [clean, ambiguous, placed, placedLeft]) {
    assert.equal(result.groups[0].word_start, 0);
    assert.equal(result.groups.at(-1)!.word_end, script.length);
    for (let i = 1; i < result.groups.length; i++) {
      assert.equal(result.groups[i].word_start, result.groups[i - 1].word_end);
      assert.equal(result.groups[i].audio_start, result.groups[i - 1].audio_end);
    }
  }
});

test("chunk text keeps the reviewed spelling and punctuation and places unscripted markers", () => {
  const text = "All right,\n\nso let's take a look.";
  const tokens = scriptTokens(text);
  assert.equal(sliceText(text, tokens, 1, 4), "right, so let's");
  assert.equal(chunkText(text, tokens, 0, 4, [2]), `All right, ${UNSCRIPTED_MARKER} so let's`);
  assert.equal(chunkText(text, tokens, 0, 2, [0]), `${UNSCRIPTED_MARKER} All right,`);
});

test("speech missing from the reviewed text is marked where ASR inserts words", () => {
  const reviewed = words("trade, they're going to start taking risk off");
  const heard = asrWords("trade they're start they're gonna start taking risk off");
  const markers = unscriptedMarkerPositions(reviewed, heard);
  assert.equal(markers.length, 1);
  assert.ok(markers[0] > 1 && markers[0] < 5);
  assert.deepEqual(unscriptedMarkerPositions(reviewed, asrWords("trade they're going to start taking risk off")), []);
  assert.deepEqual(unscriptedMarkerPositions(reviewed, asrWords("thank trade they're going to start taking risk off")), [], "one stray edge word is ignored");
  assert.deepEqual(dropMarkerIntervals([{ word: "so", start: 0, end: 1 }, { word: "[bracketed]", start: 1, end: 2 }, { word: "<unk>", start: 2, end: 3 }]).map((w) => w.word), ["so"]);
});

test("stitching shifts chunk times by the chunk offset and enforces the count", () => {
  const tokens = words("Hello there. General Kenobi.");
  const groups = [{ audio_start: 0, audio_end: 5, word_start: 0, word_end: 2 }, { audio_start: 5, audio_end: 9.5, word_start: 2, word_end: 4 }];
  const stitched = stitchAlignments(groups, [
    [{ word: "hello", start: 0.5, end: 0.9 }, { word: "there", start: 0.9, end: 1.4 }],
    [{ word: "general", start: 0.2, end: 0.7 }, { word: "kenobi", start: 0.7, end: 1.3 }],
  ], tokens);
  assert.deepEqual(stitched, [
    { word: "Hello", start: 0.5, end: 0.9 }, { word: "there.", start: 0.9, end: 1.4 },
    { word: "General", start: 5.2, end: 5.7 }, { word: "Kenobi.", start: 5.7, end: 6.3 },
  ]);
  assert.throws(() => stitchAlignments(groups, [[{ word: "hello", start: 0.5, end: 0.9 }], [{ word: "general", start: 0.2, end: 0.7 }, { word: "kenobi", start: 0.7, end: 1.3 }]], tokens), /Chunk 0 returned 1 words for 2/);
});

test("a failed chunk merges with its shorter neighbour", () => {
  const groups = [
    { audio_start: 0, audio_end: 30, word_start: 0, word_end: 50 },
    { audio_start: 30, audio_end: 40, word_start: 50, word_end: 70 },
    { audio_start: 40, audio_end: 45, word_start: 70, word_end: 80 },
  ];
  assert.deepEqual(mergeWithNeighbour(groups, 1), [groups[0], { audio_start: 30, audio_end: 45, word_start: 50, word_end: 80 }]);
  assert.deepEqual(mergeWithNeighbour(groups, 0), [{ audio_start: 0, audio_end: 40, word_start: 0, word_end: 70 }, groups[2]]);
});

test("a word MFA reports twice (stretched over a long pause) keeps its shorter interval", () => {
  const tokens = words("all right, so let's");
  const mfa = [
    { word: "all", start: 19.96, end: 20.2 }, { word: "right", start: 20.2, end: 20.61 },
    { word: "so", start: 20.61, end: 33.63 }, { word: "so", start: 33.63, end: 33.78 }, { word: "let's", start: 33.78, end: 33.89 },
  ];
  const { words: fixed, merged } = reconcileDuplicateWords(mfa, tokens);
  assert.equal(merged, 1);
  assert.deepEqual(fixed.map((w) => [w.word, w.start]), [["all", 19.96], ["right", 20.2], ["so", 33.63], ["let's", 33.78]]);
  const unrelated = [...mfa.slice(0, 2), { word: "uh", start: 20.61, end: 20.8 }, ...mfa.slice(3)];
  assert.equal(reconcileDuplicateWords(unrelated, tokens).merged, 0, "only adjacent duplicates are reconciled");
});

test("WAV chunks round-trip sample-exact", () => {
  const samples = Int16Array.from({ length: 1600 }, (_, i) => (i * 37) % 2000 - 1000);
  const parsed = readPcm16Wav(pcm16Wav(samples, 16000));
  assert.equal(parsed.sampleRate, 16000);
  assert.deepEqual([...parsed.samples], [...samples]);
});

test("a group trims to the heard speech, padded out to the middle of a pause", () => {
  const group = { audio_start: 0, audio_end: 47.87, word_start: 0, word_end: 18 };
  // A small noise at 27.9 s, then the line at 39.05-43.42 s (as in a 48 s take with one line).
  const silences = [{ start: 0.5, end: 27.9 }, { start: 28.1, end: 39.0 }, { start: 43.45, end: 47.87 }];
  const trimmed = trimToSpeech(group, [{ start: 39.2, end: 43.3 }], silences);
  assert.equal(trimmed.audio_start, 37.7, "the padded start lies in a pause, so it stays");
  assert.equal(trimmed.audio_end, 44.8);
  assert.ok(trimmed.audio_start > 28.1, "the noise before the line is left out");
  assert.deepEqual({ ...trimmed, audio_start: 0, audio_end: 0 }, { ...group, audio_start: 0, audio_end: 0 }, "words are unchanged");
  const nearPause = trimToSpeech(group, [{ start: 29.5, end: 43.3 }], [{ start: 27.2, end: 27.9 }, ...silences.slice(1)]);
  assert.equal(nearPause.audio_start, 27.55, "a padded edge in sound moves out to a nearby pause's middle");
  const noPause = trimToSpeech(group, [{ start: 39.2, end: 43.3 }], [{ start: 0.5, end: 20 }]);
  assert.equal(noPause.audio_start, 37.7, "with no pause within reach (steady wind noise), the padding alone stands");
  assert.deepEqual(trimToSpeech(group, [], silences), group, "no heard speech leaves the group whole");
  assert.deepEqual(trimToSpeech(group, [{ start: 0.2, end: 47.8 }], []), group, "it never grows a group");
});
