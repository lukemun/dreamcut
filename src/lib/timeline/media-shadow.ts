/**
 * Media drop shadow (`media_shadow*` props). One owner for the authored values both
 * renderers draw: Standard applies them as CSS `drop-shadow(x y blur rgba(0,0,0,a))`
 * on the contained picture (inside source orientation/mirror and media scale);
 * Browser GPU maps the same values into composition space (gpu-preview/media-shadow.ts).
 * Units are composition pixels before media scale; blur is the CSS blur radius.
 */
export type MediaShadow = { offsetX: number; offsetY: number; blur: number; opacity: number };

export const MEDIA_SHADOW_DEFAULTS: MediaShadow = { offsetX: 0, offsetY: 16, blur: 28, opacity: 0.32 };

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function resolveMediaShadow(props: Record<string, unknown> | null | undefined): MediaShadow | null {
  if (props?.media_shadow !== true) return null;
  return {
    offsetX: clamp(readFiniteNumber(props.media_shadow_offset_x) ?? MEDIA_SHADOW_DEFAULTS.offsetX, -80, 80),
    offsetY: clamp(readFiniteNumber(props.media_shadow_offset_y) ?? MEDIA_SHADOW_DEFAULTS.offsetY, -80, 80),
    blur: clamp(readFiniteNumber(props.media_shadow_blur) ?? MEDIA_SHADOW_DEFAULTS.blur, 0, 80),
    opacity: clamp(readFiniteNumber(props.media_shadow_opacity) ?? MEDIA_SHADOW_DEFAULTS.opacity, 0, 0.8),
  };
}

/** CSS shadow syntax shared by `drop-shadow()` and `box-shadow`. */
export function mediaShadowCss(shadow: MediaShadow) {
  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px rgba(0, 0, 0, ${shadow.opacity})`;
}
