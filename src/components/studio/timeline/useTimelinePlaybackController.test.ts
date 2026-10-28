import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYHEAD_UI_SYNC_INTERVAL_MS,
  seekPlayerAndPause,
  shouldClearStalePlayerBuffering,
  playheadSecForPlayerFrame,
  shouldSyncPlayheadUi,
} from "./useTimelinePlaybackController";

test("ordinary frame telemetry is coalesced inside the UI interval", () => {
    assert.equal(shouldSyncPlayheadUi({ lastSyncMs: 100, nowMs: 133 }), false);
    assert.equal(shouldSyncPlayheadUi({
      lastSyncMs: 100,
      nowMs: 100 + PLAYHEAD_UI_SYNC_INTERVAL_MS,
    }), true);
});

test("exact seek and stop boundaries always synchronize", () => {
    assert.equal(shouldSyncPlayheadUi({ lastSyncMs: 100, nowMs: 101, force: true }), true);
});

test("the initial synchronization is allowed", () => {
    assert.equal(shouldSyncPlayheadUi({
      lastSyncMs: Number.NEGATIVE_INFINITY,
      nowMs: 0,
    }), true);
});

test("explicit transport seeks pause playback before moving the frame", () => {
  const calls: string[] = [];
  seekPlayerAndPause({
    isPlaying: () => true,
    pause: () => calls.push("pause"),
    seekTo: (frame) => calls.push(`seek:${frame}`),
  }, 0);
  assert.deepEqual(calls, ["pause", "seek:0"]);
});

test("explicit transport seeks do not issue a redundant pause", () => {
  const calls: string[] = [];
  seekPlayerAndPause({
    isPlaying: () => false,
    pause: () => calls.push("pause"),
    seekTo: (frame) => calls.push(`seek:${frame}`),
  }, 90);
  assert.deepEqual(calls, ["seek:90"]);
});

test("a replaced waiting media owner cannot leave buffering stuck while frames advance", () => {
  assert.equal(shouldClearStalePlayerBuffering(null, 1200), false);
  assert.equal(shouldClearStalePlayerBuffering(1200, 1200), false);
  assert.equal(shouldClearStalePlayerBuffering(1200, 1201), true);
  assert.equal(shouldClearStalePlayerBuffering(1200, 1199), true);
});

test("a playhead parked between frames survives the Player reporting its frame", () => {
  // 2.18s is frame 65.4 at 30fps; the Player shows and reports frame 65.
  assert.equal(playheadSecForPlayerFrame(2.18, 65, 30), 2.18);
  // Once the Player moves to another frame, the playhead follows it.
  assert.equal(playheadSecForPlayerFrame(2.18, 66, 30), 66 / 30);
  assert.equal(playheadSecForPlayerFrame(1, 30, 30), 1);
});
