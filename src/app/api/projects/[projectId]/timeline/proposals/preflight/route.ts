import { assertProposalControlBudget } from "@/lib/agent/proposal-control-budget";
import { proposalControlInventory } from "@/lib/agent/proposal-control-inventory";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

import { safeParseJson } from "@/lib/api-helpers";
import {
  EDITOR_AGENT_MAX_MUTATIONS,
  proposalWarnings,
  validateEditorAgentProposalAgainstProject,
  withDefaultReviewControls,
} from "@/lib/agent/timeline-editor-agent-apply";
import { reviewProposalSpatial } from "@/lib/agent/proposal-spatial-review";
import { readMetadata, readTimeline } from "@/lib/local-store/store";

type Params = { params: Promise<{ projectId: string }> };

/** Validate and spatially assess an exact draft proposal without persisting it. */
export const POST = withEditRequestActor(async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    // The server chooses default review dials when the draft names none.
    const raw = withDefaultReviewControls((body.proposal ?? body) as Record<string, unknown>);
    const declaredCap = (raw.caps as { max_mutations?: unknown } | undefined)?.max_mutations;
    // An omitted cap is the hard ceiling; the server counts the changes itself.
    if (declaredCap !== undefined && (typeof declaredCap !== "number" || !Number.isInteger(declaredCap) || declaredCap < 0 || declaredCap > EDITOR_AGENT_MAX_MUTATIONS)) {
      return NextResponse.json({ error: `caps.max_mutations must be an integer from 0 to ${EDITOR_AGENT_MAX_MUTATIONS}` }, { status: 400 });
    }

    const proposal = validateEditorAgentProposalAgainstProject(raw, declaredCap ?? EDITOR_AGENT_MAX_MUTATIONS, projectId);
    const before = readTimeline(projectId);
    assertProposalControlBudget(before, proposal.options);
    const metadata = readMetadata(projectId);
    // The same scoped check proposal_create runs, here always and with the full assessment.
    const reviews = reviewProposalSpatial(projectId, before, metadata.lane_order_keys, proposal.options, { full: true, always: true });
    const options = proposal.options.map((option, index) => {
      const review = reviews[index]!;
      const preservation = { status: option.preserve_fields?.length ? "passed" : "not_declared", protected_elements: option.preserve_fields?.length ?? 0 };
      const common = { option_id: option.id, preservation, ...(option.control_gaps ? { control_gaps: option.control_gaps } : {}), control_inventory: proposalControlInventory(before, option), scope: review.scope };
      return review.spatial_status === "not_applicable"
        ? { ...common, spatial_status: "not_applicable" as const, reason: review.reason }
        : { ...common, spatial_status: review.overlap_status, delta: review.delta, assessment: review.assessment };
    });

    return NextResponse.json({
      project_id: projectId,
      persisted: false,
      proposal_valid: true,
      expected_revision: proposal.expected_revision,
      options,
      ...(proposalWarnings(proposal).length ? { warnings: proposalWarnings(proposal) } : {}),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to preflight proposal" }, { status });
  }
});
