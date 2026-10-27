import { readKeyframeMap, resolveNumberKeyframe } from "./keyframes";

type PropsLike = Record<string, unknown> | null | undefined;

/**
 * Film look: the finishing treatments a colourist adds after the grade. Split tone tints shadows
 * and highlights, halation is the warm red glow film shows around bright edges, bloom a softer
 * neutral glow, the vignette darkens the frame's edges and grain adds moving film texture.
 * It runs after grade/LUT and color map, on unpremultiplied sRGB-encoded colour, never changes
 * alpha, and its random grain is a hash of (seed, clip-local step, cell), so preview, export and
 * repeated seeks draw identical frames. Sizes are authored at a 1080-wide reference.
 */
export const FILM_LOOK_FIELDS = [
  "film_grain",
  "film_grain_size",
  "film_halation",
  "film_halation_radius",
  "film_bloom",
  "film_bloom_radius",
  "film_glow_threshold",
  "film_vignette",
  "film_vignette_size",
  "film_vignette_softness",
  "film_split_tone",
  "film_split_shadow_hue",
  "film_split_highlight_hue",
  "film_split_balance",
] as const;
export type FilmLookField = (typeof FILM_LOOK_FIELDS)[number];

/** The strengths: each one alone turns its treatment on, and each can be keyed over time. */
export const FILM_LOOK_AMOUNT_FIELDS = ["film_grain", "film_halation", "film_bloom", "film_vignette", "film_split_tone"] as const;
export const FILM_LOOK_KEYFRAME_FIELDS = FILM_LOOK_AMOUNT_FIELDS;

export const FILM_LOOK_CONFIG = {
  film_grain: { min: 0, max: 1, identity: 0 },
  film_grain_size: { min: 0.5, max: 6, identity: 1.5 },
  film_halation: { min: 0, max: 1, identity: 0 },
  film_halation_radius: { min: 2, max: 80, identity: 16 },
  film_bloom: { min: 0, max: 1, identity: 0 },
  film_bloom_radius: { min: 4, max: 160, identity: 48 },
  film_glow_threshold: { min: 0.3, max: 0.98, identity: 0.72 },
  film_vignette: { min: 0, max: 1, identity: 0 },
  film_vignette_size: { min: 0.2, max: 1.5, identity: 0.8 },
  film_vignette_softness: { min: 0.05, max: 1.5, identity: 0.6 },
  film_split_tone: { min: 0, max: 1, identity: 0 },
  film_split_shadow_hue: { min: 0, max: 360, identity: 195 },
  film_split_highlight_hue: { min: 0, max: 360, identity: 35 },
  film_split_balance: { min: -1, max: 1, identity: 0 },
} as const satisfies Record<FilmLookField, { min: number; max: number; identity: number }>;

/** Grain changes 24 times a second on the clip's own clock, like film frames. */
export const FILM_GRAIN_RATE = 24;
/** Halation is the red-orange of light scattering back through film's red layer. */
export const FILM_HALATION_TINT = [1, 0.32, 0.12] as const;

export type FilmLook = {
  grain: number; grainSize: number; grainStep: number;
  halation: number; halationRadius: number;
  bloom: number; bloomRadius: number; threshold: number;
  vignette: number; vignetteSize: number; vignetteSoftness: number;
  splitTone: number; shadowHue: number; highlightHue: number; balance: number;
};

/** A film look in composition pixels, ready for a renderer. */
export type FilmLookPlan = FilmLook & { width: number; height: number; scale: number };

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeFilmLookValue(field: FilmLookField, value: unknown) {
  const config = FILM_LOOK_CONFIG[field];
  return Math.min(config.max, Math.max(config.min, finite(value) ?? config.identity));
}

export function hasFilmLookData(props: PropsLike) {
  if (!props) return false;
  const keyframes = readKeyframeMap(props);
  return FILM_LOOK_FIELDS.some((field) => props[field] != null) || FILM_LOOK_KEYFRAME_FIELDS.some((field) => (keyframes[field]?.length ?? 0) > 0);
}

/** The single time-resolution entry point. Null when every strength is zero, so nothing changes. */
export function resolveFilmLookAtTime(props: PropsLike, timeSeconds: number): FilmLook | null {
  if (!hasFilmLookData(props)) return null;
  const value = (field: FilmLookField) => {
    const fallback = normalizeFilmLookValue(field, props?.[field]);
    if (!(FILM_LOOK_KEYFRAME_FIELDS as readonly string[]).includes(field)) return fallback;
    const config = FILM_LOOK_CONFIG[field];
    return normalizeFilmLookValue(field, resolveNumberKeyframe(props, field, timeSeconds, fallback, { min: config.min, max: config.max }));
  };
  const look: FilmLook = {
    grain: value("film_grain"), grainSize: value("film_grain_size"),
    // The epsilon keeps frame-exact times on the step they reach.
    grainStep: Math.max(0, Math.floor(Math.max(0, timeSeconds) * FILM_GRAIN_RATE + 1e-6)),
    halation: value("film_halation"), halationRadius: value("film_halation_radius"),
    bloom: value("film_bloom"), bloomRadius: value("film_bloom_radius"), threshold: value("film_glow_threshold"),
    vignette: value("film_vignette"), vignetteSize: value("film_vignette_size"), vignetteSoftness: value("film_vignette_softness"),
    splitTone: value("film_split_tone"), shadowHue: value("film_split_shadow_hue"), highlightHue: value("film_split_highlight_hue"), balance: value("film_split_balance"),
  };
  return look.grain > 0 || look.halation > 0 || look.bloom > 0 || look.vignette > 0 || look.splitTone > 0 ? look : null;
}

export function filmLookPlan(look: FilmLook, width: number, height: number): FilmLookPlan {
  return { ...look, width, height, scale: width / 1080 };
}

/** A fully saturated sRGB colour at `hue` degrees, minus its own luma: a tint that keeps brightness. */
export function filmTintVector(hueDegrees: number): [number, number, number] {
  const h = (((hueDegrees % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const rgb = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const luma = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  return [rgb[0]! - luma, rgb[1]! - luma, rgb[2]! - luma];
}

export function filmLookRemovalPatch(props: PropsLike): Record<string, unknown> {
  const keyframes = { ...readKeyframeMap(props) } as Record<string, unknown>;
  for (const field of FILM_LOOK_KEYFRAME_FIELDS) delete keyframes[field];
  return { ...Object.fromEntries(FILM_LOOK_FIELDS.map((field) => [field, undefined])), keyframes };
}

/** Starting point when the creator adds the effect: light grain, a little halation and bloom, soft edges. */
export function filmLookPreset(props: PropsLike): Record<string, unknown> {
  return {
    ...filmLookRemovalPatch(props),
    ...Object.fromEntries(FILM_LOOK_FIELDS.map((field) => [field, FILM_LOOK_CONFIG[field].identity])),
    film_grain: 0.3, film_halation: 0.35, film_bloom: 0.15, film_vignette: 0.3,
  };
}
