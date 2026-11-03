import assert from "node:assert/strict";
import test from "node:test";
import { findTransitionRegion, transitionHoverId } from "./transition-hover";
import type { TransitionHitRegion } from "./timeline-hit-regions";

const regions: TransitionHitRegion[] = [
  { kind: "create", fromElementId: "a", toElementId: "b", x: 86, y: 10, width: 28, height: 24 },
  { kind: "create", fromElementId: "b", toElementId: "c", x: 94, y: 10, width: 28, height: 24 },
];
test("overlapping transition targets choose the nearest cut regardless of order", () => {
  assert.equal(findTransitionRegion(regions, 107, 20), regions[1]);
  assert.equal(findTransitionRegion([...regions].reverse(), 101, 20), regions[0]);
  assert.equal(transitionHoverId(findTransitionRegion(regions, 107, 20)), "create:b:c");
});
test("leaving the seam clears hover and does not steal clip-body targets", () => {
  assert.equal(findTransitionRegion(regions, 107, 40), undefined);
  assert.equal(transitionHoverId(undefined), null);
});
test("existing transition keeps its selection identity", () => {
  assert.equal(transitionHoverId({ kind: "existing", transitionId: "fade", x: 0, y: 0, width: 28, height: 18 }), "fade");
});
