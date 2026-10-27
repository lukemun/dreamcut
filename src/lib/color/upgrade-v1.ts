/**
 * Upgrades a linear-srgb-v1 grade to dreamcut-acescct-v2. Exposure, temperature, tint, saturation and
 * hue carry straight across. v1's tonal controls (contrast, highlights/shadows/whites/blacks, lift,
 * gamma, gain, master curve) are composed per channel and fitted into v2 custom curves, which is
 * near-exact (mean ΔE2000 under 0.1 per control). v1 applied lift/gamma/gain/curve after saturation
 * and v2 applies all tone before it, so those combined with saturation are approximate; the report
 * flags them and `pnpm verify:color-migration` measures them.
 */
import { IDENTITY_GRADE_V2, type GradeV2 } from "./grade-v2";
import { monotoneSpline, type CurvePoint } from "./splines";
import { GRADE_AXIS_WHITE, gradeAxisToLinear, linearToGradeAxis } from "./transfers";

export type ColorGradeV1 = {
  exposureEv: number; contrast: number;
  highlights: number; shadows: number; whites: number; blacks: number;
  saturation: number; temperature: number; tint: number; hueDegrees: number;
  liftRgb: readonly [number, number, number];
  gammaRgb: readonly [number, number, number];
  gainRgb: readonly [number, number, number];
  masterCurve: readonly number[];
};

export const UPGRADE_V1_VERSION = "v1-to-acescct-v2.1";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** v1's localized tone response, continuous (the same polynomial as buildToneTable, without its 65-sample table). */
function v1Tone(grade: ColorGradeV1, x: number): number {
  const inv = 1 - x;
  return clamp01(x + 0.15 * grade.blacks * inv ** 4 + 1.12 * grade.shadows * x * inv ** 3 + 1.12 * grade.highlights * x ** 3 * inv + 0.15 * grade.whites * x ** 4);
}

function v1Curve(grade: ColorGradeV1, x: number): number {
  const curve = grade.masterCurve, scaled = clamp01(x) * (curve.length - 1);
  const left = Math.floor(scaled), right = Math.min(curve.length - 1, left + 1);
  return curve[left]! + (curve[right]! - curve[left]!) * (scaled - left);
}

/** v1's tone steps before its saturation step, on linear light after exposure and white balance. */
export function v1PreSaturationTone(grade: ColorGradeV1, linear: number): number {
  const contrasted = clamp01(clamp01(linear) * grade.contrast + 0.18 * (1 - grade.contrast));
  return v1Tone(grade, contrasted);
}

/** v1's tone steps after its saturation and hue steps. */
export function v1PostSaturationTone(grade: ColorGradeV1, channel: 0 | 1 | 2, linear: number): number {
  const lift = grade.liftRgb[channel], gamma = grade.gammaRgb[channel], gain = grade.gainRgb[channel];
  let x = clamp01(linear * (1 - lift) + lift);
  x = clamp01(x ** (1 / gamma));
  x = clamp01(x * gain);
  return v1Curve(grade, x);
}

function toneIsIdentity(grade: ColorGradeV1) {
  const curveIdentity = grade.masterCurve.every((v, i) => Math.abs(v - i / (grade.masterCurve.length - 1)) < 1e-4);
  return grade.contrast === 1 && grade.highlights === 0 && grade.shadows === 0 && grade.whites === 0 && grade.blacks === 0
    && grade.liftRgb.every((v) => v === 0) && grade.gammaRgb.every((v) => v === 1) && grade.gainRgb.every((v) => v === 1) && curveIdentity;
}

const MAX_CURVE_POINTS = 16;
const FIT_TOLERANCE = 0.001;
const FIT_SAMPLES = 512;

/**
 * Fit a grade-axis curve to a linear-light function on 0..1, flat above white as v1 clipped there.
 * Knots are added greedily where the error is worst, so v1's clip and curve corners get a knot.
 */
function fitAxisCurve(fn: (linear: number) => number): { points: CurvePoint[]; maxError: number } {
  const target = (u: number) => linearToGradeAxis(fn(gradeAxisToLinear(Math.min(u, GRADE_AXIS_WHITE))));
  const knots = new Set<number>([0, GRADE_AXIS_WHITE / 2, GRADE_AXIS_WHITE]);
  const build = () => {
    const points: CurvePoint[] = [...knots].sort((a, b) => a - b).map((u) => [Number(u.toFixed(5)), Number(target(u).toFixed(5))]);
    points.push([1, points[points.length - 1]![1]]);
    return points;
  };
  for (;;) {
    const points = build(), spline = monotoneSpline(points);
    let maxError = 0, worst = 0;
    for (let i = 0; i <= FIT_SAMPLES; i += 1) {
      const u = (GRADE_AXIS_WHITE * i) / FIT_SAMPLES, error = Math.abs(spline(u) - target(u));
      if (error > maxError) { maxError = error; worst = u; }
    }
    if (maxError <= FIT_TOLERANCE || points.length >= MAX_CURVE_POINTS) return { points, maxError };
    knots.add(worst);
  }
}

export type UpgradeReport = {
  version: string;
  fittedCurves: boolean;
  maxCurveError: number;
  /** v1 applied lift/gamma/gain/curve after saturation; v2 applies them before, so this grade is approximate. */
  postSaturationToneMoved: boolean;
};

/** Fit on fixed, evenly spaced points, so curves fitted at different moments share their x and interpolate. */
function fitAxisCurveFixed(fn: (linear: number) => number, knots = MAX_CURVE_POINTS - 1): { points: CurvePoint[]; maxError: number } {
  const target = (u: number) => linearToGradeAxis(fn(gradeAxisToLinear(Math.min(u, GRADE_AXIS_WHITE))));
  const points: CurvePoint[] = Array.from({ length: knots }, (_, i) => {
    const u = (GRADE_AXIS_WHITE * i) / (knots - 1);
    return [Number(u.toFixed(5)), Number(target(u).toFixed(5))];
  });
  points.push([1, points[points.length - 1]![1]]);
  const spline = monotoneSpline(points);
  let maxError = 0;
  for (let i = 0; i <= FIT_SAMPLES; i += 1) { const u = (GRADE_AXIS_WHITE * i) / FIT_SAMPLES; maxError = Math.max(maxError, Math.abs(spline(u) - target(u))); }
  return { points, maxError };
}

/** `fixedKnots`: animated grades — per-channel curves on shared points, so keys fitted at different moments interpolate. */
export function upgradeColorGradeV1(v1: ColorGradeV1, options?: { fixedKnots?: boolean }): { grade: GradeV2; report: UpgradeReport } {
  const grade: GradeV2 = {
    ...IDENTITY_GRADE_V2,
    exposureEv: v1.exposureEv, temperature: v1.temperature, tint: v1.tint,
    saturation: v1.saturation, hueDegrees: v1.hueDegrees,
    curves: { ...IDENTITY_GRADE_V2.curves },
  };
  if (toneIsIdentity(v1) && !options?.fixedKnots) return { grade, report: { version: UPGRADE_V1_VERSION, fittedCurves: false, maxCurveError: 0, postSaturationToneMoved: false } };
  const fit = options?.fixedKnots ? fitAxisCurveFixed : fitAxisCurve;
  const fits = ([0, 1, 2] as const).map((channel) => fit((l) => v1PostSaturationTone(v1, channel, v1PreSaturationTone(v1, l))));
  const sameForAll = fits.every((fit) => JSON.stringify(fit.points) === JSON.stringify(fits[0]!.points));
  if (sameForAll && !options?.fixedKnots) grade.curves = { ...grade.curves, y: fits[0]!.points };
  else grade.curves = { ...grade.curves, r: fits[0]!.points, g: fits[1]!.points, b: fits[2]!.points };
  const postSatActive = v1.liftRgb.some((v) => v !== 0) || v1.gammaRgb.some((v) => v !== 1) || v1.gainRgb.some((v) => v !== 1)
    || v1.masterCurve.some((v, i) => Math.abs(v - i / (v1.masterCurve.length - 1)) > 1e-4);
  return {
    grade,
    report: {
      version: UPGRADE_V1_VERSION,
      fittedCurves: true,
      maxCurveError: Math.max(...fits.map((fit) => fit.maxError)),
      postSaturationToneMoved: postSatActive && (v1.saturation !== 1 || v1.hueDegrees !== 0),
    },
  };
}
