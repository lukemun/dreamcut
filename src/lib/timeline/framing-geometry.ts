import { clampMediaOffset, clampMediaScale, type MediaTransformProps } from "./media-transform";

export type FrameSize = { width: number; height: number };
export type NormalizedFrameRect = { x: number; y: number; width: number; height: number };

function positive(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function containRect(source: FrameSize, viewport: FrameSize) {
  const sourceWidth = positive(source.width);
  const sourceHeight = positive(source.height);
  const viewportWidth = positive(viewport.width);
  const viewportHeight = positive(viewport.height);
  const scale = Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (viewportWidth - width) / 2,
    y: (viewportHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Returns the part of the source visible inside the composition. The renderer
 * contains the source first, then applies translate and scale around the
 * composition center; this is the inverse of that exact layout.
 */
export function visibleSourceRect(
  source: FrameSize,
  composition: FrameSize,
  transform: MediaTransformProps,
): NormalizedFrameRect {
  const base = containRect(source, composition);
  const scale = clampMediaScale(transform.scale);
  const width = base.width * scale;
  const height = base.height * scale;
  const x = (composition.width - width) / 2 + clampMediaOffset(transform.offsetX) * composition.width / 2;
  const y = (composition.height - height) / 2 + clampMediaOffset(transform.offsetY) * composition.height / 2;
  const left = clamp((0 - x) / width, 0, 1);
  const top = clamp((0 - y) / height, 0, 1);
  const right = clamp((composition.width - x) / width, 0, 1);
  const bottom = clamp((composition.height - y) / height, 0, 1);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Resolve renderer offsets after the user drags the visible crop window. */
export function transformForSourceCenter(
  source: FrameSize,
  composition: FrameSize,
  scaleValue: number,
  center: { x: number; y: number },
): MediaTransformProps {
  const scale = clampMediaScale(scaleValue);
  const base = containRect(source, composition);
  const transformedWidth = base.width * scale;
  const transformedHeight = base.height * scale;
  const visibleWidth = Math.min(1, composition.width / transformedWidth);
  const visibleHeight = Math.min(1, composition.height / transformedHeight);
  const centerX = clamp(center.x, visibleWidth / 2, 1 - visibleWidth / 2);
  const centerY = clamp(center.y, visibleHeight / 2, 1 - visibleHeight / 2);
  return {
    scale,
    offsetX: clampMediaOffset(transformedWidth * (1 - 2 * centerX) / composition.width),
    offsetY: clampMediaOffset(transformedHeight * (1 - 2 * centerY) / composition.height),
  };
}
