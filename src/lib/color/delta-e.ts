/** CIEDE2000 colour difference between sRGB-encoded colours, for measuring grade parity and migration error. */
import { apply, type Mat3, type Vec3 } from "./matrices";
import { srgbToLinear } from "./transfers";

// IEC 61966-2-1 linear sRGB → XYZ (D65).
const REC709_TO_XYZ: Mat3 = [[0.4123908, 0.3575843, 0.1804808], [0.212639, 0.7151687, 0.0721923], [0.0193308, 0.1191948, 0.9505322]];
const WHITE: Vec3 = [0.95047, 1, 1.08883];

export function srgbToLab(rgb: Vec3): Vec3 {
  const xyz = apply(REC709_TO_XYZ, [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])]);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(xyz[0] / WHITE[0]), f(xyz[1] / WHITE[1]), f(xyz[2] / WHITE[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE2000(a: Vec3, b: Vec3): number {
  const [L1, a1, b1] = srgbToLab(a), [L2, a2, b2] = srgbToLab(b);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (x: number, y: number) => { const v = (Math.atan2(y, x) * 180) / Math.PI; return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * Math.PI) / 360);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) hm = Math.abs(h1p - h2p) > 180 ? (hm < 360 ? (hm + 360) / 2 : (hm - 360) / 2) : hm / 2;
  const rad = (d: number) => (d * Math.PI) / 180;
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hm - 275) / 25) ** 2))));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
