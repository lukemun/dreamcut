/**
 * Input and output transforms for dreamcut-scene-v2. The working space is scene-linear light with
 * Rec.709 primaries and 1.0 = diffuse white; wider sources keep their colour as values outside 0..1
 * until the output gamut compression. Grading happens between `inputToWorking` and
 * `workingToDisplay`; at identity an SDR source comes back unchanged.
 */
import { apply, gamutMatrix, type PrimariesId, type Vec3 } from "./matrices";
import {
  HLG_REFERENCE_WHITE_SCENE,
  REFERENCE_WHITE_NITS,
  hlgToSceneLinear,
  linearToSrgb,
  nitsToPq,
  pqToNits,
  srgbToLinear,
} from "./transfers";

export type SourceTransfer = "srgb" | "hlg" | "pq" | "linear";
export type SourceColorSpace = { transfer: SourceTransfer; primaries: PrimariesId };

export const SDR_REC709: SourceColorSpace = { transfer: "srgb", primaries: "rec709" };

/** ffprobe colour tags to the source space the input transform uses. SDR Rec.709/601/2020-SDR use the sRGB curve, as Chromium does. */
export function sourceColorSpaceFromProbe(probe: { color_transfer?: string | null; color_primaries?: string | null }): SourceColorSpace {
  const transfer = probe.color_transfer?.toLowerCase() ?? "";
  const primaries = probe.color_primaries?.toLowerCase() ?? "";
  const gamut: PrimariesId = primaries === "bt2020" ? "rec2020" : primaries === "smpte432" || primaries === "smpte431" ? "displayP3"
    : primaries === "smpte170m" || primaries === "bt470bg" ? "smpte170m" : "rec709";
  if (transfer === "arib-std-b67") return { transfer: "hlg", primaries: gamut };
  if (transfer === "smpte2084") return { transfer: "pq", primaries: gamut };
  if (transfer === "linear") return { transfer: "linear", primaries: gamut };
  return { transfer: "srgb", primaries: gamut };
}

/** The brightest relative value a source can carry, used as the tone map's source peak. */
export function sourcePeakRelative(space: SourceColorSpace, maxCllNits?: number | null): number {
  if (space.transfer === "hlg") return 1 / HLG_REFERENCE_WHITE_SCENE;
  if (space.transfer === "pq") return Math.max(1, (maxCllNits && maxCllNits > 0 ? maxCllNits : 1000) / REFERENCE_WHITE_NITS);
  return 1;
}

function decodeChannel(v: number, transfer: SourceTransfer): number {
  if (transfer === "srgb") return srgbToLinear(v);
  if (transfer === "hlg") return hlgToSceneLinear(v) / HLG_REFERENCE_WHITE_SCENE;
  if (transfer === "pq") return pqToNits(v) / REFERENCE_WHITE_NITS;
  return v;
}

const matrixCache = new Map<string, ReturnType<typeof gamutMatrix>>();
function cachedMatrix(from: PrimariesId, to: PrimariesId) {
  const key = `${from}>${to}`;
  let m = matrixCache.get(key);
  if (!m) matrixCache.set(key, (m = gamutMatrix(from, to)));
  return m;
}

/** The grading basis: per-channel controls act on these primaries, as v1 did. */
export const WORKING_PRIMARIES = "rec709" as const;

/** Encoded source RGB to scene-linear working RGB. */
export function inputToWorking(rgb: Vec3, space: SourceColorSpace): Vec3 {
  const linear: Vec3 = [decodeChannel(rgb[0], space.transfer), decodeChannel(rgb[1], space.transfer), decodeChannel(rgb[2], space.transfer)];
  return space.primaries === WORKING_PRIMARIES ? linear : apply(cachedMatrix(space.primaries, WORKING_PRIMARIES), linear);
}

export type OutputTransformOptions = {
  /** Brightest relative value of the source; 1 for SDR. Above the display peak, BT.2390 compresses into it. */
  sourcePeak: number;
  /** Display peak in relative units; 1 is SDR white. */
  displayPeak?: number;
  /** Below 1, out-of-gamut colours are compressed toward neutral from this distance; 1 clips. */
  gamutThreshold?: number;
};

/** BT.2390 EETF on a relative luminance, in the PQ domain. Identity when the source fits the display. */
export function toneMapLuminance(relative: number, sourcePeak: number, displayPeak = 1): number {
  if (relative <= 0) return 0;
  if (sourcePeak <= displayPeak) return Math.min(relative, displayPeak);
  const srcPq = nitsToPq(sourcePeak * REFERENCE_WHITE_NITS);
  const maxLum = nitsToPq(displayPeak * REFERENCE_WHITE_NITS) / srcPq;
  const ks = 1.5 * maxLum - 0.5;
  const e = Math.min(1, nitsToPq(relative * REFERENCE_WHITE_NITS) / srcPq);
  let mapped = e;
  if (e > ks) {
    const t = (e - ks) / (1 - ks), t2 = t * t, t3 = t2 * t;
    mapped = (2 * t3 - 3 * t2 + 1) * ks + (t3 - 2 * t2 + t) * (1 - ks) + (-2 * t3 + 3 * t2) * maxLum;
  }
  return pqToNits(mapped * srcPq) / REFERENCE_WHITE_NITS;
}

// ACES 1.3 reference gamut compression limits, used when the source is wider than Rec.709.
const RGC_LIMIT: Vec3 = [1.147, 1.264, 1.312];
const RGC_POWER = 1.2;

function compressDistance(d: number, threshold: number, limit: number): number {
  if (d < threshold) return d;
  const scale = (limit - threshold) / (((1 - threshold) / (limit - threshold)) ** -RGC_POWER - 1) ** (1 / RGC_POWER);
  const n = (d - threshold) / scale;
  return threshold + scale * n / (1 + n ** RGC_POWER) ** (1 / RGC_POWER);
}

/** Pull out-of-gamut channels toward the achromatic axis; colours within `threshold` are untouched. */
export function compressGamut(rgb: Vec3, threshold: number): Vec3 {
  const ach = Math.max(rgb[0], rgb[1], rgb[2]);
  if (ach <= 0) return [0, 0, 0];
  if (threshold >= 1) return [Math.max(0, rgb[0]), Math.max(0, rgb[1]), Math.max(0, rgb[2])];
  return rgb.map((c, i) => {
    const d = (ach - c) / ach;
    return ach - compressDistance(d, threshold, RGC_LIMIT[i]!) * ach;
  }) as unknown as Vec3;
}

/** Scene-linear working RGB to sRGB-encoded Rec.709 display values, clipped to 0..1. Dither is applied by the renderer. */
export function workingToDisplay(rgb: Vec3, options: OutputTransformOptions): Vec3 {
  const displayPeak = options.displayPeak ?? 1;
  let linear = compressGamut(rgb, options.gamutThreshold ?? (options.sourcePeak > 1 ? 0.815 : 1));
  const peak = Math.max(linear[0], linear[1], linear[2]);
  if (peak > 0 && options.sourcePeak > displayPeak) {
    const scale = toneMapLuminance(peak, options.sourcePeak, displayPeak) / peak;
    linear = [linear[0] * scale, linear[1] * scale, linear[2] * scale];
  }
  return linear.map((c) => linearToSrgb(Math.min(displayPeak, Math.max(0, c)) / displayPeak)) as unknown as Vec3;
}
