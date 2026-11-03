import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { evaluateProposalStaleness, proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { readTimeline, readMetadata } from "@/lib/local-store/store";

import { safeParseJson } from "@/lib/api-helpers";
import { assertWaveStepOpen } from "@/lib/agent/proposal-waves";
import {
  applyEditorAgentProposal,
  proposalOption,
  validateEditorAgentProposalAgainstProject,
} from "@/lib/agent/timeline-editor-agent-apply";
import { applyProposalReviewOverrides, proposalNumericOverridesSchema } from "@/lib/agent/proposal-overrides";
import { parseMotionRating, recordMotionProposalReview } from "@/lib/local-store/motion-proposal-review";
import {
  listProposals,
  readProposal,
  rebasePendingProposal,
  resolveProposal,
  resolveSupersededProposals,
} from "@/lib/local-store/proposals";

type Params = { params: Promise<{ projectId: string; proposalId: string }> };

/**
 * POST — approve one option and write it to the timeline.
 *
 * `applyEditorAgentProposal` re-validates `expected_revision` under the project
 * lock, so a proposal that has been sitting while the timeline changed fails
 * with 409 rather than clobbering the newer state. It takes the lock itself;
 * this route must not wrap it in another `withProjectLock` (the lock is a
 * promise chain and a re-entrant acquire would deadlock).
 */
export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const body = await safeParseJson(request);
    const optionId = typeof body?.option_id === "string" ? body.option_id : undefined;

    const record = readProposal(projectId, proposalId);
    assertWaveStepOpen(projectId, record);
    if (record.status !== "pending") {
      return NextResponse.json({ error: `Proposal ${proposalId} is already ${record.status}` }, { status: 409 });
    }

    const overrides = proposalNumericOverridesSchema.parse(body?.overrides ?? []);
    const motionRating = parseMotionRating(body?.rating);
    const selectedOptionId = proposalOption(record.proposal, optionId).id;
    const proposal = applyProposalReviewOverrides(record.proposal, selectedOptionId, overrides, readTimeline(projectId));
    const proposalHistoryIds = listProposals(projectId, { status: "pending" })
      .map((candidate) => candidate.proposal_id);
    let supersededProposalIds: string[] = [];
    const rebasedProposalIds: string[] = [];
    const applied = await applyEditorAgentProposal(
      proposal,
      proposal.caps.max_mutations,
      selectedOptionId,
      {
        proposalIds: proposalHistoryIds,
        appliedProposalIds: [proposalId],

        beforeFinalSnapshot: ({ beforeRevision, afterRevision }) => {
          // Resolve and rebase while the approval lock is still held, then let
          // the shared apply path capture one final snapshot containing both
          // the applied timeline and the matching review state.
          resolveProposal(projectId, proposalId, "approved", {
            option_id: selectedOptionId,
            numeric_overrides: overrides,
            before_revision: beforeRevision,
            after_revision: afterRevision,
          });
          supersededProposalIds = resolveSupersededProposals(
            projectId,
            proposalId,
            record.proposal.supersedes_proposal_ids ?? [],
          );

          const liveTimeline = readTimeline(projectId);
          const liveLanes = readMetadata(projectId).lane_order_keys;
          for (const sibling of listProposals(projectId, { status: "pending" })) {
            // Every card stands alone (assertCardStandsAlone), so each one still pending moves
            // onto the new revision when it still validates; a deleted clip retires it.
            if (
              sibling.proposal_id === proposalId
              || evaluateProposalStaleness(sibling, liveTimeline, afterRevision, liveLanes).stale
            ) {
              continue;
            }
            const candidate = {
              ...sibling.proposal,
              expected_revision: afterRevision,
            };
            try {
              validateEditorAgentProposalAgainstProject(
                candidate,
                candidate.caps.max_mutations,
                projectId,
              );
              rebasePendingProposal(projectId, sibling.proposal_id, afterRevision,
                proposalElementFingerprints(liveTimeline, candidate));
              rebasedProposalIds.push(sibling.proposal_id);
            } catch {
              // Leave an overlapping or otherwise invalid sibling on its old revision.
              // It will read as stale and require a fresh human-review proposal.
            }
          }
        },
      },
    );
    const resolved = readProposal(projectId, proposalId);
    if (resolved.status !== "approved") {
      throw new Error("Proposal approval did not resolve its review record");
    }
    recordMotionProposalReview(projectId, proposalId, proposalOption(proposal, selectedOptionId).operations, "approved", motionRating);

    return NextResponse.json({
      ...applied,
      status: resolved.status,
      resolution: resolved.resolution,
      superseded_proposal_ids: supersededProposalIds,
      rebased_proposal_ids: rebasedProposalIds,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to approve proposal" }, { status });
  }
});
