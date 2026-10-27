import assert from "node:assert/strict";
import test from "node:test";

import { buildCompositingLaneOrder } from "./compositing-lanes";

test("explicit caption lane order allows a visual above a caption", () => {
  assert.deepEqual(
    buildCompositingLaneOrder({
      visualLaneKeys: ["visual_top", "visual_bottom"],
      captionLaneKeys: ["captions_title"],
      persistedLaneOrderKeys: ["visual_top", "captions_title", "visual_bottom"],
    }),
    ["visual_bottom", "captions_title", "visual_top"],
  );
});

test("legacy order without caption lanes keeps captions above visuals", () => {
  assert.deepEqual(
    buildCompositingLaneOrder({
      visualLaneKeys: ["visual_top", "visual_bottom"],
      captionLaneKeys: ["captions_title"],
      persistedLaneOrderKeys: ["visual_top", "visual_bottom"],
    }),
    ["visual_bottom", "visual_top", "captions_title"],
  );
});

test("lane ten and up stack above the single-digit lanes", () => {
  const order = buildCompositingLaneOrder({ visualLaneKeys: ["visual_10", "visual_2", "visual_9", "visual_1"], captionLaneKeys: [], persistedLaneOrderKeys: [] });
  assert.deepEqual(order, ["visual_1", "visual_2", "visual_9", "visual_10"]);
});
