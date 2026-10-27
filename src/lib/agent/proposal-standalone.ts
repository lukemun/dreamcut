import { applyProposalReviewOverrides } from "@/lib/agent/proposal-overrides";
import { overlappingWrites, proposalWrites, TIMELINE_WIDE } from "@/lib/agent/proposal-staleness";
import {
  deriveProposalTimeline,
  proposalOption,
  validateEditorAgentProposalAgainstProject,
  type EditorAgentProposal,
} from "@/lib/agent/timeline-editor-agent-apply";
import { readProposalTuning } from "@/lib/local-store/proposal-tuning";
import { listProposals, type ProposalRecord } from "@/lib/local-store/proposals";
import type { TimelineFile } from "@/lib/local-store/store";

/**
 * The queue contract: every pending card applies on its own, in any order, whatever the
 * creator does with the others (approve, tune, reject). The creator can then go through
 * the cards one after another without any of them breaking. Checked when a card is drafted:
 *
 * - it changes nothing another pending card changes (the same setting of the same clip, a
 *   whole clip, the caption rail, or a cut that moves everything after it);
 * - it validates on the live timeline, on top of each other pending card, and each other
 *   pending card validates on top of it.
 *
 * A card that fails is refused with the reason, so the agent combines the two into one card
 * or replaces the earlier one (supersedes_proposal_ids). Cards the new one replaces, and
 * drafts already replaced, are not its siblings.
 */
export function assertCardStandsAlone(projectId: string, proposal: EditorAgentProposal, live: TimelineFile) {
  const pending = listProposals(projectId, { status: "pending" });
  const replaced = new Set([...proposal.supersedes_proposal_ids ?? [], ...pending.flatMap((record) => record.proposal.supersedes_proposal_ids ?? [])]);
  const mine = proposalWrites(proposal);
  for (const sibling of pending) {
    if (replaced.has(sibling.proposal_id)) continue;
    const name = `pending card ${sibling.proposal_id} ("${sibling.proposal.summary.slice(0, 120)}")`;
    const overlaps = overlappingWrites(mine, proposalWrites(sibling.proposal));
    if (overlaps.length) {
      const [id, field] = overlaps[0]!;
      const what = id === TIMELINE_WIDE ? "a cut that moves everything after it, which cannot share the queue with other cards"
        : id === "@cuts" ? "the same stretch of the recording"
        : field === "*" ? `the whole of ${id}` : `${field} of ${id}`;
      throw refusal(`This card and ${name} both change ${what}. Every card must apply on its own whatever happens to the others: combine them into one card, or replace the earlier one with supersedes_proposal_ids.`);
    }
    try {
      validateEditorAgentProposalAgainstProject(proposal, proposal.caps.max_mutations, projectId, applied(projectId, sibling, live));
    } catch (error) {
      throw refusal(`This card works alone but not after ${name} is applied: ${message(error)}. Combine them, or draft this one so it applies either way.`);
    }
    for (const option of proposal.options) {
      const after = deriveProposalTimeline(live, option.operations, projectId, option.preserve_fields).timeline;
      try {
        validateEditorAgentProposalAgainstProject(sibling.proposal, sibling.proposal.caps.max_mutations, projectId, after);
      } catch (error) {
        throw refusal(`Approving this card (option ${option.id}) would stop ${name} applying: ${message(error)}. Combine them, or draft this one so both apply in either order.`);
      }
    }
  }
}

/** The live timeline with a pending card applied as the creator would: its recommended option and saved tuning. */
function applied(projectId: string, record: ProposalRecord, live: TimelineFile) {
  const option = proposalOption(record.proposal);
  const tuned = applyProposalReviewOverrides(record.proposal, option.id, readProposalTuning(projectId, record.proposal_id)[option.id] ?? [], live);
  const chosen = proposalOption(tuned, option.id);
  return deriveProposalTimeline(live, chosen.operations, projectId, chosen.preserve_fields).timeline;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/\.$/, "");
const refusal = (text: string) => Object.assign(new Error(text), { status: 409 });
