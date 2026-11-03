/**
 * How each grade field is shown, shared by Properties → Color and proposal cards so both hosts use the
 * same labels, ranges and units. Values are stored as color-grade.ts defines them.
 */
import { CURVE_CONFIG, WHEEL_CONFIG, type ColorGradeCurveField, type ColorGradeSliceField, type ColorGradeWheelField } from "@/lib/timeline/color-grade";
import { SKIN_HUE, SLICE_CENTRES } from "@/lib/color/grade-v2";
import { GRADE_AXIS_GREY, GRADE_AXIS_WHITE } from "@/lib/color/transfers";
import type { CurveGraphKind } from "./CurveGraph";

/**
 * `puck`: the colour shift the rim reaches, about twice a strong look (measured on an HLG clip: gain
 * 0.06 is already a clear warm tint, 0.2 is unusable), so the whole wheel is useful travel. Exact
 * values can still go to the stored bounds.
 */
export const WHEEL_SPECS: Record<ColorGradeWheelField, { label: string; puck: number }> = {
  // "… color" keeps them apart from the Shadows/Highlights tone sliders above.
  grade_wheel_lift: { label: "Shadows color", puck: 0.08 },
  grade_wheel_gamma: { label: "Midtones color", puck: 0.15 },
  grade_wheel_gain: { label: "Highlights color", puck: 0.12 },
  grade_wheel_offset: { label: "Overall color", puck: 0.05 },
};
export const wheelRanges = (field: ColorGradeWheelField) => ({ rgbRange: WHEEL_SPECS[field].puck, valueRange: WHEEL_CONFIG[field].rgb, masterRange: WHEEL_CONFIG[field].master });

const HUE_NAMES: Array<[number, string]> = [
  [SLICE_CENTRES.red, "reds"], [SKIN_HUE, "skin tones"], [SLICE_CENTRES.yellow, "yellows"], [SLICE_CENTRES.green, "greens"],
  [SLICE_CENTRES.cyan, "cyans"], [SLICE_CENTRES.blue, "blues"], [SLICE_CENTRES.magenta, "magentas"],
];
export function hueName(hue: number) {
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
  return HUE_NAMES.reduce((best, entry) => (distance(entry[0], hue) < distance(best[0], hue) ? entry : best))[1];
}
function toneName(x: number) {
  if (x < GRADE_AXIS_GREY * 0.55) return "deep shadows";
  if (x < GRADE_AXIS_GREY * 0.9) return "shadows";
  if (x < (GRADE_AXIS_GREY + GRADE_AXIS_WHITE) / 2) return "midtones";
  if (x <= GRADE_AXIS_WHITE + 0.02) return "highlights";
  return "brights";
}
const percent = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number, unit: string, digits = 0) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;

/** Tone curves show 0..1 of the grade axis, as Resolve does; the stored bounds allow a little more for exact values. */
const TONE_CURVE_VIEW = [0, 1] as const;

export const CURVE_SPECS: Record<ColorGradeCurveField, { label: string; group: "Tone" | "Color"; kind: CurveGraphKind }> = {
  grade_curve_y: { label: "Brightness", group: "Tone", kind: { identity: "diagonal", yRange: TONE_CURVE_VIEW, background: "tone", describeX: toneName, describeY: percent, yUnit: "%", toDisplayY: (y) => y * 100, fromDisplayY: (v) => v / 100 } },
  grade_curve_r: { label: "Red", group: "Tone", kind: { identity: "diagonal", yRange: TONE_CURVE_VIEW, background: "tone", describeX: toneName, describeY: percent, yUnit: "%", toDisplayY: (y) => y * 100, fromDisplayY: (v) => v / 100 } },
  grade_curve_g: { label: "Green", group: "Tone", kind: { identity: "diagonal", yRange: TONE_CURVE_VIEW, background: "tone", describeX: toneName, describeY: percent, yUnit: "%", toDisplayY: (y) => y * 100, fromDisplayY: (v) => v / 100 } },
  grade_curve_b: { label: "Blue", group: "Tone", kind: { identity: "diagonal", yRange: TONE_CURVE_VIEW, background: "tone", describeX: toneName, describeY: percent, yUnit: "%", toDisplayY: (y) => y * 100, fromDisplayY: (v) => v / 100 } },
  grade_curve_hue_hue: { label: "Hue vs Hue", group: "Color", kind: { identity: 0, periodic: true, yRange: CURVE_CONFIG.grade_curve_hue_hue.y, background: "hue", describeX: hueName, describeY: (y) => signed(y, "°"), yUnit: "°" } },
  grade_curve_hue_sat: { label: "Hue vs Saturation", group: "Color", kind: { identity: 1, periodic: true, yRange: CURVE_CONFIG.grade_curve_hue_sat.y, background: "hue", describeX: hueName, describeY: percent, yUnit: "%", toDisplayY: (y) => y * 100, fromDisplayY: (v) => v / 100 } },
  grade_curve_hue_lum: { label: "Hue vs Brightness", group: "Color", kind: { identity: 0, periodic: true, yRange: CURVE_CONFIG.grade_curve_hue_lum.y, background: "hue", describeX: hueName, describeY: (y) => signed(y, " stops", 2), yUnit: "stops" } },
  grade_curve_lum_sat: { label: "Brightness vs Saturation", group: "Color", kind: { identity: 1, yRange: CURVE_CONFIG.grade_curve_lum_sat.y, background: "tone", describeX: toneName, describeY: percent, yUnit: "%", toDisplayY: (y) => y * 100, fromDisplayY: (v) => v / 100 } },
  grade_curve_sat_sat: { label: "Saturation vs Saturation", group: "Color", kind: { identity: 1, yRange: CURVE_CONFIG.grade_curve_sat_sat.y, background: "saturation", describeX: (x) => `${percent(x)} saturation`, describeY: percent, yUnit: "%", toDisplayY: (y) => y * 100, fromDisplayY: (v) => v / 100 } },
};

export const SLICE_SPECS: Record<ColorGradeSliceField, string> = {
  grade_slice_red: "Reds", grade_slice_yellow: "Yellows", grade_slice_green: "Greens", grade_slice_cyan: "Cyans",
  grade_slice_blue: "Blues", grade_slice_magenta: "Magentas", grade_slice_skin: "Skin",
};
