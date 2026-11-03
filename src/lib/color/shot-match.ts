/**
 * Shot match: solve one clip's primary grade so its look sits with a reference clip's, the way a
 * colourist matches a shot before fine-tuning. Both clips are measured as they display (each with
 * its own grade and output transform) in CIELAB: brightness spread, the overall cast, and how
 * colourful the picture is. The solver moves only the target's exposure, contrast, highlights,
 * temperature, tint and saturation, from its current values; every other part of its grade is kept.
 */
import { srgbToLab } from "./delta-e";
import { evaluateGrade, prepareGrade, type GradeV2 } from "./grade-v2";
import { inputToWorking, sourcePeakRelative, workingToDisplay, type SourceColorSpace } from "./io-transforms";

/** Working-space pixels of one clip (scene-linear Rec.709 triples) and its tone-map source peak. */
export type MatchSample = { linear: Float32Array; sourcePeak: number };

/**
 * Pixels from encoded RGBA frames, decoded with the clip's source colour space. Pixels are taken
 * on an even stride so at most `maxPixels` are kept across all frames.
 */
export function matchSampleFromFrames(
  frames: ReadonlyArray<{ rgba: ArrayLike<number>; width: number; height: number; maxValue?: number }>,
  space: SourceColorSpace,
  maxCllNits?: number | null,
  maxPixels = 2400,
): MatchSample {
  const total = frames.reduce((sum, frame) => sum + frame.width * frame.height, 0);
  const stride = Math.max(1, Math.floor(total / maxPixels));
  const values: number[] = [];
  let index = 0;
  for (const frame of frames) {
    const scale = 1 / (frame.maxValue ?? 255);
    for (let i = 0; i < frame.width * frame.height; i += 1, index += 1) {
      if (index % stride !== 0 || frame.rgba[i * 4 + 3]! * scale < 0.5) continue;
      const lin = inputToWorking([frame.rgba[i * 4]! * scale, frame.rgba[i * 4 + 1]! * scale, frame.rgba[i * 4 + 2]! * scale], space);
      values.push(lin[0], lin[1], lin[2]);
    }
  }
  return { linear: Float32Array.from(values), sourcePeak: sourcePeakRelative(space, maxCllNits) };
}

/** How a clip looks, in CIELAB units: brightness percentiles, the neutral-weighted cast, mean chroma, and the share of clipped highlights. */
export type MatchStats = { l10: number; l50: number; l90: number; castA: number; castB: number; chroma: number; clipped: number };

export function measureMatchStats(sample: MatchSample, grade: GradeV2): MatchStats {
  const baked = prepareGrade(grade);
  const count = sample.linear.length / 3;
  const lightness = new Float32Array(count);
  let weightSum = 0, castA = 0, castB = 0, chroma = 0, clipped = 0;
  for (let i = 0; i < count; i += 1) {
    const graded = evaluateGrade([sample.linear[i * 3]!, sample.linear[i * 3 + 1]!, sample.linear[i * 3 + 2]!], baked);
    const display = workingToDisplay(graded, { sourcePeak: sample.sourcePeak });
    if (Math.max(display[0], display[1], display[2]) >= 0.995) clipped += 1;
    const [l, a, b] = srgbToLab(display);
    lightness[i] = l;
    const c = Math.hypot(a, b);
    chroma += c;
    // Near-neutral pixels carry the cast; strongly coloured objects should not drag it.
    const weight = 1 / (1 + (c / 12) ** 2);
    weightSum += weight; castA += weight * a; castB += weight * b;
  }
  lightness.sort();
  const at = (p: number) => (count ? lightness[Math.min(count - 1, Math.floor(p * (count - 1)))]! : 0);
  return { l10: at(0.1), l50: at(0.5), l90: at(0.9), castA: weightSum ? castA / weightSum : 0, castB: weightSum ? castB / weightSum : 0, chroma: count ? chroma / count : 0, clipped: count ? clipped / count : 0 };
}

/**
 * Distance from look `a` to reference `b`, roughly in ΔE: mid brightness, spread, cast and
 * colourfulness. Clipping more highlights than the reference counts heavily: detail lost to a
 * match cannot be recovered by tuning afterwards.
 */
export function matchDistance(a: MatchStats, b: MatchStats): number {
  const spread = (a.l90 - a.l10) - (b.l90 - b.l10);
  const extraClipping = Math.max(0, a.clipped - b.clipped) * 100;
  return Math.sqrt(2 * extraClipping ** 2 + (a.l50 - b.l50) ** 2 + 0.25 * spread ** 2 + (a.castA - b.castA) ** 2 + (a.castB - b.castB) ** 2 + 0.5 * (a.chroma - b.chroma) ** 2);
}

// A match moves each control at most `reach` from where the target already is: it evens shots out,
// it does not restyle them. `limit` is the slider's own range.
const PARAMS = [
  { key: "exposureEv", limit: [-3, 3], reach: 1.5, step: 0.3 },
  { key: "contrast", limit: [0, 2], reach: 0.3, step: 0.1 },
  { key: "highlights", limit: [-1, 1], reach: 0.6, step: 0.15 },
  { key: "temperature", limit: [-1, 1], reach: 0.6, step: 0.15 },
  { key: "tint", limit: [-1, 1], reach: 0.6, step: 0.15 },
  { key: "saturation", limit: [0, 2], reach: 0.6, step: 0.15 },
] as const;

export type MatchedField = (typeof PARAMS)[number]["key"];

export type ShotMatchResult = {
  grade: GradeV2;
  changed: Partial<Record<MatchedField, number>>;
  reference: MatchStats;
  before: MatchStats;
  after: MatchStats;
  distanceBefore: number;
  distanceAfter: number;
};

const PRIOR_WEIGHT = 8;
/** Below this distance two shots already read as matched; nudging them only chases noise. */
export const MATCHED_DISTANCE = 1.5;

export function solveShotMatch(input: { reference: MatchSample; referenceGrade: GradeV2; target: MatchSample; targetGrade: GradeV2; iterations?: number }): ShotMatchResult {
  const reference = measureMatchStats(input.reference, input.referenceGrade);
  const before = measureMatchStats(input.target, input.targetGrade);
  const start = PARAMS.map((param) => input.targetGrade[param.key]);
  const distanceBefore = matchDistance(before, reference);
  if (distanceBefore < MATCHED_DISTANCE) return { grade: input.targetGrade, changed: {}, reference, before, after: before, distanceBefore, distanceAfter: distanceBefore };
  const bounds = PARAMS.map((param, index) => [Math.max(param.limit[0], start[index]! - param.reach), Math.min(param.limit[1], start[index]! + param.reach)] as const);
  const clamp = (index: number, value: number) => Math.min(bounds[index]![1], Math.max(bounds[index]![0], value));
  const withParams = (values: readonly number[]): GradeV2 => {
    const next = { ...input.targetGrade };
    PARAMS.forEach((param, index) => { next[param.key] = clamp(index, values[index]!); });
    return next;
  };
  const cost = (values: readonly number[]) => {
    // Distance from the start, as a share of each control's reach.
    const prior = values.reduce((sum, value, index) => sum + ((clamp(index, value) - start[index]!) / (2 * PARAMS[index]!.reach)) ** 2, 0);
    const outside = values.reduce((sum, value, index) => sum + (value - clamp(index, value)) ** 2, 0);
    return matchDistance(measureMatchStats(input.target, withParams(values)), reference) + PRIOR_WEIGHT * prior + 100 * outside;
  };
  const best = nelderMead(cost, start, PARAMS.map((param) => param.step), input.iterations ?? 160).map((value, index) => clamp(index, value));
  const grade = withParams(best);
  const after = measureMatchStats(input.target, grade);
  const changed: ShotMatchResult["changed"] = {};
  PARAMS.forEach((param, index) => {
    const value = Number(grade[param.key].toFixed(3));
    if (Math.abs(value - start[index]!) >= 0.005) changed[param.key] = value;
  });
  return { grade, changed, reference, before, after, distanceBefore, distanceAfter: matchDistance(after, reference) };
}

function nelderMead(f: (x: readonly number[]) => number, start: readonly number[], steps: readonly number[], maxIterations: number): number[] {
  const n = start.length;
  let simplex = [start.slice(), ...steps.map((step, i) => start.map((v, j) => (j === i ? v + step : v)))].map((x) => ({ x, f: f(x) }));
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    simplex.sort((a, b) => a.f - b.f);
    if (simplex[n]!.f - simplex[0]!.f < 1e-4) break;
    const centroid = start.map((_, j) => simplex.slice(0, n).reduce((sum, p) => sum + p.x[j]!, 0) / n);
    const along = (t: number) => centroid.map((c, j) => c + t * (simplex[n]!.x[j]! - c));
    const reflected = along(-1), fr = f(reflected);
    if (fr < simplex[0]!.f) {
      const expanded = along(-2), fe = f(expanded);
      simplex[n] = fe < fr ? { x: expanded, f: fe } : { x: reflected, f: fr };
    } else if (fr < simplex[n - 1]!.f) {
      simplex[n] = { x: reflected, f: fr };
    } else {
      const contracted = fr < simplex[n]!.f ? along(-0.5) : along(0.5), fc = f(contracted);
      if (fc < Math.min(fr, simplex[n]!.f)) simplex[n] = { x: contracted, f: fc };
      else simplex = simplex.map((p, i) => (i === 0 ? p : (() => { const x = p.x.map((v, j) => simplex[0]!.x[j]! + 0.5 * (v - simplex[0]!.x[j]!)); return { x, f: f(x) }; })()));
    }
  }
  simplex.sort((a, b) => a.f - b.f);
  return simplex[0]!.x.slice();
}
