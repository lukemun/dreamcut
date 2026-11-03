import assert from "node:assert/strict";
import test from "node:test";

import { measureHorizontalGroupBalance, unionRects } from "./group-balance";

test("group balance measures the union rather than averaging element centers", () => {
  const group = unionRects([
    { left: 145, top: 88, right: 395, bottom: 868 },
    { left: 566, top: 88, right: 1030, bottom: 868 },
  ]);
  assert.deepEqual(group, { left: 145, top: 88, right: 1030, bottom: 868 });
  assert.deepEqual(measureHorizontalGroupBalance(group, 1080), {
    centerX: 587.5,
    centerDeltaPx: 47.5,
    leftMargin: 145,
    rightMargin: 50,
    marginDeltaPx: 95,
  });
});

test("a centered group has equal outer margins", () => {
  const measurement = measureHorizontalGroupBalance(
    { left: 97.5, top: 88, right: 982.5, bottom: 868 },
    1080,
  );
  assert.equal(measurement.centerDeltaPx, 0);
  assert.equal(measurement.marginDeltaPx, 0);
});
