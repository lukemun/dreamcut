import { MAX_MEDIA_SCALE, clampMediaOffset, clampMediaScale } from "@/lib/timeline/media-transform";
import type { KeyframePoint } from "@/lib/timeline/keyframes";

/**
 * Reframe compiler: focal samples in source space → a media_scale +
 * media_offset_x/y keyframe path that keeps the subject framed when a clip's
 * aspect doesn't match the composition (the classic 16:9 source on a 9:16
 * canvas).
 *
 * This is the L2 half of auto-reframe: it consumes focal evidence some
 * detector already produced (Apple Vision tracks, SAM 2, or hand-marked
 * points) and emits ORDINARY timeline keyframes — gradeable, nudgeable, and
 * rejectable in the editor like any hand-authored move. It never runs
 * perception itself, so re-tuning smoothing or margins never forces a re-read.
 *
 * Geometry mirrors source-projection.ts exactly (contain fit, centered base
 * rect, translate = offset × composition/2):
 *   ox = baseWidth·s·(1 − 2fx) / W   centers source-normalized fx at W/2
 * clamped so the frame never pans past the source edge — when the subject
 * walks out of reach the camera stops at the edge, it does not chase into
 * letterbox.
 */

export type FocalSample = {
  /** Source-media seconds (as detectors report), NOT clip-local time. */
  time_seconds: number;
  /** Focal box in source-normalized 0..1 coordinates. */
  box: { x: number; y: number; width: number; height: number };
};

export type ReframeClip = {
  timeline_start: number;
  duration: number;
  trim_start: number;
  playback_rate: number;
};

export type ReframeOptions = {
  /** Extra zoom beyond exact cover, e.g. 0.05 = 5% breathing room. Default 0. */
  margin?: number;
  /** EMA smoothing 0..1; higher = stickier camera. Default 0.45. */
  smoothing?: number;
  /** Minimum seconds between emitted keyframes. Default 0.5. */
  keyframeIntervalSeconds?: number;
  /** Offset delta below which motion is considered noise. Default 0.005. */
  minOffsetDelta?: number;
};

export type ReframeResult = {
  /** Static zoom for the whole clip (v1 holds scale constant — calmer). */
  media_scale: number;
  /** Clip-local keyframes; single-point arrays collapse to static offsets. */
  offsetX: KeyframePoint[];
  offsetY: KeyframePoint[];
  /** True when the cover zoom exceeded MAX_MEDIA_SCALE and was clamped. */
  scaleClamped: boolean;
  /** Samples that fell inside the clip's trimmed window. */
  usedSamples: number;
};

const round = (value: number) => Number(value.toFixed(4));

/** Scale that makes a contain-fitted source cover the composition. */
export function coverScale(
  sourceWidth: number,
  sourceHeight: number,
  compositionWidth: number,
  compositionHeight: number,
): number {
  const contain = Math.min(compositionWidth / sourceWidth, compositionHeight / sourceHeight);
  const cover = Math.max(compositionWidth / sourceWidth, compositionHeight / sourceHeight);
  return cover / contain;
}

/** Offsets centering a source-normalized focal point, edge-clamped. */
export function offsetsForFocalPoint(
  fx: number,
  fy: number,
  sourceWidth: number,
  sourceHeight: number,
  compositionWidth: number,
  compositionHeight: number,
  mediaScale: number,
): { offsetX: number; offsetY: number } {
  const contain = Math.min(compositionWidth / sourceWidth, compositionHeight / sourceHeight);
  const baseWidth = sourceWidth * contain;
  const baseHeight = sourceHeight * contain;
  const centering = (focal: number, base: number, composition: number) => {
    const ideal = (base * mediaScale * (1 - 2 * focal)) / composition;
    // Edge clamp: keep the transformed rect covering the composition on this
    // axis (|offset| ≤ scaled overflow); if the source doesn't overflow the
    // axis at this scale there is nothing to pan.
    const overflow = Math.max(0, (base * mediaScale) / composition - 1);
    return clampMediaOffset(Math.max(-overflow, Math.min(overflow, ideal)));
  };
  return {
    offsetX: centering(fx, baseWidth, compositionWidth),
    offsetY: centering(fy, baseHeight, compositionHeight),
  };
}

export function compileReframe(
  samples: readonly FocalSample[],
  clip: ReframeClip,
  source: { width: number; height: number },
  composition: { width: number; height: number },
  options: ReframeOptions = {},
): ReframeResult {
  const margin = options.margin ?? 0;
  const alpha = options.smoothing ?? 0.45;
  const interval = options.keyframeIntervalSeconds ?? 0.5;
  const minDelta = options.minOffsetDelta ?? 0.005;
  const rate = clip.playback_rate > 0 ? clip.playback_rate : 1;

  const rawScale = coverScale(source.width, source.height, composition.width, composition.height) * (1 + margin);
  const mediaScale = clampMediaScale(rawScale);
  const scaleClamped = rawScale > MAX_MEDIA_SCALE;

  // Source seconds → clip-local timeline seconds; keep what the trim window shows.
  const localized = samples
    .map((sample) => ({
      t: (sample.time_seconds - clip.trim_start) / rate,
      fx: sample.box.x + sample.box.width / 2,
      fy: sample.box.y + sample.box.height / 2,
    }))
    .filter((sample) => sample.t >= 0 && sample.t <= clip.duration)
    .sort((a, b) => a.t - b.t);

  if (localized.length === 0) {
    // No evidence in-window: center-cover, no motion.
    const centered = offsetsForFocalPoint(0.5, 0.5, source.width, source.height, composition.width, composition.height, mediaScale);
    return {
      media_scale: mediaScale,
      offsetX: [{ t: 0, v: centered.offsetX }],
      offsetY: [{ t: 0, v: centered.offsetY }],
      scaleClamped,
      usedSamples: 0,
    };
  }

  // EMA over focal centers so the camera drifts rather than jitters.
  let fx = localized[0]!.fx;
  let fy = localized[0]!.fy;
  const path = localized.map((sample) => {
    fx = fx + alpha * (sample.fx - fx);
    fy = fy + alpha * (sample.fy - fy);
    const offsets = offsetsForFocalPoint(fx, fy, source.width, source.height, composition.width, composition.height, mediaScale);
    return { t: round(sample.t), ...offsets };
  });

  // Decimate: first point, then only movement ≥ minDelta at ≥ interval spacing,
  // always closing on the final point so the end pose is exact.
  const kept = [path[0]!];
  for (const point of path.slice(1, -1)) {
    const previous = kept[kept.length - 1]!;
    if (point.t - previous.t < interval) continue;
    if (Math.abs(point.offsetX - previous.offsetX) < minDelta && Math.abs(point.offsetY - previous.offsetY) < minDelta) continue;
    kept.push(point);
  }
  const last = path[path.length - 1]!;
  if (path.length > 1 && last.t > kept[kept.length - 1]!.t) kept.push(last);

  const still = kept.every((point) => Math.abs(point.offsetX - kept[0]!.offsetX) < minDelta
    && Math.abs(point.offsetY - kept[0]!.offsetY) < minDelta);
  const emitted = still ? [kept[0]!] : kept;

  return {
    media_scale: mediaScale,
    offsetX: emitted.map((point) => ({ t: point.t, v: point.offsetX })),
    offsetY: emitted.map((point) => ({ t: point.t, v: point.offsetY })),
    scaleClamped,
    usedSamples: localized.length,
  };
}

/** Props patch for a compiled reframe: static scale; keyframes only for real motion. */
export function reframePropsPatch(result: ReframeResult): Record<string, unknown> {
  const moving = result.offsetX.length > 1 || result.offsetY.length > 1;
  if (!moving) {
    return {
      media_scale: result.media_scale,
      media_offset_x: result.offsetX[0]?.v ?? 0,
      media_offset_y: result.offsetY[0]?.v ?? 0,
    };
  }
  return {
    media_scale: result.media_scale,
    media_offset_x: result.offsetX[0]?.v ?? 0,
    media_offset_y: result.offsetY[0]?.v ?? 0,
    keyframes: {
      media_offset_x: result.offsetX.map((point) => ({ t: point.t, v: point.v })),
      media_offset_y: result.offsetY.map((point) => ({ t: point.t, v: point.v })),
    },
  };
}
