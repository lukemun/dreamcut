import assert from "node:assert/strict";
import test from "node:test";
import { evaluateColorGradeV1 } from "./color-grade-v1-reference";
import { deltaE2000 } from "./delta-e";
import { evaluateGrade, prepareGrade } from "./grade-v2";
import { SDR_REC709, inputToWorking, workingToDisplay } from "./io-transforms";
import type { Vec3 } from "./matrices";
import { upgradeColorGradeV1, type ColorGradeV1 } from "./upgrade-v1";

export const IDENTITY_V1: ColorGradeV1 = {
  exposureEv: 0, contrast: 1, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  saturation: 1, temperature: 0, tint: 0, hueDegrees: 0,
  liftRgb: [0, 0, 0], gammaRgb: [1, 1, 1], gainRgb: [1, 1, 1],
  masterCurve: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
};

const PATCHES: Vec3[] = [];
for (let r = 0; r <= 5; r += 1) for (let g = 0; g <= 5; g += 1) for (let b = 0; b <= 5; b += 1) PATCHES.push([r / 5, g / 5, b / 5]);
PATCHES.push([0.87, 0.67, 0.55], [0.55, 0.38, 0.3], [0.18, 0.18, 0.18], [0.46, 0.46, 0.46]);

export function migrationError(v1: ColorGradeV1) {
  const { grade, report } = upgradeColorGradeV1(v1);
  const baked = prepareGrade(grade);
  const errors = PATCHES.map((rgb) => deltaE2000(evaluateColorGradeV1(rgb, v1), workingToDisplay(evaluateGrade(inputToWorking(rgb, SDR_REC709), baked), { sourcePeak: 1 }))).sort((a, b) => a - b);
  return { mean: errors.reduce((a, b) => a + b, 0) / errors.length, p99: errors[Math.floor(errors.length * 0.99)]!, max: errors[errors.length - 1]!, report };
}

export const SINGLE_CONTROL_CASES: Array<[string, Partial<ColorGradeV1>]> = [
  ["exposure +1", { exposureEv: 1 }], ["exposure -1.5", { exposureEv: -1.5 }],
  ["warm", { temperature: 0.6 }], ["cool + tint", { temperature: -0.5, tint: 0.4 }],
  ["contrast 1.3", { contrast: 1.3 }], ["contrast 0.7", { contrast: 0.7 }],
  ["highlights -0.6", { highlights: -0.6 }], ["shadows +0.5", { shadows: 0.5 }],
  ["whites +0.4", { whites: 0.4 }], ["blacks -0.4", { blacks: -0.4 }],
  ["lift", { liftRgb: [0.05, 0.03, 0] }], ["gamma", { gammaRgb: [1.2, 1.1, 0.9] }], ["gain", { gainRgb: [1.1, 1, 0.9] }],
  ["curve", { masterCurve: [0, 0.1, 0.22, 0.36, 0.5, 0.65, 0.79, 0.9, 1] }],
  ["saturation 1.3", { saturation: 1.3 }], ["saturation 0.6", { saturation: 0.6 }],
  ["hue 20", { hueDegrees: 20 }],
];

test("identity upgrades to identity", () => {
  const { grade, report } = upgradeColorGradeV1(IDENTITY_V1);
  assert.equal(report.fittedCurves, false);
  assert.deepEqual(grade.curves.y, []);
  assert.ok(migrationError(IDENTITY_V1).max < 0.01);
});

test("single controls upgrade within mean ΔE 0.5 and p99 ΔE 2", () => {
  const failures: string[] = [];
  for (const [label, patch] of SINGLE_CONTROL_CASES) {
    const e = migrationError({ ...IDENTITY_V1, ...patch });
    if (e.mean > 0.5 || e.p99 > 2) failures.push(`${label}: mean ${e.mean.toFixed(2)} p99 ${e.p99.toFixed(2)} max ${e.max.toFixed(2)}`);
  }
  assert.deepEqual(failures, []);
});

test("tone-only combinations stay close because saturation is untouched", () => {
  const e = migrationError({ ...IDENTITY_V1, exposureEv: 0.4, contrast: 1.2, highlights: -0.4, shadows: 0.3, liftRgb: [0.02, 0.01, 0], gainRgb: [1.05, 1, 0.95] });
  assert.ok(e.mean <= 0.5 && e.p99 <= 2, `mean ${e.mean} p99 ${e.p99}`);
});

test("contrast and zones with saturation, the common pairing, stay close", () => {
  const e = migrationError({ ...IDENTITY_V1, contrast: 1.2, shadows: 0.3, highlights: -0.3, saturation: 1.25, temperature: 0.2 });
  assert.ok(e.mean <= 0.5 && e.p99 <= 2, `mean ${e.mean} p99 ${e.p99}`);
});

test("per-channel lift, gamma or gain with saturation is the known approximate case", () => {
  // v1 applied these after saturation; v2 applies all tone before it. Rare in practice; reported, not hidden.
  const { report } = upgradeColorGradeV1({ ...IDENTITY_V1, saturation: 1.2, liftRgb: [0, 0.01, 0.03] });
  assert.equal(report.fittedCurves, true);
  assert.ok(migrationError({ ...IDENTITY_V1, saturation: 1.2, liftRgb: [0, 0.01, 0.03] }).mean < 2);
});
