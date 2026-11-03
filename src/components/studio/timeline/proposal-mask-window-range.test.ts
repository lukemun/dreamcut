import assert from "node:assert/strict";
import test from "node:test";
import type { ProposalOptionReview } from "./timeline-client";
import { proposalMaskWindowRange } from "./proposal-mask-window-range";

const option = {
  adjustment_rows: [{changes: [
    {operation_index: 0, field: "mask_window_close_start_seconds", after_value: 2.45},
    {operation_index: 0, field: "mask_window_close_duration_seconds", after_value: .3},
    {operation_index: 0, field: "mask_window_reopen_start_seconds", after_value: 3.4},
    {operation_index: 0, field: "mask_window_reopen_duration_seconds", after_value: .3},
  ]}],
  rows: [{changes: [{field: "source_duration_seconds", after_value: 5.166666666666667}]}],
} as ProposalOptionReview;

test("picture-window timing ranges use the clip and leave neighboring phases in order", () => {
  const authored = () => undefined;
  assert.deepEqual(proposalMaskWindowRange(option, "mask_window_close_start_seconds", authored), {min: .03, max: 3.07});
  assert.deepEqual(proposalMaskWindowRange(option, "mask_window_close_duration_seconds", authored), {min: .03, max: .92});
  assert.deepEqual(proposalMaskWindowRange(option, "mask_window_reopen_start_seconds", authored), {min: 2.78, max: 4.83});
  assert.deepEqual(proposalMaskWindowRange(option, "mask_window_reopen_duration_seconds", authored), {min: .03, max: 1.73});
  assert.equal(proposalMaskWindowRange(option, "mask_window_top_percent", authored), undefined);
  const laterReopen = (_index: number, field: string) => field === "mask_window_reopen_start_seconds" ? 4.5 : undefined;
  assert.deepEqual(proposalMaskWindowRange(option, "mask_window_close_duration_seconds", laterReopen), {min: .03, max: 2.02});
  assert.deepEqual(proposalMaskWindowRange(option, "mask_window_close_start_seconds", laterReopen), {min: .03, max: 4.17});
});
