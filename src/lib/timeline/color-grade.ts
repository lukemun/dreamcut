import {
  hasKeyframes,
  readKeyframeMap,
  removeKeyframes,
  removeKeyframesAtTime,
  resolveNumberKeyframe,
  resolveTupleKeyframe,
  resolveVariableTupleKeyframe,
  upsertKeyframe,
  writeKeyframeMap,
} from "./keyframes";
import { COLOR_GRADE_LUT_KEYFRAME_FIELDS, readColorGradeLutProps, resetColorGradeLutProps } from "./cube-lut";
import { IDENTITY_GRADE_V2, SLICE_IDS, type GradeV2, type SliceId } from "../color/grade-v2";
import { buildGradeShaderDescriptor, type GradeShaderDescriptor } from "../color/grade-shader";
import { SDR_REC709, type SourceColorSpace } from "../color/io-transforms";
import { GRADE_AXIS_GREY } from "../color/transfers";
import { upgradeColorGradeV1, type ColorGradeV1 } from "../color/upgrade-v1";
import type { CurvePoint } from "../color/splines";

type PropsLike = Record<string, unknown> | null | undefined;

/**
 * Clip colour grades. Model `dreamcut-scene-v2` (src/lib/color/): scene-linear light, Rec.709
 * primaries, tone controls on an ACEScct-shaped axis, one float shader in every renderer. Grades
 * saved under `linear-srgb-v1` are upgraded when read and rewritten as v2 on the next write.
 */
export const COLOR_GRADE_MODEL = "dreamcut-scene-v2" as const;
export const LEGACY_COLOR_GRADE_MODEL = "linear-srgb-v1" as const;

export const COLOR_GRADE_FIELDS = [
  "grade_exposure_ev",
  "grade_contrast",
  "grade_contrast_pivot",
  "grade_highlights",
  "grade_shadows",
  "grade_whites",
  "grade_blacks",
  "grade_saturation",
  "grade_temperature",
  "grade_tint",
  "grade_hue_degrees",
] as const;

/** [red, green, blue, master]. */
export const COLOR_GRADE_WHEEL_FIELDS = ["grade_wheel_lift", "grade_wheel_gamma", "grade_wheel_gain", "grade_wheel_offset"] as const;
/** [hue degrees, saturation, density]. */
export const COLOR_GRADE_SLICE_FIELDS = SLICE_IDS.map((id) => `grade_slice_${id}` as const) as unknown as readonly `grade_slice_${SliceId}`[];
/** Flat [x0, y0, x1, y1, …]; empty is identity. */
export const COLOR_GRADE_CURVE_FIELDS = [
  "grade_curve_y", "grade_curve_r", "grade_curve_g", "grade_curve_b",
  "grade_curve_hue_hue", "grade_curve_hue_sat", "grade_curve_hue_lum", "grade_curve_lum_sat", "grade_curve_sat_sat",
] as const;

export const COLOR_GRADE_ADVANCED_FIELDS = [...COLOR_GRADE_WHEEL_FIELDS, ...COLOR_GRADE_SLICE_FIELDS, ...COLOR_GRADE_CURVE_FIELDS] as const;

/** v1 fields that only exist in stored linear-srgb-v1 grades; cleared when a grade is upgraded. */
export const LEGACY_COLOR_GRADE_FIELDS = ["grade_lift_rgb", "grade_gamma_rgb", "grade_gain_rgb", "grade_curve_master"] as const;

export const COLOR_GRADE_KEYFRAME_FIELDS = [
  ...COLOR_GRADE_FIELDS,
  ...COLOR_GRADE_ADVANCED_FIELDS,
  ...COLOR_GRADE_LUT_KEYFRAME_FIELDS,
] as const;

export type ColorGradeField = (typeof COLOR_GRADE_FIELDS)[number];
export type ColorGradeWheelField = (typeof COLOR_GRADE_WHEEL_FIELDS)[number];
export type ColorGradeSliceField = (typeof COLOR_GRADE_SLICE_FIELDS)[number];
export type ColorGradeCurveField = (typeof COLOR_GRADE_CURVE_FIELDS)[number];
export type AdvancedColorGradeField = ColorGradeWheelField | ColorGradeSliceField | ColorGradeCurveField;

export type ColorGrade = GradeV2;
export const IDENTITY_COLOR_GRADE: ColorGrade = IDENTITY_GRADE_V2;

type ScalarKey = "exposureEv" | "contrast" | "contrastPivot" | "highlights" | "shadows" | "whites" | "blacks" | "saturation" | "temperature" | "tint" | "hueDegrees";

export const COLOR_GRADE_FIELD_CONFIG = {
  grade_exposure_ev: { key: "exposureEv", min: -3, max: 3, identity: 0, precision: 2 },
  grade_contrast: { key: "contrast", min: 0, max: 2, identity: 1, precision: 3 },
  grade_contrast_pivot: { key: "contrastPivot", min: 0.2, max: 0.8, identity: Number(GRADE_AXIS_GREY.toFixed(4)), precision: 4 },
  grade_highlights: { key: "highlights", min: -1, max: 1, identity: 0, precision: 3 },
  grade_shadows: { key: "shadows", min: -1, max: 1, identity: 0, precision: 3 },
  grade_whites: { key: "whites", min: -1, max: 1, identity: 0, precision: 3 },
  grade_blacks: { key: "blacks", min: -1, max: 1, identity: 0, precision: 3 },
  grade_saturation: { key: "saturation", min: 0, max: 2, identity: 1, precision: 3 },
  grade_temperature: { key: "temperature", min: -1, max: 1, identity: 0, precision: 3 },
  grade_tint: { key: "tint", min: -1, max: 1, identity: 0, precision: 3 },
  grade_hue_degrees: { key: "hueDegrees", min: -180, max: 180, identity: 0, precision: 1 },
} as const satisfies Record<ColorGradeField, { key: ScalarKey; min: number; max: number; identity: number; precision: number }>;

/** Bounds for each non-scalar field. Wheels: [r, g, b, master]; slices: [hue, saturation, density]. */
export const WHEEL_CONFIG = {
  grade_wheel_lift: { key: "lift", rgb: 0.5, master: 0.5 },
  grade_wheel_gamma: { key: "gamma", rgb: 1, master: 1 },
  grade_wheel_gain: { key: "gain", rgb: 2, master: 2 },
  grade_wheel_offset: { key: "offset", rgb: 0.25, master: 0.25 },
} as const satisfies Record<ColorGradeWheelField, { key: "lift" | "gamma" | "gain" | "offset"; rgb: number; master: number }>;
export const SLICE_BOUNDS = { hue: [-60, 60], saturation: [0, 2], density: [-1, 1] } as const;
export const SLICE_IDENTITY = [0, 1, 0] as const;
export const CURVE_CONFIG = {
  grade_curve_y: { key: "y", y: [-0.25, 1.25], periodic: false, identity: null },
  grade_curve_r: { key: "r", y: [-0.25, 1.25], periodic: false, identity: null },
  grade_curve_g: { key: "g", y: [-0.25, 1.25], periodic: false, identity: null },
  grade_curve_b: { key: "b", y: [-0.25, 1.25], periodic: false, identity: null },
  grade_curve_hue_hue: { key: "hueHue", y: [-180, 180], periodic: true, identity: 0 },
  grade_curve_hue_sat: { key: "hueSat", y: [0, 2], periodic: true, identity: 1 },
  grade_curve_hue_lum: { key: "hueLum", y: [-2, 2], periodic: true, identity: 0 },
  grade_curve_lum_sat: { key: "lumSat", y: [0, 2], periodic: false, identity: 1 },
  grade_curve_sat_sat: { key: "satSat", y: [0, 2], periodic: false, identity: 1 },
} as const satisfies Record<ColorGradeCurveField, { key: keyof GradeV2["curves"]; y: readonly [number, number]; periodic: boolean; identity: number | null }>;
export const MAX_CURVE_POINTS = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
const round = (value: number, precision = 4) => Number(value.toFixed(precision));

export function normalizeColorGradeField(field: ColorGradeField, value: unknown) {
  const config = COLOR_GRADE_FIELD_CONFIG[field];
  return Number(clamp(finite(value) ?? config.identity, config.min, config.max).toFixed(config.precision));
}

const isWheel = (field: string): field is ColorGradeWheelField => field in WHEEL_CONFIG;
const isCurve = (field: string): field is ColorGradeCurveField => field in CURVE_CONFIG;

/** Curve points sorted by x, x within 0..1 (hue curves wrap), y within the curve's bounds, at most 16. */
export function normalizeCurvePoints(field: ColorGradeCurveField, value: unknown): number[] {
  const config = CURVE_CONFIG[field];
  if (!Array.isArray(value)) return [];
  const points: Array<[number, number]> = [];
  for (let i = 0; i + 1 < value.length; i += 2) {
    const x = finite(value[i]), y = finite(value[i + 1]);
    if (x == null || y == null) continue;
    points.push([round(config.periodic ? ((x % 1) + 1) % 1 : clamp(x, 0, 1)), round(clamp(y, config.y[0], config.y[1]))]);
  }
  points.sort((a, b) => a[0] - b[0]);
  const unique = points.filter((p, i) => i === 0 || p[0] - points[i - 1]![0] > 1e-4).slice(0, MAX_CURVE_POINTS);
  return unique.flat();
}

export function normalizeAdvancedColorGradeField(field: AdvancedColorGradeField, value: unknown): number[] {
  if (isWheel(field)) {
    const { rgb, master } = WHEEL_CONFIG[field];
    const raw = Array.isArray(value) && value.length === 4 ? value : [0, 0, 0, 0];
    return raw.map((entry, index) => round(clamp(finite(entry) ?? 0, -(index === 3 ? master : rgb), index === 3 ? master : rgb)));
  }
  if (isCurve(field)) return normalizeCurvePoints(field, value);
  const raw = Array.isArray(value) && value.length === 3 ? value : SLICE_IDENTITY;
  const bounds = [SLICE_BOUNDS.hue, SLICE_BOUNDS.saturation, SLICE_BOUNDS.density];
  return raw.map((entry, index) => round(clamp(finite(entry) ?? SLICE_IDENTITY[index]!, bounds[index]![0], bounds[index]![1]), index === 0 ? 1 : 3));
}

function isAdvancedIdentity(field: AdvancedColorGradeField, value: readonly number[]) {
  if (isCurve(field)) return value.length === 0;
  if (isWheel(field)) return value.every((v) => Math.abs(v) < 0.0005);
  return value.every((v, i) => Math.abs(v - SLICE_IDENTITY[i]!) < 0.0005);
}

const ALL_GRADE_FIELDS: readonly string[] = [...COLOR_GRADE_KEYFRAME_FIELDS, ...LEGACY_COLOR_GRADE_FIELDS];

export function hasColorGradeData(props: PropsLike) {
  if (!props) return false;
  if (props.lut_asset_id != null || props.lut_source_url != null) return true;
  // Undo restores a removed field as null; an empty field is not grade data.
  if (ALL_GRADE_FIELDS.some((field) => props[field] != null)) return true;
  const keyframes = readKeyframeMap(props);
  return ALL_GRADE_FIELDS.some((field) => (keyframes[field]?.length ?? 0) > 0);
}

// --- Upgrading stored v1 grades. ---

const V1_SCALARS = ["grade_exposure_ev", "grade_contrast", "grade_highlights", "grade_shadows", "grade_whites", "grade_blacks", "grade_saturation", "grade_temperature", "grade_tint", "grade_hue_degrees"] as const;
const V1_TONAL = ["grade_contrast", "grade_highlights", "grade_shadows", "grade_whites", "grade_blacks", ...LEGACY_COLOR_GRADE_FIELDS] as const;
const V1_IDENTITY: ColorGradeV1 = {
  exposureEv: 0, contrast: 1, highlights: 0, shadows: 0, whites: 0, blacks: 0, saturation: 1, temperature: 0, tint: 0, hueDegrees: 0,
  liftRgb: [0, 0, 0], gammaRgb: [1, 1, 1], gainRgb: [1, 1, 1], masterCurve: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
};
const V1_RANGES: Record<(typeof V1_SCALARS)[number], [number, number]> = {
  grade_exposure_ev: [-3, 3], grade_contrast: [0, 2], grade_highlights: [-1, 1], grade_shadows: [-1, 1], grade_whites: [-1, 1], grade_blacks: [-1, 1],
  grade_saturation: [0, 2], grade_temperature: [-1, 1], grade_tint: [-1, 1], grade_hue_degrees: [-180, 180],
};
const V1_KEYS: Record<(typeof V1_SCALARS)[number], keyof ColorGradeV1> = {
  grade_exposure_ev: "exposureEv", grade_contrast: "contrast", grade_highlights: "highlights", grade_shadows: "shadows", grade_whites: "whites",
  grade_blacks: "blacks", grade_saturation: "saturation", grade_temperature: "temperature", grade_tint: "tint", grade_hue_degrees: "hueDegrees",
};

function readV1AtTime(props: PropsLike, time: number | null): ColorGradeV1 {
  const scalar = (field: (typeof V1_SCALARS)[number]) => {
    const [min, max] = V1_RANGES[field], fallback = clamp(finite(props?.[field]) ?? (V1_IDENTITY[V1_KEYS[field]] as number), min, max);
    return time == null ? fallback : resolveNumberKeyframe(props, field, time, fallback, { min, max });
  };
  const tuple = (field: string, identity: readonly number[], min: number, max: number) => {
    const stored = Array.isArray(props?.[field]) && (props![field] as unknown[]).length === identity.length ? (props![field] as number[]) : identity;
    const value = time == null ? stored : resolveTupleKeyframe(props, field, time, stored, { min, max, length: identity.length });
    return value.map((v, i) => clamp(finite(v) ?? identity[i]!, min, max));
  };
  return {
    ...Object.fromEntries(V1_SCALARS.map((field) => [V1_KEYS[field], scalar(field)])) as unknown as ColorGradeV1,
    liftRgb: tuple("grade_lift_rgb", V1_IDENTITY.liftRgb, -0.25, 0.25) as unknown as ColorGradeV1["liftRgb"],
    gammaRgb: tuple("grade_gamma_rgb", V1_IDENTITY.gammaRgb, 0.25, 4) as unknown as ColorGradeV1["gammaRgb"],
    gainRgb: tuple("grade_gain_rgb", V1_IDENTITY.gainRgb, 0, 4) as unknown as ColorGradeV1["gainRgb"],
    masterCurve: tuple("grade_curve_master", V1_IDENTITY.masterCurve, 0, 1),
  };
}

const curveToFlat = (points: readonly CurvePoint[]) => points.flatMap(([x, y]) => [round(x), round(y)]);

function writeUpgradedCurves(target: Record<string, unknown>, grade: GradeV2) {
  for (const field of ["grade_curve_y", "grade_curve_r", "grade_curve_g", "grade_curve_b"] as const) {
    const points = grade.curves[CURVE_CONFIG[field].key];
    if (points.length) target[field] = normalizeCurvePoints(field, curveToFlat(points));
    else delete target[field];
  }
}

/** True when these props hold a stored linear-srgb-v1 grade. */
export function isLegacyColorGrade(props: PropsLike) {
  return props?.color_grade_model === LEGACY_COLOR_GRADE_MODEL
    || (props?.color_grade_model == null && LEGACY_COLOR_GRADE_FIELDS.some((field) => props?.[field] != null));
}

/**
 * Rewrite a stored v1 grade as v2 props (see src/lib/color/upgrade-v1.ts). Exposure, white balance,
 * saturation and hue keep their fields, values and keyframes; v1's tonal controls become custom curves, keyed at the union of their
 * key times when any were animated. Deterministic, so read-time and persisted upgrades agree.
 */
export function upgradeColorGradeProps(props: PropsLike): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(props ?? {}) };
  if (!isLegacyColorGrade(props)) return next;
  const keyframes = readKeyframeMap(props);
  const tonalTimes = [...new Set(V1_TONAL.flatMap((field) => (keyframes[field] ?? []).map((point) => point.t)))].sort((a, b) => a - b);
  const animated = tonalTimes.length > 0;
  const staticGrade = upgradeColorGradeV1(readV1AtTime(props, null), { fixedKnots: animated }).grade;
  for (const field of V1_TONAL) delete next[field];
  writeUpgradedCurves(next, staticGrade);
  const nextKeyframes = { ...keyframes };
  for (const field of V1_TONAL) delete nextKeyframes[field];
  if (animated) {
    // Every key is fitted per channel on the same points, so neighbouring keys interpolate.
    for (const field of ["grade_curve_r", "grade_curve_g", "grade_curve_b"] as const) {
      nextKeyframes[field] = tonalTimes.map((t) => {
        const upgraded = upgradeColorGradeV1(readV1AtTime(props, t), { fixedKnots: true }).grade;
        return { t, v: normalizeCurvePoints(field, curveToFlat(upgraded.curves[CURVE_CONFIG[field].key])), ease: "linear" as const };
      });
    }
  }
  const written = writeKeyframeMap(next, nextKeyframes);
  written.color_grade_model = COLOR_GRADE_MODEL;
  return stripIdentityStaticFields(written);
}

export function validateColorGradeModel(props: PropsLike): string | null {
  const hasData = hasColorGradeData(props);
  const model = props?.color_grade_model;
  if (!hasData && model == null) return null;
  if (model !== COLOR_GRADE_MODEL && !isLegacyColorGrade(props)) {
    return hasData && model == null
      ? `Color grade data is missing color_grade_model (${COLOR_GRADE_MODEL} required).`
      : `Unsupported color grade model: ${String(model)}.`;
  }
  try {
    readColorGradeLutProps(props);
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid color LUT data.";
  }
  return null;
}

function assertSupportedColorGrade(props: PropsLike) {
  const issue = validateColorGradeModel(props);
  if (issue) throw new Error(issue);
}

const current = (props: PropsLike) => (isLegacyColorGrade(props) ? upgradeColorGradeProps(props) : props);

function toPoints(flat: readonly number[]): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i]!, flat[i + 1]!]);
  return points;
}

function gradeFromValues(scalar: (field: ColorGradeField) => number, advanced: (field: AdvancedColorGradeField) => number[]): ColorGrade {
  const scalars = Object.fromEntries(COLOR_GRADE_FIELDS.map((field) => [COLOR_GRADE_FIELD_CONFIG[field].key, scalar(field)])) as Pick<ColorGrade, ScalarKey>;
  const wheel = (field: ColorGradeWheelField) => { const [r, g, b, master] = advanced(field); return { rgb: [r!, g!, b!] as const, master: master! }; };
  const curves = Object.fromEntries(COLOR_GRADE_CURVE_FIELDS.map((field) => [CURVE_CONFIG[field].key, toPoints(advanced(field))])) as unknown as ColorGrade["curves"];
  const slices = Object.fromEntries(SLICE_IDS.map((id) => {
    const [hue, saturation, density] = advanced(`grade_slice_${id}`);
    return [id, { hue: hue!, saturation: saturation!, density: density! }];
  })) as ColorGrade["slices"];
  return { ...scalars, lift: wheel("grade_wheel_lift"), gamma: wheel("grade_wheel_gamma"), gain: wheel("grade_wheel_gain"), offset: wheel("grade_wheel_offset"), curves, slices };
}

export function readColorGradeProps(props: PropsLike): ColorGrade {
  assertSupportedColorGrade(props);
  const source = current(props);
  return gradeFromValues(
    (field) => normalizeColorGradeField(field, source?.[field]),
    (field) => normalizeAdvancedColorGradeField(field, source?.[field]),
  );
}

export function resolveColorGradeAtTime(props: PropsLike, timeSeconds: number): ColorGrade {
  assertSupportedColorGrade(props);
  const source = current(props);
  const fallback = (field: AdvancedColorGradeField) => normalizeAdvancedColorGradeField(field, source?.[field]);
  return gradeFromValues(
    (field) => {
      const config = COLOR_GRADE_FIELD_CONFIG[field];
      return normalizeColorGradeField(field, resolveNumberKeyframe(source, field, timeSeconds, normalizeColorGradeField(field, source?.[field]), { min: config.min, max: config.max }));
    },
    (field) => normalizeAdvancedColorGradeField(field, isCurve(field)
      ? resolveVariableTupleKeyframe(source, field, timeSeconds, fallback(field))
      : resolveTupleKeyframe(source, field, timeSeconds, fallback(field), { length: isWheel(field) ? 4 : 3 })),
  );
}

/** The stored value of a non-scalar field, read back out of a resolved grade. */
export function advancedColorGradeValue(grade: ColorGrade, field: AdvancedColorGradeField): number[] {
  if (isWheel(field)) { const wheel = grade[WHEEL_CONFIG[field].key]; return [...wheel.rgb, wheel.master]; }
  if (isCurve(field)) return curveToFlat(grade.curves[CURVE_CONFIG[field].key]);
  const slice = grade.slices[field.slice("grade_slice_".length) as SliceId];
  return [slice.hue, slice.saturation, slice.density];
}

export function isIdentityColorGrade(grade: ColorGrade) {
  const scalars = COLOR_GRADE_FIELDS.every((field) => {
    const config = COLOR_GRADE_FIELD_CONFIG[field];
    return Math.abs(grade[config.key] - config.identity) < 0.0005;
  });
  const wheels = (["lift", "gamma", "gain", "offset"] as const).every((key) => Math.abs(grade[key].master) < 0.0005 && grade[key].rgb.every((v) => Math.abs(v) < 0.0005));
  const curves = Object.values(grade.curves).every((points) => points.length === 0);
  const slices = Object.values(grade.slices).every((s) => Math.abs(s.hue) < 0.0005 && Math.abs(s.saturation - 1) < 0.0005 && Math.abs(s.density) < 0.0005);
  return scalars && wheels && curves && slices;
}

function stripIdentityStaticFields(props: Record<string, unknown>) {
  for (const field of COLOR_GRADE_FIELDS) {
    if (Math.abs(normalizeColorGradeField(field, props[field]) - COLOR_GRADE_FIELD_CONFIG[field].identity) < 0.0005) delete props[field];
  }
  for (const field of COLOR_GRADE_ADVANCED_FIELDS) {
    if (isAdvancedIdentity(field, normalizeAdvancedColorGradeField(field, props[field]))) delete props[field];
  }
  if (!hasColorGradeData(props)) delete props.color_grade_model;
  return props;
}

export function commitColorGradeFieldAtTime(props: PropsLike, timeSeconds: number, field: ColorGradeField, value: number) {
  assertSupportedColorGrade(props);
  const source = current(props);
  const normalized = normalizeColorGradeField(field, value);
  const next = hasKeyframes(source, field) ? upsertKeyframe(source, field, timeSeconds, normalized) : { ...(source ?? {}), [field]: normalized };
  if (hasColorGradeData(next)) next.color_grade_model = COLOR_GRADE_MODEL;
  return stripIdentityStaticFields(next);
}

export function upsertColorGradeKeyframe(props: PropsLike, timeSeconds: number, field: ColorGradeField, value: number) {
  assertSupportedColorGrade(props);
  const next = upsertKeyframe(current(props), field, timeSeconds, normalizeColorGradeField(field, value));
  next.color_grade_model = COLOR_GRADE_MODEL;
  return next;
}

export function commitAdvancedColorGradeFieldAtTime(props: PropsLike, timeSeconds: number, field: AdvancedColorGradeField, value: readonly number[]) {
  assertSupportedColorGrade(props);
  const source = current(props);
  const normalized = normalizeAdvancedColorGradeField(field, value);
  const next = hasKeyframes(source, field) ? upsertKeyframe(source, field, timeSeconds, normalized) : { ...(source ?? {}), [field]: normalized };
  next.color_grade_model = COLOR_GRADE_MODEL;
  return stripIdentityStaticFields(next);
}

export function upsertAdvancedColorGradeKeyframe(props: PropsLike, timeSeconds: number, field: AdvancedColorGradeField, value: readonly number[]) {
  const next = upsertKeyframe(current(props), field, timeSeconds, normalizeAdvancedColorGradeField(field, value));
  next.color_grade_model = COLOR_GRADE_MODEL;
  return next;
}

export function resetColorGrade(props: PropsLike) {
  const fields = [...COLOR_GRADE_KEYFRAME_FIELDS, ...LEGACY_COLOR_GRADE_FIELDS];
  const next = removeKeyframes(props, fields);
  for (const field of fields) delete next[field];
  delete next.color_grade_model;
  return resetColorGradeLutProps(next);
}

export function clearColorGradeKeyframes(props: PropsLike) {
  return stripIdentityStaticFields(removeKeyframes(current(props), COLOR_GRADE_KEYFRAME_FIELDS));
}

export function removeColorGradeKeyframeAtTime(props: PropsLike, timeSeconds: number, field: ColorGradeField | AdvancedColorGradeField) {
  return stripIdentityStaticFields(removeKeyframesAtTime(current(props), [field], timeSeconds));
}

/**
 * The colour space of a clip's bound picture. Code-value HDR authorities (HDR_CODE_VIDEO_RECIPE) carry
 * HLG or PQ values tagged as BT.709; `source_color_space`, set when the clip is bound, says how to
 * decode them. Absent means an ordinary SDR picture.
 */
export function resolveSourceColorSpace(props: PropsLike): { source: SourceColorSpace; maxCllNits: number | null } {
  const value = props?.source_color_space as { transfer?: unknown; primaries?: unknown; max_cll_nits?: unknown } | undefined;
  const transfer = value?.transfer === "hlg" || value?.transfer === "pq" ? value.transfer : null;
  if (!transfer) return { source: SDR_REC709, maxCllNits: null };
  const primaries = value?.primaries === "rec709" || value?.primaries === "displayP3" ? value.primaries : "rec2020";
  const maxCll = finite(value?.max_cll_nits);
  return { source: { transfer, primaries }, maxCllNits: maxCll != null && maxCll > 0 ? maxCll : null };
}

export type ColorGradeFilterDescriptor = GradeShaderDescriptor & { passthrough?: boolean };

/** The shader inputs for a grade. Returns null at identity unless `includeIdentity` (keeps animated grades mounted). */
export function buildColorGradeFilterDescriptor(grade: ColorGrade, options?: { includeIdentity?: boolean; source?: SourceColorSpace; maxCllNits?: number | null }): ColorGradeFilterDescriptor | null {
  const source = options?.source ?? SDR_REC709;
  if (isIdentityColorGrade(grade) && source.transfer === "srgb" && !options?.includeIdentity) return null;
  return { ...buildGradeShaderDescriptor(grade, source, options?.maxCllNits),
    passthrough: isIdentityColorGrade(grade) && source.transfer === "srgb" && source.primaries === "rec709" };
}

export function colorGradeFieldToDisplay(field: ColorGradeField, grade: ColorGrade) {
  const value = grade[COLOR_GRADE_FIELD_CONFIG[field].key];
  if (field === "grade_contrast" || field === "grade_saturation") return (value - 1) * 100;
  if (field === "grade_contrast_pivot") return value * 100;
  if (field === "grade_temperature" || field === "grade_tint" || ["grade_highlights", "grade_shadows", "grade_whites", "grade_blacks"].includes(field)) return value * 100;
  return value;
}

export function colorGradeDisplayToField(field: ColorGradeField, displayValue: number) {
  if (field === "grade_contrast" || field === "grade_saturation") return 1 + displayValue / 100;
  if (field === "grade_contrast_pivot") return displayValue / 100;
  if (field === "grade_temperature" || field === "grade_tint" || ["grade_highlights", "grade_shadows", "grade_whites", "grade_blacks"].includes(field)) return displayValue / 100;
  return displayValue;
}

/**
 * A clip's grade as it looks at one moment, detached from the clip: every grade field resolved at
 * that time (keyframes flattened) plus its look file. "Copy a clip's look" cards are built from
 * it. The source colour space stays with each clip's own picture.
 */
export type ColorGradeSnapshot = {
  projectId: string;
  fields: Record<string, number | number[]>;
  lut: { assetId: string; sourceUrl: string; intensity: number } | null;
};

export function colorGradeSnapshot(props: PropsLike, timeSeconds: number, projectId: string): ColorGradeSnapshot {
  const grade = resolveColorGradeAtTime(props, timeSeconds);
  const fields: ColorGradeSnapshot["fields"] = {};
  for (const field of COLOR_GRADE_FIELDS) fields[field] = grade[COLOR_GRADE_FIELD_CONFIG[field].key];
  for (const field of COLOR_GRADE_ADVANCED_FIELDS) fields[field] = advancedColorGradeValue(grade, field);
  const lut = readColorGradeLutProps(current(props));
  const intensity = lut ? normalizeLutIntensityAt(current(props), timeSeconds, lut.intensity) : 0;
  return { projectId, fields, lut: lut ? { assetId: lut.assetId, sourceUrl: lut.sourceUrl, intensity } : null };
}

function normalizeLutIntensityAt(props: PropsLike, timeSeconds: number, fallback: number) {
  return Number(Math.min(1, Math.max(0, resolveNumberKeyframe(props, "lut_intensity", timeSeconds, fallback, { min: 0, max: 1 }))).toFixed(3));
}
