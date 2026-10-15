"use client";
import { useId, useLayoutEffect, useRef, useReducer, type CSSProperties } from "react";
import { useFrameState } from ".";
import {useNativeSources} from "../native-preview/NativeSourceProvider";
import {NativeSourceVideo} from "../native-preview/NativeSourceVideo";
import { watchMediaRecovery } from "./media-recovery";
import { mediaTime } from "./math";
import { shouldSeekPreview, previewFollowerRate, previewTargetTime } from "./preview-sync";
import { originalMediaSampleUs } from "@/lib/timeline/source-sampling";

/** Export decodes the original, so a picture is captured where the preview proxy's frame came
 * from (timeline/source-sampling.ts). One microsecond early: the capture seek adds it back. */
function renderTarget(kind: "video" | "audio", rendering: boolean | undefined, target: number, sourceEnd: number, fps: number, proxyFps: number | null) {
  if (kind !== "video" || !rendering || proxyFps !== fps) return target;
  return Math.min(sourceEnd - .00001, Math.max(0, originalMediaSampleUs(target, fps, proxyFps) - 1) / 1_000_000);
}
export type MediaProps = {
  sourceTimeSeconds?: number;
  /** Frame rate of the preview proxy this clip was previewed with, or null when there is none. Export matches its frames only at the composition rate. */
  previewProxyFps?: number | null;
  src: string; style?: CSSProperties; playbackRate?: number; volume?: number | ((frame: number) => number);
  muted?: boolean; trimBefore?: number; trimAfter?: number; startFrom?: number; endAt?: number;
  crossOrigin?: "anonymous" | "use-credentials"; title?: string; loop?: boolean; preservePitch?: boolean;
  transparent?: boolean; pauseWhenBuffering?: boolean; acceptableTimeShiftInSeconds?: number;
  useWebAudioApi?: boolean; onError?: (error: Error) => void; onVideoFrame?: (frame: CanvasImageSource) => void;
  /** Source time decreases with timeline time; browsers cannot play media backward. */
  reverse?: boolean;
};
export function Media({ kind, reverse = false, src, style, sourceTimeSeconds, previewProxyFps = null, playbackRate = 1, volume = 1, muted, trimBefore, trimAfter, startFrom, endAt, crossOrigin, title, loop, preservePitch = true, pauseWhenBuffering = false, acceptableTimeShiftInSeconds = 2 / 30, useWebAudioApi, onError }: MediaProps & { kind: "video" | "audio" }) {
  const state = useFrameState(), id = useId();
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const lifecycle = useRef(0);
  const firstFrameReady = useRef(false);
  const sync = useRef({ lastSeekAt: -Infinity, seekVersion: -1, authoredRate: NaN });
  const [metadataRevision, refreshMetadata] = useReducer(x => x + 1, 0);
  const amplifier = useRef<{ source: MediaElementAudioSourceNode; gain: GainNode } | null>(null);
  const trim = (trimBefore ?? startFrom ?? 0) / state.fps;
  let time = sourceTimeSeconds ?? mediaTime(state.frame, state.fps, trimBefore ?? startFrom ?? 0, playbackRate);
  const sourceEnd = Math.min((trimAfter ?? endAt ?? Infinity) / state.fps, ref.current?.duration || Infinity);
  const span = sourceEnd - trim;
  if (loop && Number.isFinite(span) && span > 0) time = trim + Math.max(0, time - trim) % span;
  const outside = time >= sourceEnd || span <= 0;
  const gain = state.frozen || muted || outside ? 0 : Math.max(0, typeof volume === "function" ? volume(state.frame) : volume);
  useLayoutEffect(() => {
    lifecycle.current++;
    firstFrameReady.current = false;
    sync.current = { lastSeekAt: -Infinity, seekVersion: -1, authoredRate: NaN };
    const el = ref.current!;
    el.addEventListener("loadedmetadata", refreshMetadata);
    el.addEventListener("seeked", refreshMetadata);
    const fail = () => { const error = new Error(`Media failed: ${src}: ${el.error?.message}`); state.session.fail(error); onError?.(error); };
    el.addEventListener("error", fail);
    // A Strict Mode cleanup can suspend an unstarted decoder. Restart loading
    // after listeners are installed; metadata resynchronizes the source trim.
    el.load();
    const stopRecovery = state.rendering ? () => {} : watchMediaRecovery(el,
      () => state.session.media.get(id)?.target ?? null,
      () => { sync.current.seekVersion = -1; firstFrameReady.current = false; });
    return () => {
      stopRecovery();
      el.removeEventListener("loadedmetadata", refreshMetadata); el.removeEventListener("seeked", refreshMetadata); el.removeEventListener("error", fail); el.pause(); state.session.media.delete(id);
      const generation = ++lifecycle.current;
      queueMicrotask(() => { if (generation === lifecycle.current) { amplifier.current?.source.disconnect(); amplifier.current?.gain.disconnect(); amplifier.current = null; } });
    };
  }, [id, src, state.session, onError]);
  useLayoutEffect(() => {
    const el = ref.current!;
    state.session.media.set(id, {
      element: el, kind, target: renderTarget(kind, state.rendering, Math.max(trim, Math.min(time, sourceEnd - .00001)), sourceEnd, state.fps, previewProxyFps), active: !state.frozen,
      // A reversed decoder seeks every frame; waiting on each seek would stall the transport.
      pauseWhenBuffering: pauseWhenBuffering && !reverse,
      firstFrameReady: firstFrameReady.current,
      timelineFrame: state.absoluteFrame ?? state.frame,
      sample: !state.frozen && !muted && !outside ? { id: title ?? id, src, time, volume: gain, rate: playbackRate, preservePitch, ...(reverse ? { reverse: true } : {}) } : null,
    });
    if (state.rendering) { el.muted = true; el.pause(); return; }
    const syncPreview = () => {
    // Reverse is shown by seeking the paused decoder to each frame. Its sound comes
    // from a separately prepared reversed preview track, never from this element.
    if (reverse) {
      el.muted = true; el.pause();
      const target = previewTargetTime(time, trim, el.duration);
      if (el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - target) > .5 / state.fps) el.currentTime = target;
      if (kind === "video" && el.readyState >= 2 && !el.seeking) {
        firstFrameReady.current = true;
        const entry = state.session.media.get(id);
        if (entry) entry.firstFrameReady = true;
      }
      return;
    }
    el.muted = state.muted || Boolean(muted) || state.frozen === true || gain === 0;
    const totalGain = gain * state.volume;
    if (useWebAudioApi && !amplifier.current && state.playing && !el.muted && totalGain > 0) {
      const context = state.session.getAudioContext();
      const source = context.createMediaElementSource(el), gainNode = context.createGain();
      source.connect(gainNode); gainNode.connect(context.destination); amplifier.current = { source, gain: gainNode };
    }
    if (amplifier.current) { amplifier.current.gain.gain.value = totalGain; el.volume = 1; if (state.playing) void state.session.getAudioContext().resume(); }
    else el.volume = Math.min(1, totalGain);
    const effectiveRate = playbackRate * state.playbackRate;

    el.preservesPitch = preservePitch && gain > 0;
    const desired = previewTargetTime(time, trim, el.duration);
    const clockOwner = state.session.isPreviewClockOwner(el);
    const follower = (state.transportPlaying ?? state.playing) && !state.frozen && !clockOwner
      && (kind === "audio" || gain === 0);
    const timelineDrift = (desired - el.currentTime) / playbackRate;
    // The integrated source clock remains continuous through rate changes.
    // Resetting seek cooldown at every ramp sample repeatedly restarts decoding.
    // Explicit timeline seeks still bypass cooldown through seekVersion.
    const adjustedRate = previewFollowerRate(effectiveRate, follower ? timelineDrift : 0);
    const rateChanged = sync.current.authoredRate !== effectiveRate;
    sync.current.authoredRate = effectiveRate;
    if (el.playbackRate !== adjustedRate) el.playbackRate = adjustedRate;
    const now = performance.now(), seekVersion = state.seekVersion ?? 0;
    // Let a ramp's changing target converge by rate, while steady sections
    // retain a tighter picture/audio sync without seeking on every frame.
    if (shouldSeekPreview({ currentTime: el.currentTime, target: desired, rate: playbackRate,
      tolerance: follower ? Math.max(kind === "audio" || rateChanged ? .25 : .1, acceptableTimeShiftInSeconds) : acceptableTimeShiftInSeconds, playing: (state.transportPlaying ?? state.playing) && !state.frozen, ready: el.readyState >= 1,
      seeking: el.seeking, explicitSeek: sync.current.seekVersion !== seekVersion,
      clockOwner,
      now, lastSeekAt: sync.current.lastSeekAt })) {
      el.currentTime = desired;
      sync.current.lastSeekAt = now;
      sync.current.seekVersion = seekVersion;
    }
    if (el.readyState >= 1 && !el.seeking) sync.current.seekVersion = seekVersion;
    if (kind === "video" && el.readyState >= 2 && !el.seeking) {
      firstFrameReady.current = true;
      const entry = state.session.media.get(id);
      if (entry) entry.firstFrameReady = true;
    }
    if (state.playing && !outside) {
      if (el.paused && !el.ended) void el.play().catch(error => { if (error?.name !== "AbortError") state.session.fail(error); });
    } else el.pause();
    };
    state.session.media.get(id)!.syncPreview = syncPreview;
    syncPreview();
  }, [metadataRevision, state, id, src, time, gain, playbackRate, muted, trim, sourceEnd, outside, kind, pauseWhenBuffering, useWebAudioApi, preservePitch, acceptableTimeShiftInSeconds, reverse]);
  const Tag = kind;
  return <Tag data-preview-premounted={state.premounted ? "true" : undefined} ref={ref} src={src} style={style} crossOrigin={crossOrigin} title={title} preload={state.rendering && kind === "audio" ? "metadata" : "auto"} playsInline />;
}
export const Video = (props: MediaProps) => {const native=useNativeSources();return native?<NativeSourceVideo {...props}/>:<Media {...props} kind="video" />;};
export const Audio = (props: MediaProps) => <Media {...props} kind="audio" />;
