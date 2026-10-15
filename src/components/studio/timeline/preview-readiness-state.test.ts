import assert from "node:assert/strict";
import test from "node:test";

import {
  createDetachedReadinessState,
  dispatchPreviewReadiness,
  isStartGateOpen,
  reducePreviewReadiness,
  type PreviewReadinessEvent,
  type PreviewReadinessState,
} from "./preview-readiness-state";

function run(state: PreviewReadinessState, ...events: PreviewReadinessEvent[]) {
  return events.reduce(reducePreviewReadiness, state);
}

const attached = () =>
  run(createDetachedReadinessState(), { type: "PLAYER_ATTACHED", frame: 1710, resumeIntent: false });

test("attach opens a warming session at the preserved frame", () => {
  const state = attached();
  assert.equal(state.phase, "warming");
  assert.equal(state.sessionId, 1);
  assert.equal(state.targetFrame, 1710);
  assert.equal(state.queuedPlay, false);
  assert.equal(isStartGateOpen(state), false);
});

test("attach with resume intent queues exactly one play", () => {
  const state = run(createDetachedReadinessState(), {
    type: "PLAYER_ATTACHED",
    frame: 300,
    resumeIntent: true,
  });
  assert.equal(state.queuedPlay, true);
  const ready = run(state, { type: "READY", sessionId: state.sessionId });
  assert.equal(ready.phase, "ready");
  assert.equal(ready.queuedPlay, true); // caller executes it, then reports PLAYBACK_STARTED
});

test("READY from a stale session cannot open the current gate", () => {
  const first = attached();
  const second = run(first, { type: "SEEK_REQUESTED", frame: 900 });
  assert.equal(second.sessionId, first.sessionId + 1);
  const poked = run(second, { type: "READY", sessionId: first.sessionId });
  assert.equal(poked.phase, "warming");
  assert.equal(isStartGateOpen(poked), false);
});

test("TIMEOUT and REQUIREMENT_ERROR from a stale session are ignored", () => {
  const first = attached();
  const second = run(first, { type: "SEEK_REQUESTED", frame: 60 });
  const timedOut = run(second, { type: "TIMEOUT", sessionId: first.sessionId });
  assert.equal(timedOut.timedOut, false);
  const errored = run(second, {
    type: "REQUIREMENT_ERROR",
    sessionId: first.sessionId,
    message: "old",
  });
  assert.equal(errored.phase, "warming");
  assert.equal(errored.error, null);
});

test("play while warming queues once; ready executes; started clears", () => {
  let state = attached();
  state = run(state, { type: "PLAY_REQUESTED" }, { type: "PLAY_REQUESTED" });
  assert.equal(state.queuedPlay, true);
  state = run(state, { type: "READY", sessionId: state.sessionId });
  assert.equal(state.phase, "ready");
  assert.equal(state.queuedPlay, true);
  state = run(state, { type: "PLAYBACK_STARTED" });
  assert.equal(state.phase, "playing");
  assert.equal(state.queuedPlay, false);
});

test("pause while warming cancels the queued play and is never gated", () => {
  let state = run(attached(), { type: "PLAY_REQUESTED" });
  state = run(state, { type: "PAUSE_REQUESTED" });
  assert.equal(state.queuedPlay, false);
  assert.equal(state.phase, "warming");
  state = run(state, { type: "READY", sessionId: state.sessionId });
  assert.equal(state.phase, "ready");
  assert.equal(state.queuedPlay, false); // no surprise auto-start
});

test("an explicit seek re-anchors and cancels a queued play", () => {
  let state = run(attached(), { type: "PLAY_REQUESTED" });
  state = run(state, { type: "SEEK_REQUESTED", frame: 2400 });
  assert.equal(state.phase, "warming");
  assert.equal(state.targetFrame, 2400);
  assert.equal(state.queuedPlay, false);
});

test("seek during playback returns to warming (start gate closes)", () => {
  let state = run(attached(), { type: "READY", sessionId: 1 }, { type: "PLAYBACK_STARTED" });
  assert.equal(state.phase, "playing");
  state = run(state, { type: "SEEK_REQUESTED", frame: 30 });
  assert.equal(state.phase, "warming");
  assert.equal(isStartGateOpen(state), false);
});

test("timeout keeps warming but surfaces the truth; retry preserves play intent", () => {
  let state = run(attached(), { type: "PLAY_REQUESTED" });
  state = run(state, { type: "TIMEOUT", sessionId: state.sessionId });
  assert.equal(state.phase, "warming");
  assert.equal(state.timedOut, true);
  const beforeRetrySession = state.sessionId;
  state = run(state, { type: "RETRY" });
  assert.equal(state.phase, "warming");
  assert.equal(state.sessionId, beforeRetrySession + 1);
  assert.equal(state.timedOut, false);
  assert.equal(state.queuedPlay, true); // the user already asked once
});

test("required-media error degrades; retry re-warms at the same frame", () => {
  let state = run(attached(), {
    type: "REQUIREMENT_ERROR",
    sessionId: 1,
    message: "narration.m4a failed",
  });
  assert.equal(state.phase, "degraded");
  assert.equal(state.error, "narration.m4a failed");
  assert.equal(isStartGateOpen(state), false);
  state = run(state, { type: "RETRY" });
  assert.equal(state.phase, "warming");
  assert.equal(state.error, null);
  assert.equal(state.targetFrame, 1710);
});

test("RETRY is a no-op unless degraded or timed out", () => {
  const warming = attached();
  assert.equal(run(warming, { type: "RETRY" }), warming);
  const ready = run(warming, { type: "READY", sessionId: 1 });
  assert.equal(run(ready, { type: "RETRY" }), ready);
});

test("SAMPLE updates pending count only for the live warming session", () => {
  let state = attached();
  state = run(state, { type: "SAMPLE", sessionId: 1, pendingCount: 3 });
  assert.equal(state.pendingCount, 3);
  state = run(state, { type: "SAMPLE", sessionId: 99, pendingCount: 7 });
  assert.equal(state.pendingCount, 3);
  const ready = run(state, { type: "READY", sessionId: 1 });
  assert.equal(run(ready, { type: "SAMPLE", sessionId: 1, pendingCount: 5 }), ready);
});

test("PLAYBACK_STARTED is trusted from any phase (native controls path)", () => {
  const state = run(attached(), { type: "PLAYBACK_STARTED" });
  assert.equal(state.phase, "playing");
  const stopped = run(state, { type: "PLAYBACK_STOPPED" });
  assert.equal(stopped.phase, "ready");
});

test("detach resets but preserves the session counter monotonicity", () => {
  const first = attached();
  const detached = run(first, { type: "PLAYER_DETACHED" });
  assert.equal(detached.phase, "detached");
  const reattached = run(detached, { type: "PLAYER_ATTACHED", frame: 10, resumeIntent: false });
  assert.equal(reattached.sessionId, first.sessionId + 1); // never reuses an old id
});

test("events on a detached machine do not open a session", () => {
  const detached = createDetachedReadinessState();
  assert.equal(run(detached, { type: "PLAY_REQUESTED" }), detached);
  assert.equal(run(detached, { type: "SEEK_REQUESTED", frame: 5 }), detached);
});

test("replay seek closes the gate synchronously before play in the same render batch", () => {
  for (const phase of ["ready", "playing"] as const) {
    const authority = { current: { ...attached(), phase } };
    const publications: PreviewReadinessState[] = [];
    const dispatch = (event: PreviewReadinessEvent) => dispatchPreviewReadiness(authority, state => publications.push(state), event);
    dispatch({ type: "SEEK_REQUESTED", frame: 192 });
    assert.equal(isStartGateOpen(authority.current), false);
    dispatch({ type: "PLAY_REQUESTED" });
    assert.equal(authority.current.queuedPlay, true);
    const sessionId = authority.current.sessionId;
    dispatch({ type: "READY", sessionId: sessionId - 1 });
    assert.equal(isStartGateOpen(authority.current), false);
    dispatch({ type: "READY", sessionId });
    assert.equal(isStartGateOpen(authority.current), true);
    assert.equal(authority.current.queuedPlay, true);
    dispatch({ type: "PLAYBACK_STARTED" });
    assert.equal(authority.current.queuedPlay, false);
    assert.equal(publications.at(-1), authority.current);
  }
});

test("a second replay replaces the warming target without losing its play intent", () => {
  const authority = { current: attached() };
  const dispatch = (event: PreviewReadinessEvent) => dispatchPreviewReadiness(authority, () => {}, event);
  dispatch({ type: "SEEK_REQUESTED", frame: 240 });
  dispatch({ type: "PLAY_REQUESTED" });
  const previousSession = authority.current.sessionId;
  dispatch({ type: "SEEK_REQUESTED", frame: 192 });
  dispatch({ type: "PLAY_REQUESTED" });
  dispatch({ type: "READY", sessionId: previousSession });
  assert.equal(authority.current.phase, "warming");
  assert.equal(authority.current.targetFrame, 192);
  assert.equal(authority.current.queuedPlay, true);
  dispatch({ type: "PAUSE_REQUESTED" });
  assert.equal(authority.current.queuedPlay, false);
});
