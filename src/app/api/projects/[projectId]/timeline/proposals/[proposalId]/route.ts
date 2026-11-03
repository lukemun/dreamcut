import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { safeParseJson } from "@/lib/api-helpers";
import { timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { proposalReviewDetail } from "@/lib/agent/proposal-detail";
import { parseMotionRating, recordMotionProposalReview } from "@/lib/local-store/motion-proposal-review";
import { readProposal, rejectProposalRevisionChain } from "@/lib/local-store/proposals";
import { readMetadata, readTimeline } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string; proposalId: string }> };

/** GET — one proposal with its derived, per-option review rows. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const record = readProposal(projectId, proposalId);
    return NextResponse.json(proposalReviewDetail(projectId, record, {
      timeline: readTimeline(projectId),
      revision: timelineRevision(projectId),
      laneOrderKeys: readMetadata(projectId).lane_order_keys,
    }));
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load proposal" }, { status });
  }
}

/** DELETE — reject this revision and all pending previous drafts; never touches the timeline. Returns the undo step. */
export const DELETE = withEditRequestActor(async function DELETE(request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const body = await safeParseJson(request);
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 1_000) : undefined;
    const rating = parseMotionRating(body?.rating);
    const { record, rejected_proposal_ids, history } = await rejectProposalRevisionChain(projectId, proposalId, reason);
    recordMotionProposalReview(projectId, proposalId, record.proposal.options.flatMap((option) => option.operations), "rejected", rating);
    return NextResponse.json({ proposal_id: record.proposal_id, status: record.status, resolution: record.resolution, rejected_proposal_ids, history });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to reject proposal" }, { status });
  }
});
