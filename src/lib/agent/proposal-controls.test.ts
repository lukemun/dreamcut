import assert from "node:assert/strict";
import test from "node:test";
import { editorAgentOptionSchema, countOperationMutations } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { proposalControlIsVisible, proposalControlOrder, PROPOSAL_TUNABLE_FIELDS } from "./proposal-controls";
import { reviewOption } from "./proposal-review";

const operations = [{ element_id: "00000000-0000-4000-8000-000000000001", create_text: {
  text: "➜", title: "Route arrow", timeline_start: 2, duration_seconds: 3,
  lane_key: "captions_0", lane_index: 0, positionPreset: "center", fontPreset: "permanent_marker",
  styleVariant: "none", textAlign: "center", fontSizePx: 200, absX: 0.36, absY: 0.138, maxWidth: 0.18,
  animationIn: "handwriting", animationInDuration: 0.13,
} }] as const;
const plan = ["fontSizePx", "absX", "absY", "animationInDuration"].map(field => ({ operation_index: 0, target: "create_text" as const, field }));
const base = { id: "arrow", label: "Arrow", recommended: true, summary: "Place the arrow.", requested_mutations: countOperationMutations(operations), operations };

test("paper outline control keeps the white glitch and color cutout registered", () => {
  const ops = [1, 2].map(i => ({ element_id: `00000000-0000-4000-8000-00000000000${i}`, props: { sticker_outline: true, sticker_outline_width: 9 } }));
  const ref = { operation_index: 0, target: "props" as const, field: "sticker_outline_width", linked_operation_indices: [1] };
  const option = editorAgentOptionSchema.parse({ ...base, operations: ops, requested_mutations: countOperationMutations(ops), review_controls: [ref] });
  const tuned = applyProposalNumericOverrides(option, [{ ...ref, value: 16 }]);
  assert.deepEqual(tuned.operations.map(op => op.props?.sticker_outline_width), [16, 16]);
  assert.equal(PROPOSAL_TUNABLE_FIELDS.sticker_outline_width.label, "Paper outline");
  assert.throws(() => applyProposalNumericOverrides(option, [{ ...ref, value: 33 }]));
  assert.deepEqual(option.operations.map(op => op.props?.sticker_outline_width), [9, 9]);
});

test("intent controls survive schema and derived review without changing mutation count", () => {
  const option = editorAgentOptionSchema.parse({ ...base, review_controls: plan });
  const review = reviewOption({ schema_version: 1, elements: [], transitions: [] }, option);
  assert.deepEqual(review.review_controls, plan);
  assert.deepEqual([...plan].reverse().sort((a,b) => proposalControlOrder(a, plan) - proposalControlOrder(b, plan)), plan);
  assert.equal(option.requested_mutations, base.requested_mutations);
  assert.deepEqual(review.rows[0].changes.filter(c => proposalControlIsVisible(c, plan)).map(c => c.field).sort(), plan.map(c => c.field).sort());
});

test("control plan cannot expose absent, internal, duplicate or nonnumeric fields", () => {
  for (const refs of [
    [{ ...plan[0], field: "volume" }], [{ ...plan[0], field: "lane_index" }],
    [{ ...plan[0], field: "text" }], [{ ...plan[0], operation_index: 9 }], [plan[0], plan[0]],
  ]) {
    // An invalid dial is dropped with a reason; the edit itself still validates.
    const parsed = editorAgentOptionSchema.parse({ ...base, review_controls: refs });
    assert.ok((parsed.dropped_review_controls?.length ?? 0) >= 1, JSON.stringify(refs));
    assert.ok((parsed.review_controls?.length ?? 0) < refs.length, JSON.stringify(refs));
  }
});

test("new text geometry tunes safely, leaving original option, clock and content intact", () => {
  const option = editorAgentOptionSchema.parse({ ...base, review_controls: plan });
  const tuned = applyProposalNumericOverrides(option, plan.slice(0, 3).map((ref, i) => ({ ...ref, value: [220, 0.4, 0.2][i] })));
  assert.equal(tuned.operations[0].create_text?.fontSizePx, 220);
  assert.equal(tuned.operations[0].create_text?.absX, 0.4);
  assert.equal(tuned.operations[0].create_text?.absY, 0.2);
  assert.equal(tuned.operations[0].create_text?.timeline_start, 2);
  assert.equal(tuned.operations[0].create_text?.text, "➜");
  assert.equal(option.operations[0].create_text?.fontSizePx, 200);
  assert.throws(() => applyProposalNumericOverrides(option, [{ ...plan[0], value: 301 }]));
  assert.throws(() => applyProposalNumericOverrides(option, [{ ...plan[0], field: "source_url", value: "/other" }]));
});

test("old proposals retain supported controls while explicit plans hide unrelated ones", () => {
  const change = { operation_index: 0, target: "create_text", field: "animationInDuration", after_value: 0.13 };
  assert.equal(proposalControlIsVisible(change), true);
  assert.equal(proposalControlIsVisible(change, plan.slice(0, 3)), false);
  assert.equal(proposalControlIsVisible({ ...change, field: "absX", after_value: 0.36 }), false);
  assert.equal(proposalControlIsVisible({ ...change, field: "absX", after_value: 0.36 }, plan), true);
  assert.equal(PROPOSAL_TUNABLE_FIELDS.absX.toDisplay?.(0.36), 36);
  assert.equal(PROPOSAL_TUNABLE_FIELDS.absX.fromDisplay?.(36), 0.36);
});

test("fill speed changes only the video clock and remains bounded", () => {
  const option = editorAgentOptionSchema.parse({ ...base, requested_mutations: base.requested_mutations + 1,
    operations: [{ ...operations[0], create_text: { ...operations[0].create_text, mediaFillVideoPlaybackRate: 0.25 } }],
    review_controls: [{ operation_index: 0, target: "create_text", field: "mediaFillVideoPlaybackRate" }],
  });
  const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "create_text", field: "mediaFillVideoPlaybackRate", value: 0.4 }]);
  assert.equal(tuned.operations[0].create_text?.mediaFillVideoPlaybackRate, 0.4);
  assert.equal(tuned.operations[0].create_text?.animationInDuration, 0.13);
  assert.equal(tuned.operations[0].create_text?.duration_seconds, 3);
  assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "create_text", field: "mediaFillVideoPlaybackRate", value: 0 }]));
});

test("one shared fill control tunes all linked text in preview and approval", () => {
  const operations = [0, 1, 2, 3].map(i => ({
    element_id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    props: { mediaFillVideoPlaybackRate: 0.75 },
  }));
  const control = { operation_index: 0, target: "props" as const, field: "mediaFillVideoPlaybackRate", linked_operation_indices: [1, 2, 3] };
  const option = editorAgentOptionSchema.parse({ ...base, operations, requested_mutations: 4, review_controls: [control] });
  const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "props", field: control.field, value: 0.5 }]);
  assert.deepEqual(tuned.operations.map(op => op.props?.mediaFillVideoPlaybackRate), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(option.operations.map(op => op.props?.mediaFillVideoPlaybackRate), [0.75, 0.75, 0.75, 0.75]);
  assert.equal(proposalControlIsVisible({ operation_index: 1, target: "props", field: control.field, after_value: 0.75 }, option.review_controls), false);
  for (const linked_operation_indices of [[0], [1, 1], [4]]) {
    assert.deepEqual(editorAgentOptionSchema.parse({ ...option, review_controls: [{ ...control, linked_operation_indices }] }).review_controls, []);
  }
});

test("a caption track split into parts shows one set of dials, and each dial moves every part", async () => {
  const { proposalControlTier } = await import("./proposal-controls");
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const part = (n: number) => ({ element_id: id(n), replace_captions: {
    cues: [{ element_id: id(100 + n), text: "word", timeline_start: n, duration: 0.4, caption_source_text: "word", caption_alignment_path: "/tmp/alignment.json",
      timing_source: { element_id: id(99), alignment_sha256: "a".repeat(64), source_start_seconds: n, source_end_seconds: n + 0.4, playback_rate: 1 } }],
    lane_key: "captions_0", font_preset: "anton", font_size_px: 96, style_variant: "bold_outline", position_preset: "bottom_center", max_width: 0.6,
    grouping: "pause_first_v1", word_limit: 1, offsetX: 0, offsetY: 0.09 } });
  // Linked on size only, as cards drafted before offsetX was linked were.
  const option = { id: "main", label: "Captions", recommended: true, summary: "One word at a time.", operations: [part(1), part(2), part(3)],
    review_controls: [{ operation_index: 0, target: "replace_captions", field: "font_size_px", linked_operation_indices: [1, 2] }] } as never;
  const tier = (operation_index: number, field: string) => proposalControlTier({ operation_index, target: "replace_captions", field, after_value: 0 }, (option as { review_controls: never }).review_controls);
  assert.equal(tier(0, "offsetX"), "main");
  for (const field of ["offsetX", "offsetY", "font_size_px"]) assert.equal(tier(1, field), null, `${field} shows once`);
  const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: "replace_captions", field: "offsetX", value: 0.1 }] as never);
  assert.deepEqual((tuned as unknown as { operations: { replace_captions: { offsetX: number } }[] }).operations.map(op => op.replace_captions.offsetX), [0.1, 0.1, 0.1]);
});
