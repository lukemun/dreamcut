import { readKeyframeMap, writeKeyframeMap, type KeyframePoint } from "@/lib/timeline/keyframes";

export const SPEED_KEYFRAME_FIELD = "playback_rate";
export const MIN_SPEED_RATE = 0.25;
export const MAX_SPEED_RATE = 4;
/** Boolean clip prop: play the used source window from its end back to its start. */
export const PLAYBACK_REVERSE_PROP = "playback_reverse";

type SpeedMediaLike = {
  duration: number;
  trim_start?: number | null;
  trim_end?: number | null;
  playback_rate?: number | null;
  props?: Record<string, unknown> | null;
  _source_duration?: number;
};

export type SpeedStepSegment = {
  index: number;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
  playbackRate: number;
  /** Source time runs from sourceEnd back to sourceStart across this segment. */
  reverse?: boolean;
};

const EPS = 0.0005;
const round = (value: number) => Number(value.toFixed(6));
const clampRate = (value: number) => Math.min(MAX_SPEED_RATE, Math.max(MIN_SPEED_RATE, value));

function sourceDuration(media: SpeedMediaLike) {
  const value = typeof media._source_duration === "number"
    ? media._source_duration
    : media.props?.source_duration_seconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function isPlaybackReversed(media: Pick<SpeedMediaLike, "props">) {
  return media.props?.[PLAYBACK_REVERSE_PROP] === true;
}

export function getSpeedSourceWindow(media: SpeedMediaLike) {
  const start = Math.max(0, media.trim_start || 0);
  const duration = sourceDuration(media);
  const end = duration == null ? null : Math.max(start, duration - Math.max(0, media.trim_end ?? 0));
  return { start, end };
}

function authoredPoints(media: SpeedMediaLike) {
  const { start, end } = getSpeedSourceWindow(media);
  if (end == null) return [];
  return (readKeyframeMap(media.props)[SPEED_KEYFRAME_FIELD] ?? [])
    .filter((point): point is KeyframePoint<number> => (
      typeof point.v === "number"
      && typeof point.source_t === "number"
      && point.source_t > start + EPS
      && point.source_t < end - EPS
    ))
    .sort((left, right) => left.source_t! - right.source_t!);
}

export function resolveSpeedStepSegments(media: SpeedMediaLike): SpeedStepSegment[] {
  const { start, end } = getSpeedSourceWindow(media);
  if (end == null || end <= start + EPS) return [];
  // A reversed clip plays at one constant speed; speed steps do not apply to it.
  if (isPlaybackReversed(media)) {
    const rate = clampRate(media.playback_rate || 1);
    return [{ index: 0, sourceStart: round(start), sourceEnd: round(end), timelineStart: 0, timelineEnd: round((end - start) / rate), playbackRate: rate, reverse: true }];
  }
  const points = authoredPoints(media);
  const boundaries = [start, ...points.map((point) => point.source_t!), end];
  const rates = [clampRate(media.playback_rate || 1), ...points.map((point) => clampRate(point.v))];
  let timelineCursor = 0;
  return rates.map((rate, index) => {
    const sourceStart = boundaries[index]!;
    const sourceEnd = boundaries[index + 1]!;
    const timelineStart = timelineCursor;
    timelineCursor += (sourceEnd - sourceStart) / rate;
    return {
      index,
      sourceStart: round(sourceStart),
      sourceEnd: round(sourceEnd),
      timelineStart: round(timelineStart),
      timelineEnd: round(timelineCursor),
      playbackRate: rate,
    };
  });
}

export function speedStepDuration(media: SpeedMediaLike) {
  const segments = resolveSpeedStepSegments(media);
  return segments.length ? segments.at(-1)!.timelineEnd : media.duration;
}

export function speedAtTimelineTime(media: SpeedMediaLike, localSeconds: number) {
  const segments = resolveSpeedStepSegments(media);
  if (!segments.length) return clampRate(media.playback_rate || 1);
  const time = Math.max(0, localSeconds);
  return (segments.find((segment) => time < segment.timelineEnd - EPS) ?? segments.at(-1)!).playbackRate;
}

/** Source window end for a reversed clip, including legacy clips without source metadata. */
function reversedWindow(media: SpeedMediaLike) {
  const { start, end } = getSpeedSourceWindow(media);
  return { start, end: end ?? start + Math.max(0, media.duration) * (media.playback_rate || 1), rate: media.playback_rate || 1 };
}

export function timelineTimeToSourceTime(media: SpeedMediaLike, localSeconds: number) {
  if (isPlaybackReversed(media)) {
    const { start, end, rate } = reversedWindow(media);
    return Math.min(end, Math.max(start, end - Math.max(0, localSeconds) * rate));
  }
  const segments = resolveSpeedStepSegments(media);
  if (!segments.length) return Math.max(0, (media.trim_start ?? 0) + localSeconds * (media.playback_rate || 1));
  const segment = segments.find((candidate) => localSeconds < candidate.timelineEnd - EPS) ?? segments.at(-1)!;
  return Math.min(segment.sourceEnd, Math.max(segment.sourceStart,
    segment.sourceStart + (localSeconds - segment.timelineStart) * segment.playbackRate));
}

export function sourceTimeToTimelineTime(media: SpeedMediaLike, absoluteSourceSeconds: number) {
  if (isPlaybackReversed(media)) {
    const { end, rate } = reversedWindow(media);
    return Math.max(0, (end - absoluteSourceSeconds) / rate);
  }
  const segments = resolveSpeedStepSegments(media);
  if (!segments.length) return Math.max(0, (absoluteSourceSeconds - (media.trim_start ?? 0)) / (media.playback_rate || 1));
  const segment = segments.find((candidate) => absoluteSourceSeconds < candidate.sourceEnd - EPS) ?? segments.at(-1)!;
  return Math.max(0, segment.timelineStart + (absoluteSourceSeconds - segment.sourceStart) / segment.playbackRate);
}

function canonicalProps(media: SpeedMediaLike, rawPoints: KeyframePoint<number>[]) {
  const map = readKeyframeMap(media.props);
  if (!rawPoints.length) {
    delete map[SPEED_KEYFRAME_FIELD];
    return writeKeyframeMap(media.props, map);
  }
  const provisional = writeKeyframeMap(media.props, {
    ...map,
    [SPEED_KEYFRAME_FIELD]: rawPoints.map((point) => ({ ...point, ease: "hold" as const })),
  });
  const projected = { ...media, props: provisional };
  const points = authoredPoints(projected).map((point) => ({
    ...point,
    t: round(sourceTimeToTimelineTime(projected, point.source_t!)),
    ease: "hold" as const,
  }));
  return writeKeyframeMap(provisional, { ...readKeyframeMap(provisional), [SPEED_KEYFRAME_FIELD]: points });
}

export function toggleSpeedStepAtTime(media: SpeedMediaLike, localSeconds: number) {
  const points = authoredPoints(media);
  const existing = points.find((point) => Math.abs(point.t - localSeconds) <= EPS);
  const next = existing
    ? points.filter((point) => point !== existing)
    : [...points, {
      t: localSeconds,
      source_t: timelineTimeToSourceTime(media, localSeconds),
      v: speedAtTimelineTime(media, localSeconds),
      ease: "hold" as const,
    }];
  const props = canonicalProps(media, next);
  const projected = { ...media, props };
  return { props, duration: round(speedStepDuration(projected)) };
}

export function setSpeedAtTime(media: SpeedMediaLike, localSeconds: number, nextRate: number) {
  const rate = clampRate(nextRate);
  const points = authoredPoints(media);
  const exact = points.find((point) => Math.abs(point.t - localSeconds) <= EPS);
  const activeIndex = exact ? points.indexOf(exact) : points.findLastIndex((point) => point.t < localSeconds);
  if (activeIndex < 0) {
    const projected = { ...media, playback_rate: rate };
    const props = canonicalProps(projected, points);
    return { playbackRate: rate, props, duration: round(speedStepDuration({ ...projected, props })) };
  }
  const nextPoints = points.map((point, index) => index === activeIndex ? { ...point, v: rate } : point);
  const props = canonicalProps(media, nextPoints);
  return { playbackRate: media.playback_rate, props, duration: round(speedStepDuration({ ...media, props })) };
}

export function retimeSpeedStep(media: SpeedMediaLike, fromTime: number, toTime: number, fps = 30) {
  const points = authoredPoints(media);
  const index = points.findIndex((point) => Math.abs(point.t - fromTime) <= EPS);
  if (index < 0) return null;
  const segments = resolveSpeedStepSegments(media);
  const previous = segments[index]!;
  const nextBoundary = points[index + 1]?.source_t ?? segments.at(-1)!.sourceEnd;
  const sourceFrame = 1 / Math.max(1, fps);
  const targetTime = Math.max(previous.timelineStart + sourceFrame / previous.playbackRate, toTime);
  const sourceBoundary = Math.min(
    nextBoundary - sourceFrame,
    previous.sourceStart + (targetTime - previous.timelineStart) * previous.playbackRate,
  );
  const nextPoints = points.map((point, pointIndex) => pointIndex === index
    ? { ...point, source_t: Math.max(previous.sourceStart + sourceFrame, sourceBoundary) }
    : point);
  const props = canonicalProps(media, nextPoints);
  const projected = { ...media, props };
  const moved = authoredPoints(projected)[index];
  return { props, duration: round(speedStepDuration(projected)), timeSeconds: moved?.t ?? fromTime };
}

/** Frame-quantized source clock shared by a persistent decoder and export.
 * Matches the historical section boundaries without replacing the media node. */
export function speedStepFrame(segments: SpeedStepSegment[], frame: number, fps: number) {
  const segment = segments.find(candidate => frame < Math.round(candidate.timelineEnd * fps)) ?? segments.at(-1);
  if (!segment) throw new Error("A speed-mapped clip requires a source window");
  const localFrame = Math.max(0, frame - Math.round(segment.timelineStart * fps));
  // Reverse starts on the last whole source frame inside the window and steps back.
  if (segment.reverse) return { playbackRate: segment.playbackRate, reverse: true as const,
    sourceTimeSeconds: Math.max(Math.round(segment.sourceStart * fps) / fps,
      (Math.round(segment.sourceEnd * fps) - 1 - localFrame * segment.playbackRate) / fps) };
  return { playbackRate: segment.playbackRate,
    sourceTimeSeconds: Math.round(segment.sourceStart * fps) / fps + localFrame / fps * segment.playbackRate };
}
