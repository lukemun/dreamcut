import assert from "node:assert/strict";
import test from "node:test";
import { deriveProposalTimeline, editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import type { TimelineFile } from "../local-store/store";

const id = "00000000-0000-4000-8000-000000000051";
const empty = { elements: [], transitions: [] } as unknown as TimelineFile;
const opening = [
  { t: 0, v: [0.38, 0, 0.5, 0.95], ease: "easeOut" },
  { t: 0.25, v: [0.38, 0, 0.5, 0], ease: "hold" },
  { t: 1, v: [0, 0, 0, 0] },
];
const option = (points: unknown) => editorAgentOptionSchema.parse({
  id: "cross", label: "Cross", summary: "Cross", recommended: true,
  operations: [{ element_id: id, create_visual: {
    type: "still", source_url: "/api/projects/fixture/media/synthetic.png", timeline_start: 0, duration_seconds: 1.2,
    lane_key: "visual_1", lane_index: 0, mask_inset: [0.38, 0, 0.5, 0.95], mask_inset_keyframes: points,
  } }],
});

test("a new visual can open its crop edges over time, as a window that widens", () => {
  const props = deriveProposalTimeline(empty, option(opening).operations, "fixture").timeline.elements[0].props!;
  assert.deepEqual((props.keyframes as Record<string, unknown>).mask_inset, opening);
});

test("new-visual mask keyframes must fit the clip and keep an opening", () => {
  assert.throws(() => deriveProposalTimeline(empty, option([{ t: 0, v: [0, 0, 0, 0] }, { t: 2, v: [0, 0, 0, 0] }]).operations, "fixture"), /fit within the clip/);
  assert.throws(() => option([{ t: 0, v: [0.5, 0, 0.5, 0] }, { t: 1, v: [0, 0, 0, 0] }]), /visible opening/);
});
