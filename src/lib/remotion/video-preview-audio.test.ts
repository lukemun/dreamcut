import assert from "node:assert/strict";
import test from "node:test";

import { resolvePreviewAudioSource } from "./video-preview-audio";

test("preview uses a dedicated audio derivative for audible video", () => {
  assert.equal(resolvePreviewAudioSource({ volume: 1, props: { preview_audio_source_url: "/voice.m4a" } }, false), "/voice.m4a");
});

test("runtime cache repair overrides a legacy muxed preview-audio binding", () => {
  assert.equal(resolvePreviewAudioSource({
    volume: 1,
    props: {
      preview_audio_source_url: "/camera-sized-treatment.mp4",
      runtime_preview_audio_source_url: "/repaired-clock.m4a",
    },
  }, false), "/repaired-clock.m4a");
});

test("rendering preserves embedded source audio authority", () => {
  assert.equal(resolvePreviewAudioSource({ volume: 1, props: { preview_audio_source_url: "/voice.m4a" } }, true), null);
});

test("silent visual layers never mount preview audio", () => {
  assert.equal(resolvePreviewAudioSource({ volume: 0, props: { preview_audio_source_url: "/voice.m4a" } }, false), null);
});
