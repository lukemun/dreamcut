import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "./types";
import { applyInstantPreviewProps, instantPreviewProps } from "./proposal-preview-props";

const rows = [
  { element_id: "still", changes: [
    { field: "lane_key", target: "patch", operation_index: 0 },
    { field: "media_offset_x", target: "props", operation_index: 0 },
    { field: "media_scale", target: "props", operation_index: 0 },
  ] },
  { element_id: "graphic", changes: [{ field: "timeline_start", target: "create_visual", operation_index: 1 }] },
];

test("picture dials resolve to their draft element; timing and other targets wait for the server", () => {
  assert.deepEqual(instantPreviewProps(rows, [
    { operation_index: 0, target: "props", field: "media_offset_x", value: -0.4 },
    { operation_index: 1, target: "create_visual", field: "timeline_start", value: 5 },
    { operation_index: 0, target: "props", field: "media_scale", value: "big" },
  ]), [{ elementId: "still", field: "media_offset_x", value: -0.4 }]);
});

test("applying them restyles only that element", () => {
  const still = { id: "still", props: { media_offset_x: 0, media_scale: 0.85 } } as unknown as TimelineElement;
  const other = { id: "other", props: {} } as unknown as TimelineElement;
  const [moved, same] = applyInstantPreviewProps([still, other], [{ elementId: "still", field: "media_offset_x", value: -0.4 }]);
  assert.deepEqual(moved!.props, { media_offset_x: -0.4, media_scale: 0.85 });
  assert.equal(same, other);
});
