export type ProjectionRect = { x: number; y: number; width: number; height: number };
export type SourceProjectionInput = {
  source_width: number;
  source_height: number;
  sample_aspect_ratio?: { num: number; den: number };
  display_rotation_degrees?: 0 | 90 | 180 | 270;
  composition_width: number;
  composition_height: number;
  fit: "contain" | "cover";
  media_scale?: number;
  media_offset_x?: number;
  media_offset_y?: number;
  mask_inset?: { top: number; right: number; bottom: number; left: number };
  timeline_time_seconds: number;
  timeline_start_seconds: number;
  source_trim_start_seconds?: number;
  playback_rate?: number;
};

export type SourceProjection = {
  source_time_seconds: number;
  display_source_size: { width: number; height: number };
  base_rect: ProjectionRect;
  transformed_rect: ProjectionRect;
  visible_rect: ProjectionRect;
};

export type CompositionTransformLayout = {
  translate_x: number;
  translate_y: number;
  scale: number;
  mask_rect: ProjectionRect;
};

const finitePositive = (value: number | undefined, fallback: number) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
const precise = (value: number) => Number(value.toFixed(6));

export function resolveCompositionTransformLayout(input: {
  composition_width: number;
  composition_height: number;
  media_scale?: number;
  media_offset_x?: number;
  media_offset_y?: number;
  mask_inset?: { top: number; right: number; bottom: number; left: number };
}): CompositionTransformLayout {
  const mask = input.mask_inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    translate_x: precise((input.media_offset_x ?? 0) * input.composition_width / 2),
    translate_y: precise((input.media_offset_y ?? 0) * input.composition_height / 2),
    scale: finitePositive(input.media_scale, 1),
    // MediaTransformFrame applies clip/mask percentages to its full-composition
    // wrapper, outside the translated/scaled child.
    mask_rect: {
      x: precise(mask.left * input.composition_width),
      y: precise(mask.top * input.composition_height),
      width: precise(Math.max(0, 1 - mask.left - mask.right) * input.composition_width),
      height: precise(Math.max(0, 1 - mask.top - mask.bottom) * input.composition_height),
    },
  };
}

export function intersectProjectionRects(a: ProjectionRect, b: ProjectionRect): ProjectionRect | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: precise(left), y: precise(top), width: precise(right - left), height: precise(bottom - top) };
}

export function projectSourceToComposition(input: SourceProjectionInput): SourceProjection {
  const sar = finitePositive(input.sample_aspect_ratio?.num, 1) / finitePositive(input.sample_aspect_ratio?.den, 1);
  const rotated = input.display_rotation_degrees === 90 || input.display_rotation_degrees === 270;
  const encodedWidth = finitePositive(input.source_width, 1) * sar;
  const encodedHeight = finitePositive(input.source_height, 1);
  const displayWidth = rotated ? encodedHeight : encodedWidth;
  const displayHeight = rotated ? encodedWidth : encodedHeight;
  const containScale = Math.min(input.composition_width / displayWidth, input.composition_height / displayHeight);
  const coverScale = Math.max(input.composition_width / displayWidth, input.composition_height / displayHeight);
  const baseScale = input.fit === "cover" ? coverScale : containScale;
  const baseWidth = displayWidth * baseScale;
  const baseHeight = displayHeight * baseScale;
  const baseRect = {
    x: precise((input.composition_width - baseWidth) / 2),
    y: precise((input.composition_height - baseHeight) / 2),
    width: precise(baseWidth),
    height: precise(baseHeight),
  };
  const layout = resolveCompositionTransformLayout(input);
  const mediaScale = layout.scale;
  const transformedWidth = baseWidth * mediaScale;
  const transformedHeight = baseHeight * mediaScale;
  const transformedRect = {
    x: precise((input.composition_width - transformedWidth) / 2 + layout.translate_x),
    y: precise((input.composition_height - transformedHeight) / 2 + layout.translate_y),
    width: precise(transformedWidth),
    height: precise(transformedHeight),
  };
  const compositionRect = { x: 0, y: 0, width: input.composition_width, height: input.composition_height };
  const visibleRect = intersectProjectionRects(transformedRect, intersectProjectionRects(layout.mask_rect, compositionRect) ?? {
    x: 0, y: 0, width: 0, height: 0,
  }) ?? { x: 0, y: 0, width: 0, height: 0 };
  return {
    source_time_seconds: (input.source_trim_start_seconds ?? 0)
      + Math.max(0, input.timeline_time_seconds - input.timeline_start_seconds) * finitePositive(input.playback_rate, 1),
    display_source_size: { width: displayWidth, height: displayHeight },
    base_rect: baseRect,
    transformed_rect: transformedRect,
    visible_rect: visibleRect,
  };
}

export function projectNormalizedSourceBox(box: ProjectionRect, projection: SourceProjection): ProjectionRect {
  return {
    x: precise(projection.transformed_rect.x + box.x * projection.transformed_rect.width),
    y: precise(projection.transformed_rect.y + box.y * projection.transformed_rect.height),
    width: precise(box.width * projection.transformed_rect.width),
    height: precise(box.height * projection.transformed_rect.height),
  };
}

/** Canonical detector boxes are normalized top-left display coordinates. */
export function projectVisibleNormalizedSourceBox(box: ProjectionRect, projection: SourceProjection): ProjectionRect | null {
  return intersectProjectionRects(projectNormalizedSourceBox(box, projection), projection.visible_rect);
}
