import { getStroke } from "perfect-freehand";
import type { ShapeContour } from "./shapes";

/**
 * Hand-drawn ink for a shape's outline: each contour becomes a filled pen stroke whose width
 * thins toward its ends (taper) and whose line drifts and swells a little (wobble), repeatable
 * per seed. Width and drift are fixed along the full contour, so draw-on only reveals more of
 * the same stroke and nothing already drawn moves. Both renderers fill the returned path.
 */
export type InkStyle = {
  /** Width of the line in canvas pixels. */
  width: number;
  /** 0 to 1: how much of each end thins to a point. */
  taper: number;
  /** 0 to 1: how far the line drifts and how much its width varies. */
  wobble: number;
  seed: number;
  /** Canvas pixels per 1080p pixel, so wobble keeps its look at any output size. */
  unit: number;
};

const CURVE_STEPS = 48; // matches contourLength, so drawn lengths line up with the outline
const MIN_WIDTH = 0.08; // share of the full width left at a tapered end

type Pt = [number, number];

/** The contour as a dense polyline with the running length at each point. */
function flatten(contour: ShapeContour): { points: Pt[]; at: number[] } {
  const { points: src } = contour;
  const points: Pt[] = [[src[0].x, src[0].y]];
  const segments = src.slice(1).map((to, i) => [src[i], to] as const);
  if (contour.closed && src.length > 1) segments.push([src.at(-1)!, src[0]]);
  for (const [from, to] of segments) {
    if (!from.out && !to.in) { points.push([to.x, to.y]); continue; }
    const p1: Pt = [from.x + (from.out?.[0] ?? 0), from.y + (from.out?.[1] ?? 0)];
    const p2: Pt = [to.x + (to.in?.[0] ?? 0), to.y + (to.in?.[1] ?? 0)];
    for (let i = 1; i <= CURVE_STEPS; i++) {
      const t = i / CURVE_STEPS, u = 1 - t;
      points.push([
        u * u * u * from.x + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * to.x,
        u * u * u * from.y + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * to.y,
      ]);
    }
  }
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return { points, at };
}

/** Repeatable smooth noise in -1..1 along a line, from `seed`. */
function noise(seed: number) {
  const hash = (i: number) => {
    let h = Math.imul(i ^ Math.imul(seed + 1, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff * 2 - 1;
  };
  const smooth = (x: number) => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    return hash(i) * (1 - s) + hash(i + 1) * s;
  };
  return (x: number) => smooth(x) * 0.7 + smooth(x * 2.3 + 17) * 0.3;
}

/** Point at running length `s` on the polyline, and the unit normal there. */
function sample(line: { points: Pt[]; at: number[] }, s: number, from: number): { p: Pt; n: Pt; index: number } {
  const { points, at } = line;
  let i = from;
  while (i < at.length - 2 && at[i + 1] < s) i++;
  const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
  const span = at[Math.min(i + 1, at.length - 1)] - at[i];
  const t = span > 0 ? Math.min(1, Math.max(0, (s - at[i]) / span)) : 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return { p: [a[0] + dx * t, a[1] + dy * t], n: [-dy / len, dx / len], index: i };
}

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 2;
const r = (value: number) => Number(value.toFixed(2));

/** A contour's pen input along its whole length, kept so each draw-on frame only cuts it short. */
type PreparedInk = {
  line: { points: Pt[]; at: number[] };
  total: number;
  /** Pen input sampled from the first point to the end, with the length and line index of each sample. */
  input: [number, number, number][];
  lengths: number[];
  cursors: number[];
  at: (s: number, cursor: number) => { pen: [number, number, number]; index: number };
  /** The last outlines made, by drawn length (the whole one stays while the contour is fully drawn). */
  outlines: Map<number, string>;
  /** Approximate bytes held: samples, line points and outline text. */
  bytes: number;
};

/** Bounds of the prepared-ink cache: contours kept and approximate bytes held. */
const INK_CACHE_ENTRIES = 2048;
const INK_CACHE_BYTES = 48 * 1024 * 1024;
const OUTLINES_PER_CONTOUR = 3;
// A pen sample (array of three numbers, its length and line index) and a line point with its running length.
const SAMPLE_BYTES = 80, POINT_BYTES = 56;
const inkCache = new Map<string, PreparedInk>();
let inkCacheBytes = 0;

function prepareInk(contour: ShapeContour, style: InkStyle, index: number): PreparedInk | null {
  const line = flatten(contour);
  const total = line.at.at(-1)!;
  if (total <= 0) return null;
  const step = Math.max(0.75, Math.min(4, style.width / 3));
  const taperLength = style.taper * Math.min(total * 0.5, style.width * 14);
  const drift = noise(style.seed * 131 + index * 7919);
  const swell = noise(style.seed * 389 + index * 104729 + 3);
  const wavelength = 90 * style.unit;
  const amplitude = style.wobble * 3.2 * style.unit + style.wobble * style.width * 0.18;
  // Width and drift depend on the full length only, so a part drawn now is the same as when more is drawn.
  const at = (s: number, from: number): { pen: [number, number, number]; index: number } => {
    const { p, n, index } = sample(line, s, from);
    // The ends of a closed contour meet; drift fades out there so they still join.
    const fade = contour.closed ? Math.min(1, s / wavelength, (total - s) / wavelength) : 1;
    const offset = drift(s / wavelength) * amplitude * fade;
    const taper = taperLength > 0 ? Math.max(MIN_WIDTH, Math.min(ease(s / taperLength), ease((total - s) / taperLength))) : 1;
    const pressure = taper * (1 + swell(s / (wavelength * 0.6)) * 0.28 * style.wobble);
    return { pen: [p[0] + n[0] * offset, p[1] + n[1] * offset, Math.max(0.01, Math.min(1, pressure * 0.5))], index };
  };
  const input: [number, number, number][] = [], lengths: number[] = [], cursors: number[] = [];
  let cursor = 0;
  for (let s = 0; ; s = Math.min(total, s + step)) {
    const { pen, index } = at(s, cursor);
    cursor = index;
    input.push(pen); lengths.push(s); cursors.push(cursor);
    if (s >= total) break;
  }
  return { line, total, input, lengths, cursors, at, outlines: new Map(), bytes: input.length * SAMPLE_BYTES + line.points.length * POINT_BYTES };
}

function preparedInk(contour: ShapeContour, style: InkStyle, index: number): PreparedInk | null {
  const key = `${index}:${style.width}:${style.taper}:${style.wobble}:${style.seed}:${style.unit}:${contour.closed ? 1 : 0}:${JSON.stringify(contour.points)}`;
  const hit = inkCache.get(key);
  if (hit) { inkCache.delete(key); inkCache.set(key, hit); return hit; }
  const ink = prepareInk(contour, style, index);
  if (!ink) return null;
  inkCache.set(key, ink); inkCacheBytes += ink.bytes;
  for (const [old, entry] of inkCache) {
    if (inkCache.size <= INK_CACHE_ENTRIES && inkCacheBytes <= INK_CACHE_BYTES || old === key) break;
    inkCache.delete(old); inkCacheBytes -= entry.bytes;
  }
  return ink;
}

/** Contours and approximate bytes held by the prepared-ink cache. */
export const inkCacheSize = () => ({ entries: inkCache.size, bytes: inkCacheBytes });
export function clearInkCache() { inkCache.clear(); inkCacheBytes = 0; }

/**
 * Filled outline of one contour drawn up to `drawn` pixels of its length, as SVG path data. The pen
 * input along the whole contour is made once per contour and style; each drawn length cuts it short.
 */
export function inkContourPathD(contour: ShapeContour, drawn: number, style: InkStyle, index = 0): string {
  if (drawn <= 0 || style.width <= 0 || contour.points.length < 2) return "";
  const ink = preparedInk(contour, style, index);
  if (!ink) return "";
  const { total } = ink;
  const end = Math.min(drawn, total);
  const known = ink.outlines.get(end);
  if (known !== undefined) return known;
  // The samples before `end`, then one at `end` itself, as sampling up to `end` gives.
  let count = 0, hi = ink.lengths.length;
  while (count < hi) { const mid = (count + hi) >> 1; if (ink.lengths[mid] < end) count = mid + 1; else hi = mid; }
  const input = end >= total ? ink.input.slice() : [...ink.input.slice(0, count), ink.at(end, count ? ink.cursors[count - 1] : 0).pen];
  if (input.length === 1) input.push([input[0][0] + 0.01, input[0][1], input[0][2]]);
  // thinning 1 makes the radius `size × pressure`, so pressure 0.5 is exactly `width` across.
  const outline = getStroke(input, {
    size: style.width, thinning: 1, smoothing: 0.5, streamline: 0, simulatePressure: false,
    easing: (p) => p, start: { cap: true, taper: false }, end: { cap: true, taper: false }, last: end >= total,
  });
  const d = outline.length < 3 ? "" : `M ${outline.map(([x, y]) => `${r(x)} ${r(y)}`).join(" L ")} Z`;
  // Keep the whole outline and the latest partial ones; forget the oldest partial first.
  for (const [length, old] of ink.outlines) {
    if (ink.outlines.size < OUTLINES_PER_CONTOUR) break;
    if (length >= total) continue;
    ink.outlines.delete(length); ink.bytes -= old.length; inkCacheBytes -= old.length;
    break;
  }
  ink.outlines.set(end, d); ink.bytes += d.length; inkCacheBytes += d.length;
  return d;
}
