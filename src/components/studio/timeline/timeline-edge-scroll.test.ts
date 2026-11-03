import test from "node:test";
import assert from "node:assert/strict";
import { trimGestureActivated, trimEdgeScrollPosition, trimEdgeScrollVelocity } from "./timeline-edge-scroll";

test("trim scrolling activates at either viewport edge and accelerates smoothly", () => {
  assert.equal(trimEdgeScrollVelocity(400, 200, 800), 0);
  assert.equal(trimEdgeScrollVelocity(200, 200, 800), -600);
  assert.equal(trimEdgeScrollVelocity(800, 200, 800), 600);
  assert.equal(trimEdgeScrollVelocity(228, 200, 800), -150);
  assert.equal(trimEdgeScrollVelocity(900, 200, 800), 600);
  assert.equal(trimEdgeScrollVelocity(200, 200, 200), 0);
});

test("stationary edge scrolling continues over frames, respects zoom and bounds", () => {
  let scroll = 10;
  for (let frame = 0; frame < 60; frame++) scroll = trimEdgeScrollPosition(scroll, -600, 1000 / 60, 100, 30);
  assert.ok(Math.abs(scroll - 4) < 1e-8);
  assert.equal(trimEdgeScrollPosition(0, -600, 16, 100, 30), 0);
  assert.equal(trimEdgeScrollPosition(30, 600, 16, 100, 30), 30);
  assert.equal(trimEdgeScrollPosition(10, 600, 1000, 100, 30), 10.3);
  assert.equal(trimEdgeScrollPosition(10, 600, 50, 200, 30), 10.15);
});

test("selection at a trim edge cannot start stationary autoscroll or commit a trim", () => {
  assert.equal(trimGestureActivated(189, 189, false), false);
  assert.equal(trimGestureActivated(189, 192, false), false);
  assert.equal(trimGestureActivated(189, 185, false), true);
  assert.equal(trimGestureActivated(189, 193, false), true);
  assert.equal(trimGestureActivated(189, 189, true), true);
  assert.equal(trimGestureActivated(null, 200, false), false);
});
