import assert from "node:assert/strict";
import test from "node:test";

import { videoStabilizationRecipe } from "./video-stabilization";

test("smooth-motion stabilization maps strength to bounded detector settings", () => {
  assert.deepEqual(videoStabilizationRecipe("smooth_motion", -20), {
    schemaVersion: 1,
    recipe: "video-stabilization-v1:smooth_motion:0",
    mode: "smooth_motion",
    strengthPercent: 0,
    shakiness: 2,
    smoothingFrames: 5,
    tripod: false,
    autoZoom: true,
  });
  const strongest = videoStabilizationRecipe("smooth_motion", 120);
  assert.equal(strongest.strengthPercent, 100);
  assert.equal(strongest.shakiness, 8);
  assert.equal(strongest.smoothingFrames, 50);
});

test("lock-camera stabilization uses tripod mode", () => {
  const recipe = videoStabilizationRecipe("lock_camera", 50);
  assert.equal(recipe.tripod, true);
  assert.equal(recipe.smoothingFrames, 0);
});
