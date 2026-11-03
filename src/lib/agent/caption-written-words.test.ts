import assert from "node:assert/strict";
import test from "node:test";

import { spokenWordCount, writtenCaptionUnits } from "@/lib/agent/caption-written-words";

const timed = (text: string) => text.split(" ").map((word, index) => ({ word, start: index, end: index + 0.9 }));

test("written numbers and names take the spoken words they were said as", () => {
  const spoken = timed("The spy was down zero point two two. nas dock fell half a percent.");
  const units = writtenCaptionUnits(spoken, "The SPY was down 0.22. Nasdaq fell half a percent.");
  assert.deepEqual(units.map((unit) => unit.word), ["The", "SPY", "was", "down", "0.22.", "Nasdaq", "fell", "half", "a", "percent."]);
  const number = units[4]!;
  assert.deepEqual(number.spoken.map((word) => word.word), ["zero", "point", "two", "two."]);
  assert.equal(number.start, 4);
  assert.equal(number.end, 7.9);
  assert.deepEqual(units[5]!.spoken.map((word) => word.word), ["nas", "dock"]);
});

test("spoken words the script leaves out stay as spoken; written words never said are dropped", () => {
  const units = writtenCaptionUnits(timed("so um it worked"), "So it worked well");
  assert.deepEqual(units.map((unit) => unit.word), ["So", "um", "it", "worked"]);
});

test("paragraphs are matched on their own when they line up with the reviewed text", () => {
  const reviewed = "up four point nine nine percent\n\ngold rose";
  const units = writtenCaptionUnits(timed("up four point nine nine percent gold rose"), "up 4.99%\n\nGold rose", reviewed);
  assert.deepEqual(units.map((unit) => unit.word), ["up", "4.99%", "Gold", "rose"]);
  assert.equal(units[1]!.spoken.length, 5);
});

test("a written token's likely spoken length", () => {
  assert.equal(spokenWordCount("0.22"), 4);
  assert.equal(spokenWordCount("4.99%"), 5);
  assert.equal(spokenWordCount("S&P"), 3);
  assert.equal(spokenWordCount("10-K"), 2);
  assert.equal(spokenWordCount("2026"), 4);
  assert.equal(spokenWordCount("Nasdaq"), 1);
});
