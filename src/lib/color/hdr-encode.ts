/**
 * HDR export encoding: the half-float composite (sRGB-encoded, relative to SDR white, Rec.709-based
 * with wider colours kept as values outside 0..1) becomes HLG BT.2020 10-bit limited-range YUV 4:2:0
 * (I420P10) for the browser's VP9 profile 2 encoder. SDR white lands at HLG 75% (BT.2408), and an HLG
 * source at identity grade comes back with its own code values.
 */
import { apply, gamutMatrix } from "./matrices";
import { HLG_REFERENCE_WHITE_SCENE, sceneLinearToHlg, srgbToLinear } from "./transfers";

const TO_2020 = gamutMatrix("rec709", "rec2020");
// BT.2020 non-constant-luminance YCbCr.
const KR = 0.2627, KB = 0.0593, KG = 1 - KR - KB;

// Lookup tables keep the per-pixel transfer functions out of the export loop (compositeToI420P10).
const DECODE_MIN = -1, DECODE_MAX = 3, DECODE_SIZE = 16384;
const decodeTable = Float32Array.from({ length: DECODE_SIZE + 1 }, (_, i) => srgbToLinear(DECODE_MIN + ((DECODE_MAX - DECODE_MIN) * i) / DECODE_SIZE));
const ENCODE_MAX = 1 / HLG_REFERENCE_WHITE_SCENE, ENCODE_SIZE = 16384;
const encodeTable = Float32Array.from({ length: ENCODE_SIZE + 1 }, (_, i) => sceneLinearToHlg(Math.min(1, ((ENCODE_MAX * i) / ENCODE_SIZE) * HLG_REFERENCE_WHITE_SCENE)));

function lookup(table: Float32Array, min: number, max: number, value: number) {
  const p = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * (table.length - 1);
  const i = Math.min(table.length - 2, Math.floor(p));
  return table[i]! + (table[i + 1]! - table[i]!) * (p - i);
}

// lookup() specialised to the two tables, for the per-pixel loop below.
const decodeStep = DECODE_SIZE / (DECODE_MAX - DECODE_MIN), encodeStep = ENCODE_SIZE / ENCODE_MAX;
function decode(value: number) {
  const p = (value < DECODE_MIN ? 0 : value > DECODE_MAX ? DECODE_MAX - DECODE_MIN : value - DECODE_MIN) * decodeStep;
  const floor = p | 0, i = floor > DECODE_SIZE - 1 ? DECODE_SIZE - 1 : floor, low = decodeTable[i]!;
  return low + (decodeTable[i + 1]! - low) * (p - i);
}
function encode(value: number) {
  const p = (value < 0 ? 0 : value > ENCODE_MAX ? ENCODE_MAX : value) * encodeStep;
  const floor = p | 0, i = floor > ENCODE_SIZE - 1 ? ENCODE_SIZE - 1 : floor, low = encodeTable[i]!;
  return low + (encodeTable[i + 1]! - low) * (p - i);
}

/** One composite pixel (sRGB-encoded, SDR white = 1) to HLG BT.2020 code values. */
export function extendedToHlg(r: number, g: number, b: number): [number, number, number] {
  const lin = apply(TO_2020, [lookup(decodeTable, DECODE_MIN, DECODE_MAX, r), lookup(decodeTable, DECODE_MIN, DECODE_MAX, g), lookup(decodeTable, DECODE_MIN, DECODE_MAX, b)]);
  return [lookup(encodeTable, 0, ENCODE_MAX, lin[0]), lookup(encodeTable, 0, ENCODE_MAX, lin[1]), lookup(encodeTable, 0, ENCODE_MAX, lin[2])];
}

/**
 * Premultiplied RGBA floats (CanvasKit readPixels as RGBA_F32) to I420P10 planes in one buffer:
 * Y (width×height), then Cb and Cr at half resolution, each sample a little-endian uint16.
 * Width and height must be even.
 */
export function compositeToI420P10(pixels: Float32Array, width: number, height: number): Uint8Array {
  if (width % 2 || height % 2) throw Error("HDR export needs even dimensions");
  const lumaSize = width * height, chromaSize = lumaSize / 4, halfWidth = width >> 1;
  const planes = new Uint16Array(lumaSize + 2 * chromaSize);
  const cb = new Float32Array(chromaSize), cr = new Float32Array(chromaSize);
  // extendedToHlg inlined without its per-pixel arrays: a 1440p frame takes ~120 ms here instead of ~210 ms.
  const [[m0, m1, m2], [m3, m4, m5], [m6, m7, m8]] = TO_2020;
  const cbScale = 1 / (2 * (1 - KB)), crScale = 1 / (2 * (1 - KR));
  for (let y = 0; y < height; y += 1) {
    const chromaRow = (y >> 1) * halfWidth;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4, a = pixels[i + 3]!;
      const scale = a > 0 ? 1 / a : 0;
      const r = decode(pixels[i]! * scale), g = decode(pixels[i + 1]! * scale), b = decode(pixels[i + 2]! * scale);
      const R = encode(m0! * r + m1! * g + m2! * b), G = encode(m3! * r + m4! * g + m5! * b), B = encode(m6! * r + m7! * g + m8! * b);
      const Y = KR * R + KG * G + KB * B;
      planes[y * width + x] = Math.round(64 + 876 * (Y < 0 ? 0 : Y > 1 ? 1 : Y));
      const c = chromaRow + (x >> 1);
      cb[c]! += (B - Y) * cbScale;
      cr[c]! += (R - Y) * crScale;
    }
  }
  for (let c = 0; c < chromaSize; c += 1) {
    planes[lumaSize + c] = Math.round(512 + 896 * Math.min(0.5, Math.max(-0.5, cb[c]! / 4)));
    planes[lumaSize + chromaSize + c] = Math.round(512 + 896 * Math.min(0.5, Math.max(-0.5, cr[c]! / 4)));
  }
  return new Uint8Array(planes.buffer);
}

/** VP9 profile 2 (10-bit) codec string for a frame size and rate. */
export function vp9Profile2Codec(width: number, height: number, fps: number) {
  const samples = width * height * fps;
  const level = samples <= 1920 * 1080 * 30 ? "40" : samples <= 1920 * 1080 * 60 ? "41" : samples <= 4096 * 2176 * 30 ? "50" : "51";
  return `vp09.02.${level}.10`;
}
