import { recordMotionProposalReview } from "@/lib/local-store/motion-proposal-review";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { evaluateProposalStaleness, proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { readTimeline, readMetadata } from "@/lib/local-store/store";

import { safeParseJson } from "@/lib/api-helpers";
import { resolveProposalBatch } from "@/lib/agent/proposal-batch";
import {
  applyEditorAgentProposalBatch,
  validateEditorAgentProposalAgainstProject,
} from "@/lib/agent/timeline-editor-agent-apply";
import {
  listProposals,
  rebasePendingProposal,
  resolveProposal,
  resolveSupersededProposals,
} from "@/lib/local-store/proposals";

type Params = { params: Promise<{ projectId: string }> };

/** Apply the selected proposal options in one write and one Undo snapshot. */
export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await safeParseJson(request);
    const batch = resolveProposalBatch(projectId, body?.selections);
    const selectedIds = new Set(batch.items.map((item) => item.record.proposal_id));
    for (const item of batch.items) {
      const selectedSuperseded = (item.record.proposal.supersedes_proposal_ids ?? [])
        .find((proposalId) => selectedIds.has(proposalId));
      if (selectedSuperseded) {
        return NextResponse.json({
          error: `A batch cannot approve proposal ${selectedSuperseded} together with the proposal that supersedes it`,
        }, { status: 400 });
      }
    }
    const proposalHistoryIds = listProposals(projectId, { status: "pending" })
      .map((candidate) => candidate.proposal_id);
    let supersededProposalIds: string[] = [];
    const rebasedProposalIds: string[] = [];
    const applied = await applyEditorAgentProposalBatch(
      projectId,
      batch.revision,
      batch.items.map((item) => item.option),
      {
        proposalIds: proposalHistoryIds,
        appliedProposalIds: [...selectedIds],
        feedbackIds: [...new Set(batch.items.flatMap(item => item.record.proposal.responds_to_feedback_ids ?? []))],

        beforeFinalSnapshot: ({ beforeRevision, afterRevision }) => {
          for (const item of batch.items) {
            resolveProposal(projectId, item.record.proposal_id, "approved", {
              option_id: item.option.id,
              numeric_overrides: item.overrides,
              before_revision: beforeRevision,
              after_revision: afterRevision,
            });
          }
          supersededProposalIds = batch.items.flatMap((item) => resolveSupersededProposals(
            projectId,
            item.record.proposal_id,
            item.record.proposal.supersedes_proposal_ids ?? [],
          ));

          const liveTimeline = readTimeline(projectId);
          const liveLanes = readMetadata(projectId).lane_order_keys;
          for (const sibling of listProposals(projectId, { status: "pending" })) {
            // Every card stands alone (assertCardStandsAlone), so each one still pending moves
            // onto the new revision when it still validates; a deleted clip retires it.
            if (
              selectedIds.has(sibling.proposal_id)
              || evaluateProposalStaleness(sibling, liveTimeline, afterRevision, liveLanes).stale
            ) continue;
            const candidate = { ...sibling.proposal, expected_revision: afterRevision };
            try {
              validateEditorAgentProposalAgainstProject(candidate, candidate.caps.max_mutations, projectId);
              rebasePendingProposal(projectId, sibling.proposal_id, afterRevision,
                proposalElementFingerprints(liveTimeline, candidate));
              rebasedProposalIds.push(sibling.proposal_id);
            } catch {
              // Leave conflicting proposals pending and visibly stale.
            }
          }
        },
      },
    );

    for (const item of batch.items) {
      recordMotionProposalReview(projectId, item.record.proposal_id, item.option.operations, "approved", null);
    }
    return NextResponse.json({
      ...applied,
      approved_proposal_ids: [...selectedIds],
      approved_count: selectedIds.size,
      superseded_proposal_ids: supersededProposalIds,
      rebased_proposal_ids: rebasedProposalIds,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to approve selected edits" }, { status });
  }
});
