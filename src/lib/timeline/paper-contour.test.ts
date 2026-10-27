import assert from "node:assert/strict";
import test from "node:test";
import { paperContourMatrix, PAPER_CONTOUR_MODEL } from "./paper-contour";
const props = { contour_model: PAPER_CONTOUR_MODEL, contour_radius_start: 140, contour_radius_end: 240, contour_duration: 1, contour_color: "#ff0000" };
function alpha(distance: number, time: number) {
  const encoded = Math.round((1 - distance / 1024) * 65535);
  const m = paperContourMatrix(props, time)!;
  return Math.max(0, Math.min(1, m[15]! * (encoded >> 8) / 255 + m[16]! * (encoded & 255) / 255 + m[19]!));
}
test("edge advances continuously rather than switching widths", () => {
  assert.equal(alpha(190, 0), 0);
  assert.ok(alpha(190, 0.5) > 0.48 && alpha(190, 0.5) < 0.52);
  assert.equal(alpha(190, 1), 1);
  assert.equal(alpha(190, 5), 1);
  assert.equal(alpha(190, -1), 0);
});
test("fine distance values survive RG decoding", () => {
  assert.ok(alpha(190.2, 0.5) < alpha(190.1, 0.5));
});
test("unrelated images have no filter and invalid numeric props fail safely", () => {
  assert.equal(paperContourMatrix({}, 0), null);
  assert.ok(paperContourMatrix({...props,contour_duration:NaN,contour_radius_end:Infinity}, 0)!.every(Number.isFinite));
});
