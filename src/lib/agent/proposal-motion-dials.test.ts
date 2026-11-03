import assert from "node:assert/strict";
import test from "node:test";
import { editorAgentOptionSchema, countOperationMutations } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { reviewOption } from "./proposal-review";
import { derivedChoiceFields, derivedChoiceValue } from "./proposal-controls";

const SOURCE = "/api/projects/p/media/sources/take.mov";
const CUTOUT = "/api/projects/p/media/cutouts/take-cutout.webm";
// A cut-out hops in over 6 frames, the live take holds, and the next clip follows.
const operations = [
  { element_id: "00000000-0000-4000-8000-000000000001", create_visual: { type: "video_clip" as const, title: "Land", source_url: CUTOUT, timeline_start: 0.5,
    source_duration_seconds: 1, source_start_seconds: 0, source_end_seconds: 0.2, lane_key: "visual_1", lane_index: 1, has_alpha: true,
    transition_keyframes: { media_offset_x: [{ t: 0, v: -1.2, ease: "easeOut" as const }, { t: 1 / 6, v: 0 }], directional_blur_x: [{ t: 0, v: 90 }, { t: 1 / 6, v: 0 }] },
    directional_blur_x: 90 } },
  { element_id: "00000000-0000-4000-8000-000000000002", create_visual: { type: "video_clip" as const, title: "Live", source_url: SOURCE, timeline_start: 0.7,
    source_duration_seconds: 40, source_start_seconds: 10.2, source_end_seconds: 10.7, lane_key: "visual_1", lane_index: 1 } },
  { element_id: "00000000-0000-4000-8000-000000000003", create_visual: { type: "video_clip" as const, title: "Next", source_url: SOURCE, timeline_start: 1.2,
    source_duration_seconds: 40, source_start_seconds: 20, source_end_seconds: 22, lane_key: "visual_1", lane_index: 1 } },
];
const hop = { id: "hop", kind: "hold" as const, label: "Hop length", reference_seconds: 0.2, spacing_seconds: 0.2, min_spacing_seconds: 0.1, max_spacing_seconds: 0.5, bindings: [
  { operation_index: 0, target: "create_visual" as const, field: "source_end_seconds" as const, offset_seconds: 0.2, spacing_multiplier: 1 },
  { operation_index: 0, target: "create_visual" as const, field: "keyframe_span_seconds" as const, offset_seconds: 1 / 6, spacing_multiplier: 1 },
  { operation_index: 1, target: "create_visual" as const, field: "timeline_start" as const, offset_seconds: 0.7, spacing_multiplier: 1 },
  { operation_index: 1, target: "create_visual" as const, field: "source_start_seconds" as const, offset_seconds: 10.2, spacing_multiplier: 1 },
  { operation_index: 1, target: "create_visual" as const, field: "source_end_seconds" as const, offset_seconds: 10.7, spacing_multiplier: 1 },
  { operation_index: 2, target: "create_visual" as const, field: "timeline_start" as const, offset_seconds: 1.2, spacing_multiplier: 1 },
] };
const option = () => editorAgentOptionSchema.parse({ id: "hops", label: "Hops", recommended: true, summary: "Hops", operations,
  requested_mutations: countOperationMutations(operations as never), timing_controls: [hop],
  review_controls: [{ operation_index: 0, target: "timing_control", field: "spacing_seconds" }] });

test("a hop length dial stretches the move, slides the live take's source in and ripples later clips", () => {
  const tuned = applyProposalNumericOverrides(option(), [{ operation_index: 0, target: "timing_control", field: "spacing_seconds", value: 0.4 }]);
  const [land, live, next] = tuned.operations.map(op => op.create_visual!);
  assert.equal(land.source_end_seconds, 0.4);
  // Every key scales with the span: the move still ends on the clip's last frame.
  assert.ok(Math.abs(land.transition_keyframes!.media_offset_x!.at(-1)!.t - (0.4 - 1 / 30)) < 1e-6);
  assert.equal(land.transition_keyframes!.media_offset_x![0].ease, "easeOut");
  assert.ok(Math.abs(live.timeline_start - 0.9) < 1e-9);
  assert.ok(Math.abs(live.source_start_seconds! - 10.4) < 1e-9);
  assert.ok(Math.abs(live.source_end_seconds! - 10.9) < 1e-9, "the hold keeps its length");
  assert.ok(Math.abs(next.timeline_start - 1.4) < 1e-9);
  assert.deepEqual(applyProposalNumericOverrides(option(), []), option());
});

test("source-in and keyframe-span links refuse values the draft does not hold or the source cannot give", () => {
  const wrongSpan = { ...hop, bindings: hop.bindings.map(binding => binding.field === "keyframe_span_seconds" ? { ...binding, offset_seconds: 0.3 } : binding) };
  assert.equal(editorAgentOptionSchema.safeParse({ ...option(), timing_controls: [wrongSpan] }).success, false);
  const pastEnd = { ...hop, max_spacing_seconds: 3, bindings: hop.bindings.map(binding => binding.field === "source_start_seconds" ? { ...binding, offset_seconds: 39.5 } : binding) };
  const ops = structuredClone(operations); ops[1].create_visual.source_start_seconds = 39.5; ops[1].create_visual.source_end_seconds = 40;
  assert.equal(editorAgentOptionSchema.safeParse({ ...option(), operations: ops, timing_controls: [pastEnd] }).success, false);
});

test("a move that starts off frame gets a Comes in from choice that mirrors it", () => {
  const values = operations[0].create_visual as unknown as Record<string, unknown>;
  assert.deepEqual(derivedChoiceFields("create_visual", values), ["motion_from_side"]);
  assert.equal(derivedChoiceValue(values, "motion_from_side"), "left");
  const tuned = applyProposalNumericOverrides(option(), [{ operation_index: 0, target: "create_visual", field: "motion_from_side", value: "right" }]);
  assert.deepEqual(tuned.operations[0].create_visual!.transition_keyframes!.media_offset_x!.map(point => point.v), [1.2, 0]);
  const row = reviewOption({ schema_version: 1, elements: [], transitions: [] } as never, option()).adjustment_rows.find(item => item.changes.some(change => change.field === "motion_from_side"))!;
  assert.equal(row.changes.find(change => change.field === "motion_from_side")?.label, "Comes in from");
  // A move that starts on screen has no entry side.
  assert.equal(derivedChoiceValue({ transition_keyframes: { media_offset_x: [{ t: 0, v: 0.3 }, { t: 0.1, v: 0 }] } }, "motion_from_side"), undefined);
});

test("one linked Horizontal blur dial scales every hop's blur envelope", () => {
  const twin = structuredClone(operations[0]); twin.element_id = "00000000-0000-4000-8000-000000000004"; twin.create_visual.timeline_start = 3;
  const ops = [...operations, twin];
  const linked = editorAgentOptionSchema.parse({ id: "hops", label: "Hops", recommended: true, summary: "Hops", operations: ops,
    requested_mutations: countOperationMutations(ops as never),
    review_controls: [{ operation_index: 0, target: "create_visual", field: "directional_blur_x", linked_operation_indices: [3] }] });
  const tuned = applyProposalNumericOverrides(linked, [{ operation_index: 0, target: "create_visual", field: "directional_blur_x", value: 45 }]);
  for (const index of [0, 3]) {
    assert.deepEqual(tuned.operations[index].create_visual!.transition_keyframes!.directional_blur_x!.map(point => point.v), [45, 0]);
    assert.equal(tuned.operations[index].create_visual!.directional_blur_x, 45);
  }
});

test("a live take whose source in and out both follow the hop may hold as short as its own hold allows", () => {
  const hold = { id: "hold", kind: "hold" as const, reference_seconds: 0.5, spacing_seconds: 0.5, min_spacing_seconds: 0.1, max_spacing_seconds: 1, bindings: [
    { operation_index: 1, target: "create_visual" as const, field: "source_end_seconds" as const, offset_seconds: 10.7, spacing_multiplier: 1 },
    { operation_index: 2, target: "create_visual" as const, field: "timeline_start" as const, offset_seconds: 1.2, spacing_multiplier: 1 },
  ] };
  // At the shortest hop and shortest hold both ends' extremes would cross; the real window stays 0.1 s.
  const parsed = editorAgentOptionSchema.parse({ ...option(), timing_controls: [hop, hold] });
  const tuned = applyProposalNumericOverrides(parsed, [0, 1].map(operation_index => ({ operation_index, target: "timing_control" as const, field: "spacing_seconds", value: 0.1 })));
  const live = tuned.operations[1].create_visual!;
  assert.ok(Math.abs(live.source_end_seconds! - live.source_start_seconds! - 0.1) < 1e-6);
});

test("a frames dial reaches its rounded end values", () => {
  const short = { ...hop, min_spacing_seconds: 0.166667 };
  const parsed = editorAgentOptionSchema.parse({ ...option(), timing_controls: [short] });
  assert.doesNotThrow(() => applyProposalNumericOverrides(parsed, [{ operation_index: 0, target: "timing_control", field: "spacing_seconds", value: 5 / 30 }]));
});
