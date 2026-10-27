import assert from "node:assert/strict";
import test from "node:test";
import { compositeToI420P10, extendedToHlg, vp9Profile2Codec } from "./hdr-encode";
import { IDENTITY_GRADE_V2, evaluateGrade, prepareGrade } from "./grade-v2";
import { inputToWorking } from "./io-transforms";
import { linearToSrgb } from "./transfers";

const near = (a: number, b: number, tol: number, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);

test("SDR white lands at HLG 75% and black at 0", () => {
  for (const c of extendedToHlg(1, 1, 1)) near(c, 0.75, 0.002, "white");
  for (const c of extendedToHlg(0, 0, 0)) near(c, 0, 1e-6, "black");
});

test("an HLG source at identity grade keeps its own code values through HDR export", () => {
  const space = { transfer: "hlg", primaries: "rec2020" } as const, baked = prepareGrade(IDENTITY_GRADE_V2);
  for (const code of [[0.1, 0.1, 0.1], [0.5, 0.45, 0.4], [0.75, 0.75, 0.75], [0.9, 0.85, 0.8], [0.6, 0.3, 0.2]] as const) {
    // The HDR output transform below the export peak only encodes: linear working light, sRGB-encoded.
    const lin = evaluateGrade(inputToWorking(code, space), baked);
    const out = extendedToHlg(linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2]));
    for (let i = 0; i < 3; i += 1) near(out[i]!, code[i]!, 0.003, `code ${code}`);
  }
});

test("I420P10 packs limited-range BT.2020 YCbCr", () => {
  const w = 4, h = 2, pixels = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) pixels.set([1, 1, 1, 1], i * 4);
  const planes = new Uint16Array(compositeToI420P10(pixels, w, h).buffer);
  const luma = planes.slice(0, w * h), chroma = planes.slice(w * h);
  for (const y of luma) near(y, 64 + 876 * 0.75, 1, "white luma");
  for (const c of chroma) assert.equal(c, 512, "neutral chroma");
  assert.equal(planes.length, w * h * 1.5);
});

test("VP9 profile 2 codec level follows frame size", () => {
  assert.equal(vp9Profile2Codec(1920, 1080, 30), "vp09.02.40.10");
  assert.equal(vp9Profile2Codec(3840, 2160, 30), "vp09.02.50.10");
  assert.equal(vp9Profile2Codec(3840, 2160, 60), "vp09.02.51.10");
});
