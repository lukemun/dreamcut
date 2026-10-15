"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createDetachedReadinessState,
  isStartGateOpen,
  dispatchPreviewReadiness,
  type PreviewReadinessEvent,
  type PreviewReadinessState,
} from "./preview-readiness-state";

/**
 * Driver for the pure readiness machine (preview-readiness-state.ts).
 *
 * Readiness is measured on the REAL media elements Remotion mounted — not on
 * disposable warmers — which closes the "warmer succeeded but the mounted
 * element still buffers" gap by construction. Sampling is scoped to the
 * composition frame plus the current separate soundtrack/voice clock, so the
 * asset shelf and unrelated editor audio cannot influence transport readiness.
 * Remotion's idle shared audio tags carry data: URIs and are excluded.
 *
 * Known blind spot: a chroma-keyed clip decodes through @remotion/media's
 * canvas-backed <Video> (see TimelineVideo in TimelineComposition), which
 * mounts no DOM media element this sampler can see. Coverage there comes from
 * the Player's public waiting/resume events, surfaced as the buffering chip in
 * TimelinePlaybackShell — coarse status by design, never sole proof.
 *
 * This hook is deliberately observational. It never calls play(), pause(), or
 * seeks an individual media element. The Remotion Player is the sole preview
 * transport owner; bypassing it can start premounted narration early, replay a
 * clip at its real boundary, or leave audio running after the Player pauses.
 */

const WARMING_SAMPLE_INTERVAL_MS = 50;
const WARMING_TIMEOUT_MS = 4_000;
export const REQUIRED_STABLE_READY_SAMPLES = 16;
/** Keep the original 750 ms stability window for partially buffered media. */
const READINESS_FLOOR = 3;
export const PREVIEW_MEDIA_ROOT_SELECTOR = "[data-composition-master-frame='true']";

type ReadinessTimelineElement = {
  type: string;
  timeline_start: number;
  duration: number;
  source_url?: string | null;
  removed_at?: string | null;
  props?: Record<string, unknown> | null;
};

/** Preparation elsewhere in the edit cannot block the current shot. */
export function previewPreparationAtTime(elements: ReadinessTimelineElement[], seconds: number) {
  const active = elements.filter(element => !element.removed_at && element.type === "video_clip"
    && seconds >= element.timeline_start && seconds < element.timeline_start + element.duration);
  const states = active.map(element => element.props?.runtime_preview_preparation as { state?: string; error?: string } | undefined);
  const failed = states.find(item => item?.state === "failed");
  return {
    preparationPendingCount: states.filter(item => item?.state === "preparing").length,
    preparationError: failed ? failed.error ?? "Preview preparation failed. Retry in User → Settings." : null,
  };
}

const DOM_MEDIA_TYPES = new Set([
  "video_clip",
  "vo_segment",
  "vo_full",
  "music",
  "sound_effect",
]);

/**
 * The readiness gate can only wait for media that should be mounted at the
 * current playhead. Waiting for any media anywhere in the project deadlocks
 * valid gaps (including a timeline whose first music begins after 0:00).
 */
export function timelineExpectsMountedMediaAtTime(
  elements: ReadinessTimelineElement[],
  playheadSeconds: number,
  externalAudioPreview = false,
) {
  return elements.some((element) => (
    !element.removed_at
    && DOM_MEDIA_TYPES.has(element.type)
    && (!externalAudioPreview || element.type === "video_clip")
    && typeof element.source_url === "string"
    && element.source_url.length > 0
    && playheadSeconds >= element.timeline_start
    && playheadSeconds < element.timeline_start + element.duration
  ));
}

/** The separate mixer supplies the preview clock, so its active music/voice
 * decoder must reach playable data before the transport starts. A video clip's
 * own sound is listed too: when the GPU canvas draws the picture, the mixer
 * plays it under the clip's id. Ids the mixer has not mounted are ignored. */
export function previewClockAudioIdsAtTime(
  elements: Array<ReadinessTimelineElement & { id: string; lane_key: string }>,
  seconds: number,
): string[] {
  return elements.filter((element) => (
    !element.removed_at
    && element.type !== "sound_effect"
    && (element.lane_key.startsWith("audio_") || element.lane_key.startsWith("music_")
      || (element.type === "video_clip" && element.props?.runtime_source_has_audio !== false))
    && !!element.source_url
    && seconds >= element.timeline_start
    && seconds < element.timeline_start + element.duration
  )).map((element) => element.id);
}

/** A settled decoder with a real forward buffer needs no arbitrary one-second hold. */
export function hasReadyPreviewBuffer(media: Pick<HTMLMediaElement, "readyState" | "seeking" | "error" | "currentTime" | "duration" | "buffered">): boolean {
  if (media.readyState < 4 || media.seeking || media.error || !Number.isFinite(media.currentTime)
    || !Number.isFinite(media.duration) || media.duration <= media.currentTime) return false;
  const end = Math.min(media.duration, media.currentTime + 0.5);
  for (let i = 0; i < media.buffered.length; i++) {
    if (media.buffered.start(i) <= media.currentTime && media.buffered.end(i) >= end - 0.001) return true;
  }
  return false;
}

function isRealMediaElement(element: HTMLMediaElement): boolean {
  const src = element.currentSrc || element.src || "";
  return src.length > 0 && !src.startsWith("data:") && !src.startsWith("blob:");
}

function sampleMountedMedia(externalAudioPreview: boolean, requiredExternalAudioIds: readonly string[]): HTMLMediaElement[] {
  if (typeof document === "undefined") return [];
  const root = document.querySelector(PREVIEW_MEDIA_ROOT_SELECTOR);
  if (!root) return [];
  const inComposition = Array.from(root.querySelectorAll<HTMLMediaElement>(externalAudioPreview ? "video" : "audio,video")).filter(
    (element) => isRealMediaElement(element) && element.dataset.previewPremounted !== "true",
  );
  if (!externalAudioPreview || requiredExternalAudioIds.length === 0) return inComposition;
  const required = new Set(requiredExternalAudioIds);
  const external = Array.from(document.querySelectorAll<HTMLAudioElement>("[data-timeline-preview-audio-engine] audio"))
    .filter((element) => required.has(element.dataset.timelinePreviewAudioId ?? "") && isRealMediaElement(element));
  return [...inComposition, ...external];
}

/** Required mixer channels that exist in the page (the mixer mounts every channel up front). */
function mountedMixerChannelCount(ids: readonly string[]): number {
  if (typeof document === "undefined" || ids.length === 0) return 0;
  const required = new Set(ids);
  return Array.from(document.querySelectorAll<HTMLAudioElement>("[data-timeline-preview-audio-engine] audio"))
    .filter((element) => required.has(element.dataset.timelinePreviewAudioId ?? "")).length;
}

/**
 * The warming gate's READY predicate, extracted pure for testing.
 *
 * Ready when nothing is still decoding AND either some real media has mounted
 * or the timeline never had real media to wait for. The second arm is what
 * unblocks a stills-and-captions-only timeline: its only DOM media nodes are
 * the Player's `data:` silence, which the sampler excludes, so `realMediaCount`
 * stays 0 forever — and without `expectsRealMedia === false` the gate could
 * never conclude there is nothing to wait for.
 */
export function isPreviewWarmingComplete({
  realMediaCount,
  pendingCount,
  expectsRealMedia,
}: {
  realMediaCount: number;
  pendingCount: number;
  expectsRealMedia: boolean;
}): boolean {
  if (pendingCount > 0) return false;
  return realMediaCount > 0 || !expectsRealMedia;
}

/** The browser GPU renderer decodes picture through WebCodecs into this canvas. */
export const PREVIEW_CANVAS_PICTURE_SELECTOR = "canvas[data-gpu-preview]";

/**
 * Whether the gate should wait for a mounted DOM <audio>/<video> node.
 * `requiredExternalAudioCount` counts required mixer channels actually mounted,
 * including a video clip's own sound.
 *
 * With the separate audio mixer, the only DOM media the sampler can see are
 * picture <video> nodes plus the mixer's required music/voice channels. When
 * the GPU canvas owns the picture there are no <video> nodes at all — its
 * decode readiness reaches the transport through the Player's own
 * waiting/resume buffering. Expecting a DOM video there deadlocks every start
 * whose playhead covers only video clips (a talking head with embedded audio):
 * the sample stays "1 pending" forever and a queued Replay never starts.
 */
export function expectsDomPreviewMedia({
  expectsRealMedia,
  externalAudioPreview,
  requiredExternalAudioCount,
  canvasOwnsPicture,
}: {
  expectsRealMedia: boolean;
  externalAudioPreview: boolean;
  requiredExternalAudioCount: number;
  canvasOwnsPicture: boolean;
}): boolean {
  if (externalAudioPreview && canvasOwnsPicture) return requiredExternalAudioCount > 0;
  return expectsRealMedia;
}

export function nextStableReadySampleCount(previous: number, currentlyReady: boolean) {
  return currentlyReady ? previous + 1 : 0;
}

export type PreviewReadinessApi = {
  playerAttached: (frame: number, resumeIntent: boolean) => void;
  playerDetached: () => void;
  seekRequested: (frame: number) => void;
  /**
   * Record a play intent. Returns true when the caller may start playback NOW;
   * false means the intent was queued and will be surfaced via
   * `consumeQueuedPlay` once the session becomes ready.
   */
  playRequested: () => boolean;
  pauseRequested: () => void;
  playbackStarted: () => void;
  playbackStopped: () => void;
  retry: () => void;
};

export function usePreviewReadiness({
  // Whether the current timeline contains any element that mounts a real
  // <audio>/<video> DOM node (video_clip, vo_*, music, sound_effect). A
  // stills-and-captions-only timeline mounts none — the Player still emits
  // silent `data:` audio placeholders, which `sampleMountedMedia` correctly
  // excludes, leaving `media.length === 0` forever. Without this flag the
  // warming gate cannot tell "media hasn't mounted yet" from "there is no
  // media to wait for", so it warms until timeout and never releases queued
  // play. Defaults true so an unknowing caller keeps the old wait-for-media
  // behaviour. A stills-and-captions tutorial once exposed this failure:
  // 12 stills + 12 captions, zero audio/video, stuck on "Preview is still
  // loading" despite a healthy, visible, rAF-ticking pane.
  expectsRealMedia = true,
  externalAudioPreview = false,
  requiredExternalAudioIds = [],
  preparationPendingCount = 0,
  preparationError = null,
}: {
  expectsRealMedia?: boolean;
  externalAudioPreview?: boolean;
  requiredExternalAudioIds?: readonly string[];
  preparationPendingCount?: number;
  preparationError?: string | null;
}) {
  const [state, setState] = useState<PreviewReadinessState>(createDetachedReadinessState);
  const stateRef = useRef(state);
  const preparationRef = useRef({ preparationPendingCount, preparationError });
  preparationRef.current = { preparationPendingCount, preparationError };
  const dispatch = useCallback((event: PreviewReadinessEvent) => {
    dispatchPreviewReadiness(stateRef, setState, event);
  }, []);

  const api = useMemo<PreviewReadinessApi>(
    () => ({
      playerAttached: (frame, resumeIntent) =>
        dispatch({ type: "PLAYER_ATTACHED", frame, resumeIntent }),
      playerDetached: () => dispatch({ type: "PLAYER_DETACHED" }),
      seekRequested: (frame) => dispatch({ type: "SEEK_REQUESTED", frame }),
      playRequested: () => {
        const current = stateRef.current;
        if (preparationRef.current.preparationPendingCount || preparationRef.current.preparationError) {
          if (isStartGateOpen(current)) dispatch({ type: "PLAYER_ATTACHED", frame: current.targetFrame, resumeIntent: true });
          dispatch({ type: "PLAY_REQUESTED" });
          return false;
        }
        if (current.phase === "detached" || isStartGateOpen(current)) return true;
        dispatch({ type: "PLAY_REQUESTED" });
        return false;
      },
      pauseRequested: () => dispatch({ type: "PAUSE_REQUESTED" }),
      playbackStarted: () => dispatch({ type: "PLAYBACK_STARTED" }),
      playbackStopped: () => dispatch({ type: "PLAYBACK_STOPPED" }),
      retry: () => dispatch({ type: "RETRY" }),
    }),
    [dispatch],
  );

  useEffect(() => {
    if (!preparationPendingCount && !preparationError) dispatch({ type: "RETRY" });
  }, [dispatch, preparationPendingCount, preparationError]);

  // ── Warming sampler: real elements to HAVE_FUTURE_DATA, then READY ────────
  useEffect(() => {
    if (state.phase !== "warming") return;
    const sessionId = state.sessionId;
    let cancelled = false;
    let stableReadySamples = 0;
    let bufferedReadySamples = 0;

    const timeout = setTimeout(() => {
      if (!cancelled && !preparationPendingCount && !preparationError && !document.querySelector(`${PREVIEW_MEDIA_ROOT_SELECTOR} [data-preview-preparing="true"]`)) dispatch({ type: "TIMEOUT", sessionId });
    }, WARMING_TIMEOUT_MS);

    const sampleOnce = () => {
      if (cancelled) return;
      if (preparationError) {
        dispatch({ type: "REQUIREMENT_ERROR", sessionId, message: preparationError });
        return;
      }
      if (preparationPendingCount) {
        dispatch({ type: "SAMPLE", sessionId, pendingCount: preparationPendingCount });
        return;
      }
      if (document.querySelector(`${PREVIEW_MEDIA_ROOT_SELECTOR} [data-preview-preparing="true"]`)) {
        dispatch({ type: "SAMPLE", sessionId, pendingCount: 1 });
        return;
      }
      if (document.querySelector(`${PREVIEW_MEDIA_ROOT_SELECTOR} [data-preview-proxy-blocked]`)) {
        dispatch({ type: "REQUIREMENT_ERROR", sessionId, message: "Prepare preview: a video proxy is missing, unverified, or oversized." });
        return;
      }
      const media = sampleMountedMedia(externalAudioPreview, requiredExternalAudioIds);
      const pending = media.filter((element) => element.readyState < READINESS_FLOOR);
      const erroredElement = media.find((element) => element.error != null);
      if (erroredElement) {
        const src = (erroredElement.currentSrc || erroredElement.src).split("/").pop() ?? "media";
        dispatch({
          type: "REQUIREMENT_ERROR",
          sessionId,
          message: `${src}: ${erroredElement.error?.message || "media error"}`,
        });
        return;
      }
      const expectsDomMedia = expectsDomPreviewMedia({
        expectsRealMedia,
        externalAudioPreview,
        requiredExternalAudioCount: mountedMixerChannelCount(requiredExternalAudioIds),
        canvasOwnsPicture: document.querySelector(`${PREVIEW_MEDIA_ROOT_SELECTOR} ${PREVIEW_CANVAS_PICTURE_SELECTOR}`) != null,
      });
      const currentlyReady = isPreviewWarmingComplete({
          realMediaCount: media.length,
          pendingCount: pending.length,
          expectsRealMedia: expectsDomMedia,
        });
      stableReadySamples = nextStableReadySampleCount(stableReadySamples, currentlyReady);
      bufferedReadySamples = nextStableReadySampleCount(bufferedReadySamples, currentlyReady
        && (media.length > 0 ? media.every(hasReadyPreviewBuffer) : !expectsDomMedia));
      if (bufferedReadySamples >= 2 || stableReadySamples >= REQUIRED_STABLE_READY_SAMPLES) {
        dispatch({ type: "READY", sessionId });
        return;
      }
      dispatch({ type: "SAMPLE", sessionId, pendingCount: Math.max(pending.length, media.length === 0 && expectsDomMedia ? 1 : 0) });
    };

    sampleOnce();
    const interval = setInterval(sampleOnce, WARMING_SAMPLE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [dispatch, expectsRealMedia, externalAudioPreview, requiredExternalAudioIds, preparationPendingCount, preparationError, state.phase, state.sessionId]);

  // Stable identity: consumers put this object (and its members) in effect
  // deps. A fresh literal per render turns those effects into a setState →
  // render → new-identity → effect loop — React's max-update-depth guard
  // fires inside the Player shell. (Hit live on first wiring, 2026-07-22.)
  return useMemo(() => ({ state, api }), [state, api]);
}
