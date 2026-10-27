import { MOTION_RENDER_FIELD } from "@/lib/hyperframes/motion-media";
import type { LiveMotionWindow } from "./live-motion-store";
import type { ProposalOptionReview } from "./timeline-client";

/** Where a card's clip sits on the timeline and which part of its source it shows. */
export function proposalClipWindow(option: ProposalOptionReview, operationIndex: number): LiveMotionWindow | undefined {
  const clip = new Map(option.rows.flatMap(row => row.changes)
    .filter(change => change.operation_index === operationIndex && typeof change.after_value === "number")
    .map(change => [change.field, change.after_value as number]));
  const start = clip.get("timeline_start");
  const sourceStart = clip.get("source_start_seconds") ?? 0;
  const duration = clip.get("duration") ?? (clip.has("source_end_seconds") ? clip.get("source_end_seconds")! - sourceStart : undefined);
  return start !== undefined && duration !== undefined && duration > 0 ? { start, sourceStart, duration } : undefined;
}

/** A stable reference frame lets timing changes be judged without replaying. */
export function proposalAdjustmentFocusTime(option: ProposalOptionReview, field: string, currentValue?: (field: string) => number | undefined, operationIndex?: number): number | undefined {
  // A re-rendered motion graphic shows its new look partway through the clip, not wherever the playhead was.
  if (field === MOTION_RENDER_FIELD && operationIndex !== undefined) {
    const clip = proposalClipWindow(option, operationIndex);
    return clip ? clip.start + clip.duration * 0.55 : undefined;
  }
  if (!field.startsWith("mask_window_")) return undefined;
  const values = new Map((option.adjustment_rows ?? option.rows)
    .flatMap(row => row.changes)
    .filter(change => typeof change.after_value === "number")
    .map(change => [change.field, change.after_value as number]));
  const authoredClose = values.get("mask_window_close_start_seconds");
  const authoredClosing = values.get("mask_window_close_duration_seconds");
  const authoredReopen = values.get("mask_window_reopen_start_seconds");
  const authoredReopening = values.get("mask_window_reopen_duration_seconds");
  const close = currentValue?.("mask_window_close_start_seconds") ?? authoredClose;
  const closing = currentValue?.("mask_window_close_duration_seconds") ?? authoredClosing;
  const reopen = currentValue?.("mask_window_reopen_start_seconds") ?? authoredReopen;
  const reopening = currentValue?.("mask_window_reopen_duration_seconds") ?? authoredReopening;
  if (close === undefined || closing === undefined || reopen === undefined || reopening === undefined) return undefined;
  if (field === "mask_window_close_start_seconds" || field === "mask_window_close_duration_seconds") {
    const reference = (authoredClose ?? close) + (authoredClosing ?? closing) * .8;
    return reference >= close && reference <= close + closing ? reference : close + closing * .5;
  }
  if (field === "mask_window_reopen_start_seconds" || field === "mask_window_reopen_duration_seconds") {
    const reference = (authoredReopen ?? reopen) + (authoredReopening ?? reopening) * .5;
    return reference >= reopen && reference <= reopen + reopening ? reference : reopen + reopening * .5;
  }
  if (field === "mask_window_top_percent" || field === "mask_window_bottom_percent") return (close + closing + reopen) / 2;
  return undefined;
}
