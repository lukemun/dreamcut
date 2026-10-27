/**
 * The dreamcut-scene-v2 grade: what each control does to a scene-linear working pixel (Rec.709
 * primaries; tone controls on the ACEScct-shaped grade axis). Tone and
 * hue-indexed work is baked into a 1D atlas that the shaders sample the same way `evaluateGrade`
 * does, so the TypeScript reference, the CanvasKit shader and the Standard WebGL path agree.
 *
 * Order: exposure and white balance (linear) → offset, lift/gamma/gain, contrast, zones, then custom
 * curves (per channel, grade axis) → saturation and hue (v1's matrices) → hue/lum/sat curves and colour
 * slice (linear chroma; brightness changes in stops). Curves sit before saturation because upgraded v1
 * grades put contrast and zones there, and contrast with saturation is the common pairing.
 */
import { apply, lumaWeights, multiply, type Mat3, type Vec3 } from "./matrices";
import { inputToWorking, SDR_REC709, workingToDisplay } from "./io-transforms";
import { monotoneSpline, smoothCurve, type CurvePoint } from "./splines";
import { GRADE_AXIS_GREY, GRADE_AXIS_WHITE, gradeAxisToLinear, linearToGradeAxis } from "./transfers";

export const COLOR_GRADE_MODEL_V2 = "dreamcut-scene-v2" as const;

export type WheelValue = { rgb: Vec3; master: number };
export const SLICE_IDS = ["red", "yellow", "green", "cyan", "blue", "magenta", "skin"] as const;
export type SliceId = (typeof SLICE_IDS)[number];
export type SliceValue = { hue: number; saturation: number; density: number };

export type GradeCurves = {
  /** Tone curves on the grade axis; empty = identity. */
  y: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[];
  /** x = hue turn 0..1 (0 = Rec.709 red), y = hue shift in degrees. */
  hueHue: CurvePoint[];
  /** x = hue, y = saturation multiplier. */
  hueSat: CurvePoint[];
  /** x = hue, y = brightness shift in stops, scaled by saturation so neutrals stay put. */
  hueLum: CurvePoint[];
  /** x = luma on the grade axis, y = saturation multiplier. */
  lumSat: CurvePoint[];
  /** x = saturation (1 = a Rec.709 primary), y = saturation multiplier. */
  satSat: CurvePoint[];
};

export type GradeV2 = {
  exposureEv: number;
  temperature: number;
  tint: number;
  contrast: number;
  /** Grade-axis position contrast pivots around; defaults to 18% grey. */
  contrastPivot: number;
  highlights: number; shadows: number; whites: number; blacks: number;
  saturation: number;
  hueDegrees: number;
  /** Additive on the grade axis. */
  offset: WheelValue;
  /** Raises or lowers blacks with white fixed. */
  lift: WheelValue;
  /** Bends mid-tones; positive brightens. */
  gamma: WheelValue;
  /** Scales from black in stops; white moves, black stays. */
  gain: WheelValue;
  curves: GradeCurves;
  slices: Record<SliceId, SliceValue>;
};

const ZERO_WHEEL: WheelValue = { rgb: [0, 0, 0], master: 0 };
const NEUTRAL_SLICE: SliceValue = { hue: 0, saturation: 1, density: 0 };

export const IDENTITY_GRADE_V2: GradeV2 = {
  exposureEv: 0, temperature: 0, tint: 0,
  contrast: 1, contrastPivot: Number(GRADE_AXIS_GREY.toFixed(4)),
  highlights: 0, shadows: 0, whites: 0, blacks: 0,
  saturation: 1, hueDegrees: 0,
  offset: ZERO_WHEEL, lift: ZERO_WHEEL, gamma: ZERO_WHEEL, gain: ZERO_WHEEL,
  curves: { y: [], r: [], g: [], b: [], hueHue: [], hueSat: [], hueLum: [], lumSat: [], satSat: [] },
  slices: Object.fromEntries(SLICE_IDS.map((id) => [id, NEUTRAL_SLICE])) as Record<SliceId, SliceValue>,
};

/** One stop of brightness on the grade axis. */
export const GRADE_AXIS_STOP = linearToGradeAxis(2) - linearToGradeAxis(1);

// --- White balance: v1's bounded gains, in the same Rec.709 basis, so migrated values match. ---

export function whiteBalanceMatrix(temperature: number, tint: number): Mat3 {
  const clamp = (v: number) => Math.min(1.25, Math.max(0.75, v));
  return [[clamp(1 + temperature * 0.12 + tint * 0.03), 0, 0], [0, clamp(1 - tint * 0.08), 0], [0, 0, clamp(1 - temperature * 0.12 + tint * 0.03)]];
}

/** Global saturation and hue use v1's luminance-preserving matrices, so migrated grades match exactly. */
export function saturationHueMatrix(saturation: number, hueDegrees: number): Mat3 {
  const s = saturation, c = Math.cos((hueDegrees * Math.PI) / 180), n = Math.sin((hueDegrees * Math.PI) / 180);
  const sat: Mat3 = [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]];
  const hue: Mat3 = [
    [0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928],
    [0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.14, 0.072 - c * 0.072 - n * 0.283],
    [0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072],
  ];
  return multiply(hue, sat);
}

// --- Chroma in linear light: hue holds under exposure and desaturation; 0 = Rec.709 red, saturation 1 = a 709 primary. ---

const SQRT3 = Math.sqrt(3);
type Opponent = { m: number; c1: number; c2: number };
const toOpponent = (u: Vec3): Opponent => ({ m: (u[0] + u[1] + u[2]) / 3, c1: (2 * u[0] - u[1] - u[2]) / 2, c2: (SQRT3 / 2) * (u[1] - u[2]) });
const fromOpponent = ({ m, c1, c2 }: Opponent): Vec3 => [m + (2 / 3) * c1, m - c1 / 3 + c2 / SQRT3, m - c1 / 3 - c2 / SQRT3];
const LUMA = lumaWeights("rec709");
const lumaOf = (lin: Vec3) => LUMA[0] * lin[0] + LUMA[1] * lin[1] + LUMA[2] * lin[2];
const wrap = (x: number) => ((x % 1) + 1) % 1;
/** Chroma of a linear colour around its own luminance. */
const chromaOf = (lin: Vec3) => { const y = lumaOf(lin); return { y, o: toOpponent([lin[0] - y, lin[1] - y, lin[2] - y]) }; };
const REFERENCE_RED = chromaOf(inputToWorking([1, 0, 0], SDR_REC709));
export const HUE_ZERO = Math.atan2(REFERENCE_RED.o.c2, REFERENCE_RED.o.c1) / (2 * Math.PI);
export const SAT_NORM = Math.hypot(REFERENCE_RED.o.c1, REFERENCE_RED.o.c2) / REFERENCE_RED.y;

export function hueOfLinear(lin: Vec3): number {
  const { o } = chromaOf(lin);
  return wrap(Math.atan2(o.c2, o.c1) / (2 * Math.PI) - HUE_ZERO);
}
export function saturationOfLinear(lin: Vec3): number {
  const { y, o } = chromaOf(lin);
  return Math.hypot(o.c1, o.c2) / Math.max(Math.abs(y), 1e-6) / SAT_NORM;
}
export const hueOf = (encodedRec709: Vec3) => hueOfLinear(inputToWorking(encodedRec709, SDR_REC709));

/** Rotate and scale a colour's chroma around its luminance, keeping that luminance. */
function adjustChroma(lin: Vec3, radians: number, gain: number): Vec3 {
  const { y, o } = chromaOf(lin);
  const c = Math.cos(radians), s = Math.sin(radians);
  const d = fromOpponent({ m: o.m, c1: (o.c1 * c - o.c2 * s) * gain, c2: (o.c1 * s + o.c2 * c) * gain });
  return [d[0] + y, d[1] + y, d[2] + y];
}

/** A display-encoded colour at a hue on the grade's own hue axis, for curve and wheel artwork. */
export function colorAtHue(hue: number, saturation = 1, luminance = 0.25): Vec3 {
  const red = inputToWorking([1, 0, 0], SDR_REC709), { y } = chromaOf(red);
  const grey: Vec3 = [luminance, luminance, luminance];
  const reference = adjustChroma(red, 2 * Math.PI * wrap(hue), saturation);
  const scale = luminance / y;
  const linear = reference.map((c) => c * scale) as unknown as Vec3;
  return workingToDisplay(linear.map((c, i) => Math.max(c, grey[i]! * 0.02)) as unknown as Vec3, { sourcePeak: 1, gamutThreshold: 0.6 });
}

/** Slice centres, measured from the Rec.709 primaries and secondaries rather than assumed. */
export const SLICE_CENTRES: Record<Exclude<SliceId, "skin">, number> = {
  red: hueOf([1, 0, 0]), yellow: hueOf([1, 1, 0]), green: hueOf([0, 1, 0]),
  cyan: hueOf([0, 1, 1]), blue: hueOf([0, 0, 1]), magenta: hueOf([1, 0, 1]),
};
/** A typical skin tone; the Skin slice is a narrow window around it, gated by saturation. */
export const SKIN_HUE = hueOf([0.87, 0.67, 0.55]);
const SKIN_HALF_WIDTH = 15 / 360;

/** Raised-cosine weights for the six colour slices at a hue; they always sum to 1. */
export function sliceWeights(hue: number): Record<Exclude<SliceId, "skin">, number> {
  const ids = ["red", "yellow", "green", "cyan", "blue", "magenta"] as const;
  const weights = { red: 0, yellow: 0, green: 0, cyan: 0, blue: 0, magenta: 0 };
  for (let i = 0; i < ids.length; i += 1) {
    const a = SLICE_CENTRES[ids[i]!], b = SLICE_CENTRES[ids[(i + 1) % ids.length]!];
    const span = wrap(b - a), offset = wrap(hue - a);
    if (offset <= span) {
      const w = 0.5 * (1 + Math.cos((Math.PI * offset) / span));
      weights[ids[i]!] = w; weights[ids[(i + 1) % ids.length]!] = 1 - w;
      return weights;
    }
  }
  return weights;
}

export function skinWindow(hue: number): number {
  const d = Math.abs(((hue - SKIN_HUE + 1.5) % 1) - 0.5);
  return d >= SKIN_HALF_WIDTH ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / SKIN_HALF_WIDTH));
}

const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The Skin slice leaves near-neutrals and saturated colours alone. */
export const skinSaturationGate = (sat: number) => smoothstep(0.04, 0.12, sat) * (1 - smoothstep(0.6, 0.9, sat));

// --- Per-channel tone rows. ---

/** Offset, lift/gamma/gain, contrast and zones for one channel on the grade axis. */
export function primaryToneCurve(grade: GradeV2, channel: 0 | 1 | 2): (u: number) => number {
  const offset = grade.offset.master + grade.offset.rgb[channel];
  const lift = grade.lift.master + grade.lift.rgb[channel];
  const gainFactor = 2 ** (grade.gain.master + grade.gain.rgb[channel]);
  const gammaExponent = 2 ** -(grade.gamma.master + grade.gamma.rgb[channel]);
  const { contrast, contrastPivot: pivot, blacks, shadows, highlights, whites } = grade;
  return (input) => {
    let v = (input + offset) / GRADE_AXIS_WHITE;
    v = (v + lift * (1 - v)) * gainFactor;
    // Mid-tone power on 0..1, continued with matching slope above white and as-is below black.
    v = v <= 0 ? v : v <= 1 ? v ** gammaExponent : 1 + gammaExponent * (v - 1);
    let u = (v * GRADE_AXIS_WHITE - pivot) * contrast + pivot;
    const s = u / GRADE_AXIS_WHITE, c = Math.min(1, Math.max(0, s)), inv = 1 - c;
    u += GRADE_AXIS_WHITE * (0.15 * blacks * inv ** 4 + 1.12 * shadows * c * inv ** 3 + 1.12 * highlights * c ** 3 * inv + 0.15 * whites * (s > 1 ? 1 : c ** 4));
    return u;
  };
}

// --- Atlas: the baked form every renderer samples. ---

export const ATLAS_WIDTH = 1024;
export const ATLAS_ROWS = {
  toneR: 0, toneG: 1, toneB: 2,
  curveR: 3, curveG: 4, curveB: 5,
  hueShift: 6, hueSat: 7, hueLum: 8, hueDensity: 9,
  lumSat: 10, satSat: 11,
  skinHue: 12, skinSat: 13, skinDensity: 14,
} as const;
export const ATLAS_ROW_COUNT = 15;

export type GradeAtlas = { width: number; rows: number; data: Float32Array };

function fillRow(data: Float32Array, row: number, fn: (x: number) => number, monotone = false) {
  let previous = -Infinity;
  for (let i = 0; i < ATLAS_WIDTH; i += 1) {
    let value = fn(i / (ATLAS_WIDTH - 1));
    if (monotone) { value = Math.max(previous, value); previous = value; }
    data[row * ATLAS_WIDTH + i] = value;
  }
}

export function bakeGradeAtlas(grade: GradeV2): GradeAtlas {
  const data = new Float32Array(ATLAS_WIDTH * ATLAS_ROW_COUNT);
  for (const channel of [0, 1, 2] as const) fillRow(data, ATLAS_ROWS.toneR + channel, primaryToneCurve(grade, channel), true);
  const y = monotoneSpline(grade.curves.y);
  const channelCurves = [grade.curves.r, grade.curves.g, grade.curves.b].map(monotoneSpline);
  for (const channel of [0, 1, 2] as const) fillRow(data, ATLAS_ROWS.curveR + channel, (u) => channelCurves[channel]!(y(u)), true);
  const hueHue = smoothCurve(grade.curves.hueHue, 0, true), hueSat = smoothCurve(grade.curves.hueSat, 1, true), hueLum = smoothCurve(grade.curves.hueLum, 0, true);
  const sliceAt = (h: number, pick: (s: SliceValue) => number) => {
    const w = sliceWeights(h);
    return (Object.keys(w) as Array<keyof typeof w>).reduce((sum, id) => sum + w[id] * pick(grade.slices[id]), 0);
  };
  fillRow(data, ATLAS_ROWS.hueShift, (h) => (hueHue(h) + sliceAt(h, (s) => s.hue)) / 360);
  fillRow(data, ATLAS_ROWS.hueSat, (h) => Math.max(0, hueSat(h) * sliceAt(h, (s) => s.saturation)));
  fillRow(data, ATLAS_ROWS.hueLum, (h) => hueLum(h));
  fillRow(data, ATLAS_ROWS.hueDensity, (h) => sliceAt(h, (s) => s.density));
  const lumSat = smoothCurve(grade.curves.lumSat, 1), satSat = smoothCurve(grade.curves.satSat, 1);
  fillRow(data, ATLAS_ROWS.lumSat, (x) => Math.max(0, lumSat(x)));
  fillRow(data, ATLAS_ROWS.satSat, (x) => Math.max(0, satSat(x)));
  const skin = grade.slices.skin;
  fillRow(data, ATLAS_ROWS.skinHue, (h) => (skinWindow(h) * skin.hue) / 360);
  fillRow(data, ATLAS_ROWS.skinSat, (h) => skinWindow(h) * (skin.saturation - 1));
  fillRow(data, ATLAS_ROWS.skinDensity, (h) => skinWindow(h) * skin.density);
  return { width: ATLAS_WIDTH, rows: ATLAS_ROW_COUNT, data };
}

/** Linear sample of a row; tone rows extend past 0..1 with their end slope, hue rows wrap. */
export function sampleAtlas(atlas: GradeAtlas, row: number, x: number, mode: "extend" | "wrap" | "clamp"): number {
  const n = atlas.width, base = row * n;
  const position = (mode === "wrap" ? wrap(x) : x) * (n - 1);
  if (mode === "extend" && position < 0) return atlas.data[base]! + position * (atlas.data[base + 1]! - atlas.data[base]!);
  if (mode === "extend" && position > n - 1) return atlas.data[base + n - 1]! + (position - (n - 1)) * (atlas.data[base + n - 1]! - atlas.data[base + n - 2]!);
  const p = Math.min(n - 1, Math.max(0, position)), i = Math.min(n - 2, Math.floor(p)), t = p - i;
  const a = atlas.data[base + i]!, b = atlas.data[base + i + 1]!;
  return a + (b - a) * t;
}

// --- Evaluation (the reference the renderers must match). ---

export type BakedGrade = { grade: GradeV2; atlas: GradeAtlas; linear: Mat3; chroma: Mat3 };

export function prepareGrade(grade: GradeV2): BakedGrade {
  const wb = whiteBalanceMatrix(grade.temperature, grade.tint);
  const exposure = 2 ** grade.exposureEv;
  return {
    grade, atlas: bakeGradeAtlas(grade),
    linear: wb.map((row) => row.map((c) => c * exposure)) as unknown as Mat3,
    chroma: saturationHueMatrix(grade.saturation, grade.hueDegrees),
  };
}

/** Scene-linear working RGB in and out. */
export function evaluateGrade(input: Vec3, baked: BakedGrade): Vec3 {
  const { atlas } = baked;
  let lin = apply(baked.linear, input);
  const toneRow = (row: number, l: number) => gradeAxisToLinear(sampleAtlas(atlas, row, linearToGradeAxis(l), "extend"));
  lin = [toneRow(ATLAS_ROWS.toneR, lin[0]), toneRow(ATLAS_ROWS.toneG, lin[1]), toneRow(ATLAS_ROWS.toneB, lin[2])];
  lin = [toneRow(ATLAS_ROWS.curveR, lin[0]), toneRow(ATLAS_ROWS.curveG, lin[1]), toneRow(ATLAS_ROWS.curveB, lin[2])];
  lin = apply(baked.chroma, lin);
  const { y, o } = chromaOf(lin);
  const chroma = Math.hypot(o.c1, o.c2);
  if (chroma < 1e-9 || y <= 0) return lin;
  const sat = chroma / y / SAT_NORM, hue = wrap(Math.atan2(o.c2, o.c1) / (2 * Math.PI) - HUE_ZERO);
  const gate = skinSaturationGate(sat), weight = Math.min(1, sat);
  const shift = (sampleAtlas(atlas, ATLAS_ROWS.hueShift, hue, "wrap") + gate * sampleAtlas(atlas, ATLAS_ROWS.skinHue, hue, "wrap")) * 2 * Math.PI;
  const satGain = sampleAtlas(atlas, ATLAS_ROWS.hueSat, hue, "wrap") * sampleAtlas(atlas, ATLAS_ROWS.lumSat, linearToGradeAxis(y), "clamp")
    * sampleAtlas(atlas, ATLAS_ROWS.satSat, sat, "clamp") * (1 + gate * sampleAtlas(atlas, ATLAS_ROWS.skinSat, hue, "wrap"));
  const stops = weight * sampleAtlas(atlas, ATLAS_ROWS.hueLum, hue, "wrap")
    - weight * (sampleAtlas(atlas, ATLAS_ROWS.hueDensity, hue, "wrap") + gate * sampleAtlas(atlas, ATLAS_ROWS.skinDensity, hue, "wrap"));
  const scaled = adjustChroma(lin, shift, satGain), brightness = 2 ** stops;
  return [scaled[0] * brightness, scaled[1] * brightness, scaled[2] * brightness];
}

export function isIdentityGradeV2(grade: GradeV2): boolean {
  return JSON.stringify(grade) === JSON.stringify(IDENTITY_GRADE_V2);
}

