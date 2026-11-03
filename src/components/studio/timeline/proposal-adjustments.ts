import { proposalControlOrder, proposalControlTier, type ProposalControlReference } from "@/lib/agent/proposal-controls";
import type { ProposalOptionReview, ProposalReviewRow } from "./timeline-client";

/** Presentation is a projection of the full inventory, never an access allowlist. */
export function proposalAdjustmentTiers(option: ProposalOptionReview) {
  const controls = (option.adjustment_rows ?? option.rows).flatMap(row => row.changes.map(change => ({row, change})));
  // Each subject's dials sit together under one heading, in the order its first dial was chosen.
  const bySubject = (items: typeof controls) => {
    const groups = new Map<string, typeof controls>();
    for (const item of items) {
      const subject = proposalAdjustmentSubject(item.row, item.change, option.review_controls, option.adjustment_rows ?? option.rows);
      groups.set(subject, [...(groups.get(subject) ?? []), item]);
    }
    return [...groups.values()].flat();
  };
  return {
    main: bySubject(controls.filter(({change}) => proposalControlTier(change, option.review_controls) === "main")
      .sort((a,b) => proposalControlOrder(a.change, option.review_controls) - proposalControlOrder(b.change, option.review_controls))),
    advanced: bySubject(controls.filter(({change}) => proposalControlTier(change, option.review_controls) === "advanced")
      .sort((a, b) => Number(!!b.change.control_group) - Number(!!a.change.control_group))),
  };
}

export function proposalAdjustmentSubject(row: ProposalReviewRow, change: ProposalReviewRow["changes"][number], plan?: ProposalControlReference[], rows?: ProposalReviewRow[]) {
  if (change.field.startsWith("mask_window_") || change.field.startsWith("playback_ramp_bar_")) return "Black bar window";
  if (change.field.startsWith("playback_ramp_fast_") || change.field.startsWith("playback_ramp_top_") || change.field.startsWith("playback_ramp_slow_")) return "Ball speed ramp";
  const section = change.section ?? plan?.find(ref => ref.target === change.target && ref.field === change.field
    && [ref.operation_index, ...(ref.linked_operation_indices ?? [])].includes(change.operation_index))?.section;
  if (section) return section;
  if (change.target === "timing_control") return row.action === "Adjust hold" ? "Time on screen" : "Reveal timing";
  if (change.target === "block") return row.element_label;
  const link = plan?.find(ref => ref.operation_index === change.operation_index && ref.target === change.target && ref.field === change.field && ref.linked_operation_indices?.length);
  if (!link) return row.element_label;
  // Linked clips named "Streak into Mark 3" and "Streak away from Mark 3" are headed "Mark 3".
  const labels = [link.operation_index, ...link.linked_operation_indices!].map(index =>
    rows?.find(candidate => candidate.changes.some(item => item.operation_index === index))?.element_label);
  const shared = labels.every(Boolean) ? sharedEnding(labels as string[]) : "";
  return shared || (LINKED_SUBJECT[change.target] ?? "Everything together");
}

/** The words every label ends with, when they are more than filler. */
function sharedEnding(labels: string[]) {
  const words = labels.map(label => label.trim().split(/\s+/));
  const shared: string[] = [];
  for (let i = 1; words.every(list => list.length >= i); i++) {
    const word = words[0][words[0].length - i];
    if (!words.every(list => list[list.length - i] === word)) break;
    shared.unshift(word);
  }
  return shared.join(" ").replace(/^(at|from|into|to|of|the)\s+/i, "");
}

/** One dial moving several items is named for what they are, in a creator's words. */
const LINKED_SUBJECT: Record<string, string> = { create_audio: "Sound effects", create_visual: "Pictures", create_text: "Text" };
