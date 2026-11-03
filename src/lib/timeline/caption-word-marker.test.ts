import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CAPTION_WORD_MARKER, resolveCaptionWordMarker, wordMarkerCSS, wordMarkerFrame, wordMarkerGapFrame, wordMarkerSignature } from "./caption-word-marker";
import { resolveCaptionProps } from "./captions";

const words = [{ text: "one", start: 0, end: 0.4 }, { text: "two", start: 0.5, end: 1 }, { text: "three", start: 1, end: 1.6 }];
const style = (patch: Partial<typeof DEFAULT_CAPTION_WORD_MARKER>) => ({ ...DEFAULT_CAPTION_WORD_MARKER, ...patch });

test("no marker by default, and stored captions resolve without one", () => {
  assert.equal(resolveCaptionProps({ text: "Hi" }).wordMarker, "none");
  assert.equal(wordMarkerFrame(DEFAULT_CAPTION_WORD_MARKER, words, 0, 0.2, true), null);
  assert.equal(wordMarkerSignature(DEFAULT_CAPTION_WORD_MARKER, words, 0.2, true), "");
});

test("bounds and unknown values fall back", () => {
  const resolved = resolveCaptionWordMarker({ wordMarker: "glow", wordMarkerOpacity: 3, wordMarkerColor: "red", wordMarkerMotion: "spin", wordMarkerThicknessEm: 0 });
  assert.equal(resolved.wordMarker, "none");
  assert.equal(resolved.wordMarkerOpacity, 1);
  assert.equal(resolved.wordMarkerColor, DEFAULT_CAPTION_WORD_MARKER.wordMarkerColor);
  assert.equal(resolved.wordMarkerMotion, "snap");
  assert.equal(resolved.wordMarkerThicknessEm, 0.02);
});

test("a box sits behind the word being said and holds through the pause before the next", () => {
  const box = style({ wordMarker: "box" });
  assert.deepEqual(wordMarkerFrame(box, words, 0, 0.2, true), { width: 1, scale: 1, opacity: 1, origin: "center" });
  assert.notEqual(wordMarkerFrame(box, words, 0, 0.45, true), null);
  assert.equal(wordMarkerFrame(box, words, 0, 0.45, false), null);
  assert.equal(wordMarkerFrame(box, words, 1, 0.2, true), null);
});

test("pop grows from below full size; slide hands the marker over as a wipe", () => {
  const pop = style({ wordMarker: "box", wordMarkerMotion: "pop", wordMarkerSeconds: 0.2 });
  assert.ok(wordMarkerFrame(pop, words, 1, 0.5, true)!.scale < 0.7);
  assert.ok(wordMarkerFrame(pop, words, 1, 0.65, true)!.scale > 1);
  assert.equal(wordMarkerFrame(pop, words, 1, 0.8, true)!.scale, 1);
  const slide = style({ wordMarker: "underline", wordMarkerMotion: "slide", wordMarkerSeconds: 0.2 });
  const incoming = wordMarkerFrame(slide, words, 2, 1.1, true)!;
  const outgoing = wordMarkerFrame(slide, words, 1, 1.1, true)!;
  assert.equal(incoming.origin, "left");
  assert.equal(outgoing.origin, "right");
  assert.ok(Math.abs(incoming.width + outgoing.width - 1) < 1e-9);
  assert.equal(wordMarkerFrame(slide, words, 1, 1.3, true), null);
});

test("a bar fills each word as it is said and runs through the spaces behind it", () => {
  const bar = style({ wordMarker: "bar" });
  assert.equal(wordMarkerFrame(bar, words, 1, 0.75, true)!.width, 0.5);
  assert.equal(wordMarkerFrame(bar, words, 0, 0.75, true)!.width, 1);
  assert.equal(wordMarkerFrame(bar, words, 2, 0.75, true), null);
  assert.notEqual(wordMarkerGapFrame(bar, words, 1, 0.75, true), null);
  assert.equal(wordMarkerGapFrame(bar, words, 2, 0.75, true), null);
  const css = wordMarkerCSS(bar, wordMarkerFrame(bar, words, 1, 0.75, true)!);
  assert.equal(css.transform, "scale(0.5, 1)");
  assert.equal(css.transformOrigin, "left center");
  assert.equal(css.height, "0.12em");
});

test("the GPU fingerprint holds while the marker is still and changes while it moves", () => {
  const pop = style({ wordMarker: "box", wordMarkerMotion: "pop", wordMarkerSeconds: 0.2 });
  assert.equal(wordMarkerSignature(pop, words, 0.85, true), wordMarkerSignature(pop, words, 0.9, true));
  assert.notEqual(wordMarkerSignature(pop, words, 0.55, true), wordMarkerSignature(pop, words, 0.6, true));
});
