import assert from "node:assert/strict";
import test from "node:test";
import { proposalAdjustmentSubject } from "./proposal-adjustments";
import type { ProposalReviewRow } from "./timeline-client";

const row = (label: string, operation_index: number) => ({ element_label: label, changes: [{ field: "directional_blur_x", target: "create_visual", operation_index }] }) as unknown as ProposalReviewRow;

test("a linked dial is headed by the name its clips share", () => {
  const rows = [row("Streak into Mark 3", 5), row("Streak away from Mark 3", 7)];
  const plan = [{ operation_index: 5, target: "create_visual", field: "directional_blur_x", linked_operation_indices: [7] }];
  assert.equal(proposalAdjustmentSubject(rows[0], rows[0].changes[0], plan, rows), "Mark 3");
});

test("a linked dial whose clips share no name keeps the generic heading", () => {
  const rows = [row("Logo", 1), row("Lower third", 2)];
  const plan = [{ operation_index: 1, target: "create_visual", field: "directional_blur_x", linked_operation_indices: [2] }];
  assert.equal(proposalAdjustmentSubject(rows[0], rows[0].changes[0], plan, rows), "Pictures");
});

test("dials that name a section sit under it, timing and blur together, in plan order", () => {
  const hop = row("Streak in: Tree to pole", 5);
  const hold = { element_label: "Hold by the pole", action: "Adjust hold", changes: [{ field: "spacing_seconds", target: "timing_control", operation_index: 2 }] } as unknown as ProposalReviewRow;
  const plan = [
    { operation_index: 5, target: "create_visual", field: "directional_blur_x", section: "To the pole" },
    { operation_index: 2, target: "timing_control", field: "spacing_seconds", section: "To the pole" },
  ];
  assert.equal(proposalAdjustmentSubject(hop, hop.changes[0], plan, [hop, hold]), "To the pole");
  assert.equal(proposalAdjustmentSubject(hold, hold.changes[0], plan, [hop, hold]), "To the pole");
  assert.equal(proposalAdjustmentSubject(hold, hold.changes[0], [], [hold]), "Time on screen");
});

test("a change that carries its own section is headed by it", () => {
  const block = { element_label: "Speed hops", changes: [{ field: "hold_seconds", target: "block", operation_index: 0, section: "To the pole" }] } as unknown as ProposalReviewRow;
  assert.equal(proposalAdjustmentSubject(block, block.changes[0], [], [block]), "To the pole");
});
