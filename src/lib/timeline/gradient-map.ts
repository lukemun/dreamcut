import { readKeyframeMap, resolveNumberKeyframe } from "./keyframes";

type PropsLike = Record<string, unknown> | null | undefined;

/**
 * Gradient map: each pixel's luminance is mapped onto a three-stop colour ramp
 * (shadows → midtones → highlights) and mixed with the picture by an amount.
 * The defaults are a thermal-camera ramp. It runs after grade/LUT, on
 * unpremultiplied sRGB-encoded colour, and never changes alpha.
 */
export const GRADIENT_MAP_AMOUNT_FIELD = "gradient_map_amount" as const;
export const GRADIENT_MAP_CONTRAST_FIELD = "gradient_map_contrast" as const;
export const GRADIENT_MAP_COLOR_FIELDS = ["gradient_map_shadows", "gradient_map_midtones", "gradient_map_highlights"] as const;
export const GRADIENT_MAP_NUMBER_FIELDS = [GRADIENT_MAP_AMOUNT_FIELD, GRADIENT_MAP_CONTRAST_FIELD] as const;
export const GRADIENT_MAP_KEYFRAME_FIELDS = GRADIENT_MAP_NUMBER_FIELDS;
export const GRADIENT_MAP_FIELDS = [...GRADIENT_MAP_NUMBER_FIELDS, ...GRADIENT_MAP_COLOR_FIELDS] as const;

export type GradientMapNumberField = (typeof GRADIENT_MAP_NUMBER_FIELDS)[number];
export type GradientMapColorField = (typeof GRADIENT_MAP_COLOR_FIELDS)[number];
export type GradientMapField = (typeof GRADIENT_MAP_FIELDS)[number];

export const GRADIENT_MAP_NUMBER_CONFIG = {
  gradient_map_amount: { min: 0, max: 1, identity: 0 },
  gradient_map_contrast: { min: 0.25, max: 3, identity: 1 },
} as const satisfies Record<GradientMapNumberField, { min: number; max: number; identity: number }>;

export const GRADIENT_MAP_DEFAULT_COLORS = {
  gradient_map_shadows: "#5a0000",
  gradient_map_midtones: "#ff3c00",
  gradient_map_highlights: "#ffe45c",
} as const satisfies Record<GradientMapColorField, string>;

/** Rec. 709 luma weights applied to sRGB-encoded values (both renderers). */
export const GRADIENT_MAP_LUMA = [0.2126, 0.7152, 0.0722] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type GradientMap = {
  amount: number;
  contrast: number;
  /** Shadows, midtones, highlights as 0..1 sRGB triples. */
  stops: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeGradientMapNumber(field: GradientMapNumberField, value: unknown) {
  const config = GRADIENT_MAP_NUMBER_CONFIG[field];
  const numeric = finite(value) ?? config.identity;
  return Math.min(config.max, Math.max(config.min, numeric));
}

export function normalizeGradientMapColor(field: GradientMapColorField, value: unknown): string {
  return typeof value === "string" && HEX_COLOR.test(value.trim()) ? value.trim().toLowerCase() : GRADIENT_MAP_DEFAULT_COLORS[field];
}

export function hexToUnitRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

/** True when the clip carries the effect at all, even if its amount is zero at this moment. */
export function hasGradientMapData(props: PropsLike) {
  if (!props) return false;
  const keyframes = readKeyframeMap(props);
  return GRADIENT_MAP_FIELDS.some((field) => props[field] != null) || GRADIENT_MAP_KEYFRAME_FIELDS.some((field) => (keyframes[field]?.length ?? 0) > 0);
}

/**
 * The single time-resolution entry point shared by Standard and CanvasKit.
 * Returns null when the mix is zero, so neither renderer changes a pixel.
 */
export function resolveGradientMapAtTime(props: PropsLike, timeSeconds: number): GradientMap | null {
  if (!hasGradientMapData(props)) return null;
  const value = (field: GradientMapNumberField) => {
    const config = GRADIENT_MAP_NUMBER_CONFIG[field];
    const fallback = normalizeGradientMapNumber(field, props?.[field]);
    return normalizeGradientMapNumber(field, resolveNumberKeyframe(props, field, timeSeconds, fallback, { min: config.min, max: config.max }));
  };
  const amount = value("gradient_map_amount");
  if (amount <= 0) return null;
  const stops = GRADIENT_MAP_COLOR_FIELDS.map((field) => hexToUnitRgb(normalizeGradientMapColor(field, props?.[field]))) as unknown as GradientMap["stops"];
  return { amount, contrast: value("gradient_map_contrast"), stops };
}

/** Reference evaluation of one unpremultiplied sRGB colour (tests and CPU checks). */
export function applyGradientMap(map: GradientMap, rgb: readonly [number, number, number]): [number, number, number] {
  const luma = rgb[0] * GRADIENT_MAP_LUMA[0] + rgb[1] * GRADIENT_MAP_LUMA[1] + rgb[2] * GRADIENT_MAP_LUMA[2];
  const level = Math.min(1, Math.max(0, (luma - 0.5) * map.contrast + 0.5));
  const [from, to, t] = level < 0.5 ? [map.stops[0], map.stops[1], level * 2] : [map.stops[1], map.stops[2], level * 2 - 1];
  return [0, 1, 2].map((channel) => {
    const mapped = from[channel] + (to[channel] - from[channel]) * t;
    return rgb[channel] + (mapped - rgb[channel]) * map.amount;
  }) as [number, number, number];
}

/** Shallow props patch that removes every field and its animation (undefined keys are dropped on save). */
export function gradientMapRemovalPatch(props: PropsLike): Record<string, unknown> {
  const keyframes = { ...readKeyframeMap(props) } as Record<string, unknown>;
  for (const field of GRADIENT_MAP_KEYFRAME_FIELDS) delete keyframes[field];
  return { ...Object.fromEntries(GRADIENT_MAP_FIELDS.map((field) => [field, undefined])), keyframes };
}

/** Starting point when the creator adds the effect: a full thermal look. */
export function gradientMapPreset(props: PropsLike): Record<string, unknown> {
  return { ...gradientMapRemovalPatch(props), gradient_map_amount: 1, ...GRADIENT_MAP_DEFAULT_COLORS, gradient_map_contrast: 1.4 };
}
