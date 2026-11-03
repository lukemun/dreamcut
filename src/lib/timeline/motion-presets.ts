import { readKeyframeMap, writeKeyframeMap, type KeyframePoint, type KeyframeMap } from "./keyframes";
import { clampMediaOffset, readMediaTransformProps } from "./media-transform";

export const MEDIA_MOTION_PRESETS = ["none", "float", "bounce", "orbit", "spiral"] as const;
export type MediaMotionPreset = (typeof MEDIA_MOTION_PRESETS)[number];
export type IdentifiedMediaMotionPreset = MediaMotionPreset | "custom";

const MOTION_FIELDS = ["media_offset_x", "media_offset_y"] as const;
const TIME_PRECISION = 3;

function roundedTime(value: number) {
  return Number(Math.max(0, value).toFixed(TIME_PRECISION));
}

function point(t: number, v: number, ease: KeyframePoint["ease"] = "linear"): KeyframePoint<number> {
  return { t: roundedTime(t), v: clampMediaOffset(v), ease };
}

function sample(
  durationSeconds: number,
  steps: number,
  resolve: (progress: number) => number,
): KeyframePoint<number>[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    return point(durationSeconds * progress, resolve(progress));
  });
}

function triangle(progress: number, cycles: number, phase = 0) {
  const cycleProgress = ((progress * cycles + phase) % 1 + 1) % 1;
  return 1 - 4 * Math.abs(cycleProgress - 0.5);
}

/** Shared by actor motion and its visible guide. Offsets use the canvas coordinate system. */
export function spiralPosition(x: number, y: number, progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  const angle = p * Math.PI * 6;
  const radius = 1 - p;
  return { x: radius * (x * Math.cos(angle) - y * Math.sin(angle)),
    y: radius * (x * Math.sin(angle) + y * Math.cos(angle)) };
}

function generatedMotionKeyframes(
  props: Record<string, unknown> | null | undefined,
  preset: Exclude<MediaMotionPreset, "none">,
  durationSeconds: number,
): KeyframeMap {
  const duration = Math.max(1 / 30, durationSeconds);
  const { offsetX, offsetY } = readMediaTransformProps(props);

  if (preset === "spiral") {
    const scale = typeof props?.media_scale === "number" ? props.media_scale : 1;
    return {
      media_offset_x: sample(duration, 180, p => spiralPosition(offsetX, offsetY, p).x),
      media_offset_y: sample(duration, 180, p => spiralPosition(offsetX, offsetY, p).y),
      media_scale: sample(duration, 180, p => Math.max(0.01, scale * (1 - p))),
    };
  }

  if (preset === "float") {
    const cycles = Math.max(1, Math.round(duration / 3));
    const steps = cycles * 4;
    return {
      media_offset_x: [point(0, offsetX), point(duration, offsetX)],
      media_offset_y: sample(duration, steps, (progress) => (
        offsetY - Math.sin(progress * Math.PI * 2 * cycles) * 0.045
      )).map((keyframe) => ({ ...keyframe, ease: "easeInOut" as const })),
    };
  }

  if (preset === "orbit") {
    const cycles = Math.max(1, Math.round(duration / 4));
    const steps = cycles * 16;
    return {
      media_offset_x: sample(duration, steps, (progress) => (
        offsetX + Math.cos(progress * Math.PI * 2 * cycles) * 0.14 - 0.14
      )),
      media_offset_y: sample(duration, steps, (progress) => (
        offsetY + Math.sin(progress * Math.PI * 2 * cycles) * 0.09
      )),
    };
  }

  const xCycles = Math.max(1, Math.round(duration / 3.5));
  const yCycles = xCycles + 1;
  const steps = Math.max(24, xCycles * yCycles * 4);
  return {
    media_offset_x: sample(duration, steps, (progress) => (
      offsetX + triangle(progress, xCycles) * 0.3
    )),
    media_offset_y: sample(duration, steps, (progress) => (
      offsetY + triangle(progress, yCycles, 0.25) * 0.18
    )),
  };
}

export function applyMediaMotionPreset(
  props: Record<string, unknown> | null | undefined,
  preset: MediaMotionPreset,
  durationSeconds: number,
): Record<string, unknown> {
  const keyframes = readKeyframeMap(props);
  for (const field of MOTION_FIELDS) delete keyframes[field];
  if (props?.media_motion_preset === "spiral") delete keyframes.media_scale;
  const baseProps = { ...props, media_motion_preset: preset };
  if (preset === "none") {
    const cleared = writeKeyframeMap(baseProps, keyframes);
    return Object.keys(keyframes).length === 0 ? { ...cleared, keyframes: {} } : cleared;
  }
  return writeKeyframeMap(baseProps, {
    ...keyframes,
    ...generatedMotionKeyframes(props, preset, durationSeconds),
  });
}

function samePoints(left: KeyframePoint[] | undefined, right: KeyframePoint[] | undefined) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

export function identifyMediaMotionPreset(
  props: Record<string, unknown> | null | undefined,
  durationSeconds: number,
): IdentifiedMediaMotionPreset {
  const keyframes = readKeyframeMap(props);
  const hasMotion = MOTION_FIELDS.some((field) => (keyframes[field]?.length ?? 0) > 0);
  if (!hasMotion) return "none";

  for (const preset of MEDIA_MOTION_PRESETS) {
    if (preset === "none") continue;
    const generated = readKeyframeMap(applyMediaMotionPreset(props, preset, durationSeconds));
    if (MOTION_FIELDS.every((field) => samePoints(keyframes[field], generated[field]))
      && (preset !== "spiral" || samePoints(keyframes.media_scale, generated.media_scale))) return preset;
  }
  return "custom";
}
