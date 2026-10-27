/**
 * Colour scopes on display pixels (sRGB-encoded RGBA), shared by the editor's scope panel and
 * frame-state's agent evidence. Levels are SDR display percentages, not calibrated nits; chroma
 * uses BT.709 Cb/Cr, so angles match a broadcast vectorscope (red ≈ 103°, yellow ≈ 175°, skin ≈ 123°).
 */

const KR = 0.2126, KB = 0.0722, KG = 1 - KR - KB;

/** Vectorscope angle of the skin-tone line, degrees counterclockwise from +Cb. */
export const SKIN_LINE_DEGREES = 123;

function chroma(r: number, g: number, b: number) {
  const y = KR * r + KG * g + KB * b;
  return { y, cb: (b - y) / (2 * (1 - KB)), cr: (r - y) / (2 * (1 - KR)) };
}

const angleOf = (cb: number, cr: number) => ((Math.atan2(cr, cb) * 180) / Math.PI + 360) % 360;

/** The six vectorscope targets for 100% colours, used to name directions. */
export const VECTORSCOPE_TARGETS = (["red", "yellow", "green", "cyan", "blue", "magenta"] as const).map((name, index) => {
  const rgb = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]][index]!;
  const { cb, cr } = chroma(rgb[0]!, rgb[1]!, rgb[2]!);
  return { name, degrees: angleOf(cb, cr), cb, cr };
});

const circularDistance = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** Nearest named colour direction for a vectorscope angle. */
export function nameVectorscopeAngle(degrees: number): string {
  return VECTORSCOPE_TARGETS.reduce((best, target) => circularDistance(target.degrees, degrees) < circularDistance(best.degrees, degrees) ? target : best).name;
}

function percentile(sorted: Float32Array, p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))]!;
}
const pct = (value: number) => Math.round(value * 1000) / 10;

export type ColorScopeStats = ReturnType<typeof colorScopeStats>;

/**
 * Summary a reader can act on without seeing the frame: brightness spread and clipping, channel
 * balance, saturation by hue, an overall cast measured on near-neutral pixels, and where skin-like
 * pixels sit against the skin line.
 */
export function colorScopeStats(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const count = width * height;
  const luma = new Float32Array(count), chan = [new Float32Array(count), new Float32Array(count), new Float32Array(count)];
  const sat = new Float32Array(count);
  const sectors = Array.from({ length: 12 }, () => ({ pixels: 0, saturation: 0 }));
  let n = 0, clippedHigh = 0, crushed = 0, neutral = 0, castCb = 0, castCr = 0, skin = 0, skinOffset = 0, chromatic = 0;
  for (let i = 0; i < count; i += 1) {
    if (rgba[i * 4 + 3]! < 128) continue;
    const r = rgba[i * 4]! / 255, g = rgba[i * 4 + 1]! / 255, b = rgba[i * 4 + 2]! / 255;
    const { y, cb, cr } = chroma(r, g, b);
    const c = Math.hypot(cb, cr);
    luma[n] = y; chan[0]![n] = r; chan[1]![n] = g; chan[2]![n] = b; sat[n] = c; n += 1;
    if (Math.max(r, g, b) >= 254 / 255) clippedHigh += 1;
    if (Math.max(r, g, b) <= 2 / 255) crushed += 1;
    // Near-neutral, mid-brightness pixels reveal a cast; deep shadows and clipped whites do not.
    if (c < 0.06 && y > 0.12 && y < 0.92) { neutral += 1; castCb += cb; castCr += cr; }
    if (c < 0.03) continue;
    chromatic += 1;
    const angle = angleOf(cb, cr);
    const sector = sectors[Math.floor(angle / 30) % 12]!;
    sector.pixels += 1; sector.saturation += c;
    const fromSkin = ((angle - SKIN_LINE_DEGREES + 540) % 360) - 180;
    if (Math.abs(fromSkin) <= 25 && c < 0.3 && y > 0.15 && y < 0.9) { skin += 1; skinOffset += fromSkin; }
  }
  const sorted = (values: Float32Array) => values.subarray(0, n).slice().sort();
  const L = sorted(luma), S = sorted(sat), [R, G, B] = chan.map(sorted) as [Float32Array, Float32Array, Float32Array];
  const level = (values: Float32Array) => ({ p5: pct(percentile(values, 5)), p50: pct(percentile(values, 50)), p95: pct(percentile(values, 95)) });
  const castStrength = neutral ? Math.hypot(castCb, castCr) / neutral : 0;
  const castAngle = angleOf(castCb, castCr);
  return {
    samples: n,
    scale: "SDR display percent (0 black, 100 white); chroma is BT.709 Cb/Cr distance, 0.5 at a 100% primary",
    brightness: { p1: pct(percentile(L, 1)), p5: pct(percentile(L, 5)), p50: pct(percentile(L, 50)), p95: pct(percentile(L, 95)), p99: pct(percentile(L, 99)) },
    clipped: { highlights_percent: n ? pct(clippedHigh / n) : 0, shadows_percent: n ? pct(crushed / n) : 0 },
    channels: { red: level(R), green: level(G), blue: level(B) },
    saturation: { p50: Math.round(percentile(S, 50) * 1000) / 1000, p95: Math.round(percentile(S, 95) * 1000) / 1000 },
    hue_sectors: sectors.map((sector, index) => ({
      degrees: index * 30 + 15,
      toward: nameVectorscopeAngle(index * 30 + 15),
      share_percent: chromatic ? pct(sector.pixels / chromatic) : 0,
      mean_saturation: sector.pixels ? Math.round((sector.saturation / sector.pixels) * 1000) / 1000 : 0,
    })).filter((sector) => sector.share_percent >= 1),
    cast: neutral < n * 0.02
      ? { measured: false as const, reason: "Too few near-neutral pixels to judge a cast" }
      : { measured: true as const, neutral_share_percent: pct(neutral / n), strength: Math.round(castStrength * 1000) / 1000, toward: castStrength < 0.006 ? "none" : nameVectorscopeAngle(castAngle), degrees: Math.round(castAngle) },
    skin: skin < n * 0.01
      ? null
      : { share_percent: pct(skin / n), mean_offset_degrees: Math.round((skinOffset / skin) * 10) / 10, note: "Positive leans yellow/green of the skin line, negative leans red/magenta. Skin-like hues, not detected faces." },
  };
}

/** Vectorscope density: `size`×`size` bins, centre is neutral, the edge is 0.5 chroma. */
export function vectorscopeBins(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, size = 128) {
  const bins = new Uint32Array(size * size);
  const half = size / 2;
  for (let i = 0; i < width * height; i += 1) {
    if (rgba[i * 4 + 3]! < 128) continue;
    const { cb, cr } = chroma(rgba[i * 4]! / 255, rgba[i * 4 + 1]! / 255, rgba[i * 4 + 2]! / 255);
    const x = Math.round(half + cb * 2 * (half - 1)), y = Math.round(half - cr * 2 * (half - 1));
    if (x >= 0 && x < size && y >= 0 && y < size) bins[y * size + x]! += 1;
  }
  return bins;
}
