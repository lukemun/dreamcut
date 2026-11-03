import assert from "node:assert/strict";
import test from "node:test";

import {
  buildColorGradeFilterDescriptor,
  colorGradeSnapshot,
  clearColorGradeKeyframes,
  COLOR_GRADE_MODEL,
  commitColorGradeFieldAtTime,
  commitAdvancedColorGradeFieldAtTime,
  IDENTITY_COLOR_GRADE,
  readColorGradeProps,
  resetColorGrade,
  resolveColorGradeAtTime,
  upgradeColorGradeProps,
  isLegacyColorGrade,
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

test("shader descriptor carries exposure and white balance in its linear matrix", () => {
  const descriptor = buildColorGradeFilterDescriptor({ ...IDENTITY_COLOR_GRADE, exposureEv: 1, temperature: 1, tint: 1 });
  assert.ok(descriptor);
  const [[r], [, g], [, , b]] = descriptor.linearMatrix;
  assert.ok(r > b, "warmer: red gain above blue");
  assert.ok(g < 2, "tint lowers green below the exposure gain");
  assert.ok(Math.abs(descriptor.linearMatrix[0][0] / 2 - 1.15) < 0.01, "exposure doubles, temperature and tint add 15% red");
  assert.equal(descriptor.atlasBytes().length, 1024 * 15 * 4);
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

test("wheels normalize, interpolate and keep red, green, blue, brightness order", () => {
  let props = commitAdvancedColorGradeFieldAtTime({}, 0, "grade_wheel_lift", [0.8, -0.8, 0.1, 0.2]);
  assert.deepEqual(props.grade_wheel_lift, [0.5, -0.5, 0.1, 0.2]);
  assert.equal(props.color_grade_model, COLOR_GRADE_MODEL);
  props = upsertAdvancedColorGradeKeyframe(props, 0, "grade_wheel_gain", [0, 0, 0, 0]);
  props = upsertAdvancedColorGradeKeyframe(props, 2, "grade_wheel_gain", [0.2, 0, -0.2, 1]);
  const gain = resolveColorGradeAtTime(props, 1).gain;
  assert.deepEqual([...gain.rgb, gain.master], [0.1, 0, -0.1, 0.5]);
});

test("curves keep sorted points within range, wrap hue curves, and hold between unequal keys", () => {
  const props = commitAdvancedColorGradeFieldAtTime({}, 0, "grade_curve_y", [0.6, 0.7, 0, 0, 1, 1, 0.3, 2]);
  assert.deepEqual(props.grade_curve_y, [0, 0, 0.3, 1.25, 0.6, 0.7, 1, 1]);
  const hue = commitAdvancedColorGradeFieldAtTime({}, 0, "grade_curve_hue_sat", [1.25, 0.5, -0.1, 1]);
  assert.deepEqual(hue.grade_curve_hue_sat, [0.25, 0.5, 0.9, 1]);
  let keyed = upsertAdvancedColorGradeKeyframe({}, 0, "grade_curve_y", [0, 0, 1, 1]);
  keyed = upsertAdvancedColorGradeKeyframe(keyed, 2, "grade_curve_y", [0, 0.1, 0.5, 0.6, 1, 1]);
  assert.deepEqual(resolveColorGradeAtTime(keyed, 1).curves.y, [[0, 0], [1, 1]], "different point counts hold the earlier key");
  let same = upsertAdvancedColorGradeKeyframe({}, 0, "grade_curve_y", [0, 0, 1, 1]);
  same = upsertAdvancedColorGradeKeyframe(same, 2, "grade_curve_y", [0, 0.2, 1, 1]);
  assert.deepEqual(resolveColorGradeAtTime(same, 1).curves.y, [[0, 0.1], [1, 1]]);
});

test("colour slices store hue, saturation and density", () => {
  const props = commitAdvancedColorGradeFieldAtTime({}, 0, "grade_slice_skin", [90, 3, -0.4]);
  assert.deepEqual(props.grade_slice_skin, [60, 2, -0.4]);
  assert.deepEqual(readColorGradeProps(props).slices.skin, { hue: 60, saturation: 2, density: -0.4 });
});

test("advanced identity values are omitted and reset preserves unrelated props", () => {
  const identity = commitAdvancedColorGradeFieldAtTime({ unrelated: true }, 0, "grade_wheel_gamma", [0, 0, 0, 0]);
  assert.deepEqual(identity, { unrelated: true });
  const graded = commitAdvancedColorGradeFieldAtTime(identity, 0, "grade_wheel_gain", [0.2, 0, -0.1, 0]);
  assert.deepEqual(resetColorGrade(graded), { unrelated: true });
});

test("stored v1 grades upgrade on read and on the next write", () => {
  const v1 = { color_grade_model: "linear-srgb-v1", grade_exposure_ev: 0.5, grade_contrast: 1.2, grade_saturation: 1.3, grade_lift_rgb: [0.02, 0, 0], keep: 1 };
  assert.equal(isLegacyColorGrade(v1), true);
  assert.equal(validateColorGradeModel(v1), null);
  const grade = readColorGradeProps(v1);
  assert.equal(grade.exposureEv, 0.5);
  assert.equal(grade.saturation, 1.3);
  assert.equal(grade.contrast, 1, "v1 contrast moves into the curves");
  assert.ok(grade.curves.r.length > 2 && grade.curves.g.length > 2, "per-channel lift becomes R/G/B curves");
  const upgraded = upgradeColorGradeProps(v1);
  assert.equal(upgraded.color_grade_model, COLOR_GRADE_MODEL);
  assert.equal(upgraded.grade_lift_rgb, undefined);
  assert.equal(upgraded.grade_contrast, undefined);
  assert.equal(upgraded.keep, 1);
  assert.deepEqual(readColorGradeProps(upgraded), grade, "read-time and persisted upgrades agree");
  const written = commitColorGradeFieldAtTime(v1, 0, "grade_tint", 0.2);
  assert.equal(written.color_grade_model, COLOR_GRADE_MODEL);
  assert.equal(written.grade_lift_rgb, undefined);
  assert.equal(written.grade_tint, 0.2);
});

test("animated v1 tone controls upgrade to keyed curves at the same moments", () => {
  const v1 = { color_grade_model: "linear-srgb-v1", keyframes: { grade_contrast: [{ t: 0, v: 1, ease: "linear" }, { t: 2, v: 1.4, ease: "linear" }] } };
  const upgraded = upgradeColorGradeProps(v1) as { keyframes?: Record<string, Array<{ t: number }>> };
  for (const field of ["grade_curve_r", "grade_curve_g", "grade_curve_b"]) assert.deepEqual(upgraded.keyframes?.[field]?.map((key) => key.t), [0, 2]);
  assert.equal(upgraded.keyframes?.grade_contrast, undefined);
  const start = resolveColorGradeAtTime(upgraded, 0).curves.r, middle = resolveColorGradeAtTime(upgraded, 1).curves.r, end = resolveColorGradeAtTime(upgraded, 2).curves.r;
  assert.equal(start.length, end.length, "keys share their points");
  assert.ok(start.every(([x, y]) => Math.abs(x - y) < 0.002 || x === 1), "the first key is the identity diagonal");
  assert.ok(middle.every(([x], i) => x === start[i]![0]) && middle.some(([, y], i) => y !== start[i]![1] && y !== end[i]![1]), "midway the curve is between its keys");
});

test("new tone fields support fine values, keyframe interpolation, and reset", () => {
  let props = commitColorGradeFieldAtTime({ keep: true }, 0, "grade_highlights", -0.123);
  assert.equal(readColorGradeProps(props).highlights, -0.123);
  props = upsertColorGradeKeyframe(props, 0, "grade_shadows", 0);
  props = upsertColorGradeKeyframe(props, 2, "grade_shadows", 0.8);
  assert.equal(resolveColorGradeAtTime(props, 1).shadows, 0.4);
  assert.deepEqual(resetColorGrade(props), { keep: true });
});

test("a grade snapshot flattens keyframes at a moment and keeps the look file", () => {
  let source = upsertColorGradeKeyframe({}, 0, "grade_exposure_ev", 0);
  source = upsertColorGradeKeyframe(source, 2, "grade_exposure_ev", 1);
  source = commitAdvancedColorGradeFieldAtTime(source, 0, "grade_wheel_gain", [0.02, 0, -0.02, 0.1]);
  source = { ...source, lut_asset_id: "a".repeat(32), lut_source_url: "/api/projects/p1/media/look.cube", lut_intensity: 0.6 };
  const snapshot = colorGradeSnapshot(source, 1, "p1");
  assert.equal(snapshot.fields.grade_exposure_ev, 0.5);
  assert.deepEqual(snapshot.fields.grade_wheel_gain, [0.02, 0, -0.02, 0.1]);
  assert.equal(snapshot.lut?.intensity, 0.6);
  assert.equal(colorGradeSnapshot({}, 0, "p1").lut, null);
});

test("fields an undo left empty are not grade data", () => {
  const undone = { grade_exposure_ev: null, grade_contrast: null, unrelated: 1 };
  assert.equal(validateColorGradeModel(undone), null);
  assert.deepEqual(resolveColorGradeAtTime(undone, 0), IDENTITY_COLOR_GRADE);
});


test("only an identity SDR Rec.709 grade can preserve the original compositor", () => {
  assert.equal(buildColorGradeFilterDescriptor(readColorGradeProps({}), { includeIdentity: true })?.passthrough, true);
  assert.equal(buildColorGradeFilterDescriptor(readColorGradeProps({ color_grade_model: COLOR_GRADE_MODEL, grade_exposure_ev: 1 }), { includeIdentity: true })?.passthrough, false);
  assert.equal(buildColorGradeFilterDescriptor(readColorGradeProps({}), { includeIdentity: true, source: { primaries: "rec2020", transfer: "hlg" } })?.passthrough, false);
});
