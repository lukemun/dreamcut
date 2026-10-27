import assert from "node:assert/strict";
import test from "node:test";
import { snapPanelSize } from "./panel-snap";

test("pointer resizing snaps to the nearest valid target and releases outside its radius", () => {
  assert.equal(snapPanelSize(553, [560, 550], 280, 1200), 550);
  assert.equal(snapPanelSize(569, [560], 280, 1200), 560);
  assert.equal(snapPanelSize(571, [560], 280, 1200), 571);
  assert.equal(snapPanelSize(344, [335, NaN, Infinity], 340, 1000), 344);
  assert.equal(snapPanelSize(500, [], 280, 1200), 500);
});
