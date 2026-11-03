import assert from "node:assert/strict";
import test from "node:test";
import { paperFillFilter, paperFillMatrix, resolvePaperFill } from "./paper-fill";

test("paper fill accepts only hex RGB, preserving legacy source appearance by default", () => {
  assert.equal(resolvePaperFill("#F6F3EA"), "#f6f3ea");
  for (const value of [undefined, null, "red", "url(evil)", "#fff", 123]) assert.equal(paperFillFilter(value), null);
});
test("paper fill changes RGB only and retains the exact input alpha", () => {
  assert.equal(paperFillMatrix("#ff0080"), '0 0 0 0 1 0 0 0 0 0 0 0 0 0 0.5019607843137255 0 0 0 1 0');
  assert.equal(paperFillFilter("#FF0080"), "url(#paper-fill-ff0080)");
});
