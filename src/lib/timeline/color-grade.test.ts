import assert from "node:assert/strict";
import test from "node:test";

import {
  buildColorGradeFilterDescriptor,
  clearColorGradeKeyframes,
  COLOR_GRADE_MODEL,
  commitColorGradeFieldAtTime,
  commitAdvancedColorGradeFieldAtTime,
  IDENTITY_COLOR_GRADE,
  readColorGradeProps,
  resetColorGrade,
  resolveColorGradeAtTime,
  updateMasterCurvePoint,
  upsertColorGradeKeyframe,
  upsertAdvancedColorGradeKeyframe,
  validateColorGradeModel,
} from "./color-grade";

test("missing color grade data resolves to identity", () => {
  assert.deepEqual(readColorGradeProps({ unrelated: true }), IDENTITY_COLOR_GRADE);
  assert.equal(buildColorGradeFilterDescriptor(IDENTITY_COLOR_GRADE), null);
});

test("static grade writes are versioned, normalized, and identity values are omitted", () => {
  const warmed = commitColorGradeFieldAtTime({ unrelated: true }, 0, "grade_temperature", 4);
  assert.equal(warmed.color_grade_model, COLOR_GRADE_MODEL);
  assert.equal(warmed.grade_temperature, 1);
  assert.equal(warmed.unrelated, true);

  const resetTemperature = commitColorGradeFieldAtTime(warmed, 0, "grade_temperature", 0);
  assert.equal(resetTemperature.grade_temperature, undefined);
  assert.equal(resetTemperature.color_grade_model, undefined);
  assert.equal(resetTemperature.unrelated, true);
});

test("keyframed grade fields interpolate at clip-local time", () => {
  let props = upsertColorGradeKeyframe({}, 0, "grade_exposure_ev", 0);
  props = upsertColorGradeKeyframe(props, 2, "grade_exposure_ev", 2);
  assert.equal(resolveColorGradeAtTime(props, 1).exposureEv, 1);
  assert.equal(props.color_grade_model, COLOR_GRADE_MODEL);
});

test("filter descriptor preserves linear middle grey for contrast and shifts white balance directionally", () => {
  const descriptor = buildColorGradeFilterDescriptor({
    ...IDENTITY_COLOR_GRADE,
    exposureEv: 1,
    contrast: 1.5,
    temperature: 1,
    tint: 1,
  });
  assert.ok(descriptor);
  assert.equal(descriptor.exposureSlope, 2);
  assert.equal(descriptor.contrastIntercept, -0.09);
  assert.ok(descriptor.redGain > descriptor.blueGain);
  assert.ok(descriptor.greenGain < 1);
});

test("unknown or missing grade models fail closed", () => {
  assert.match(validateColorGradeModel({ grade_contrast: 1.2 }) ?? "", /missing color_grade_model/);
  assert.match(validateColorGradeModel({ color_grade_model: "future", grade_contrast: 1.2 }) ?? "", /Unsupported/);
  assert.throws(() => readColorGradeProps({ grade_contrast: 1.2 }), /missing color_grade_model/);
});

test("clear keyframes preserves static grade while reset removes only grade data", () => {
  let props = commitColorGradeFieldAtTime({ unrelated: "keep" }, 0, "grade_saturation", 1.4);
  props = upsertColorGradeKeyframe(props, 1, "grade_hue_degrees", 20);
  const cleared = clearColorGradeKeyframes(props);
  assert.equal(cleared.grade_saturation, 1.4);
  assert.equal(cleared.keyframes, undefined);
  assert.equal(cleared.color_grade_model, COLOR_GRADE_MODEL);
  assert.deepEqual(resetColorGrade(props), { unrelated: "keep" });
});

test("lift gamma gain tuples normalize, interpolate, and preserve channel order", () => {
  let props = commitAdvancedColorGradeFieldAtTime({}, 0, "grade_lift_rgb", [0.5, -0.5, 0.1]);
  assert.deepEqual(props.grade_lift_rgb, [0.25, -0.25, 0.1]);
  assert.equal(props.color_grade_model, COLOR_GRADE_MODEL);
  props = upsertAdvancedColorGradeKeyframe(props, 0, "grade_gain_rgb", [1, 1, 1]);
  props = upsertAdvancedColorGradeKeyframe(props, 2, "grade_gain_rgb", [2, 1.5, 1]);
  assert.deepEqual(resolveColorGradeAtTime(props, 1).gainRgb, [1.5, 1.25, 1]);
});

test("master curves use a fixed monotonic table and feed a 17-sample render descriptor", () => {
  const props = commitAdvancedColorGradeFieldAtTime({}, 0, "grade_curve_master", [0, 0.2, 0.1, 0.4, 0.5, 0.7, 0.65, 0.9, 1]);
  assert.deepEqual(props.grade_curve_master, [0, 0.2, 0.2, 0.4, 0.5, 0.7, 0.7, 0.9, 1]);
  const descriptor = buildColorGradeFilterDescriptor(readColorGradeProps(props));
  assert.ok(descriptor);
  assert.equal(descriptor.masterCurveTable.length, 17);
  assert.equal(descriptor.masterCurveTable[0], 0);
  assert.equal(descriptor.masterCurveTable[16], 1);
});

test("master curve point edits stay between adjacent points", () => {
  const curve = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  assert.equal(updateMasterCurvePoint(curve, 3, 0.9)[3], 0.5);
  assert.equal(updateMasterCurvePoint(curve, 3, -1)[3], 0.25);
  assert.equal(updateMasterCurvePoint(curve, 3, 0.4)[3], 0.4);
});

test("advanced identity values are omitted and reset preserves unrelated props", () => {
  const identity = commitAdvancedColorGradeFieldAtTime({ unrelated: true }, 0, "grade_gamma_rgb", [1, 1, 1]);
  assert.deepEqual(identity, { unrelated: true });
  const graded = commitAdvancedColorGradeFieldAtTime(identity, 0, "grade_gain_rgb", [1.2, 1, 0.9]);
  assert.deepEqual(resetColorGrade(graded), { unrelated: true });
});

test("localized tone controls preserve identity and target different regions", async () => {
  const { buildToneTable } = await import("./color-grade");
  const identity = buildToneTable(IDENTITY_COLOR_GRADE);
  assert.deepEqual(identity, Array.from({ length: 65 }, (_, i) => i / 64));
  const shadow = buildToneTable({ ...IDENTITY_COLOR_GRADE, shadows: 0.7 });
  const highlight = buildToneTable({ ...IDENTITY_COLOR_GRADE, highlights: -0.7 });
  assert.ok(shadow[12]! - identity[12]! > shadow[52]! - identity[52]!);
  assert.ok(identity[52]! - highlight[52]! > identity[12]! - highlight[12]!);
  for (const sign of [-1, 1]) {
    const table = buildToneTable({ highlights: sign, shadows: -sign, whites: sign, blacks: -sign });
    assert.ok(table.every((v, i) => v >= 0 && v <= 1 && (i === 0 || v >= table[i - 1]!)));
  }
});

test("new tone fields support fine values, keyframe interpolation, and reset", () => {
  let props = commitColorGradeFieldAtTime({ keep: true }, 0, "grade_highlights", -0.123);
  assert.equal(readColorGradeProps(props).highlights, -0.123);
  props = upsertColorGradeKeyframe(props, 0, "grade_shadows", 0);
  props = upsertColorGradeKeyframe(props, 2, "grade_shadows", 0.8);
  assert.equal(resolveColorGradeAtTime(props, 1).shadows, 0.4);
  assert.deepEqual(resetColorGrade(props), { keep: true });
});
