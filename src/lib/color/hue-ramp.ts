/**
 * Colour ramps for grading artwork, computed from the grade's own hue axis so a hue curve's strip and a
 * wheel's ring line up with what the shader changes. Computed here rather than written as colour literals.
 */
import { colorAtHue } from "./grade-v2";
import { gradeAxisToLinear, linearToSrgb } from "./transfers";

const css = (rgb: readonly number[]) => `rgb(${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(" ")})`;

/** Evenly spaced stops across one hue turn (0 = Rec.709 red), ending where they began. */
export function hueRampStops(count = 12, saturation = 0.85, luminance = 0.3): string[] {
  return Array.from({ length: count + 1 }, (_, i) => css(colorAtHue(i / count, saturation, luminance)));
}

/** CSS gradient for a hue axis running left to right. */
export function hueRampGradient(direction = "to right"): string {
  const stops = hueRampStops();
  return `linear-gradient(${direction}, ${stops.map((stop, i) => `${stop} ${((i / (stops.length - 1)) * 100).toFixed(2)}%`).join(", ")})`;
}

/**
 * CSS conic gradient for a colour wheel with Rec.709 red at `redAngleDegrees` (clockwise from the top).
 * Hue runs anticlockwise, as on a vectorscope; conic angles run clockwise, so the hue walks backwards.
 */
export function wheelRingGradient(redAngleDegrees: number, count = 24): string {
  const stops = Array.from({ length: count + 1 }, (_, i) => `${css(colorAtHue((count - i) / count, 0.9, 0.32))} ${((i / count) * 360).toFixed(1)}deg`);
  return `conic-gradient(from ${redAngleDegrees}deg, ${stops.join(", ")})`;
}

/**
 * Brightness along the grade axis as it displays: black at 0, SDR white about two-thirds across (diffuse
 * white on the log axis), white beyond. Under tone curves so the strip matches where tones really sit.
 */
export const TONE_RAMP_GRADIENT = `linear-gradient(to right, ${Array.from({ length: 17 }, (_, i) => {
  const level = Math.round(Math.min(1, Math.max(0, linearToSrgb(gradeAxisToLinear(i / 16)))) * 255);
  return `rgb(${level} ${level} ${level}) ${((i / 16) * 100).toFixed(2)}%`;
}).join(", ")})`;

/** Saturation axes run from grey to colour. */
export const SATURATION_RAMP_GRADIENT = `linear-gradient(to right, ${css(colorAtHue(0, 0, 0.3))}, ${css(colorAtHue(0, 1, 0.3))})`;
