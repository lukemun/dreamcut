import test from "node:test";
import assert from "node:assert/strict";
import { compileRevealSequence } from "./proposal-reveal-sequence";
import { revealEvalPacket, gradeRevealOption } from "./reveal-sequence-eval";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { assertProposalControlBudget, proposalSliderCount } from "./proposal-control-budget";
import { editorAgentOptionSchema, countOperationMutations } from "./timeline-editor-agent-apply";

test("shared first and independent follow-up compile without changing prepared assets", () => {
  for (const id of ["shared-gap-first", "independent-gaps-followup"]) {
    const { input } = revealEvalPacket(id);
    const before = structuredClone(input);
    const result = compileRevealSequence({ ...input, gap_mode: id === "shared-gap-first" ? "shared" : "independent" });
    assert.deepEqual(input, before);
    assert.equal(result.preparation, "reused_supplied_assets");
    assert.equal(result.persisted, false);
    assert.deepEqual(gradeRevealOption(id, result.option).checks, { schema_and_budget: true, preserve_baseline: true, controls: true, gaps: true, presence: true, reset: true });
  }
});

test("independent deltas compose in either order; no preparation or new source", () => {
  const option = compileRevealSequence({ ...revealEvalPacket("independent-gaps-followup").input, gap_mode: "independent" }).option;
  const overrides = [1, 3].map(operation_index => ({ operation_index, target: "timing_control" as const, field: "spacing_seconds", value: 0.8 }));
  assert.deepEqual(applyProposalNumericOverrides(option, overrides), applyProposalNumericOverrides(option, overrides.toReversed()));
});

test("bad source ranges, duplicate ownership, conflicting dials and speech bindings fail", () => {
  const input = revealEvalPacket("shared-gap-first").input;
  const bad = structuredClone(input); bad.actors[0].presence.max_seconds = 3.1;
  assert.throws(() => compileRevealSequence(bad));
  const duplicate = structuredClone(input); duplicate.actors[1].element_id = duplicate.actors[0].element_id;
  assert.throws(() => compileRevealSequence(duplicate), /unique ownership/);
  assert.throws(() => compileRevealSequence({ ...input, max_gap_seconds: 0.2 }), /Gap/);
  const compiled = compileRevealSequence(input);
  assert.throws(() => compileRevealSequence({ ...input, option: compiled.option }), /base option/);
  assert.equal(gradeRevealOption("shared-gap-first", compileRevealSequence({ ...input, gap_mode: "independent" }).option).pass, false);
});

test("15-slider admission counts fallback and linked sliders; historical schema remains readable", () => {
  const operations = Array.from({ length: 16 }, (_, i) => ({ element_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, props: { subject_glow: 1 } }));
  const base = { id: "budget", label: "Budget", summary: "Budget", recommended: true, operations, requested_mutations: countOperationMutations(operations) };
  const legacy = editorAgentOptionSchema.parse(base);
  const timeline = { elements: [], transitions: [] };
  assert.equal(proposalSliderCount(timeline, legacy), 16);
  assert.throws(() => assertProposalControlBudget(timeline, [legacy]), /smaller reviewable proposals/);
  const fifteen = editorAgentOptionSchema.parse({ ...base, review_controls: operations.slice(0, 15).map((_, operation_index) => ({ operation_index, target: "props", field: "subject_glow" })) });
  assert.doesNotThrow(() => assertProposalControlBudget(timeline, [fifteen]));
  const linked = editorAgentOptionSchema.parse({ ...base, review_controls: [{ operation_index: 0, target: "props", field: "subject_glow", linked_operation_indices: operations.slice(1).map((_, i) => i + 1) }] });
  assert.equal(proposalSliderCount(timeline, linked), 1);
});

test("entrance envelopes constrain the presence range and recompile through existing controls", () => {
  const input = revealEvalPacket("shared-gap-first").input;
  const raw = structuredClone(input) as Record<string, any>;
  for (const op of raw.option.operations) if (op.create_visual) Object.assign(op.create_visual, {
    subject_entrance_seconds: 0, subject_flash_seconds: 1 / 30, subject_glow_fade_seconds: 2 / 30, transition_keyframes: {},
  });
  raw.option.requested_mutations = countOperationMutations(raw.option.operations);
  const option = compileRevealSequence(raw).option;
  const tuned = applyProposalNumericOverrides(option, [{ operation_index: 1, target: "timing_control", field: "spacing_seconds", value: 1.5 }]);
  assert.equal(tuned.operations[0].create_visual!.transition_keyframes!.media_opacity!.at(-1)!.t, 1.5);
  raw.actors[0].presence.min_seconds = 1 / 30;
  assert.throws(() => compileRevealSequence(raw), /complete entrance envelope/);
  raw.actors[0].presence.min_seconds = 0.2;
  raw.option.operations[0].create_visual.source_duration_seconds = 2.5;
  assert.throws(() => compileRevealSequence(raw), /handled source window/);
});
