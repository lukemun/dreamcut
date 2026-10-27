import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAllPreviewAudioGains,
  clearPreviewAudioGain,
  readPreviewAudioGain,
  setPreviewAudioGain,
  subscribePreviewAudioGain,
} from "./preview-audio-gain-store";

test("preview gain changes notify only the selected audio element", () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const unsubscribeFirst = subscribePreviewAudioGain("audio-a", () => { firstCalls += 1; });
  const unsubscribeSecond = subscribePreviewAudioGain("audio-b", () => { secondCalls += 1; });

  setPreviewAudioGain("audio-a", 0.42);
  assert.equal(readPreviewAudioGain("audio-a"), 0.42);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0);

  clearPreviewAudioGain("audio-a");
  assert.equal(readPreviewAudioGain("audio-a"), null);
  assert.equal(firstCalls, 2);
  assert.equal(secondCalls, 0);

  unsubscribeFirst();
  unsubscribeSecond();
});

test("preview gain clamps to the supported editor range", () => {
  setPreviewAudioGain("audio-clamped", 8);
  assert.equal(readPreviewAudioGain("audio-clamped"), 4);
  setPreviewAudioGain("audio-clamped", -2);
  assert.equal(readPreviewAudioGain("audio-clamped"), 0);
  clearPreviewAudioGain("audio-clamped");
});

test("all transient gains can be abandoned without changing persisted audio", () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const unsubscribeFirst = subscribePreviewAudioGain("audio-first", () => { firstCalls += 1; });
  const unsubscribeSecond = subscribePreviewAudioGain("audio-second", () => { secondCalls += 1; });

  setPreviewAudioGain("audio-first", 0);
  setPreviewAudioGain("audio-second", 1.25);
  clearAllPreviewAudioGains();

  assert.equal(readPreviewAudioGain("audio-first"), null);
  assert.equal(readPreviewAudioGain("audio-second"), null);
  assert.equal(firstCalls, 2);
  assert.equal(secondCalls, 2);

  unsubscribeFirst();
  unsubscribeSecond();
});
