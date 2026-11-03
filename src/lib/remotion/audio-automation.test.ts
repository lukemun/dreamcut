import assert from "node:assert/strict";
import test from "node:test";

import { resolveAudioAutomationSampleFrame } from "@/lib/remotion/audio-automation";

test("keeps coarse sampling in the steady clip body", () => {
  assert.equal(resolveAudioAutomationSampleFrame({
    frame: 47,
    durationInFrames: 167,
    framesPerSample: 5,
    transitionOutFrames: 12,
  }), 45);
});

test("preserves exact frames across a narration-owned transition fade", () => {
  assert.equal(resolveAudioAutomationSampleFrame({
    frame: 158,
    durationInFrames: 167,
    framesPerSample: 5,
    transitionOutFrames: 12,
  }), 158);
  assert.equal(resolveAudioAutomationSampleFrame({
    frame: 159,
    durationInFrames: 167,
    framesPerSample: 5,
    transitionOutFrames: 12,
  }), 159);
  assert.equal(resolveAudioAutomationSampleFrame({
    frame: 160,
    durationInFrames: 167,
    framesPerSample: 5,
    transitionOutFrames: 12,
  }), 160);
});
