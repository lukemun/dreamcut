import assert from "node:assert/strict";
import test from "node:test";

import { isValidElement } from "react";

import { IDENTITY_COLOR_GRADE } from "../timeline/color-grade";
import { ColorGradeFilter } from "./ColorGradeFilter";
import { GradeCanvasFilter } from "./GradeCanvasFilter";

const child = "graded-video";
const renderFilter = (contrast: number, mountIdentity: boolean) => ColorGradeFilter({ grade: { ...IDENTITY_COLOR_GRADE, contrast }, mountIdentity, children: child });

test("animated grading keeps the grade wrapper mounted through identity values", () => {
  for (const contrast of [1, 1.003]) {
    const frame = renderFilter(contrast, true);
    assert.ok(isValidElement(frame) && frame.type === GradeCanvasFilter, `contrast ${contrast} keeps the grade canvas`);
    assert.equal((frame.props as { children: unknown }).children, child);
  }
});

test("an unanimated identity grade retains the zero-wrapper fast path", () => {
  assert.equal(renderFilter(1, false), child);
  assert.ok(isValidElement(renderFilter(1.2, false)));
});

test("an HDR source is graded even at identity, because it still needs its tone map", () => {
  const frame = ColorGradeFilter({ grade: IDENTITY_COLOR_GRADE, source: { transfer: "hlg", primaries: "rec2020" }, children: child });
  assert.ok(isValidElement(frame) && frame.type === GradeCanvasFilter);
});
