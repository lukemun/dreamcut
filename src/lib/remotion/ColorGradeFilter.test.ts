import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IDENTITY_COLOR_GRADE } from "../timeline/color-grade";
import { ColorGradeFilter } from "./ColorGradeFilter";

function renderFilter(contrast: number, mountIdentity: boolean) {
  return renderToStaticMarkup(createElement(
    ColorGradeFilter,
    {
      grade: { ...IDENTITY_COLOR_GRADE, contrast },
      mountIdentity,
      children: createElement("video", { "data-testid": "graded-video" }),
    },
  ));
}

test("animated grading keeps the filter wrapper mounted through identity values", () => {
  const identityFrame = renderFilter(1, true);
  const gradedFrame = renderFilter(1.003, true);

  assert.match(identityFrame, /<filter/);
  assert.match(gradedFrame, /<filter/);
  assert.equal((identityFrame.match(/<video/g) ?? []).length, 1);
  assert.equal((gradedFrame.match(/<video/g) ?? []).length, 1);
});

test("an unanimated identity grade retains the zero-wrapper fast path", () => {
  const identityFrame = renderFilter(1, false);

  assert.doesNotMatch(identityFrame, /<filter/);
  assert.equal((identityFrame.match(/<video/g) ?? []).length, 1);
});
