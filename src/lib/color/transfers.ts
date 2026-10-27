/**
 * Transfer functions for the dreamcut-acescct-v2 colour model. Closed-form, from the published
 * specifications (IEC 61966-2-1 sRGB, ITU-R BT.2100 HLG and PQ, ACEScct S-2016-001). This is the
 * reference the shaders, the migration, the scopes and the FFmpeg fallback LUT are built from.
 */

/** sRGB piecewise EOTF. SDR video uses it too, matching how Chromium displays Rec.709 video. */
export function srgbToLinear(v: number): number {
  const sign = v < 0 ? -1 : 1, a = Math.abs(v);
  return sign * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4);
}

export function linearToSrgb(l: number): number {
  const sign = l < 0 ? -1 : 1, a = Math.abs(l);
  return sign * (a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055);
}

const HLG_A = 0.17883277;
const HLG_B = 1 - 4 * HLG_A;
const HLG_C = 0.5 - HLG_A * Math.log(4 * HLG_A);

/** BT.2100 HLG inverse OETF: signal 0..1 to scene light 0..1 (1 = peak). */
export function hlgToSceneLinear(v: number): number {
  const e = Math.max(0, v);
  return e <= 0.5 ? (e * e) / 3 : (Math.exp((e - HLG_C) / HLG_A) + HLG_B) / 12;
}

export function sceneLinearToHlg(l: number): number {
  const e = Math.max(0, l);
  return e <= 1 / 12 ? Math.sqrt(3 * e) : HLG_A * Math.log(12 * e - HLG_B) + HLG_C;
}

/** HLG reference white (75% signal, BT.2408) in scene light; dividing by it puts diffuse white at 1.0. */
export const HLG_REFERENCE_WHITE_SCENE = hlgToSceneLinear(0.75);

const PQ_M1 = 2610 / 16384;
const PQ_M2 = (2523 / 4096) * 128;
const PQ_C1 = 3424 / 4096;
const PQ_C2 = (2413 / 4096) * 32;
const PQ_C3 = (2392 / 4096) * 32;

/** BT.2100 PQ EOTF: signal 0..1 to absolute display light in nits. */
export function pqToNits(v: number): number {
  const p = Math.max(0, v) ** (1 / PQ_M2);
  return 10000 * (Math.max(p - PQ_C1, 0) / (PQ_C2 - PQ_C3 * p)) ** (1 / PQ_M1);
}

export function nitsToPq(nits: number): number {
  const y = Math.max(0, nits) / 10000;
  const p = y ** PQ_M1;
  return ((PQ_C1 + PQ_C2 * p) / (1 + PQ_C3 * p)) ** PQ_M2;
}

/** BT.2408 HDR reference white, and the luminance that relative 1.0 means for PQ sources. */
export const REFERENCE_WHITE_NITS = 203;

const CCT_X_BREAK = 0.0078125;
const CCT_Y_BREAK = 0.155251141552511;
const CCT_A = 10.5402377416545;
const CCT_B = 0.0729055341958355;

/** ACEScct encoding of scene-linear AP1. */
export function linearToAcescct(l: number): number {
  return l <= CCT_X_BREAK ? CCT_A * l + CCT_B : (Math.log2(l) + 9.72) / 17.52;
}

export function acescctToLinear(c: number): number {
  return c <= CCT_Y_BREAK ? (c - CCT_B) / CCT_A : 2 ** (c * 17.52 - 9.72);
}

/**
 * The normalised axis every curve, wheel and zone uses: 0 at linear 0, 1 at linear 16.
 * 18% grey ≈ 0.48, diffuse white ≈ 0.68, HLG peak (≈ 3.78 relative) ≈ 0.83. Values outside 0..1 extend linearly.
 */
const CCT_AT_ZERO = linearToAcescct(0);
const CCT_AT_SIXTEEN = linearToAcescct(16);
export function linearToGradeAxis(l: number): number {
  return (linearToAcescct(l) - CCT_AT_ZERO) / (CCT_AT_SIXTEEN - CCT_AT_ZERO);
}
export function gradeAxisToLinear(u: number): number {
  return acescctToLinear(u * (CCT_AT_SIXTEEN - CCT_AT_ZERO) + CCT_AT_ZERO);
}
export const GRADE_AXIS_GREY = linearToGradeAxis(0.18);
export const GRADE_AXIS_WHITE = linearToGradeAxis(1);
