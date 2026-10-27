/**
 * Gamut matrices derived from published primaries and white points, with Bradford chromatic
 * adaptation between D65 and the ACES white. Derived rather than copied so every pair is consistent.
 */

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [Vec3, Vec3, Vec3];
type Chromaticity = readonly [number, number];
type Primaries = { red: Chromaticity; green: Chromaticity; blue: Chromaticity; white: Chromaticity };

const D65: Chromaticity = [0.3127, 0.329];
const ACES_WHITE: Chromaticity = [0.32168, 0.33767];

export const PRIMARIES = {
  rec709: { red: [0.64, 0.33], green: [0.3, 0.6], blue: [0.15, 0.06], white: D65 },
  rec2020: { red: [0.708, 0.292], green: [0.17, 0.797], blue: [0.131, 0.046], white: D65 },
  displayP3: { red: [0.68, 0.32], green: [0.265, 0.69], blue: [0.15, 0.06], white: D65 },
  /** SMPTE 170M / BT.601 525-line. */
  smpte170m: { red: [0.63, 0.34], green: [0.31, 0.595], blue: [0.155, 0.07], white: D65 },
  ap1: { red: [0.713, 0.293], green: [0.165, 0.83], blue: [0.128, 0.044], white: ACES_WHITE },
} as const satisfies Record<string, Primaries>;
export type PrimariesId = keyof typeof PRIMARIES;

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [0, 1, 2].map((c) => r[0] * b[0][c]! + r[1] * b[1][c]! + r[2] * b[2][c]!) as unknown as Vec3;
  return [row(a[0]), row(a[1]), row(a[2])];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function invert(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

const xyToXyz = ([x, y]: Chromaticity): Vec3 => [x / y, 1, (1 - x - y) / y];

function rgbToXyz(p: Primaries): Mat3 {
  const r = xyToXyz(p.red), g = xyToXyz(p.green), b = xyToXyz(p.blue);
  const columns: Mat3 = [[r[0], g[0], b[0]], [r[1], g[1], b[1]], [r[2], g[2], b[2]]];
  const s = apply(invert(columns), xyToXyz(p.white));
  return columns.map((row) => [row[0] * s[0], row[1] * s[1], row[2] * s[2]]) as unknown as Mat3;
}

const BRADFORD: Mat3 = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];

function adaptation(from: Chromaticity, to: Chromaticity): Mat3 {
  if (from[0] === to[0] && from[1] === to[1]) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const s = apply(BRADFORD, xyToXyz(from)), d = apply(BRADFORD, xyToXyz(to));
  const scale: Mat3 = [[d[0] / s[0], 0, 0], [0, d[1] / s[1], 0], [0, 0, d[2] / s[2]]];
  return multiply(invert(BRADFORD), multiply(scale, BRADFORD));
}

/** Linear RGB in `from` primaries to linear RGB in `to` primaries. */
export function gamutMatrix(from: PrimariesId, to: PrimariesId): Mat3 {
  const source = PRIMARIES[from], target = PRIMARIES[to];
  return multiply(invert(rgbToXyz(target)), multiply(adaptation(source.white, target.white), rgbToXyz(source)));
}

/** Relative luminance weights (the Y row of RGB→XYZ). */
export function lumaWeights(id: PrimariesId): Vec3 {
  return rgbToXyz(PRIMARIES[id])[1];
}

export const AP1_LUMA = lumaWeights("ap1");
