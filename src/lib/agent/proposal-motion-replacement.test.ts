import assert from "node:assert/strict";
import test from "node:test";

import { reviewOption } from "./proposal-review";
import type { EditorAgentOption } from "./timeline-editor-agent-apply";
import type { TimelineFile } from "../local-store/store";

const url = (name: string) => `/api/projects/p/media/hyperframes/section-header/section-header.${name}.webm`;
const clip = (id: string, source: string, start: number) => ({ id, type: "video_clip", source_url: source, timeline_start: start, duration: 1.5, lane_key: "visual_1", lane_index: 1, props: {} });
const timeline = { elements: [clip("a", url("old"), 57.8667), clip("b", url("old2"), 83)] } as unknown as TimelineFile;
const option = (operations: unknown[]) => ({ id: "o", label: "O", recommended: true, summary: "S", operations }) as unknown as EditorAgentOption;

test("a swapped graphic knows the render it replaces, so its card can tell which settings changed", () => {
  const removeAndCreate = reviewOption(timeline, option([
    { element_id: "a", remove_visual: { reason: "fix" } },
    { element_id: "c", create_visual: { type: "video_clip", source_url: url("new"), timeline_start: 57.8667, lane_key: "visual_1", lane_index: 1, source_duration_seconds: 1.5, source_start_seconds: 0, source_end_seconds: 1.5 } },
  ]));
  assert.equal(removeAndCreate.motion_items?.[0]?.replaces_source_url, url("old"));
  const patch = reviewOption(timeline, option([{ element_id: "b", patch: { source_url: url("new2") } }]));
  assert.equal(patch.motion_items?.[0]?.replaces_source_url, url("old2"));
  // A new graphic somewhere else replaces nothing: every dial stays up front.
  const fresh = reviewOption(timeline, option([
    { element_id: "d", create_visual: { type: "video_clip", source_url: url("new3"), timeline_start: 10, lane_key: "visual_1", lane_index: 1, source_duration_seconds: 1.5, source_start_seconds: 0, source_end_seconds: 1.5 } },
  ]));
  assert.equal(fresh.motion_items?.[0]?.replaces_source_url, undefined);
});
