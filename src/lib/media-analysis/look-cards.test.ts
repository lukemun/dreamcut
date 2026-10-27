import assert from "node:assert/strict";
import test from "node:test";

import { describeLookChange } from "./look-cards";

test("look cards describe the change in everyday words", () => {
  const before = { grade_exposure_ev: 0, grade_contrast: 1, grade_temperature: 0, grade_saturation: 1 };
  assert.deepEqual(
    describeLookChange(before, { grade_exposure_ev: 1, grade_contrast: 1.2, grade_temperature: -0.2, grade_saturation: 0.7 }),
    ["brighter by 1 stop", "more contrast", "cooler", "less colourful"],
  );
  assert.deepEqual(describeLookChange(before, { grade_exposure_ev: -0.52 }), ["darker by 0.5 stops"]);
  assert.deepEqual(describeLookChange(before, { grade_curve_y: [0, 0.1, 1, 1], lut_asset_id: "a" }), ["its fine color adjustments", "its look file"]);
  assert.deepEqual(describeLookChange(before, { grade_saturation: 1.01 }), []);
});
