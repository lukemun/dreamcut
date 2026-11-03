import assert from "node:assert/strict";
import test from "node:test";

import { captionDisplayText } from "@/lib/agent/timeline-editor-agent-apply";

test("spoken numbers and names read as written, every other word stays as spoken", () => {
  assert.equal(captionDisplayText("I made eighty k trading", [{ spoken: "eighty k", display: "$80K" }]), "I made $80K trading");
  assert.equal(captionDisplayText("outranking chat g p t.", [{ spoken: "chat g p t", display: "ChatGPT" }]), "outranking ChatGPT.");
  assert.equal(captionDisplayText("ten out of ten", [{ spoken: "ten out of ten", display: "10/10" }]), "10/10");
});

test("a substitution must match whole spoken words", () => {
  assert.throws(() => captionDisplayText("often ten", [{ spoken: "of", display: "x" }]), /does not match/);
  assert.throws(() => captionDisplayText("eighty k", [{ spoken: "ninety k", display: "$90K" }]), /does not match/);
});

test("one-word reveals time a substituted phrase as one written word", async () => {
  const { captionDisplayWords } = await import("@/lib/agent/timeline-editor-agent-apply");
  const words = [{ word: "an", start: 0, end: 0.1 }, { word: "eighty", start: 0.1, end: 0.4 }, { word: "k", start: 0.4, end: 0.6 }, { word: "profit.", start: 0.6, end: 1 }];
  assert.deepEqual(captionDisplayWords(words, [{ spoken: "eighty k", display: "$80K" }]),
    [{ word: "an", start: 0, end: 0.1 }, { word: "$80K", start: 0.1, end: 0.6 }, { word: "profit.", start: 0.6, end: 1 }]);
  assert.equal(captionDisplayWords([{ word: "six", start: 0, end: 0.3 }, { word: "fifty.", start: 0.3, end: 0.7 }], [{ spoken: "six fifty", display: "$650" }])[0]!.word, "$650.");
});

test("captions can draw without punctuation, keeping marks that belong inside words and numbers", async () => {
  const { withoutPunctuation, captionDrawnProps, resolveCaptionProps } = await import("@/lib/timeline/captions");
  assert.equal(withoutPunctuation("In September, Meta's 10-K showed $1.5B — up 10%."), "In September Meta's 10-K showed $1.5B up 10%");
  assert.equal(withoutPunctuation("“The worst performer in the bunch.”"), "The worst performer in the bunch");
  assert.equal(withoutPunctuation("80,000 at 9:30, 10/10"), "80,000 at 9:30 10/10");
  const props = resolveCaptionProps({ text: "setup, and exit.", hidePunctuation: true, timingMode: "single_word",
    wordTimings: [{ text: "setup,", start: 0, end: 0.3 }, { text: "—", start: 0.3, end: 0.4 }, { text: "exit.", start: 0.4, end: 0.8 }] });
  const drawn = captionDrawnProps(props);
  assert.equal(drawn.text, "setup and exit");
  assert.deepEqual(drawn.wordTimings.map((timing) => timing.text), ["setup", "exit"]);
  assert.equal(captionDrawnProps(resolveCaptionProps({ text: "a, b" })).text, "a, b", "off by default");
});

test("type on shows whole characters as it goes, none at the start and all at the end", async () => {
  const { typedCharacterCount, presetsForElementType } = await import("@/lib/timeline/animation-presets");
  assert.equal(typedCharacterCount("“The worst”", 0), 0);
  assert.equal(typedCharacterCount("“The worst”", 0.5), 5);
  assert.equal(typedCharacterCount("“The worst”", 1), 11);
  assert.ok(presetsForElementType("caption_text").includes("type_on"));
  assert.ok(!presetsForElementType("still").includes("type_on"), "pictures cannot type");
});
