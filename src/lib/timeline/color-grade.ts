import {
  hasKeyframes,
  readKeyframeMap,
  removeKeyframes,
  removeKeyframesAtTime,
  resolveNumberKeyframe,
  resolveTupleKeyframe,
  upsertKeyframe,
} from "./keyframes";
import { COLOR_GRADE_LUT_KEYFRAME_FIELDS, readColorGradeLutProps, resetColorGradeLutProps } from "./cube-lut";

type PropsLike = Record<string, unknown> | null | undefined;

export const COLOR_GRADE_MODEL = "linear-srgb-v1" as const;

export const COLOR_GRADE_FIELDS = [
  "grade_exposure_ev",
  "grade_contrast",
  "grade_highlights",
  "grade_shadows",
  "grade_whites",
  "grade_blacks",

  "grade_saturation",
  "grade_temperature",
  "grade_tint",
  "grade_hue_degrees",
] as const;

export const COLOR_GRADE_ADVANCED_FIELDS = [
  "grade_lift_rgb",
  "grade_gamma_rgb",
  "grade_gain_rgb",
  "grade_curve_master",
] as const;

export const COLOR_GRADE_KEYFRAME_FIELDS = [
  ...COLOR_GRADE_FIELDS,
  ...COLOR_GRADE_ADVANCED_FIELDS,
  ...COLOR_GRADE_LUT_KEYFRAME_FIELDS,
] as const;

export type ColorGradeField = (typeof COLOR_GRADE_FIELDS)[number];
export type AdvancedColorGradeField = (typeof COLOR_GRADE_ADVANCED_FIELDS)[number];

export type ColorGrade = {
  exposureEv: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;

  saturation: number;
  temperature: number;
  tint: number;
  hueDegrees: number;
  liftRgb: readonly [number, number, number];
  gammaRgb: readonly [number, number, number];
  gainRgb: readonly [number, number, number];
  masterCurve: readonly [number, number, number, number, number, number, number, number, number];
};

export const IDENTITY_COLOR_GRADE: ColorGrade = {
  exposureEv: 0,
  contrast: 1,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,

  saturation: 1,
  temperature: 0,
  tint: 0,
  hueDegrees: 0,
  liftRgb: [0, 0, 0],
  gammaRgb: [1, 1, 1],
  gainRgb: [1, 1, 1],
  masterCurve: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
};

/** Keep an edited tone-curve point between its neighbours so the preview and
 * committed grade cannot disagree or flatten a later point during normalize. */
export function updateMasterCurvePoint(
  curve: readonly number[],
  index: number,
  value: number,
): number[] {
  if (index <= 0 || index >= curve.length - 1) return [...curve];
  const lower = curve[index - 1] ?? 0;
  const upper = curve[index + 1] ?? 1;
  const next = [...curve];
  next[index] = Number(clamp(finite(value) ?? curve[index] ?? lower, lower, upper).toFixed(4));
  return next;
}

export const COLOR_GRADE_FIELD_CONFIG = {
  grade_exposure_ev: { key: "exposureEv", min: -3, max: 3, identity: 0, precision: 2 },
  grade_contrast: { key: "contrast", min: 0, max: 2, identity: 1, precision: 3 },
  grade_highlights: { key: "highlights", min: -1, max: 1, identity: 0, precision: 3 },
  grade_shadows: { key: "shadows", min: -1, max: 1, identity: 0, precision: 3 },
  grade_whites: { key: "whites", min: -1, max: 1, identity: 0, precision: 3 },
  grade_blacks: { key: "blacks", min: -1, max: 1, identity: 0, precision: 3 },
  grade_saturation: { key: "saturation", min: 0, max: 2, identity: 1, precision: 3 },
  grade_temperature: { key: "temperature", min: -1, max: 1, identity: 0, precision: 3 },
  grade_tint: { key: "tint", min: -1, max: 1, identity: 0, precision: 3 },
  grade_hue_degrees: { key: "hueDegrees", min: -180, max: 180, identity: 0, precision: 1 },
} as const satisfies Record<ColorGradeField, {
  key: keyof ColorGrade;
  min: number;
  max: number;
  identity: number;
  precision: number;
}>;

export type ColorGradeFilterDescriptor = {
  exposureSlope: number;
  redGain: number;
  greenGain: number;
  blueGain: number;
  contrastSlope: number;
  contrastIntercept: number;
  saturation: number;
  hueDegrees: number;
  liftSlope: readonly [number, number, number];
  liftIntercept: readonly [number, number, number];
  gammaExponent: readonly [number, number, number];
  gainSlope: readonly [number, number, number];
  masterCurveTable: readonly number[];
  toneTable: readonly number[];
  toneActive: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeColorGradeField(field: ColorGradeField, value: unknown) {
  const config = COLOR_GRADE_FIELD_CONFIG[field];
  const numeric = finite(value) ?? config.identity;
  return Number(clamp(numeric, config.min, config.max).toFixed(config.precision));
}

export function hasColorGradeData(props: PropsLike) {
  if (!props) return false;
  if (props.lut_asset_id != null || props.lut_source_url != null) return true;
  if (COLOR_GRADE_KEYFRAME_FIELDS.some((field) => field in props)) return true;
  const keyframes = readKeyframeMap(props);
  return COLOR_GRADE_KEYFRAME_FIELDS.some((field) => (keyframes[field]?.length ?? 0) > 0);
}

function normalizeTuple(value: unknown, identity: readonly number[], min: number, max: number, precision = 4) {
  const raw = Array.isArray(value) && value.length === identity.length ? value : identity;
  return raw.map((entry, index) => Number(clamp(finite(entry) ?? identity[index]!, min, max).toFixed(precision)));
}

export function normalizeAdvancedColorGradeField(field: AdvancedColorGradeField, value: unknown) {
  if (field === "grade_lift_rgb") return normalizeTuple(value, IDENTITY_COLOR_GRADE.liftRgb, -0.25, 0.25);
  if (field === "grade_gamma_rgb") return normalizeTuple(value, IDENTITY_COLOR_GRADE.gammaRgb, 0.25, 4);
  if (field === "grade_gain_rgb") return normalizeTuple(value, IDENTITY_COLOR_GRADE.gainRgb, 0, 4);
  const curve = normalizeTuple(value, IDENTITY_COLOR_GRADE.masterCurve, 0, 1);
  // A master curve must be monotonic so it cannot fold luminance back on itself.
  return curve.map((entry, index) => index === 0 ? 0 : index === curve.length - 1 ? 1 : entry)
    .reduce<number[]>((result, entry) => [...result, Math.max(result[result.length - 1] ?? 0, entry)], []);
}

export function validateColorGradeModel(props: PropsLike): string | null {
  const hasData = hasColorGradeData(props);
  const model = props?.color_grade_model;
  if (!hasData && model == null) return null;
  if (model !== COLOR_GRADE_MODEL) {
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

export function readColorGradeProps(props: PropsLike): ColorGrade {
  assertSupportedColorGrade(props);
  return {
    exposureEv: normalizeColorGradeField("grade_exposure_ev", props?.grade_exposure_ev),
    contrast: normalizeColorGradeField("grade_contrast", props?.grade_contrast),
    highlights: normalizeColorGradeField("grade_highlights", props?.grade_highlights),
    shadows: normalizeColorGradeField("grade_shadows", props?.grade_shadows),
    whites: normalizeColorGradeField("grade_whites", props?.grade_whites),
    blacks: normalizeColorGradeField("grade_blacks", props?.grade_blacks),
    saturation: normalizeColorGradeField("grade_saturation", props?.grade_saturation),
    temperature: normalizeColorGradeField("grade_temperature", props?.grade_temperature),
    tint: normalizeColorGradeField("grade_tint", props?.grade_tint),
    hueDegrees: normalizeColorGradeField("grade_hue_degrees", props?.grade_hue_degrees),
    liftRgb: normalizeAdvancedColorGradeField("grade_lift_rgb", props?.grade_lift_rgb) as [number, number, number],
    gammaRgb: normalizeAdvancedColorGradeField("grade_gamma_rgb", props?.grade_gamma_rgb) as [number, number, number],
    gainRgb: normalizeAdvancedColorGradeField("grade_gain_rgb", props?.grade_gain_rgb) as [number, number, number],
    masterCurve: normalizeAdvancedColorGradeField("grade_curve_master", props?.grade_curve_master) as unknown as ColorGrade["masterCurve"],
  };
}

export function resolveColorGradeAtTime(props: PropsLike, timeSeconds: number): ColorGrade {
  const fallback = readColorGradeProps(props);
  const primary = Object.fromEntries(COLOR_GRADE_FIELDS.map((field) => {
    const config = COLOR_GRADE_FIELD_CONFIG[field];
    const value = resolveNumberKeyframe(
      props,
      field,
      timeSeconds,
      fallback[config.key],
      { min: config.min, max: config.max },
    );
    return [config.key, normalizeColorGradeField(field, value)];
  })) as Pick<ColorGrade, "exposureEv" | "contrast" | "highlights" | "shadows" | "whites" | "blacks" | "saturation" | "temperature" | "tint" | "hueDegrees">;
  return {
    ...primary,
    liftRgb: normalizeAdvancedColorGradeField("grade_lift_rgb", resolveTupleKeyframe(props, "grade_lift_rgb", timeSeconds, fallback.liftRgb, { min: -0.25, max: 0.25, length: 3 })) as [number, number, number],
    gammaRgb: normalizeAdvancedColorGradeField("grade_gamma_rgb", resolveTupleKeyframe(props, "grade_gamma_rgb", timeSeconds, fallback.gammaRgb, { min: 0.25, max: 4, length: 3 })) as [number, number, number],
    gainRgb: normalizeAdvancedColorGradeField("grade_gain_rgb", resolveTupleKeyframe(props, "grade_gain_rgb", timeSeconds, fallback.gainRgb, { min: 0, max: 4, length: 3 })) as [number, number, number],
    masterCurve: normalizeAdvancedColorGradeField("grade_curve_master", resolveTupleKeyframe(props, "grade_curve_master", timeSeconds, fallback.masterCurve, { min: 0, max: 1, length: 9 })) as unknown as ColorGrade["masterCurve"],
  };
}

export function isIdentityColorGrade(grade: ColorGrade) {
  const primaryIdentity = COLOR_GRADE_FIELDS.every((field) => {
    const config = COLOR_GRADE_FIELD_CONFIG[field];
    return Math.abs(grade[config.key] - config.identity) < 0.0005;
  });
  const tupleIdentity = (actual: readonly number[], identity: readonly number[]) => actual.every((value, index) => Math.abs(value - identity[index]!) < 0.0005);
  return primaryIdentity
    && tupleIdentity(grade.liftRgb, IDENTITY_COLOR_GRADE.liftRgb)
    && tupleIdentity(grade.gammaRgb, IDENTITY_COLOR_GRADE.gammaRgb)
    && tupleIdentity(grade.gainRgb, IDENTITY_COLOR_GRADE.gainRgb)
    && tupleIdentity(grade.masterCurve, IDENTITY_COLOR_GRADE.masterCurve);
}

function stripIdentityStaticFields(props: Record<string, unknown>) {
  for (const field of COLOR_GRADE_FIELDS) {
    const config = COLOR_GRADE_FIELD_CONFIG[field];
    if (Math.abs(normalizeColorGradeField(field, props[field]) - config.identity) < 0.0005) {
      delete props[field];
    }
  }
  for (const field of COLOR_GRADE_ADVANCED_FIELDS) {
    const identity = field === "grade_lift_rgb" ? IDENTITY_COLOR_GRADE.liftRgb
      : field === "grade_gamma_rgb" ? IDENTITY_COLOR_GRADE.gammaRgb
        : field === "grade_gain_rgb" ? IDENTITY_COLOR_GRADE.gainRgb
          : IDENTITY_COLOR_GRADE.masterCurve;
    const value = normalizeAdvancedColorGradeField(field, props[field]);
    if (value.every((entry, index) => Math.abs(entry - identity[index]!) < 0.0005)) delete props[field];
  }
  if (!hasColorGradeData(props)) delete props.color_grade_model;
  return props;
}

export function commitColorGradeFieldAtTime(
  props: PropsLike,
  timeSeconds: number,
  field: ColorGradeField,
  value: number,
) {
  assertSupportedColorGrade(props);
  const normalized = normalizeColorGradeField(field, value);
  let next: Record<string, unknown>;
  if (hasKeyframes(props, field)) {
    next = upsertKeyframe(props, field, timeSeconds, normalized);
  } else {
    next = { ...(props ?? {}), [field]: normalized };
  }
  if (hasColorGradeData(next)) next.color_grade_model = COLOR_GRADE_MODEL;
  return stripIdentityStaticFields(next);
}

export function upsertColorGradeKeyframe(
  props: PropsLike,
  timeSeconds: number,
  field: ColorGradeField,
  value: number,
) {
  assertSupportedColorGrade(props);
  const next = upsertKeyframe(props, field, timeSeconds, normalizeColorGradeField(field, value));
  next.color_grade_model = COLOR_GRADE_MODEL;
  return next;
}

export function commitAdvancedColorGradeFieldAtTime(
  props: PropsLike,
  timeSeconds: number,
  field: AdvancedColorGradeField,
  value: readonly number[],
) {
  assertSupportedColorGrade(props);
  const normalized = normalizeAdvancedColorGradeField(field, value);
  const next = hasKeyframes(props, field)
    ? upsertKeyframe(props, field, timeSeconds, normalized)
    : { ...(props ?? {}), [field]: normalized };
  next.color_grade_model = COLOR_GRADE_MODEL;
  return stripIdentityStaticFields(next);
}

export function upsertAdvancedColorGradeKeyframe(
  props: PropsLike,
  timeSeconds: number,
  field: AdvancedColorGradeField,
  value: readonly number[],
) {
  const next = upsertKeyframe(props, field, timeSeconds, normalizeAdvancedColorGradeField(field, value));
  next.color_grade_model = COLOR_GRADE_MODEL;
  return next;
}

export function resetColorGrade(props: PropsLike) {
  const next = removeKeyframes(props, COLOR_GRADE_KEYFRAME_FIELDS);
  for (const field of COLOR_GRADE_KEYFRAME_FIELDS) delete next[field];
  delete next.color_grade_model;
  return resetColorGradeLutProps(next);
}

export function clearColorGradeKeyframes(props: PropsLike) {
  const next = removeKeyframes(props, COLOR_GRADE_KEYFRAME_FIELDS);
  return stripIdentityStaticFields(next);
}

export function removeColorGradeKeyframeAtTime(
  props: PropsLike,
  timeSeconds: number,
  field: ColorGradeField | AdvancedColorGradeField,
) {
  return stripIdentityStaticFields(removeKeyframesAtTime(props, [field], timeSeconds));
}

export function buildColorGradeFilterDescriptor(grade: ColorGrade, options?: { includeIdentity?: boolean }): ColorGradeFilterDescriptor | null {
  if (isIdentityColorGrade(grade) && !options?.includeIdentity) return null;
  // Relative white-balance response for linear-srgb-v1. Coefficients are intentionally
  // bounded and versioned; changing them requires a new color_grade_model.
  const redGain = clamp(1 + grade.temperature * 0.12 + grade.tint * 0.03, 0.75, 1.25);
  const greenGain = clamp(1 - grade.tint * 0.08, 0.75, 1.25);
  const blueGain = clamp(1 - grade.temperature * 0.12 + grade.tint * 0.03, 0.75, 1.25);
  const contrastPivot = 0.18;
  const interpolateCurve = (position: number) => {
    const scaled = position * (grade.masterCurve.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(grade.masterCurve.length - 1, left + 1);
    const progress = scaled - left;
    return Number(((grade.masterCurve[left] ?? 0) + ((grade.masterCurve[right] ?? 1) - (grade.masterCurve[left] ?? 0)) * progress).toFixed(6));
  };
  return {
    exposureSlope: Number(Math.pow(2, grade.exposureEv).toFixed(6)),
    redGain: Number(redGain.toFixed(6)),
    greenGain: Number(greenGain.toFixed(6)),
    blueGain: Number(blueGain.toFixed(6)),
    contrastSlope: grade.contrast,
    contrastIntercept: Number((contrastPivot * (1 - grade.contrast)).toFixed(6)),
    saturation: grade.saturation,
    hueDegrees: grade.hueDegrees,
    liftSlope: grade.liftRgb.map((value) => Number((1 - value).toFixed(6))) as [number, number, number],
    liftIntercept: grade.liftRgb.map((value) => Number(value.toFixed(6))) as [number, number, number],
    gammaExponent: grade.gammaRgb.map((value) => Number((1 / value).toFixed(6))) as [number, number, number],
    gainSlope: grade.gainRgb.map((value) => Number(value.toFixed(6))) as [number, number, number],
    toneTable: buildToneTable(grade),
    toneActive: [grade.highlights, grade.shadows, grade.whites, grade.blacks].some((value) => value !== 0),
    masterCurveTable: Array.from({ length: 17 }, (_, index) => interpolateCurve(index / 16)),
  };
}

export function colorGradeFieldToDisplay(field: ColorGradeField, grade: ColorGrade) {
  const value = grade[COLOR_GRADE_FIELD_CONFIG[field].key];
  if (field === "grade_contrast" || field === "grade_saturation") return (value - 1) * 100;
  if (field === "grade_temperature" || field === "grade_tint" || ["grade_highlights", "grade_shadows", "grade_whites", "grade_blacks"].includes(field)) return value * 100;
  return value;
}

export function colorGradeDisplayToField(field: ColorGradeField, displayValue: number) {
  if (field === "grade_contrast" || field === "grade_saturation") return 1 + displayValue / 100;
  if (field === "grade_temperature" || field === "grade_tint" || ["grade_highlights", "grade_shadows", "grade_whites", "grade_blacks"].includes(field)) return displayValue / 100;
  return displayValue;
}

/** Localized linear-light tone responses. Preserve monotonicity under combined
 * extremes; zero settings are an exact identity, including black and white. */
export function buildToneTable(grade: Pick<ColorGrade, "highlights" | "shadows" | "whites" | "blacks">): number[] {
  let previous = 0;
  return Array.from({ length: 65 }, (_, index) => {
    const x = index / 64, inv = 1 - x;
    const mapped = x + 0.15 * grade.blacks * inv ** 4
      + 1.12 * grade.shadows * x * inv ** 3
      + 1.12 * grade.highlights * x ** 3 * inv
      + 0.15 * grade.whites * x ** 4;
    previous = Math.max(previous, clamp(mapped, 0, 1));
    return Number(previous.toFixed(6));
  });
}
