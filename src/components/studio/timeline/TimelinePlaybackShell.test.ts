import assert from "node:assert/strict";
import test from "node:test";

import {
  TIMELINE_PLAYER_SHARED_AUDIO_TAGS,
  clampPlayerFrame,
  createPreviewPlayerRuntimeKey,
  restoreAttachedPlayerFrame,
  shouldReleaseStuckPreviewPointer,
} from "./playback-shell-helpers";

test("timeline Player reserves a stable pool for layered video and audio auditions", () => {
  assert.equal(TIMELINE_PLAYER_SHARED_AUDIO_TAGS, 16);
});

test("development module replacement gets a fresh Player audio pool", () => {
  assert.equal(
    createPreviewPlayerRuntimeKey(true, "runtime-a"),
    "timeline-player-dev-runtime-a",
  );
  assert.equal(
    createPreviewPlayerRuntimeKey(false, "ignored"),
    "timeline-player",
  );
});

test("replacement players restore a bounded playhead frame", () => {
  assert.equal(clampPlayerFrame(3_465.4, 5_000), 3_465);
  assert.equal(clampPlayerFrame(-12, 5_000), 0);
  assert.equal(clampPlayerFrame(5_500, 5_000), 4_999);
  assert.equal(clampPlayerFrame(Number.NaN, 5_000), 0);
});

test("preview pointer release guard only ends the active primary-button drag", () => {
  assert.equal(shouldReleaseStuckPreviewPointer(7, 7, 0), true);
  assert.equal(shouldReleaseStuckPreviewPointer(7, 7, 2), true);
  assert.equal(shouldReleaseStuckPreviewPointer(7, 7, 1), false);
  assert.equal(shouldReleaseStuckPreviewPointer(7, 8, 0), false);
  assert.equal(shouldReleaseStuckPreviewPointer(null, 7, 0), false);
});

test("gated restore preserves the frame but only QUEUES the resume", () => {
  const calls: string[] = [];
  const playing = restoreAttachedPlayerFrame(
    { seekTo: (frame) => calls.push(`seek:${frame}`) },
    729,
    true,
  );
  assert.deepEqual(calls, ["seek:729"]); // no synchronous play — ever
  assert.equal(playing.queuedResume, true);
  const paused = restoreAttachedPlayerFrame(
    { seekTo: (frame) => calls.push(`seek:${frame}`) },
    18,
    false,
  );
  assert.equal(paused.queuedResume, false);
});
