import assert from "node:assert/strict";
import test from "node:test";

import {
  enableWallSurface,
  resolveSurfacePlaneProps,
  writeSurfacePlaneProps,
} from "./surface-plane";

test("wall surface preset changes geometry without changing base appearance", () => {
  const props = enableWallSurface({ existing: true });
  const surface = resolveSurfacePlaneProps(props);

  assert.equal(props.existing, true);
  assert.equal(surface.mode, "wall");
  assert.equal(surface.depthPx, -90);
  assert.equal(surface.opacity, 1);
  assert.equal(surface.blurPx, 0);
  assert.equal(surface.blendMode, "normal");
});

test("surface plane values clamp to the renderer contract", () => {
  const surface = resolveSurfacePlaneProps(writeSurfacePlaneProps({}, {
    mode: "wall",
    perspectivePx: 9999,
    depthPx: -999,
    rotateYDeg: 80,
    skewXDeg: -50,
    opacity: 0,
    blurPx: 9,
  }));

  assert.equal(surface.perspectivePx, 3000);
  assert.equal(surface.depthPx, -400);
  assert.equal(surface.rotateYDeg, 30);
  assert.equal(surface.skewXDeg, -20);
  assert.equal(surface.opacity, 0.2);
  assert.equal(surface.blurPx, 3);
});

test("re-enabling a wall surface preserves authored geometry", () => {
  const props = enableWallSurface({
    surfaceMode: "none",
    surfaceDepthPx: -140,
    surfaceRotateYDeg: 7.5,
    surfaceOpacity: 0.67,
  });
  const surface = resolveSurfacePlaneProps(props);

  assert.equal(surface.mode, "wall");
  assert.equal(surface.depthPx, -140);
  assert.equal(surface.rotateYDeg, 7.5);
  assert.equal(surface.opacity, 0.67);
});
