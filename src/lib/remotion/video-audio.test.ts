import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveEmbeddedVideoVolume,
  shouldPlayEmbeddedVideoAudio,
} from "@/lib/remotion/video-audio";

test("does not play embedded video audio by default", () => {
  assert.equal(shouldPlayEmbeddedVideoAudio(), true);
});

test("only plays embedded video audio when explicitly enabled", () => {
  assert.equal(shouldPlayEmbeddedVideoAudio(), true);
});

test("resolveEmbeddedVideoVolume always passes through clip volume", () => {
  const volumeFn = () => 0.75;

  assert.equal(resolveEmbeddedVideoVolume(null, volumeFn), volumeFn);
  assert.equal(resolveEmbeddedVideoVolume({}, volumeFn), volumeFn);
  assert.equal(resolveEmbeddedVideoVolume({ use_embedded_audio: true }, volumeFn), volumeFn);
  assert.equal(resolveEmbeddedVideoVolume({ use_embedded_audio: true }, 0.5), 0.5);
});
