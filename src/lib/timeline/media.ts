import {
  readVideoClipTimingMetadata,
  writeVideoClipTimingMetadata,
} from "@/lib/timeline/video-clip-metadata";
import { minTimelineDurationSeconds } from "@/lib/timeline/frame-quantization";
import {
  resolveSpeedStepSegments,
  speedStepDuration,
  timelineTimeToSourceTime,
} from "@/lib/timeline/speed-steps";

export const PLAYBACK_RATE_SUPPORTED_TYPES = new Set([
  "video_clip",
  "vo_segment",
  "vo_full",
  "music",
  "sound_effect",
]);

export const WAVEFORM_SUPPORTED_TYPES = new Set([
  "video_clip",
  "music",
  "vo_segment",
  "vo_full",
  "sound_effect",
]);

type MediaTimingLike = {
  timeline_start?: number;
  type: string;
  duration: number;
  trim_start: number;
  trim_end: number | null;
  playback_rate: number;
  props?: Record<string, unknown> | null;
  _source_duration?: number;
};

export type ResolvedMediaTiming = {
  timelineStart: number;
  timelineDuration: number;
  trimStart: number;
  trimEnd: number | null;
  playbackRate: number;
  sourceDuration: number | null;
  sourcePlayableDuration: number | null;
  leadingHoldDuration: number;
  maxPlayableTimelineDuration: number;
  visiblePlayableTimelineDuration: number;
  trailingHoldDuration: number;
  visibleSourceDuration: number;
};

export function supportsPlaybackRate(type: string): boolean {
  return PLAYBACK_RATE_SUPPORTED_TYPES.has(type);
}

export function supportsOverflowHold(type: string): boolean {
  return type === "video_clip";
}

export function getNumericMediaProp(
  media: Pick<MediaTimingLike, "props">,
  key: string,
): number | null {
  const value = media.props?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getSourceDurationSeconds(media: MediaTimingLike): number | null {
  if (typeof media._source_duration === "number" && Number.isFinite(media._source_duration) && media._source_duration > 0) {
    return media._source_duration;
  }
  return readVideoClipTimingMetadata(media.props).sourceDurationSeconds;
}

export function getLeadingHoldDurationSeconds(media: Pick<MediaTimingLike, "props">): number {
  return readVideoClipTimingMetadata(media.props).leadingHoldDurationSeconds;
}

function computeMaxPlayableTimelineDuration(media: MediaTimingLike): {
  playbackRate: number;
  sourceDuration: number | null;
  sourcePlayableDuration: number | null;
  maxPlayableTimelineDuration: number;
} {
  const playbackRate = media.playback_rate > 0 ? media.playback_rate : 1;
  const sourceDuration = getSourceDurationSeconds(media);
  if (sourceDuration != null) {
    const playableSourceDuration = Math.max(0, sourceDuration - media.trim_start - (media.trim_end ?? 0));
    const speedSegments = resolveSpeedStepSegments(media);
    return {
      playbackRate,
      sourceDuration,
      sourcePlayableDuration: Number(Math.max(0, playableSourceDuration).toFixed(3)),
      maxPlayableTimelineDuration: Number(Math.max(
        0,
        speedSegments.length ? speedStepDuration(media) : playableSourceDuration / playbackRate,
      ).toFixed(3)),
    };
  }

  const explicitLimit = readVideoClipTimingMetadata(media.props).playableWindowDurationSeconds;
  if (explicitLimit != null) {
    return {
      playbackRate,
      sourceDuration: null,
      sourcePlayableDuration: null,
      maxPlayableTimelineDuration: Number(Math.max(0, explicitLimit).toFixed(3)),
    };
  }

  if (media.trim_end != null) {
    return {
      playbackRate,
      sourceDuration: null,
      sourcePlayableDuration: null,
      maxPlayableTimelineDuration: Number(Math.max(minTimelineDurationSeconds(), media.duration + media.trim_end / playbackRate).toFixed(3)),
    };
  }

  return {
    playbackRate,
    sourceDuration: null,
    sourcePlayableDuration: null,
    maxPlayableTimelineDuration: Number(Math.max(minTimelineDurationSeconds(), media.duration).toFixed(3)),
  };
}

export function resolveMediaTiming(media: MediaTimingLike): ResolvedMediaTiming {
  const timelineStart = media.timeline_start ?? 0;
  const timelineDuration = media.duration;
  const trimStart = media.trim_start;
  const trimEnd = media.trim_end ?? null;
  const leadingHoldDuration = supportsOverflowHold(media.type)
    ? getLeadingHoldDurationSeconds(media)
    : 0;
  const {
    playbackRate,
    sourceDuration,
    sourcePlayableDuration,
    maxPlayableTimelineDuration,
  } = computeMaxPlayableTimelineDuration(media);
  const visiblePlayableTimelineDuration = Number(
    Math.min(
      Math.max(0, timelineDuration - leadingHoldDuration),
      maxPlayableTimelineDuration,
    ).toFixed(3),
  );
  const trailingHoldDuration = Number(
    Math.max(0, timelineDuration - leadingHoldDuration - visiblePlayableTimelineDuration).toFixed(3),
  );
  const speedSegments = resolveSpeedStepSegments(media);
  const visibleSourceDuration = Number(Math.max(
    0,
    speedSegments.length && !speedSegments[0]!.reverse
      ? timelineTimeToSourceTime(media, visiblePlayableTimelineDuration) - trimStart
      : visiblePlayableTimelineDuration * playbackRate,
  ).toFixed(3));

  return {
    timelineStart,
    timelineDuration,
    trimStart,
    trimEnd,
    playbackRate,
    sourceDuration,
    sourcePlayableDuration,
    leadingHoldDuration,
    maxPlayableTimelineDuration,
    visiblePlayableTimelineDuration,
    trailingHoldDuration,
    visibleSourceDuration,
  };
}

export function getVideoHoldSegments(media: MediaTimingLike) {
  const timing = resolveMediaTiming(media);
  return {
    leadingHoldDuration: timing.leadingHoldDuration,
    playableDuration: timing.maxPlayableTimelineDuration,
    visiblePlayableDuration: timing.visiblePlayableTimelineDuration,
    trailingHoldDuration: timing.trailingHoldDuration,
  };
}

export function getMaxPlayableTimelineDuration(media: MediaTimingLike): number {
  return resolveMediaTiming(media).maxPlayableTimelineDuration;
}

/**
 * Maximum right-edge duration available from the current source in-point.
 *
 * `maxPlayableTimelineDuration` describes the clip's currently untrimmed
 * window and therefore subtracts `trim_end`. Resize needs the larger,
 * non-destructive source capacity so a clip that was shortened can consume
 * that tail trim again.
 */
export function getMaxExtendableTimelineDuration(media: MediaTimingLike): number {
  const playbackRate = media.playback_rate > 0 ? media.playback_rate : 1;
  const sourceDuration = getSourceDurationSeconds(media);
  if (sourceDuration != null) {
    if (resolveSpeedStepSegments(media).length) {
      return Number(speedStepDuration({ ...media, trim_end: 0 }).toFixed(3));
    }
    return Number(
      Math.max(0, (sourceDuration - media.trim_start) / playbackRate).toFixed(3),
    );
  }

  if (media.trim_end != null) {
    return Number(
      Math.max(
        minTimelineDurationSeconds(),
        media.duration + media.trim_end / playbackRate,
      ).toFixed(3),
    );
  }

  return resolveMediaTiming(media).maxPlayableTimelineDuration;
}

export function derivePlaybackRateVideoProps(
  media: MediaTimingLike,
  nextPlaybackRate: number,
  options?: { minDuration?: number },
): Record<string, unknown> | null {
  if (!supportsOverflowHold(media.type)) {
    return null;
  }

  const minDuration = options?.minDuration ?? minTimelineDurationSeconds();
  const timing = resolveMediaTiming(media);
  return writeVideoClipTimingMetadata(media.props, {
    sourceDurationSeconds: timing.sourceDuration,
    playableWindowDurationSeconds: Number(
      Math.max(
        minDuration,
        timing.sourceDuration != null
          ? (timing.sourcePlayableDuration ?? 0) / nextPlaybackRate
          : timing.maxPlayableTimelineDuration * (timing.playbackRate / nextPlaybackRate),
      ).toFixed(3),
    ),
    leadingHoldDurationSeconds: timing.leadingHoldDuration,
  });
}

export function computePlaybackRateTimelineDuration(
  media: MediaTimingLike,
  nextPlaybackRate: number,
  options?: { minDuration?: number },
): number {
  const minDuration = options?.minDuration ?? minTimelineDurationSeconds();
  const timing = resolveMediaTiming(media);
  const currentPlaybackRate = timing.playbackRate > 0 ? timing.playbackRate : 1;
  const nextBaseDuration = Number(
    Math.max(
      minDuration,
      timing.leadingHoldDuration + timing.visiblePlayableTimelineDuration * (currentPlaybackRate / nextPlaybackRate),
    ).toFixed(3),
  );

  if (supportsOverflowHold(media.type) && timing.trailingHoldDuration > 0.001) {
    return Number(Math.max(media.duration, nextBaseDuration).toFixed(3));
  }

  return nextBaseDuration;
}

export function computeCoupledDuration(input: {
  duration: number;
  oldPlaybackRate: number;
  newPlaybackRate: number;
  minDuration?: number;
}): number {
  const minDuration = input.minDuration ?? minTimelineDurationSeconds();
  if (input.oldPlaybackRate <= 0 || input.newPlaybackRate <= 0) {
    return Number(Math.max(minDuration, input.duration).toFixed(3));
  }
  const next = input.duration * (input.oldPlaybackRate / input.newPlaybackRate);
  return Number(Math.max(minDuration, next).toFixed(3));
}
