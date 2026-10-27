import assert from "node:assert/strict";
import test from "node:test";
import { SDR_REC709, compressGamut, inputToWorking, sourceColorSpaceFromProbe, sourcePeakRelative, toneMapLuminance, workingToDisplay } from "./io-transforms";
import { AP1_LUMA, apply, gamutMatrix, invert, multiply } from "./matrices";
import {
  GRADE_AXIS_GREY,
  GRADE_AXIS_WHITE,
  HLG_REFERENCE_WHITE_SCENE,
  acescctToLinear,
  gradeAxisToLinear,
  hlgToSceneLinear,
  linearToAcescct,
  linearToGradeAxis,
  linearToSrgb,
  nitsToPq,
  pqToNits,
  sceneLinearToHlg,
  srgbToLinear,
} from "./transfers";

const near = (actual: number, expected: number, tolerance: number, label = "") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} not within ${tolerance} of ${expected}`);

test("transfer functions round-trip and match published reference points", () => {
  for (let i = 0; i <= 100; i += 1) {
    const v = i / 100;
    near(linearToSrgb(srgbToLinear(v)), v, 1e-12, "srgb");
    near(sceneLinearToHlg(hlgToSceneLinear(v)), v, 1e-12, "hlg");
    near(nitsToPq(pqToNits(v)), v, 1e-6, "pq");
  }
  for (const l of [0, 0.001, 0.0078125, 0.18, 1, 4, 16, 64]) near(acescctToLinear(linearToAcescct(l)), l, 1e-9 * Math.max(1, l), "acescct");
  near(HLG_REFERENCE_WHITE_SCENE, 0.2647, 0.0005, "HLG 75% reference white");
  near(nitsToPq(203), 0.5807, 0.0005, "PQ 203 nits");
  near(nitsToPq(10000), 1, 1e-12, "PQ peak");
  near(linearToAcescct(0.18), 0.4136, 0.0005, "ACEScct mid grey");
});

test("the grade axis places grey, white and the HLG peak where the curves expect them", () => {
  near(linearToGradeAxis(0), 0, 1e-12);
  near(linearToGradeAxis(16), 1, 1e-12);
  near(GRADE_AXIS_GREY, 0.48, 0.01, "grey");
  near(GRADE_AXIS_WHITE, 0.68, 0.01, "white");
  near(linearToGradeAxis(1 / HLG_REFERENCE_WHITE_SCENE), 0.83, 0.01, "HLG peak");
  for (const u of [-0.1, 0, 0.3, 0.68, 1, 1.2]) near(linearToGradeAxis(gradeAxisToLinear(u)), u, 1e-9);
});

test("gamut matrices match published values and invert exactly", () => {
  const m = gamutMatrix("rec709", "rec2020");
  near(m[0][0], 0.6274, 0.0002); near(m[0][1], 0.3293, 0.0002); near(m[0][2], 0.0433, 0.0002);
  near(m[1][0], 0.0691, 0.0002); near(m[1][1], 0.9195, 0.0002);
  near(AP1_LUMA[0], 0.2722, 0.0002); near(AP1_LUMA[1], 0.6741, 0.0002); near(AP1_LUMA[2], 0.0537, 0.0002);
  // White stays white across the D65 → ACES white adaptation.
  const white = apply(gamutMatrix("rec709", "ap1"), [1, 1, 1]);
  for (const c of white) near(c, 1, 1e-4, "adapted white");
  const round = multiply(gamutMatrix("ap1", "rec709"), gamutMatrix("rec709", "ap1"));
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) near(round[r]![c]!, r === c ? 1 : 0, 1e-9);
  const inv = multiply(invert(m), m);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) near(inv[r]![c]!, r === c ? 1 : 0, 1e-9);
});

test("an SDR source comes back unchanged at identity", () => {
  for (let r = 0; r <= 8; r += 1) for (let g = 0; g <= 8; g += 2) for (let b = 0; b <= 8; b += 4) {
    const rgb = [r / 8, g / 8, b / 8] as const;
    const out = workingToDisplay(inputToWorking(rgb, SDR_REC709), { sourcePeak: 1 });
    for (let i = 0; i < 3; i += 1) near(out[i]!, rgb[i]!, 1e-9, `rgb ${rgb}`);
  }
});

test("HDR sources are tone-mapped smoothly into SDR", () => {
  const space = sourceColorSpaceFromProbe({ color_transfer: "arib-std-b67", color_primaries: "bt2020" });
  assert.deepEqual(space, { transfer: "hlg", primaries: "rec2020" });
  const peak = sourcePeakRelative(space);
  near(peak, 3.78, 0.01, "HLG peak relative");
  let previous = 0;
  for (let i = 1; i <= 200; i += 1) {
    const mapped = toneMapLuminance((i / 200) * peak, peak);
    assert.ok(mapped >= previous - 1e-12, "tone map is monotonic");
    assert.ok(mapped <= 1 + 1e-9, "never exceeds SDR white");
    previous = mapped;
  }
  near(toneMapLuminance(peak, peak), 1, 1e-6, "source peak lands on display peak");
  near(toneMapLuminance(0.1, peak), 0.1, 1e-9, "shadows untouched");
  const hlgWhite = workingToDisplay(inputToWorking([0.75, 0.75, 0.75], space), { sourcePeak: peak });
  for (const c of hlgWhite) assert.ok(c > 0.85 && c < 1, `HLG reference white maps near but below SDR white: ${c}`);
  assert.equal(toneMapLuminance(2, 1), 1, "SDR clips above white");
});

test("gamut compression leaves in-gamut colours alone and pulls negatives inside", () => {
  const inside = compressGamut([0.6, 0.3, 0.2], 0.815);
  for (const [i, c] of inside.entries()) near(c, [0.6, 0.3, 0.2][i]!, 1e-12);
  const pulled = compressGamut([0.8, 0.1, -0.05], 0.815);
  assert.ok(pulled.every((c) => c >= 0), `compressed into gamut: ${pulled}`);
  assert.deepEqual(compressGamut([0.8, 0.1, -0.05], 1), [0.8, 0.1, 0]);
});
