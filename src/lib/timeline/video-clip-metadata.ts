import { stripStillVideoWrapperMetadata } from "@/lib/timeline/visual-asset-metadata";

type PropsLike = Record<string, unknown> | null | undefined;

export type VideoClipTimingMetadata = {
  sourceDurationSeconds: number | null;
  playableWindowDurationSeconds: number | null;
  leadingHoldDurationSeconds: number;
};

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readVideoClipTimingMetadata(props: PropsLike): VideoClipTimingMetadata {
  const sourceDurationSeconds = readFiniteNumber(props?.source_duration_seconds);
  const playableWindowDurationSeconds = readFiniteNumber(props?.media_limit_duration_seconds);
  const leadingHoldDurationSeconds = Math.max(0, readFiniteNumber(props?.leading_hold_duration_seconds) ?? 0);

  return {
    sourceDurationSeconds: sourceDurationSeconds != null && sourceDurationSeconds > 0 ? sourceDurationSeconds : null,
    playableWindowDurationSeconds:
      playableWindowDurationSeconds != null && playableWindowDurationSeconds >= 0
        ? playableWindowDurationSeconds
        : null,
    leadingHoldDurationSeconds,
  };
}

export function writeVideoClipTimingMetadata(
  props: PropsLike,
  metadata: Partial<VideoClipTimingMetadata>,
): Record<string, unknown> {
  const nextProps: Record<string, unknown> = { ...stripStillVideoWrapperMetadata(props) };

  if ("sourceDurationSeconds" in metadata) {
    if (typeof metadata.sourceDurationSeconds === "number" && Number.isFinite(metadata.sourceDurationSeconds) && metadata.sourceDurationSeconds > 0) {
      nextProps.source_duration_seconds = metadata.sourceDurationSeconds;
    } else {
      delete nextProps.source_duration_seconds;
    }
  }

  if ("playableWindowDurationSeconds" in metadata) {
    if (
      typeof metadata.playableWindowDurationSeconds === "number"
      && Number.isFinite(metadata.playableWindowDurationSeconds)
      && metadata.playableWindowDurationSeconds >= 0
    ) {
      nextProps.media_limit_duration_seconds = metadata.playableWindowDurationSeconds;
    } else {
      delete nextProps.media_limit_duration_seconds;
    }
  }

  if ("leadingHoldDurationSeconds" in metadata) {
    if (
      typeof metadata.leadingHoldDurationSeconds === "number"
      && Number.isFinite(metadata.leadingHoldDurationSeconds)
      && metadata.leadingHoldDurationSeconds > 0
    ) {
      nextProps.leading_hold_duration_seconds = metadata.leadingHoldDurationSeconds;
    } else {
      delete nextProps.leading_hold_duration_seconds;
    }
  }

  return nextProps;
}

export function stripVideoClipTimingMetadata(props: PropsLike): Record<string, unknown> {
  const {
    source_duration_seconds: _sourceDurationSeconds,
    media_limit_duration_seconds: _playableWindowDurationSeconds,
    leading_hold_duration_seconds: _leadingHoldDurationSeconds,
    ...restProps
  } = props ?? {};

  return restProps;
}
