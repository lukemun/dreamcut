import assert from "node:assert/strict";
import test from "node:test";
import { dictionaryWords, findOovTokens, mfaTokens, parseG2pOutput } from "@/lib/instruments/oov";

test("MFA token normalization is case-insensitive and preserves contractions", () => {
  assert.deepEqual(mfaTokens("Feyre, FEYRE can't"), ["feyre", "can't"]);
});

test("OOV discovery queries actual dictionary tokens", () => {
  const dictionary = dictionaryWords("authors\tAO TH ER Z\nbook B UH K\n");
  assert.deepEqual(findOovTokens("Authors Feyre book", dictionary), ["feyre"]);
});

test("G2P output preserves the first generated pronunciation per token", () => {
  const parsed = parseG2pOutput("feyre F EH1 R\nfeyre F EY1 R\n");
  assert.equal(parsed.get("feyre"), "F EH1 R");
});
