import assert from "node:assert/strict";
import test from "node:test";
import { proposalAdjustmentFocusTime } from "./proposal-adjustment-focus";
import type { ProposalOptionReview } from "./timeline-client";

const option = { adjustment_rows: [{changes: [
  {field:"mask_window_close_start_seconds",after_value:2.45},
  {field:"mask_window_close_duration_seconds",after_value:.3},
  {field:"mask_window_reopen_start_seconds",after_value:3.4},
  {field:"mask_window_reopen_duration_seconds",after_value:.3},
]}] } as ProposalOptionReview;

test("window controls focus a stable frame in the affected phase", () => {
  assert.ok(Math.abs(proposalAdjustmentFocusTime(option,"mask_window_close_start_seconds")!-2.69)<1e-9);
  assert.ok(Math.abs(proposalAdjustmentFocusTime(option,"mask_window_close_duration_seconds")!-2.69)<1e-9);
  assert.ok(Math.abs(proposalAdjustmentFocusTime(option,"mask_window_reopen_start_seconds")!-3.55)<1e-9);
  assert.ok(Math.abs(proposalAdjustmentFocusTime(option,"mask_window_reopen_duration_seconds")!-3.55)<1e-9);
  assert.ok(Math.abs(proposalAdjustmentFocusTime(option,"mask_window_top_percent")!-3.075)<1e-9);
  const earlierClose = (field: string) => field === "mask_window_close_start_seconds" ? 1.2 : undefined;
  assert.ok(Math.abs(proposalAdjustmentFocusTime(option,"mask_window_close_start_seconds",earlierClose)!-1.35)<1e-9);
  const laterReopen = (field: string) => field === "mask_window_reopen_start_seconds" ? 4.4 : undefined;
  assert.ok(Math.abs(proposalAdjustmentFocusTime(option,"mask_window_reopen_start_seconds",laterReopen)!-4.55)<1e-9);
  assert.equal(proposalAdjustmentFocusTime(option,"volume"),undefined);
});
