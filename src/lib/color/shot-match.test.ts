import assert from "node:assert/strict";
import test from "node:test";

import { IDENTITY_GRADE_V2 } from "./grade-v2";
import { SDR_REC709 } from "./io-transforms";
import { matchSampleFromFrames, solveShotMatch } from "./shot-match";

// A deterministic frame with a spread of brightness, a few saturated objects and neutral areas.
function syntheticFrame(width = 48, height = 32) {
  const rgba = new Uint8Array(width * height * 4);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < width * height; i += 1) {
    const level = 0.1 + 0.8 * ((i % width) / width);
    const tint = i % 5 === 0 ? [0.25, -0.1, -0.15] : i % 7 === 0 ? [-0.1, 0.05, 0.2] : [0, 0, 0];
    for (let c = 0; c < 3; c += 1) rgba[i * 4 + c] = Math.round(255 * Math.min(1, Math.max(0, level + tint[c]! + (rand() - 0.5) * 0.04)));
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, width, height };
}

test("shot match recovers a known primary difference between two shots of the same scene", () => {
  const sample = matchSampleFromFrames([syntheticFrame()], SDR_REC709);
  const referenceGrade = { ...IDENTITY_GRADE_V2, exposureEv: 0.6, temperature: 0.3, saturation: 1.3 };
  const result = solveShotMatch({ reference: sample, referenceGrade, target: sample, targetGrade: IDENTITY_GRADE_V2 });
  assert.ok(result.distanceBefore > 5, `before ${result.distanceBefore}`);
  assert.ok(result.distanceAfter < 1, `after ${result.distanceAfter}`);
  assert.ok(Math.abs(result.grade.exposureEv - 0.6) < 0.2, `exposure ${result.grade.exposureEv}`);
  assert.ok(result.grade.temperature > 0.1, `temperature ${result.grade.temperature}`);
  assert.ok(result.grade.saturation > 1.1, `saturation ${result.grade.saturation}`);
});

test("shot match keeps the target's other grade settings and leaves a matched shot alone", () => {
  const sample = matchSampleFromFrames([syntheticFrame()], SDR_REC709);
  const targetGrade = { ...IDENTITY_GRADE_V2, hueDegrees: 12, gain: { rgb: [0.02, 0, 0] as const, master: 0 } };
  const result = solveShotMatch({ reference: sample, referenceGrade: targetGrade, target: sample, targetGrade });
  assert.equal(result.grade.hueDegrees, 12);
  assert.deepEqual(result.grade.gain, targetGrade.gain);
  assert.deepEqual(result.changed, {});
  assert.ok(result.distanceAfter < 0.05);
});
