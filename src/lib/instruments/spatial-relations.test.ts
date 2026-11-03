import assert from "node:assert/strict";
import { test } from "node:test";

import {
  captionBottomToMaskTopRelation,
  parseGapExpectation,
  visualMaskRectAt,
} from "@/lib/instruments/spatial-relations";

const canvas = { width: 1080, height: 1920 };
const visual = {
  id: "visual-1",
  type: "video_clip",
  timeline_start: 4,
  props: {
    mask_inset: [0.1, 0, 0.8, 0],
    keyframes: { mask_inset: [{ t: 0, v: [0.1, 0, 0.8, 0] }, { t: 2, v: [0.2, 0, 0.7, 0] }] },
  },
};

test("visualMaskRectAt uses the renderer's local-time keyframe interpolation", () => {
  assert.deepEqual(visualMaskRectAt(visual, 5, canvas), {
    left: 0,
    top: 288,
    right: 1080,
    bottom: 480,
  });
});

test("caption-to-mask relation describes clear space and passes an explicit target", () => {
  const relation = captionBottomToMaskTopRelation({
    captionId: "caption-1",
    captionText: "THIS IS",
    inkBounds: { left: 400, top: 178, right: 675, bottom: 232 },
    visual: { ...visual, timeline_start: 0, props: { mask_inset: [0.123, 0, 0.7, 0] } },
    atSeconds: 9.8,
    canvas,
    expectation: { captionId: "caption-1", visualId: "visual-1", minPx: 0, maxPx: 6 },
  });
  assert.equal(relation.signedGapPx, 4.16);
  assert.equal(relation.relation, "above_with_clearance");
  assert.equal(relation.expectation?.status, "pass");
  assert.match(relation.statement, /visible ink is 4.16px above/);
});

test("caption-to-mask relation reports overlap and fails an incompatible target", () => {
  const relation = captionBottomToMaskTopRelation({
    captionId: "caption-1",
    captionText: "THIS IS",
    inkBounds: { left: 0, top: 0, right: 100, bottom: 250 },
    visual: { ...visual, timeline_start: 0, props: { mask_inset: [0.1, 0, 0.8, 0] } },
    atSeconds: 1,
    canvas,
    expectation: { captionId: "caption-1", visualId: "visual-1", minPx: 0, maxPx: 6 },
  });
  assert.equal(relation.signedGapPx, -58);
  assert.equal(relation.relation, "overlapping");
  assert.equal(relation.expectation?.status, "fail");
});

test("parseGapExpectation validates the CLI contract", () => {
  assert.deepEqual(parseGapExpectation("caption-1:video-1:0:6"), {
    captionId: "caption-1",
    visualId: "video-1",
    minPx: 0,
    maxPx: 6,
  });
  assert.throws(() => parseGapExpectation("caption-1:video-1:6:0"), /--expect-gap/);
});
