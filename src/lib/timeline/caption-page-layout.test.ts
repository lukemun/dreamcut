import assert from "node:assert/strict";
import test from "node:test";
import { captionLineBreaksBefore, captionPageTiltDeg, resolveCaptionPageLayout } from "./caption-page-layout";

test("page tilt is off by default and each caption leans its own stable way", () => {
  assert.equal(captionPageTiltDeg(resolveCaptionPageLayout({}), "a"), 0);
  const lean = resolveCaptionPageLayout({ pageTilt: "lean", pageTiltDeg: 5 });
  const tilts = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => captionPageTiltDeg(lean, id));
  assert.ok(tilts.every((deg) => Math.abs(deg) === 5));
  assert.ok(tilts.some((deg) => deg > 0) && tilts.some((deg) => deg < 0));
  assert.equal(captionPageTiltDeg(lean, "c"), tilts[2]);
  const scatter = resolveCaptionPageLayout({ pageTilt: "scatter", pageTiltDeg: 5 });
  assert.ok(["a", "b", "c"].every((id) => Math.abs(captionPageTiltDeg(scatter, id)) <= 5));
});

test("words per line breaks before every nth word", () => {
  const layout = resolveCaptionPageLayout({ wordsPerLine: 2 });
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => captionLineBreaksBefore(layout, index)), [false, false, true, false, true]);
  assert.equal(captionLineBreaksBefore(resolveCaptionPageLayout({}), 3), false);
});
