import {
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
} from "@/lib/agent/timeline-editor-agent-apply";
import {
  evaluateProposalStaleness,
  proposalElementFingerprints,
  type ProposalStaleness,
} from "@/lib/agent/proposal-staleness";
import {
  listProposals,
  rebasePendingProposal,
  type ProposalRecord,
} from "@/lib/local-store/proposals";
import { readMetadata, readTimeline } from "@/lib/local-store/store";
import { waveStates } from "@/lib/agent/proposal-waves";

/**
 * Keep pending proposals usable across human edits.
 *
 * Rebasing used to happen only when ANOTHER proposal was approved, never when a
 * person edited the timeline — so ordinary editing silently stranded every
 * pending proposal on a dead revision. This runs on READ instead (the review
 * drawer's poll), which keeps it lazy and off the write path.
 *
 * A proposal is only moved forward when BOTH hold:
 *   1. no element it touches changed (element-scoped staleness), and
 *   2. it still validates against the current project — the same dry-run every
 *      option gets at create time, so an option that can no longer apply is
 *      left behind rather than silently carried onto a revision it will 409 on.
 */

export type RefreshedProposal = {
  record: ProposalRecord;
  staleness: ProposalStaleness;
  rebased: boolean;
};

export function refreshPendingProposals(projectId: string): RefreshedProposal[] {
  const timeline = readTimeline(projectId);
  const laneOrderKeys = readMetadata(projectId).lane_order_keys;
  const revision = timelineRevision(projectId);

  const waves = waveStates(listProposals(projectId));
  return listProposals(projectId, { status: "pending" }).map((record) => {
    // A wave step still waiting on earlier steps was drafted on top of them; it cannot
    // validate against the live timeline until they are approved, and is not stale for that.
    const wave = waves.get(record.proposal_id);
    if (wave?.waiting_for.length || wave?.blocked_by.length) {
      return { record, staleness: { stale: false, rebasable: false, reason: null }, rebased: false };
    }
    const staleness = evaluateProposalStaleness(record, timeline, revision, laneOrderKeys);
    if (staleness.stale) return { record, staleness, rebased: false };

    const candidate = { ...record.proposal, expected_revision: revision };
    try {
      validateEditorAgentProposalAgainstProject(candidate, candidate.caps.max_mutations, projectId);
    } catch (error) {
      // Still applies to its own clips, but no longer derives cleanly against
      // the newer timeline. Surface it as stale with the validator's reason.
      return {
        record,
        staleness: {
          stale: true,
          rebasable: false,
          reason: error instanceof Error
            ? `No longer applies: ${error.message}`
            : "No longer applies to the current timeline.",
        },
        rebased: false,
      };
    }

    // Even a proposal already carrying the live revision can become unsafe
    // when a sibling approval rebases it without changing its create-only
    // element ids. Re-run the full dry-run before reporting it actionable.
    if (!staleness.rebasable) return { record, staleness, rebased: false };

    const next = rebasePendingProposal(
      projectId,
      record.proposal_id,
      revision,
      proposalElementFingerprints(timeline, candidate),
    );
    return {
      record: next,
      staleness: { stale: false, rebasable: false, reason: null },
      rebased: true,
    };
  });
}
