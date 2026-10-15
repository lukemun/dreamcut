import type { PlayerRef } from "@/lib/frame-runtime/player";

// Remotion requires this value to remain constant for the lifetime of the Player.
// The default of five is too small for a layered visual edit plus a two-piece audio
// audition, where video clips and music clips can all reserve shared audio tags.
export const TIMELINE_PLAYER_SHARED_AUDIO_TAGS = 16;

/**
 * Fast Refresh can preserve Remotion's shared audio pool after the composition
 * module changes, even though the pool's mounted <Audio> owners were replaced.
 * A module-runtime key gives each development HMR runtime a clean Player/audio pool while
 * remaining constant for every ordinary render and for production builds.
 */
export function createPreviewPlayerRuntimeKey(
  isDevelopment: boolean,
  runtimeNonce: string,
) {
  return isDevelopment ? `timeline-player-dev-${runtimeNonce}` : "timeline-player";
}

export function clampPlayerFrame(frame: number, durationInFrames: number) {
  const lastFrame = Math.max(0, durationInFrames - 1);
  if (!Number.isFinite(frame)) return 0;
  return Math.min(lastFrame, Math.max(0, Math.round(frame)));
}

export function shouldReleaseStuckPreviewPointer(
  activePointerId: number | null,
  eventPointerId: number,
  buttons: number,
) {
  return activePointerId === eventPointerId && (buttons & 1) === 0;
}

type SeekablePlayer = Pick<PlayerRef, "seekTo">;

/**
 * Two-stage restore for the readiness gate: stage 1 preserves the frame
 * immediately and reports whether a resume should be QUEUED; the actual
 * `play()` happens only when the readiness session becomes ready. Never call
 * a media element or Player `play()` from the shell — synchronous playback is
 * exactly the no-barrier resume the gate exists to remove. The playback
 * controller is the sole owner of the eventual Player start.
 */
export function restoreAttachedPlayerFrame(
  player: SeekablePlayer,
  frame: number,
  resumePlayback: boolean,
): { queuedResume: boolean } {
  player.seekTo(frame);
  return { queuedResume: resumePlayback };
}
