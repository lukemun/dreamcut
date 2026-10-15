import type { TimelineFile } from "../local-store/store";
import type { EditorAgentOption } from "./timeline-editor-agent-apply";
import { proposalControlInventory } from "./proposal-control-inventory";

export const MAX_PROPOSAL_SLIDERS = 15;

/** Limit first-class controls, including the no-plan fallback. Advanced remains reachable. */
export function proposalSliderCount(timeline: TimelineFile, option: EditorAgentOption) {
  return proposalControlInventory(timeline, option).flatMap(row => row.controls)
    .filter(control => control.selected && control.kind === "number").length;
}

/** Admission rule only: historical proposals must still preview, reset and approve. */
export function assertProposalControlBudget(timeline: TimelineFile, options: EditorAgentOption[]) {
  for (const option of options) {
    const count = proposalSliderCount(timeline, option);
    if (count > MAX_PROPOSAL_SLIDERS) throw new Error(
      `Option ${option.id} exposes ${count} main sliders; maximum is ${MAX_PROPOSAL_SLIDERS}. `
      + "Break the edit into smaller reviewable proposals. Keep dependent operations together; "
      + "stage dependent pieces after human approval of prerequisites. Do not hide required controls or split into mutually exclusive options to bypass this limit.",
    );
  }
}
