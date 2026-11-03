import type { ProposalOptionReview } from "./timeline-client";

const MIN_TIME = 0.03;
const GAP = 0.03;

type ValueFor = (operationIndex: number, field: string) => number | undefined;

/** Keep each picture-window timing dial inside the remaining clip and in order. */
export function proposalMaskWindowRange(option: ProposalOptionReview, field: string, valueFor: ValueFor) {
  if (!field.startsWith("mask_window_") || !field.endsWith("_seconds")) return undefined;
  const changes = (option.adjustment_rows ?? option.rows).flatMap(row => row.changes);
  const current = (name: string) => {
    const change = changes.find(change => change.field === name && typeof change.after_value === "number");
    return change ? valueFor(change.operation_index, name) ?? change.after_value as number : undefined;
  };
  const close = current("mask_window_close_start_seconds");
  const closing = current("mask_window_close_duration_seconds");
  const reopen = current("mask_window_reopen_start_seconds");
  const reopening = current("mask_window_reopen_duration_seconds");
  const sourceDurations = option.rows.flatMap(row => row.changes)
    .filter(change => change.field === "source_duration_seconds" && typeof change.after_value === "number")
    .map(change => change.after_value as number);
  const duration = sourceDurations.length ? Math.min(...sourceDurations) : undefined;
  if (close === undefined || closing === undefined || reopen === undefined || reopening === undefined || duration === undefined) return undefined;
  const floor = (seconds: number) => Math.floor((seconds + 1e-9) * 100) / 100;
  const ceil = (seconds: number) => Math.ceil((seconds - 1e-9) * 100) / 100;
  switch (field) {
    case "mask_window_close_start_seconds": return {min: MIN_TIME, max: floor(reopen - closing - GAP)};
    case "mask_window_close_duration_seconds": return {min: MIN_TIME, max: floor(reopen - close - GAP)};
    case "mask_window_reopen_start_seconds": return {min: ceil(close + closing + GAP), max: floor(duration - reopening - GAP)};
    case "mask_window_reopen_duration_seconds": return {min: MIN_TIME, max: floor(duration - reopen - GAP)};
    default: return undefined;
  }
}
