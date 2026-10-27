"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@/lib/frame-runtime/player";

import { clampSteppedFrame } from "./playback-keyboard";
import { bindingMatches, DEFAULT_KEYBOARD_SHORTCUTS, type KeyboardShortcuts } from "@/lib/keyboard-shortcuts";

type BeatRange = { startSec: number; endSec: number } | null;
type AuditionFrameRange = { startFrame: number; endFrameExclusive: number } | null;

// The Remotion Player owns the authoritative frame clock. Mirroring all 30 frame
// updates per second into TimelineStep state rerenders the entire editor and can
// feed enough synchronous work back into Remotion to trip React's maximum update
// depth guard on media-heavy boundaries. The UI playhead does not need 30 Hz
// telemetry; seeks and playback stops still force an exact update.
export const PLAYHEAD_UI_SYNC_INTERVAL_MS = 80;

export function shouldSyncPlayheadUi({
  lastSyncMs,
  nowMs,
  force = false,
}: {
  lastSyncMs: number;
  nowMs: number;
  force?: boolean;
}) {
  return force || nowMs - lastSyncMs >= PLAYHEAD_UI_SYNC_INTERVAL_MS;
}

/**
 * A timing edit can replace a waiting media owner before it emits its matching
 * `resume`. If the Player frame advances anyway, that wait is stale and must
 * not leave the editor showing an endless buffering state.
 */
export function shouldClearStalePlayerBuffering(
  waitingFrame: number | null,
  nextFrame: number,
) {
  return waitingFrame != null && nextFrame !== waitingFrame;
}

type SeekablePlayer = Pick<PlayerRef, "isPlaying" | "pause" | "seekTo">;

export function seekPlayerAndPause(player: SeekablePlayer, frame: number) {
  if (player.isPlaying()) player.pause();
  player.seekTo(frame);
}

type ReadinessGate = {
  state: { phase: string; queuedPlay: boolean; sessionId: number };
  api: {
    seekRequested: (frame: number) => void;
    playRequested: () => boolean;
    pauseRequested: () => void;
    playbackStarted: () => void;
    playbackStopped: () => void;
  };
};

type UseTimelinePlaybackControllerArgs = {
  playerRef: React.RefObject<PlayerRef | null>;
  playerInstance: PlayerRef | null;
  durationInFrames: number;
  selectedBeat: BeatRange;
  setPlayheadSec: (seconds: number) => void;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  /** A review surface can own R for replaying its selected proposal. */
  replayShortcutDisabled?: boolean;
  /** The creator's keys (Settings → Keyboard shortcuts). */
  shortcuts?: KeyboardShortcuts;
  /** Stage C start gate and transport state. Required: there is one preview path. */
  readiness: ReadinessGate;
};

export function useTimelinePlaybackController({
  playerRef,
  playerInstance,
  durationInFrames,
  selectedBeat,
  setPlayheadSec,
  undo,
  redo,
  replayShortcutDisabled = false,
  shortcuts = DEFAULT_KEYBOARD_SHORTCUTS,
  readiness,
}: UseTimelinePlaybackControllerArgs) {
  const selectedBeatRef = useRef(selectedBeat);
  const auditionRangeRef = useRef<AuditionFrameRange>(null);
  const lastPlayheadUiSyncMsRef = useRef(Number.NEGATIVE_INFINITY);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Coarse Player buffering (public `waiting`/`resume` events). This is the
  // only readiness signal that covers BOTH decode paths — the DOM sampler in
  // usePreviewReadiness cannot see a chroma-keyed clip on @remotion/media's
  // canvas path, but the Player's buffer state can. Surfaced as status, never
  // used as the sole proof a specific source is ready (handoff §2).
  const [isPlayerBuffering, setIsPlayerBuffering] = useState(false);
  const playerBufferingFrameRef = useRef<number | null>(null);
  // Effects depend on the stable api (memoized in usePreviewReadiness), never
  // on the composite readiness object whose identity changes with each state
  // transition — that identity in a setState-calling effect's deps is a loop.
  const readinessApi = readiness.api;
  const readinessState = readiness.state;

  useEffect(() => {
    selectedBeatRef.current = selectedBeat;
  }, [selectedBeat]);

  useEffect(() => {
    const player = playerInstance;
    if (!player) return;
    const syncPlayhead = (frame: number, force = false) => {
      const nowMs = performance.now();
      if (!shouldSyncPlayheadUi({
        lastSyncMs: lastPlayheadUiSyncMsRef.current,
        nowMs,
        force,
      })) return;
      lastPlayheadUiSyncMsRef.current = nowMs;
      // Routine editor telemetry can yield to picture presentation and input.
      // Explicit seeks/stops remain urgent; the Player keeps the exact clock.
      if (force) setPlayheadSec(frame / currentFrameRate());
      else startTransition(() => setPlayheadSec(frame / currentFrameRate()));
    };
    const finishAuditionPlayback = () => {
      const auditionRange = auditionRangeRef.current;
      if (!auditionRange) return false;
      auditionRangeRef.current = null;
      const finalFrame = Math.max(
        auditionRange.startFrame,
        auditionRange.endFrameExclusive - 1,
      );
      player.pause();
      player.seekTo(finalFrame);
      syncPlayhead(finalFrame, true);
      setIsPlaying(false);
      return true;
    };
    const onFrameUpdate = (e: { detail: { frame: number } }) => {
      if (shouldClearStalePlayerBuffering(playerBufferingFrameRef.current, e.detail.frame)) {
        playerBufferingFrameRef.current = null;
        setIsPlayerBuffering(false);
      }
      const sec = e.detail.frame / currentFrameRate();
      const auditionRange = auditionRangeRef.current;
      if (
        auditionRange
        && player.isPlaying()
        && e.detail.frame >= auditionRange.endFrameExclusive
      ) {
        finishAuditionPlayback();
        return;
      }
      const beat = selectedBeatRef.current;
      if (beat && player.isPlaying() && sec >= beat.endSec) {
        const startFrame = Math.round(beat.startSec * currentFrameRate());
        player.seekTo(startFrame);
        syncPlayhead(startFrame, true);
        return;
      }
      syncPlayhead(e.detail.frame);
    };
    const onSeeked = (e: { detail: { frame: number } }) => {
      playerBufferingFrameRef.current = null;
      setIsPlayerBuffering(false);
      syncPlayhead(e.detail.frame, true);
    };
    const syncPlaying = () => {
      syncPlayhead(player.getCurrentFrame(), true);
      setIsPlaying(player.isPlaying());
    };
    const onEnded = () => {
      if (!finishAuditionPlayback()) syncPlaying();
    };
    // Feed the readiness machine the Player's own truth: `play` confirms an
    // actual start (any path, native controls included); `pause`/`ended`
    // return the gate to ready without closing it.
    const onPlay = () => {
      syncPlaying();
      readinessApi.playbackStarted();
    };
    const onPause = () => {
      playerBufferingFrameRef.current = null;
      setIsPlayerBuffering(false);
      syncPlaying();
      readinessApi.playbackStopped();
    };
    const onWaiting = () => {
      const frame = player.getCurrentFrame();
      playerBufferingFrameRef.current = frame;
      setIsPlayerBuffering(true);
    };
    const onResume = () => {
      playerBufferingFrameRef.current = null;
      setIsPlayerBuffering(false);
    };
    syncPlayhead(player.getCurrentFrame(), true);
    syncPlaying();
    setIsPlayerBuffering(false);
    playerBufferingFrameRef.current = null;
    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("seeked", onSeeked);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    player.addEventListener("waiting", onWaiting);
    player.addEventListener("resume", onResume);
    return () => {
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("seeked", onSeeked);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("waiting", onWaiting);
      player.removeEventListener("resume", onResume);
    };
  }, [playerInstance, readinessApi, setPlayheadSec]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    auditionRangeRef.current = null;
    if (player.isPlaying()) {
      player.pause();
      setIsPlaying(false);
      readinessApi.pauseRequested();
      return;
    }
    const beat = selectedBeatRef.current;
    if (beat) {
      const sec = player.getCurrentFrame() / currentFrameRate();
      if (sec < beat.startSec || sec >= beat.endSec) {
        const beatFrame = Math.round(beat.startSec * currentFrameRate());
        player.seekTo(beatFrame);
        readinessApi.seekRequested(beatFrame);
      }
    }
    // Gate the start: while required media warm, the intent is queued and the
    // stage overlay says so — the playhead never advances silently.
    if (!readinessApi.playRequested()) return;
    player.play();
    setIsPlaying(true);
  }, [playerRef, readinessApi]);

  const playFromStart = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    auditionRangeRef.current = null;
    seekPlayerAndPause(player, 0);
    setIsPlaying(false);
    setPlayheadSec(0);
    readinessApi.seekRequested(0);
    if (!readinessApi.playRequested()) return;
    player.play();
    setIsPlaying(true);
  }, [playerRef, readinessApi, setPlayheadSec]);

  const playRange = useCallback((startSeconds: number, endSeconds: number) => {
    const player = playerRef.current;
    if (!player || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return;
    const startFrame = Math.max(0, Math.round(startSeconds * currentFrameRate()));
    const endFrameExclusive = Math.min(
      durationInFrames,
      Math.max(startFrame + 1, Math.round(endSeconds * currentFrameRate())),
    );
    auditionRangeRef.current = { startFrame, endFrameExclusive };
    selectedBeatRef.current = null;
    seekPlayerAndPause(player, startFrame);
    setIsPlaying(false);
    setPlayheadSec(startFrame / currentFrameRate());
    readinessApi.seekRequested(startFrame);
    if (!readinessApi.playRequested()) return;
    player.play();
    setIsPlaying(true);
  }, [durationInFrames, playerRef, readinessApi, setPlayheadSec]);

  const seekToFrame = useCallback((requestedFrame: number) => {
    const player = playerRef.current;
    if (!player) return;
    auditionRangeRef.current = null;
    const frame = Math.max(0, Math.min(durationInFrames - 1, Math.round(requestedFrame)));
    seekPlayerAndPause(player, frame);
    setPlayheadSec(frame / currentFrameRate());
    setIsPlaying(false);
    readinessApi.seekRequested(frame);
  }, [durationInFrames, playerRef, readinessApi, setPlayheadSec]);

  // Queued-play executor: exactly one start per ready session. The reducer
  // holds the intent; this effect performs it and the Player's `play` event
  // (above) confirms it back into the machine.
  const executedQueuedPlayForSessionRef = useRef(0);
  useEffect(() => {
    if (readinessState.phase !== "ready" || !readinessState.queuedPlay) return;
    if (executedQueuedPlayForSessionRef.current === readinessState.sessionId) return;
    const player = playerRef.current;
    if (!player) return;
    executedQueuedPlayForSessionRef.current = readinessState.sessionId;
    player.play();
    setIsPlaying(true);
  }, [playerRef, readinessState?.phase, readinessState?.queuedPlay, readinessState?.sessionId, readinessState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isReplay = bindingMatches(event, shortcuts.replay);
      const fromStart = isReplay || bindingMatches(event, shortcuts.playFromStart);
      if (!fromStart && !bindingMatches(event, shortcuts.playPause)) return;
      if (event.defaultPrevented || event.repeat) return;
      if (isReplay && replayShortcutDisabled) return;
      const target = event.target;
      // Space belongs to a focused native action or disclosure. Let its
      // keyboard activation run rather than starting the preview underneath it.
      if (event.key === " " && target instanceof HTMLElement && target.closest('button, [role="button"]')) return;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable || target.closest('[role="dialog"][aria-modal="true"]'))
      ) {
        return;
      }
      event.preventDefault();
      if (fromStart) {
        playFromStart();
        return;
      }
      togglePlay();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [playFromStart, replayShortcutDisabled, shortcuts.playFromStart, shortcuts.playPause, shortcuts.replay, togglePlay]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const step = bindingMatches(event, shortcuts.frameBack) ? -1 : bindingMatches(event, shortcuts.frameForward) ? 1 : 0;
      if (step === 0) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      const player = playerRef.current;
      if (!player) return;
      event.preventDefault();
      auditionRangeRef.current = null;
      if (player.isPlaying()) player.pause();
      const nextFrame = clampSteppedFrame(player.getCurrentFrame(), step, durationInFrames);
      player.seekTo(nextFrame);
      setPlayheadSec(nextFrame / currentFrameRate());
      setIsPlaying(false);
      readinessApi.seekRequested(nextFrame);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [durationInFrames, playerRef, readinessApi, setPlayheadSec, shortcuts.frameBack, shortcuts.frameForward]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      const isRedo = bindingMatches(event, shortcuts.redo);
      if (!isRedo && !bindingMatches(event, shortcuts.undo)) return;
      event.preventDefault();
      if (isRedo) {
        void redo();
        return;
      }
      void undo();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, shortcuts.redo, shortcuts.undo]);

  useEffect(() => {
    if (!playerInstance) return;
    setIsFullscreen(playerInstance.isFullscreen());
    const onFullscreenChange = ({ detail }: { detail: { isFullscreen: boolean } }) => {
      setIsFullscreen(detail.isFullscreen);
    };
    playerInstance.addEventListener("fullscreenchange", onFullscreenChange);
    return () => playerInstance.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [playerInstance]);

  const toggleFullscreen = useCallback(() => {
    playerRef.current?.toggleFullscreen();
  }, [playerRef]);

  return {
    isPlaying,
    isPlayerBuffering,
    isFullscreen,
    toggleFullscreen,
    togglePlay,
    seekToFrame,
    playFromStart,
    playRange,
  };
}
