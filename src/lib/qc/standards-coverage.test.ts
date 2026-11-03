import assert from "node:assert/strict";
import test from "node:test";

import * as standards from "@/lib/qc/standards";
import { STANDARD_ENFORCEMENT } from "@/lib/qc/standards";

test("every exported standards constant has an explicit enforcement owner", () => {
  const helpers = new Set([
    "msToFrames",
    "framesToMs",
    "isDeliveryTarget",
    "isCaptionSafeAreaMode",
    "safeAreaFor",
    "isAllowedCaptionGapFrames",
    "STANDARD_ENFORCEMENT",
  ]);
  const constants = Object.keys(standards).filter((name) => !helpers.has(name));
  assert.deepEqual(constants.sort(), Object.keys(STANDARD_ENFORCEMENT).sort());
});
