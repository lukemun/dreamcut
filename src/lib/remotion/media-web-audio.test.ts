import assert from "node:assert/strict";
import test from "node:test";

import {
  isWebAudioApiEligibleSource,
  shouldUseWebAudioForMedia,
} from "./media-web-audio";

test("project-local media is eligible for Web Audio", () => {
  assert.equal(
    isWebAudioApiEligibleSource("/api/projects/music-audition/media/bed.mp3"),
    true,
  );
});

test("shared media proxy remains eligible for Web Audio", () => {
  assert.equal(isWebAudioApiEligibleSource("/api/media/audio/file.mp3"), true);
});

test("unproxied remote media does not opt into Web Audio", () => {
  assert.equal(isWebAudioApiEligibleSource("https://cdn.example.com/file.mp3"), false);
  assert.equal(isWebAudioApiEligibleSource(null), false);
});

test("unity-gain local media stays on the native media clock", () => {
  assert.equal(
    shouldUseWebAudioForMedia({
      src: "/api/projects/demo/media/anchor.mp4",
      needsAmplification: false,
    }),
    false,
  );
});

test("local media uses Web Audio only when it needs amplification", () => {
  assert.equal(
    shouldUseWebAudioForMedia({
      src: "/api/projects/demo/media/anchor.mp4",
      needsAmplification: true,
    }),
    true,
  );
  assert.equal(
    shouldUseWebAudioForMedia({
      src: "https://cdn.example.com/anchor.mp4",
      needsAmplification: true,
    }),
    false,
  );
});
