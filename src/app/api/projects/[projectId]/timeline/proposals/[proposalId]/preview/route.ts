import { readProposalTuning } from "@/lib/local-store/proposal-tuning";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { safeParseJson } from "@/lib/api-helpers";
import { assertWaveStepOpen } from "@/lib/agent/proposal-waves";
import { previewEditorAgentProposal, proposalOption } from "@/lib/agent/timeline-editor-agent-apply";
import { applyProposalReviewOverrides, proposalNumericOverridesSchema } from "@/lib/agent/proposal-overrides";
import { reviewOption } from "@/lib/agent/proposal-review";
import { readProposal } from "@/lib/local-store/proposals";
import { readTimeline } from "@/lib/local-store/store";
import { assessProjectSpatial } from "@/lib/local-store/spatial-assessment";
import { timelinePayload } from "@/lib/local-store/timeline-payload";

type Params = { params: Promise<{ projectId: string; proposalId: string }> };

/**
 * GET — the timeline as it WOULD be if this option were approved.
 *
 * Nothing is written. The payload is the same shape the editor loads normally,
 * so the player can render a draft without any separate preview code path.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const optionId = new URL(request.url).searchParams.get("option") ?? undefined;
    const record = readProposal(projectId, proposalId);
    assertWaveStepOpen(projectId, record);

    if (record.proposal.decision !== "propose") {
      return NextResponse.json({ error: `Proposal decision is ${record.proposal.decision}; there is nothing to preview` }, { status: 409 });
    }

    const preview = previewEditorAgentProposal(record.proposal, optionId);
    return NextResponse.json({
      proposal_id: record.proposal_id,
      status: record.status,
      option_id: preview.option.id,
      // A stale preview still renders, so the human can see what was meant —
      // but approval of a stale proposal is refused downstream.
      stale: preview.stale,
      touched_element_ids: preview.touched,
      review: reviewOption(readTimeline(projectId), preview.option),
      spatial_assessment: assessProjectSpatial(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat),
      timeline: timelinePayload(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat, preview.mutedLaneKeys),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to preview proposal" }, { status });
  }
}

export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId, proposalId } = await params;
    const body = await safeParseJson(request);
    const optionId = typeof body?.option_id === "string" ? body.option_id : undefined;
    const record = readProposal(projectId, proposalId);
    assertWaveStepOpen(projectId, record);
    const selectedOptionId = proposalOption(record.proposal, optionId).id;
    const overrides = proposalNumericOverridesSchema.parse(body?.overrides ?? readProposalTuning(projectId, proposalId)[selectedOptionId] ?? []);
    const proposal = applyProposalReviewOverrides(record.proposal, selectedOptionId, overrides, readTimeline(projectId));
    if (proposal.decision !== "propose") {
      return NextResponse.json({ error: `Proposal decision is ${proposal.decision}; there is nothing to preview` }, { status: 409 });
    }
    const preview = previewEditorAgentProposal(proposal, selectedOptionId);
    return NextResponse.json({
      proposal_id: record.proposal_id,
      status: record.status,
      option_id: preview.option.id,
      stale: preview.stale,
      touched_element_ids: preview.touched,
      review: reviewOption(readTimeline(projectId), preview.option),
      spatial_assessment: assessProjectSpatial(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat),
      timeline: timelinePayload(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat, preview.mutedLaneKeys),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to preview proposal" }, { status });
  }
});
