/**
 * The linear-srgb-v1 grade as continuous maths, for measuring the upgrade to v2. Not a runtime
 * renderer: it omits v1's 8-bit rounding between steps, which was an artefact of SVG filters.
 */
import { apply, type Mat3, type Vec3 } from "./matrices";
import { linearToSrgb, srgbToLinear } from "./transfers";
import { v1PostSaturationTone, v1PreSaturationTone, type ColorGradeV1 } from "./upgrade-v1";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function saturateMatrix(s: number): Mat3 {
  return [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]];
}

function hueRotateMatrix(degrees: number): Mat3 {
  const c = Math.cos((degrees * Math.PI) / 180), s = Math.sin((degrees * Math.PI) / 180);
  return [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
  ];
}

/** sRGB-encoded in, sRGB-encoded out, as v1 graded an SDR clip. */
export function evaluateColorGradeV1(rgb: Vec3, grade: ColorGradeV1): Vec3 {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const gains: Vec3 = [
    clamp(1 + grade.temperature * 0.12 + grade.tint * 0.03, 0.75, 1.25),
    clamp(1 - grade.tint * 0.08, 0.75, 1.25),
    clamp(1 - grade.temperature * 0.12 + grade.tint * 0.03, 0.75, 1.25),
  ];
  const exposure = 2 ** grade.exposureEv;
  let lin = rgb.map((v, i) => clamp01(clamp01(srgbToLinear(v) * exposure) * gains[i]!)) as unknown as Vec3;
  lin = lin.map((v) => v1PreSaturationTone(grade, v)) as unknown as Vec3;
  lin = apply(saturateMatrix(grade.saturation), lin).map(clamp01) as unknown as Vec3;
  lin = apply(hueRotateMatrix(grade.hueDegrees), lin).map(clamp01) as unknown as Vec3;
  lin = lin.map((v, i) => v1PostSaturationTone(grade, i as 0 | 1 | 2, v)) as unknown as Vec3;
  return lin.map(linearToSrgb) as unknown as Vec3;
}
