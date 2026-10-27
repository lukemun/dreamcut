import type { TimelineFile } from "../local-store/store";
import type { EditorAgentOption } from "./timeline-editor-agent-apply";
import { proposalControlInventory } from "./proposal-control-inventory";

export const MAX_PROPOSAL_SLIDERS = 15;

/** Limit first-class controls, including the no-plan fallback. Advanced remains reachable.
 * A graph or wheel (one curve, one colour wheel, one colour slice) counts as one control. */
export function proposalSliderCount(timeline: TimelineFile, option: EditorAgentOption) {
  return proposalControlInventory(timeline, option).flatMap(row => row.controls)
    .filter(control => control.selected && (control.kind === "number" || control.kind === "graph")).length;
}

/** Admission rule only: historical proposals must still preview, reset and approve. */
export function assertProposalControlBudget(timeline: TimelineFile, options: EditorAgentOption[]) {
  for (const option of options) {
    const count = proposalSliderCount(timeline, option);
    if (count > MAX_PROPOSAL_SLIDERS) throw new Error(
      `Option ${option.id} exposes ${count} main sliders; maximum is ${MAX_PROPOSAL_SLIDERS}. `
      + "When the option is one drawing or effect in several pieces, keep it in one card and choose its main dials with review_controls "
      + "(link equal values across the pieces with linked_operation_indices); the rest stay in Advanced adjustments. "
      + "Otherwise break the edit into smaller reviewable proposals. Keep dependent operations together; "
      + "stage dependent pieces after human approval of prerequisites. Do not hide required controls or split into mutually exclusive options to bypass this limit.",
    );
  }
}
