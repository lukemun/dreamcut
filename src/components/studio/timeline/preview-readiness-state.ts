/**
 * Pure readiness state machine for the preview Player (Stage C of the
 * first-load readiness work — see
 * docs/plans/2026-07-22-timeline-preview-first-load-readiness-handoff.md).
 *
 * The machine answers one question honestly: is it safe to START playback at
 * the current frame? It never blocks Pause, never gates continuous playback,
 * and never pretends to play. Every warming pass is a numbered session; events
 * stamped with a stale session id are ignored, so a late `canplay`/timeout
 * from a replaced Player can neither open nor close the current gate.
 *
 *   detached -> warming -> ready -> playing
 *                    \-> degraded --RETRY--> warming
 *   playing --seek / input replacement / remount--> warming
 *
 * This module is deliberately free of React and DOM imports: the transition
 * function is exhaustively unit-tested, and the hook that samples real media
 * elements (usePreviewReadiness) is a thin driver around it.
 */

export type PreviewReadinessPhase = "detached" | "warming" | "ready" | "playing" | "degraded";

export type PreviewReadinessState = {
  phase: PreviewReadinessPhase;
  /** Monotonically increasing warming-session id; stale events are ignored. */
  sessionId: number;
  /** Frame the session is anchored to (preserved across remounts). */
  targetFrame: number;
  /** One queued play intent, executed exactly once when the session is ready. */
  queuedPlay: boolean;
  /** Number of required media still below their readiness floor (display only). */
  pendingCount: number;
  /** Set when a required medium errored; shown in the degraded UI. */
  error: string | null;
  /** The 4s UX threshold fired — show "still loading" + Retry. Not proof of bad media. */
  timedOut: boolean;
};

export type PreviewReadinessEvent =
  | { type: "PLAYER_ATTACHED"; frame: number; resumeIntent: boolean }
  | { type: "PLAYER_DETACHED" }
  | { type: "SEEK_REQUESTED"; frame: number }
  | { type: "PLAY_REQUESTED" }
  | { type: "PAUSE_REQUESTED" }
  | { type: "SAMPLE"; sessionId: number; pendingCount: number }
  | { type: "REQUIREMENT_ERROR"; sessionId: number; message: string }
  | { type: "READY"; sessionId: number }
  | { type: "TIMEOUT"; sessionId: number }
  | { type: "RETRY" }
  | { type: "PLAYBACK_STARTED" }
  | { type: "PLAYBACK_STOPPED" };

export function createDetachedReadinessState(): PreviewReadinessState {
  return {
    phase: "detached",
    sessionId: 0,
    targetFrame: 0,
    queuedPlay: false,
    pendingCount: 0,
    error: null,
    timedOut: false,
  };
}

function beginWarming(
  state: PreviewReadinessState,
  frame: number,
  queuedPlay: boolean,
): PreviewReadinessState {
  return {
    phase: "warming",
    sessionId: state.sessionId + 1,
    targetFrame: frame,
    queuedPlay,
    pendingCount: 0,
    error: null,
    timedOut: false,
  };
}

/** True when a start (play) may be executed right now. */
export function isStartGateOpen(state: PreviewReadinessState): boolean {
  return state.phase === "ready" || state.phase === "playing";
}

export function reducePreviewReadiness(
  state: PreviewReadinessState,
  event: PreviewReadinessEvent,
): PreviewReadinessState {
  switch (event.type) {
    case "PLAYER_ATTACHED":
      // A (re)mount always invalidates whatever came before: fresh session at
      // the preserved frame. A previously playing Player queues its resume.
      return beginWarming(state, event.frame, event.resumeIntent);

    case "PLAYER_DETACHED":
      return { ...createDetachedReadinessState(), sessionId: state.sessionId };

    case "SEEK_REQUESTED":
      if (state.phase === "detached") return state;
      // An explicit seek re-anchors the session. A seek is not a play intent,
      // and it CANCELS one: the user moved the playhead while we were warming,
      // so auto-starting at the new position would be a surprise.
      return beginWarming(state, event.frame, false);

    case "PLAY_REQUESTED":
      if (state.phase === "detached") return state;
      if (isStartGateOpen(state)) return state; // caller starts immediately; no queue
      return { ...state, queuedPlay: true };

    case "PAUSE_REQUESTED":
      // Pause is never gated; it also cancels any queued auto-start.
      if (state.phase === "playing") {
        return { ...state, phase: "ready", queuedPlay: false };
      }
      return { ...state, queuedPlay: false };

    case "SAMPLE":
      if (event.sessionId !== state.sessionId || state.phase !== "warming") return state;
      // Referential stability matters: a fresh object per 250ms sample would
      // re-render every consumer for an unchanged count.
      if (event.pendingCount === state.pendingCount) return state;
      return { ...state, pendingCount: event.pendingCount };

    case "REQUIREMENT_ERROR":
      if (event.sessionId !== state.sessionId) return state;
      if (state.phase !== "warming" && state.phase !== "degraded") return state;
      return { ...state, phase: "degraded", error: event.message };

    case "READY":
      if (event.sessionId !== state.sessionId || state.phase !== "warming") return state;
      return { ...state, phase: "ready", pendingCount: 0, timedOut: false };

    case "TIMEOUT":
      if (event.sessionId !== state.sessionId || state.phase !== "warming") return state;
      // Stay warming — media may still arrive — but surface the truth and offer Retry.
      return { ...state, timedOut: true };

    case "RETRY":
      if (state.phase !== "degraded" && !(state.phase === "warming" && state.timedOut)) return state;
      // Retry preserves the play intent: the user already asked once.
      return beginWarming(state, state.targetFrame, state.queuedPlay);

    case "PLAYBACK_STARTED":
      // Trust the Player: if it reports playing, reflect it regardless of
      // phase (native controls, autoplay edge cases). The gate's job was
      // before this moment.
      return { ...state, phase: "playing", queuedPlay: false };

    case "PLAYBACK_STOPPED":
      if (state.phase !== "playing") return state;
      return { ...state, phase: "ready" };

    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** Transport commands can arrive in one React batch (seek, then play).
 * Publish from a synchronous authority so the second command sees the first. */
export function dispatchPreviewReadiness(
  authority: { current: PreviewReadinessState },
  publish: (state: PreviewReadinessState) => void,
  event: PreviewReadinessEvent,
) {
  authority.current = reducePreviewReadiness(authority.current, event);
  publish(authority.current);
}
