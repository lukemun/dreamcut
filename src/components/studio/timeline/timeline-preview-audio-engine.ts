"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

import {resolveMediaTiming} from "@/lib/timeline/media";
import { watchMediaRecovery } from "@/lib/frame-runtime/media-recovery";
import { shouldSeekPreview } from "@/lib/frame-runtime/preview-sync";
import type { PlayerRef } from "@/lib/frame-runtime/player";

import type { CompositionElement } from "@/lib/render/composition-adapters";
import { PitchShiftRoute } from "@/lib/frame-runtime/pitch-shift-worklet";
import { readPitchSemitones } from "@/lib/timeline/audio-pitch";
import { readPreviewAudioGain } from "@/lib/remotion/preview-audio-gain-store";
import { reversedPreviewAudioTime } from "@/lib/remotion/video-preview-audio";
import { resolveSpeedStepSegments, speedStepFrame, timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";
import {
  interpolateEnvelopeVolume,
  readVolumeEnvelopePoints,
  retargetVolumeEnvelope,
} from "@/lib/timeline/volume-envelope";

const ACTIVE_EPSILON_SECONDS = 1 / 120;
const DRIFT_CORRECTION_SECONDS = 0.12;

export type PreviewAudioElement = CompositionElement;

export function isEditorMixedAudioElement(
  element: PreviewAudioElement,
): boolean {
  return (
    !!element.source_url
    && (
      element.lane_key.startsWith("audio_")
      || element.lane_key.startsWith("music_")
      || element.lane_key.startsWith("sound_effect_")
    )
  );
}

export type PreviewAudioPlaybackState = {
  active: boolean;
  sourceTimeSeconds: number;
  gain: number;
  playbackRate: number;
};

export function resolvePreviewAudioPlaybackState(
  element: PreviewAudioElement,
  timelineSeconds: number,
): PreviewAudioPlaybackState {
  const clipTimeSeconds = timelineSeconds - element.timeline_start;
  let active = (
    clipTimeSeconds >= -ACTIVE_EPSILON_SECONDS
    && clipTimeSeconds < element.duration - ACTIVE_EPSILON_SECONDS
  );
  const boundedClipTime = Math.max(0, Math.min(element.duration, clipTimeSeconds));
  const nativeVideo=element.props?._native_video_audio===true;
  const timing=nativeVideo?resolveMediaTiming(element):null;
  if(timing)active=active&&clipTimeSeconds>=timing.leadingHoldDuration-ACTIVE_EPSILON_SECONDS&&clipTimeSeconds<timing.leadingHoldDuration+timing.maxPlayableTimelineDuration-ACTIVE_EPSILON_SECONDS;
  const sourceClipTime=timing?Math.max(0,boundedClipTime-timing.leadingHoldDuration):boundedClipTime;
  const segments = resolveSpeedStepSegments(element);
  const mapped = segments.length ? speedStepFrame(segments, Math.round(sourceClipTime * currentFrameRate()), currentFrameRate())
    : {playbackRate: element.playback_rate, sourceTimeSeconds: timelineTimeToSourceTime(element, sourceClipTime)};
  const playbackRate = mapped.playbackRate;
  // A reversed video clip plays its prepared backward track forward.
  const reversedTime = nativeVideo && element.props?.playback_reverse === true ? reversedPreviewAudioTime(element, mapped.sourceTimeSeconds) : null;
  const previewGain = readPreviewAudioGain(element.id);
  const storedEnvelope = readVolumeEnvelopePoints(element, element.duration);
  const envelope = previewGain == null
    ? storedEnvelope
    : retargetVolumeEnvelope(storedEnvelope, previewGain);
  let gain = interpolateEnvelopeVolume(envelope, boundedClipTime);

  if (element.fade_in > 0 && !element.transition_in) {
    gain *= Math.min(1, boundedClipTime / element.fade_in);
  }
  if (element.fade_out > 0 && !element.transition_out) {
    gain *= Math.min(1, Math.max(0, element.duration - boundedClipTime) / element.fade_out);
  }
  if (element.transition_out) {
    const transitionDuration = Math.max(
      0.001,
      element.transition_out.params?.audio_fade_duration_seconds
        ?? element.transition_out.duration_seconds,
    );
    const fadeStart = Math.max(0, element.duration - transitionDuration);
    if (boundedClipTime > fadeStart) {
      gain *= Math.max(0, (element.duration - boundedClipTime) / transitionDuration);
    }
  }

  const baked=nativeVideo?Number(element.props?._native_preview_audio_baked_gain??1):1;
  if(Number.isFinite(baked)&&baked>0)gain/=baked;
  return {
    active,
    sourceTimeSeconds: Math.max(0, reversedTime ?? mapped.sourceTimeSeconds),
    gain: Math.max(0, Math.min(4, gain)),
    playbackRate,
  };
}

export function shouldCorrectPreviewAudioDrift(
  currentTimeSeconds: number,
  desiredTimeSeconds: number,
): boolean {
  return (
    !Number.isFinite(currentTimeSeconds)
    || Math.abs(currentTimeSeconds - desiredTimeSeconds) > DRIFT_CORRECTION_SECONDS
  );
}

type AudioChannel = {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  pitch: PitchShiftRoute;
  element: PreviewAudioElement;
  lastSeekAt: number;
  pendingSeek: boolean;
  stopRecovery: () => void;
};

type MediaElementSourceOwner = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
};

export class TimelinePreviewAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private channels = new Map<string, AudioChannel>();
  private mediaElementSources = new WeakMap<HTMLAudioElement, MediaElementSourceOwner>();
  private playing = false;
  private transportPlaying = false;
  private timelineSeconds = 0;
  private transportRate = 1;
  private playerVolume = 1;
  private muted = false;

  private ensureContext() {
    if (this.context) return this.context;
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    this.context = new AudioContextConstructor();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.updateMasterGain();
    return this.context;
  }

  register(element: PreviewAudioElement, audio: HTMLAudioElement) {
    this.unregister(element.id);
    const context = this.ensureContext();
    if (!context || !this.masterGain) return;
    const existingOwner = this.mediaElementSources.get(audio);
    if (existingOwner && existingOwner.context !== context) {
      throw new Error("Timeline preview audio element cannot move between AudioContexts.");
    }
    const source = existingOwner?.source ?? context.createMediaElementSource(audio);
    if (!existingOwner) {
      this.mediaElementSources.set(audio, { context, source });
    }
    const gain = context.createGain();
    const pitch = new PitchShiftRoute(context, source, gain);
    gain.connect(this.masterGain);
    audio.preload = "none";
    audio.crossOrigin = "anonymous";
    const channel: AudioChannel = { audio, source, gain, pitch, element, lastSeekAt: -Infinity, pendingSeek: false, stopRecovery: () => {} };
    channel.stopRecovery = watchMediaRecovery(audio, () => {
      const warm = this.timelineSeconds >= channel.element.timeline_start - 2
        && this.timelineSeconds < channel.element.timeline_start + channel.element.duration;
      return warm ? resolvePreviewAudioPlaybackState(channel.element, this.timelineSeconds).sourceTimeSeconds : null;
    }, () => { channel.pendingSeek = true; });
    this.channels.set(element.id, channel);
    this.syncChannel(channel, true);
  }

  /**
   * Restart a registered channel's load after its element remounts (Strict Mode cleanup pauses it).
   * Only warm channels load: Chrome fetches on an explicit load() even with preload="none", so
   * reloading every channel would download the whole project's audio at once.
   */
  restartLoad(elementId: string) {
    const channel = this.channels.get(elementId);
    if (channel && channel.audio.preload !== "none") channel.audio.load();
  }

  settleSeek(elementId: string) {
    const channel = this.channels.get(elementId);
    if (channel?.pendingSeek) this.syncChannel(channel, false);
  }

  updateElement(element: PreviewAudioElement) {
    const channel = this.channels.get(element.id);
    if (!channel) return;
    channel.element = element;
    this.syncChannel(channel, true);
  }

  retryPendingChannels() {
    for (const { audio } of this.channels.values()) {
      // A retry is a load request, never a second playback authority. Healthy
      // channels and anything already playing keep their decoder and clock.
      if (audio.paused && (audio.error != null || audio.readyState < 3)) {
        audio.load();
      }
    }
  }

  unregister(elementId: string) {
    const channel = this.channels.get(elementId);
    if (!channel) return;
    channel.stopRecovery();
    channel.audio.pause();
    channel.pitch.dispose();
    channel.source.disconnect();
    channel.gain.disconnect();
    this.channels.delete(elementId);
  }

  attachPlayer(player: PlayerRef) {
    player.setPreviewClock?.(() => {
      if (!this.playing) return null;
      for (const channel of this.channels.values()) {
        const state = resolvePreviewAudioPlaybackState(channel.element, this.timelineSeconds);
        if (!state.active || state.gain <= 0 || channel.element.type === "sound_effect"
          || channel.audio.readyState < 3 || channel.audio.seeking || channel.audio.ended || channel.audio.paused) continue;
        return (this.timelineSeconds + (channel.audio.currentTime - state.sourceTimeSeconds) / state.playbackRate) * currentFrameRate();
      }
      return null;
    }, () => [...this.channels.values()].some(channel => {
      const state = resolvePreviewAudioPlaybackState(channel.element, this.timelineSeconds);
      return state.active && state.gain > 0 && channel.element.type !== "sound_effect"
        && !channel.audio.ended && (channel.audio.readyState < 3 || channel.audio.seeking);
    }));
    this.playerVolume = player.getVolume();
    this.muted = player.isMuted();
    // A player can start at the viewer's chosen speed before this attaches; begin in step with it.
    this.transportRate = Math.max(0.01, player.getPlaybackRate());
    this.timelineSeconds = player.getCurrentFrame() / currentFrameRate();
    this.playing = player.isPlaying();
    this.transportPlaying = this.playing;
    this.updateMasterGain();
    if (this.playing) void this.context?.resume();

    const onPlay = () => {
      this.transportPlaying = true;
      this.playing = true;
      this.timelineSeconds = player.getCurrentFrame() / currentFrameRate();
      void this.context?.resume();
      this.syncAll(true);
    };
    const onPause = () => {
      this.transportPlaying = false;
      this.playing = false;
      this.timelineSeconds = player.getCurrentFrame() / currentFrameRate();
      this.pauseAll();
      this.syncAll(true);
    };
    const onWaiting = () => { this.playing = false; this.pauseAll(); };
    const onResume = () => {
      if (!player.isPlaying()) return;
      this.playing = true;
      this.timelineSeconds = player.getCurrentFrame() / currentFrameRate();
      this.syncAll(false);
    };
    const onEnded = () => {
      this.transportPlaying = false;
      this.playing = false;
      this.pauseAll();
    };
    const onFrameUpdate = (event: { detail: { frame: number } }) => {
      this.timelineSeconds = event.detail.frame / currentFrameRate();
      this.syncAll(false);
    };
    const onSeeked = (event: { detail: { frame: number } }) => {
      this.timelineSeconds = event.detail.frame / currentFrameRate();
      this.syncAll(true);
    };
    const onRateChange = (event: { detail: { playbackRate: number } }) => {
      this.transportRate = Math.max(0.01, event.detail.playbackRate);
      this.syncAll(true);
    };
    const onVolumeChange = (event: { detail: { volume: number } }) => {
      this.playerVolume = Math.max(0, Math.min(1, event.detail.volume));
      this.updateMasterGain();
    };
    const onMuteChange = (event: { detail: { isMuted: boolean } }) => {
      this.muted = event.detail.isMuted;
      this.updateMasterGain();
    };

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("waiting", onWaiting);
    player.addEventListener("resume", onResume);
    player.addEventListener("ended", onEnded);
    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("seeked", onSeeked);
    player.addEventListener("ratechange", onRateChange);
    player.addEventListener("volumechange", onVolumeChange);
    player.addEventListener("mutechange", onMuteChange);
    this.syncAll(true);

    return () => {
      player.setPreviewClock?.(null);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("waiting", onWaiting);
      player.removeEventListener("resume", onResume);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("seeked", onSeeked);
      player.removeEventListener("ratechange", onRateChange);
      player.removeEventListener("volumechange", onVolumeChange);
      player.removeEventListener("mutechange", onMuteChange);
      this.transportPlaying = false;
      this.playing = false;
      this.pauseAll();
    };
  }

  dispose() {
    for (const elementId of [...this.channels.keys()]) this.unregister(elementId);
    this.masterGain?.disconnect();
    void this.context?.close();
    this.context = null;
    this.masterGain = null;
  }

  private updateMasterGain() {
    if (!this.masterGain) return;
    this.masterGain.gain.value = this.muted ? 0 : this.playerVolume;
  }

  private pauseAll() {
    for (const channel of this.channels.values()) channel.audio.pause();
  }

  private syncAll(forceSeek: boolean) {
    for (const channel of this.channels.values()) this.syncChannel(channel, forceSeek);
  }

  private syncChannel(channel: AudioChannel, forceSeek: boolean) {
    const state = resolvePreviewAudioPlaybackState(
      channel.element,
      this.timelineSeconds,
    );
    // Prepare the current beat and its immediate neighbours, not every audio
    // decoder in the entire project at refresh. Keep each node/source stable.
    const shouldWarm = this.timelineSeconds >= channel.element.timeline_start - 2
      && this.timelineSeconds < channel.element.timeline_start + channel.element.duration;
    if (shouldWarm && channel.audio.preload !== "auto") {
      channel.audio.preload = "auto";
      channel.audio.load();
    }
    channel.gain.gain.value = state.gain;
    channel.pitch.set(readPitchSemitones(channel.element.props));
    const rate = state.playbackRate * this.transportRate;
    if (channel.audio.playbackRate !== rate) channel.audio.playbackRate = rate;

    if (!shouldWarm) {
      if (!channel.audio.paused) channel.audio.pause();
      return;
    }

    channel.pendingSeek ||= forceSeek;
    if (shouldSeekPreview({
      currentTime: channel.audio.currentTime, target: state.sourceTimeSeconds,
      rate: state.playbackRate, tolerance: DRIFT_CORRECTION_SECONDS, playing: this.transportPlaying && state.active,
      seeking: channel.audio.seeking, ready: channel.audio.readyState >= 1,
      explicitSeek: channel.pendingSeek, now: performance.now(), lastSeekAt: channel.lastSeekAt,
    })) {
      try {
        channel.audio.currentTime = state.sourceTimeSeconds;
        channel.lastSeekAt = performance.now();
        channel.pendingSeek = false;
      } catch {
        // Metadata may not be available yet. loadedmetadata calls sync again.
      }
    } else if (!channel.audio.seeking && channel.audio.readyState >= 1) {
      channel.pendingSeek = false;
    }

    // Upcoming audio warms at its real source trim while paused. Do not wait
    // until its entrance to seek/decode that first audible sample.
    if (!state.active) {
      if (!channel.audio.paused) channel.audio.pause();
      return;
    }

    if (this.playing && channel.audio.paused && !channel.audio.ended) {
      void channel.audio.play().catch(() => {
        // A later frame retries after the Player interaction unlocks media.
      });
    } else if (!this.playing && !channel.audio.paused) {
      channel.audio.pause();
    }
  }
}
