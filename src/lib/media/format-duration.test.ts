import {test} from "node:test";
import assert from "node:assert/strict";
import {formatMediaDuration} from "./format-duration";

test("media lengths read as m:ss.xx, matching Storyboard Media", () => {
  assert.equal(formatMediaDuration(6), "0:06.00");
  assert.equal(formatMediaDuration(75.5), "1:15.50");
  assert.equal(formatMediaDuration(0.333), "0:00.33");
  assert.equal(formatMediaDuration(59.999), "1:00.00");
  assert.equal(formatMediaDuration(-1), "0:00.00");
  assert.equal(formatMediaDuration(Number.NaN), "0:00.00");
});
