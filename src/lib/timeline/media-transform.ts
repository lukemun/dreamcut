import {
  hasKeyframes,
  resolveNumberKeyframe,
  resolveTupleKeyframe,
  upsertKeyframe,
  removeKeyframes,
} from "./keyframes";
import { resolveCompositionTransformLayout } from "./source-projection";
import { SUBJECT_GLOW_FIELDS } from "./subject-glow";
import { COLOR_GRADE_KEYFRAME_FIELDS } from "./color-grade";

type PropsLike = Record<string, unknown> | null | undefined;

export const MIN_MEDIA_SCALE = 0.1;
export const MAX_MEDIA_SCALE = 3;
export const MAX_MEDIA_OFFSET = 2;
export const ANIMATED_TRANSFORM_PRECISION = 4;
export const MEDIA_TRANSFORM_KEYFRAME_FIELDS = [
  "media_scale",
  "media_offset_x",
  "media_offset_y",
] as const;
export type MediaTransformKeyframeField = (typeof MEDIA_TRANSFORM_KEYFRAME_FIELDS)[number];
export const MEDIA_MASK_KEYFRAME_FIELDS = ["mask_inset", "mask_feather"] as const;
export const MEDIA_OPACITY_KEYFRAME_FIELDS = ["media_opacity"] as const;
export const MEDIA_KEYFRAME_FIELDS = [
  ...SUBJECT_GLOW_FIELDS,
  "iris_radius", "iris_feather", "zoom_blur", "transition_blur", "directional_blur_x", "directional_blur_y",
  ...MEDIA_TRANSFORM_KEYFRAME_FIELDS,
  ...MEDIA_MASK_KEYFRAME_FIELDS,
  ...MEDIA_OPACITY_KEYFRAME_FIELDS,
  ...COLOR_GRADE_KEYFRAME_FIELDS,
] as const;

export type MediaTransformProps = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type MaskInsetProps = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type MediaEffectProps = {
  opacity: number;
  maskFeather: number;
};

export type MirrorBandProps = {
  center: number;
  height: number;
};

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampMediaScale(value: number) {
  return Number(clamp(value, MIN_MEDIA_SCALE, MAX_MEDIA_SCALE).toFixed(ANIMATED_TRANSFORM_PRECISION));
}

export function clampMediaOffset(value: number) {
  return Number(clamp(value, -MAX_MEDIA_OFFSET, MAX_MEDIA_OFFSET).toFixed(ANIMATED_TRANSFORM_PRECISION));
}

export function clampMediaOpacity(value: number) {
  return Number(clamp(value, 0, 1).toFixed(3));
}

/** Feather is normalized to composition output height. */
export function clampMaskFeather(value: number) {
  return Number(clamp(value, 0, 0.5).toFixed(3));
}

export function readMediaTransformProps(props: PropsLike): MediaTransformProps {
  return {
    scale: clampMediaScale(readFiniteNumber(props?.media_scale) ?? 1),
    offsetX: clampMediaOffset(readFiniteNumber(props?.media_offset_x) ?? 0),
    offsetY: clampMediaOffset(readFiniteNumber(props?.media_offset_y) ?? 0),
  };
}

export function writeMediaTransformProps(
  props: PropsLike,
  patch: Partial<MediaTransformProps>,
): Record<string, unknown> {
  const current = readMediaTransformProps(props);
  const next = {
    scale: "scale" in patch ? clampMediaScale(patch.scale ?? current.scale) : current.scale,
    offsetX: "offsetX" in patch ? clampMediaOffset(patch.offsetX ?? current.offsetX) : current.offsetX,
    offsetY: "offsetY" in patch ? clampMediaOffset(patch.offsetY ?? current.offsetY) : current.offsetY,
  };

  return {
    ...(props ?? {}),
    media_scale: next.scale,
    media_offset_x: next.offsetX,
    media_offset_y: next.offsetY,
  };
}

export function stripMediaTransformProps(props: PropsLike): Record<string, unknown> {
  const next = { ...(props ?? {}) };
  delete next.media_scale;
  delete next.media_offset_x;
  delete next.media_offset_y;
  return next;
}

export function readMaskInsetProps(props: PropsLike): MaskInsetProps {
  const raw = props?.mask_inset;
  const values = Array.isArray(raw) ? raw : [];
  return {
    top: clampMaskInset(readFiniteNumber(values[0]) ?? 0),
    right: clampMaskInset(readFiniteNumber(values[1]) ?? 0),
    bottom: clampMaskInset(readFiniteNumber(values[2]) ?? 0),
    left: clampMaskInset(readFiniteNumber(values[3]) ?? 0),
  };
}

export function readMediaEffectProps(props: PropsLike): MediaEffectProps {
  return {
    opacity: clampMediaOpacity(readFiniteNumber(props?.media_opacity) ?? 1),
    maskFeather: clampMaskFeather(readFiniteNumber(props?.mask_feather) ?? 0),
  };
}

export function writeMediaEffectProps(
  props: PropsLike,
  patch: Partial<MediaEffectProps>,
): Record<string, unknown> {
  const current = readMediaEffectProps(props);
  return {
    ...(props ?? {}),
    media_opacity: "opacity" in patch
      ? clampMediaOpacity(patch.opacity ?? current.opacity)
      : current.opacity,
    mask_feather: "maskFeather" in patch
      ? clampMaskFeather(patch.maskFeather ?? current.maskFeather)
      : current.maskFeather,
  };
}

export function clampMaskInset(value: number) {
  return Number(clamp(value, 0, 0.95).toFixed(3));
}

export function writeMaskInsetProps(
  props: PropsLike,
  patch: Partial<MaskInsetProps>,
): Record<string, unknown> {
  const current = readMaskInsetProps(props);
  const next = {
    top: "top" in patch ? clampMaskInset(patch.top ?? current.top) : current.top,
    right: "right" in patch ? clampMaskInset(patch.right ?? current.right) : current.right,
    bottom: "bottom" in patch ? clampMaskInset(patch.bottom ?? current.bottom) : current.bottom,
    left: "left" in patch ? clampMaskInset(patch.left ?? current.left) : current.left,
  };
  return {
    ...(props ?? {}),
    mask_inset: [next.top, next.right, next.bottom, next.left],
  };
}

export function mirrorBandFromMaskInset(mask: MaskInsetProps): MirrorBandProps {
  const height = clamp(1 - mask.top - mask.bottom, 0.01, 1);
  return {
    center: Number((mask.top + height / 2).toFixed(3)),
    height: Number(height.toFixed(3)),
  };
}

export function maskInsetFromMirrorBand(
  current: MaskInsetProps,
  band: MirrorBandProps,
): MaskInsetProps {
  const height = clamp(band.height, 0.01, 1);
  const center = clamp(band.center, height / 2, 1 - height / 2);
  return {
    top: clampMaskInset(center - height / 2),
    right: current.right,
    bottom: clampMaskInset(1 - center - height / 2),
    left: current.left,
  };
}

export function resolveMediaTransformAtTime(props: PropsLike, timeSeconds: number): MediaTransformProps {
  const fallback = readMediaTransformProps(props);
  return {
    scale: clampMediaScale(resolveNumberKeyframe(props, "media_scale", timeSeconds, fallback.scale, {
      min: MIN_MEDIA_SCALE,
      max: MAX_MEDIA_SCALE,
    })),
    offsetX: clampMediaOffset(resolveNumberKeyframe(props, "media_offset_x", timeSeconds, fallback.offsetX, {
      min: -MAX_MEDIA_OFFSET,
      max: MAX_MEDIA_OFFSET,
    })),
    offsetY: clampMediaOffset(resolveNumberKeyframe(props, "media_offset_y", timeSeconds, fallback.offsetY, {
      min: -MAX_MEDIA_OFFSET,
      max: MAX_MEDIA_OFFSET,
    })),
  };
}

export function resolveMaskInsetAtTime(props: PropsLike, timeSeconds: number): MaskInsetProps {
  const fallback = readMaskInsetProps(props);
  const [top, right, bottom, left] = resolveTupleKeyframe(
    props,
    "mask_inset",
    timeSeconds,
    [fallback.top, fallback.right, fallback.bottom, fallback.left],
    { min: 0, max: 0.95, length: 4 },
  );
  return {
    top: clampMaskInset(top ?? 0),
    right: clampMaskInset(right ?? 0),
    bottom: clampMaskInset(bottom ?? 0),
    left: clampMaskInset(left ?? 0),
  };
}

export function resolveMediaEffectAtTime(props: PropsLike, timeSeconds: number): MediaEffectProps {
  const fallback = readMediaEffectProps(props);
  return {
    opacity: clampMediaOpacity(resolveNumberKeyframe(
      props,
      "media_opacity",
      timeSeconds,
      fallback.opacity,
      { min: 0, max: 1 },
    )),
    maskFeather: clampMaskFeather(resolveNumberKeyframe(
      props,
      "mask_feather",
      timeSeconds,
      fallback.maskFeather,
      { min: 0, max: 0.5 },
    )),
  };
}

export function maskInsetClipPath(mask: MaskInsetProps): string | undefined {
  if (mask.top === 0 && mask.right === 0 && mask.bottom === 0 && mask.left === 0) return undefined;
  return `inset(${mask.top * 100}% ${mask.right * 100}% ${mask.bottom * 100}% ${mask.left * 100}%)`;
}

export type MaskInsetStyle = {
  clipPath?: string;
  maskImage?: string;
  WebkitMaskImage?: string;
  maskMode?: "alpha";
  maskRepeat?: "no-repeat";
  WebkitMaskRepeat?: "no-repeat";
};

export function readLineMaskRotation(props: PropsLike): number {
  return Math.max(-180, Math.min(180, readFiniteNumber(props?.mask_line_rotation) ?? 0));
}

export function maskInsetStyle(mask: MaskInsetProps, feather: number, rotation = 0, canvas = { width: 1, height: 1 }): MaskInsetStyle {
  const line = mask.left === 0 && mask.right === 0 && ((mask.top > 0) !== (mask.bottom > 0));
  if (line && rotation !== 0) {
    // CSS gradient distance is the projection of the canvas onto its normal.
    // Preserve signed distance along the rotating normal, not media rotation.
    const radians = rotation * Math.PI / 180;
    const length = Math.abs(canvas.width * Math.sin(radians)) + Math.abs(canvas.height * Math.cos(radians));
    const boundaryY = mask.top > 0 ? mask.top : 1 - mask.bottom;
    const boundary = .5 + (boundaryY - .5) * canvas.height / length;
    const width = Math.min(clampMaskFeather(feather), (1 - mask.top - mask.bottom) / 2) * canvas.height / length;
    const stops = mask.top > 0
      ? `transparent ${boundary * 100}%, #000 ${(boundary + width) * 100}%`
      : `#000 ${(boundary - width) * 100}%, transparent ${boundary * 100}%`;
    const maskImage = `linear-gradient(${180 + rotation}deg, ${stops})`;
    return { maskImage, WebkitMaskImage: maskImage, maskMode: "alpha", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" };
  }
  const safeFeather = Math.min(
    clampMaskFeather(feather),
    Math.max(0, (1 - mask.top - mask.bottom) / 2),
  );
  if (safeFeather <= 0) {
    return { clipPath: maskInsetClipPath(mask) };
  }

  const topOpaque = mask.top === 0 ? 0 : mask.top + safeFeather;
  const bottomBoundary = 1 - mask.bottom;
  const bottomOpaque = mask.bottom === 0 ? 1 : bottomBoundary - safeFeather;
  const topStops = mask.top === 0 ? "#000 0%" : `transparent 0%, transparent ${mask.top * 100}%, #000 ${topOpaque * 100}%`;
  const bottomStops = mask.bottom === 0 ? "#000 100%" : `#000 ${bottomOpaque * 100}%, transparent ${bottomBoundary * 100}%, transparent 100%`;
  const maskImage = `linear-gradient(to bottom, ${topStops}, ${bottomStops})`;
  const horizontalClip = mask.left === 0 && mask.right === 0
    ? undefined
    : `inset(0 ${mask.right * 100}% 0 ${mask.left * 100}%)`;
  return {
    ...(horizontalClip ? { clipPath: horizontalClip } : {}),
    maskImage,
    WebkitMaskImage: maskImage,
    maskMode: "alpha",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  };
}

export function upsertMediaTransformKeyframes(
  props: PropsLike,
  timeSeconds: number,
  transform: MediaTransformProps,
): Record<string, unknown> {
  let next = upsertKeyframe(props, "media_scale", timeSeconds, clampMediaScale(transform.scale));
  next = upsertKeyframe(next, "media_offset_x", timeSeconds, clampMediaOffset(transform.offsetX));
  next = upsertKeyframe(next, "media_offset_y", timeSeconds, clampMediaOffset(transform.offsetY));
  return next;
}

export function upsertMaskInsetKeyframe(
  props: PropsLike,
  timeSeconds: number,
  mask: MaskInsetProps,
): Record<string, unknown> {
  return upsertKeyframe(props, "mask_inset", timeSeconds, [
    clampMaskInset(mask.top),
    clampMaskInset(mask.right),
    clampMaskInset(mask.bottom),
    clampMaskInset(mask.left),
  ]);
}

export function upsertMediaEffectKeyframes(
  props: PropsLike,
  timeSeconds: number,
  effect: MediaEffectProps,
): Record<string, unknown> {
  let next = upsertKeyframe(props, "media_opacity", timeSeconds, clampMediaOpacity(effect.opacity));
  next = upsertKeyframe(next, "mask_feather", timeSeconds, clampMaskFeather(effect.maskFeather));
  return next;
}

export function commitMediaTransformFieldAtTime(
  props: PropsLike,
  timeSeconds: number,
  field: keyof MediaTransformProps,
  value: number,
): Record<string, unknown> {
  const propField = field === "scale"
    ? "media_scale"
    : field === "offsetX"
      ? "media_offset_x"
      : "media_offset_y";
  const clampedValue = field === "scale" ? clampMediaScale(value) : clampMediaOffset(value);
  if (hasKeyframes(props, propField)) {
    return upsertKeyframe(props, propField, timeSeconds, clampedValue);
  }
  return writeMediaTransformProps(props, { [field]: clampedValue });
}

export function commitMaskInsetAtTime(
  props: PropsLike,
  timeSeconds: number,
  mask: MaskInsetProps,
): Record<string, unknown> {
  return hasKeyframes(props, "mask_inset")
    ? upsertMaskInsetKeyframe(props, timeSeconds, mask)
    : writeMaskInsetProps(props, mask);
}

export function commitMediaEffectFieldAtTime(
  props: PropsLike,
  timeSeconds: number,
  field: keyof MediaEffectProps,
  value: number,
): Record<string, unknown> {
  const propField = field === "opacity" ? "media_opacity" : "mask_feather";
  const clampedValue = field === "opacity" ? clampMediaOpacity(value) : clampMaskFeather(value);
  if (hasKeyframes(props, propField)) {
    return upsertKeyframe(props, propField, timeSeconds, clampedValue);
  }
  return writeMediaEffectProps(props, { [field]: clampedValue });
}

export function clearMediaKeyframes(props: PropsLike): Record<string, unknown> {
  return removeKeyframes(props, MEDIA_KEYFRAME_FIELDS);
}

export function resolveMediaTransformLayout(
  width: number,
  height: number,
  transform: MediaTransformProps,
) {
  const layout = resolveCompositionTransformLayout({
    composition_width: width,
    composition_height: height,
    media_scale: transform.scale,
    media_offset_x: transform.offsetX,
    media_offset_y: transform.offsetY,
  });
  return {
    translateX: layout.translate_x,
    translateY: layout.translate_y,
    scale: layout.scale,
  };
}
