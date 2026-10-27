import assert from "node:assert/strict";
import test from "node:test";

import { groupAlignedWordsByNaturalBoundaries } from "./caption-grouping";

function words(text: string[], gaps: number[] = []) {
  let cursor = 0;
  return text.map((word, index) => {
    const start = cursor;
    const end = start + 0.25;
    cursor = end + (gaps[index] ?? 0.05);
    return { word, start, end };
  });
}

test("fixed-size grouping respects a width budget and keeps sentence fragments", () => {
  const input = words(["A", "wideword", "needs", "space.", "Yes."], [0, 0, 0, .5]);
  const groups = groupAlignedWordsByNaturalBoundaries(input, {
    measureWidth: text => text.length * 10, targetWidth: 120, maxWidth: 150,
  });
  assert.ok(groups.every(group => group.text.length * 10 <= 150));
  assert.equal(groups.map(group => group.text).join(" "), "A wideword needs space. Yes.");
  assert.equal(groups.at(-1)?.text, "Yes.");
  assert.throws(() => groupAlignedWordsByNaturalBoundaries(words(["impossiblywide"]), {
    measureWidth: text => text.length * 10, maxWidth: 10, targetWidth: 10,
  }), /Unable to group/);
});

test("uses four words instead of orphaning the fourth word", () => {
  const result = groupAlignedWordsByNaturalBoundaries(words(["have", "all", "publicly", "stated"]));
  assert.deepEqual(result.map((group) => group.text), ["have all publicly stated"]);
});

test("uses an audible pause as the preferred three-to-four-word boundary", () => {
  const aligned = words(
    ["one", "two", "three", "four", "five", "six", "seven"],
    [0.04, 0.04, 0.22, 0.04, 0.04, 0.04],
  );
  assert.deepEqual(
    groupAlignedWordsByNaturalBoundaries(aligned).map((group) => group.text),
    ["one two three", "four five six seven"],
  );
});

test("preserves a genuinely short sentence as its own caption", () => {
  const aligned = words(["Imagine.", "Two", "criminals", "commit", "a", "crime"], [0.4]);
  assert.deepEqual(
    groupAlignedWordsByNaturalBoundaries(aligned).map((group) => group.text),
    ["Imagine.", "Two criminals commit", "a crime"],
  );
});

test("a comma prefers a cut but does not override tightly spoken timing", () => {
  const aligned = words(["If", "one", "rats,", "the", "other", "stays", "loyal"], [0.03, 0.03, 0.03]);
  const groups = groupAlignedWordsByNaturalBoundaries(aligned);
  assert.ok(groups.every((group) => group.words.length <= 4));
  assert.equal(groups.map((group) => group.text).join(" "), "If one rats, the other stays loyal");
});

test("a strong acoustic pause forces a boundary even after two words", () => {
  const aligned = words(["No", "changes", "And", "even", "if", "they", "try"], [0.04, 0.5]);
  assert.deepEqual(
    groupAlignedWordsByNaturalBoundaries(aligned).map((group) => group.text),
    ["No changes", "And even if", "they try"],
  );
});
