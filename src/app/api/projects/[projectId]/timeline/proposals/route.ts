import { personalStyleSnapshot } from "@/lib/local-store/personal-styles";
import { z } from "zod";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { proposalRevisionPresentation } from "@/lib/agent/proposal-revisions";

import { safeParseJson } from "@/lib/api-helpers";
import { conditionalJsonResponse } from "@/lib/conditional-json-response";
import { proposalReviewDetail } from "@/lib/agent/proposal-detail";
import { pendingProposalInbox } from "@/components/studio/timeline/proposal-inbox";
import {
  EDITOR_AGENT_MAX_MUTATIONS,
  timelineRevision,
  proposalWarnings,
  validateEditorAgentProposal,
  validateEditorAgentProposalAgainstProject,
  withDefaultReviewControls,
} from "@/lib/agent/timeline-editor-agent-apply";
import { reviewProposal } from "@/lib/agent/proposal-review";
import { refreshPendingProposals } from "@/lib/agent/proposal-refresh";
import { evaluateProposalStaleness, proposalBaseValues, proposalElementFingerprints, proposalOverrides } from "@/lib/agent/proposal-staleness";
import { assertCardStandsAlone } from "@/lib/agent/proposal-standalone";
import { listProposals, readProposal, saveProposal } from "@/lib/local-store/proposals";
import { readMetadata, readTimeline } from "@/lib/local-store/store";
import { reviewProposalSpatial, spatialWarnings } from "@/lib/agent/proposal-spatial-review";
import { reviewSpeakerClearance, speakerClearanceWarnings } from "@/lib/agent/proposal-speaker-clearance";
import { waveBaseTimeline, waveStates, waveWaitingMessage } from "@/lib/agent/proposal-waves";
import { memoryEvents } from "@/lib/local-store/editing-memory";
import { feedbackCoverage, pendingFeedbackRequests } from "@/lib/timeline/editing-feedback";
import { listAgentRequests } from "@/lib/local-store/proposal-agent-requests";

type ProposalInboxDetail = Pick<ReturnType<typeof proposalReviewDetail>, "status" | "stale" | "stale_reason" | "review" | "tuning">;

type Params = { params: Promise<{ projectId: string }> };

/**
 * Clips an earlier, still-pending step creates are this wave's own work: the creator may tune
 * them before approving, and re-validation guards the later step, so they are not staleness
 * dependencies. Everything else is fingerprinted against the live timeline as usual.
 */
function waveFingerprints(live: ReturnType<typeof readTimeline>, base: ReturnType<typeof readTimeline> | null, proposal: Parameters<typeof proposalElementFingerprints>[1]) {
  const fingerprints = proposalElementFingerprints(live, proposal);
  if (!base) return fingerprints;
  const liveIds = new Set(live.elements.map(element => element.id));
  for (const element of base.elements) if (!liveIds.has(element.id)) delete fingerprints[element.id];
  return fingerprints;
}

/** GET — pending proposals first, each with computed staleness. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");
    const status = statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected"
      ? statusFilter
      : undefined;
    // Carry pending proposals across unrelated human edits before reporting
    // staleness, so ordinary editing does not strand the agent's work.
    const refreshed = refreshPendingProposals(projectId);
    const refreshedById = new Map(refreshed.map((result) => [result.record.proposal_id, result]));
    const revision = timelineRevision(projectId);
    const timeline = readTimeline(projectId);
    const laneOrderKeys = readMetadata(projectId).lane_order_keys;
    const listedRecords = listProposals(projectId);
    const waves = waveStates(listedRecords);
    // Repair and Draft requests the creator sent from the panel, newest per card or request.
    const agentRequests = listAgentRequests(projectId);
    const entries = listedRecords.map((record) => {
      // Computed, never stored: element-scoped, so only an edit to a clip THIS
      // proposal touches makes it stale.
      const wave = waves.get(record.proposal_id) ?? null;
      const staleness = wave?.blocked_by.length && record.status === "pending"
        ? { stale: true, reason: waveWaitingMessage(wave) }
        : refreshedById.get(record.proposal_id)?.staleness
          ?? evaluateProposalStaleness(record, timeline, revision, laneOrderKeys);
      return {
        proposal_id: record.proposal_id,
        created_at: record.created_at,
        status: record.status,
        brief: record.brief ?? null,
        summary: record.proposal.summary,
        supersedes_proposal_ids: record.proposal.supersedes_proposal_ids ?? [],
        mode: record.proposal.mode,
        decision: record.proposal.decision,
        rebase_policy: record.proposal.rebase_policy ?? "strict",
        option_count: record.proposal.options.length,
        wave,
        stale: staleness.stale,
        stale_reason: staleness.reason,
        agent_request: record.status === "pending" && staleness.stale ? agentRequests.get(record.proposal_id) ?? null : null,
        // Settings this card replaces that the creator changed since; the card stays and says so.
        overrides: record.status === "pending" && !staleness.stale ? proposalOverrides(record, timeline) : [],
        resolution: record.resolution ?? null,
      };
    });
    const proposals = proposalRevisionPresentation(entries).filter((entry) =>
      (!status || entry.status === status)
      && (status !== "pending" || (!entry.replaced_by_pending_proposal_id && !entry.replaced_by_approved_proposal_id)));
    if (url.searchParams.get("include") !== "pending_details") return conditionalJsonResponse(request, { revision, proposals });
    // Inbox batch: the list plus every pending inbox entry's review detail in
    // one response (instead of one detail request per proposal). Polled with
    // If-None-Match, so an unchanged inbox answers 304 with no body.
    const records = new Map(listedRecords.map((record) => [record.proposal_id, record]));
    const details: Record<string, ProposalInboxDetail | { error: string }> = {};
    for (const entry of pendingProposalInbox(proposals).entries) {
      // A step waiting on earlier steps has no reviewable result yet; the queue shows its title.
      if (entry.wave?.waiting_for.length || entry.wave?.blocked_by.length) continue;
      try {
        const record = records.get(entry.proposal_id);
        if (!record) throw new Error("Proposal record is unavailable");
        const detail = proposalReviewDetail(projectId, record, { timeline, revision, laneOrderKeys });
        details[entry.proposal_id] = { status: detail.status, stale: detail.stale, stale_reason: detail.stale_reason, review: detail.review, tuning: detail.tuning };
      } catch (error) {
        details[entry.proposal_id] = { error: error instanceof Error ? error.message : "Failed to load proposal details" };
      }
    }
    // Recorded requests not drafted yet ride the same poll, so the panel never hides them.
    // They are informational: an unreadable memory ledger must not take the review inbox down.
    let pending_requests: (ReturnType<typeof pendingFeedbackRequests>[number] & { agent_request: ReturnType<typeof agentRequests.get> | null })[] = [];
    try {
      pending_requests = pendingFeedbackRequests(feedbackCoverage(memoryEvents(projectId), listedRecords))
        .map(request => ({ ...request, agent_request: agentRequests.get(request.id) ?? null }));
    } catch (error) {
      console.warn("Proposals inbox: recorded requests unavailable", error);
    }
    return conditionalJsonResponse(request, { revision, proposals, details, pending_requests });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list proposals" }, { status });
  }
}

/**
 * POST — persist a proposal for human review. Applies nothing.
 *
 * The runtime cap is the proposal's own declared `caps.max_mutations`, or
 * EDITOR_AGENT_MAX_MUTATIONS when omitted; the schema bounds it by that ceiling and checks every
 * option against it, so a proposal cannot widen its way past the hard ceiling.
 */
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

    const cap = declaredCap ?? EDITOR_AGENT_MAX_MUTATIONS;
    const liveTimeline = readTimeline(projectId);
    // Every card must apply on its own: a step that only works on top of a pending step is refused.
    const base = waveBaseTimeline(projectId, validateEditorAgentProposal(raw, cap), liveTimeline);
    if (base) {
      return NextResponse.json({ error: "This step only applies on top of a pending step. Every card must apply on its own whatever happens to the others: put steps that depend on each other in one card, and give independent steps needs_steps: []." }, { status: 409 });
    }
    const proposal = validateEditorAgentProposalAgainstProject(raw, cap, projectId);
    const reviewBase = base ?? liveTimeline;
    // A correction may name any earlier draft, including one the creator already rejected or
    // approved: the link is revision history. Only pending drafts are resolved on approval;
    // settled records are never changed. An unknown id still fails (404).
    for (const supersededProposalId of proposal.supersedes_proposal_ids) readProposal(projectId, supersededProposalId);
    assertCardStandsAlone(projectId, proposal, liveTimeline);
    const styleSelection = body.personal_style === undefined ? null : z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict().parse(body.personal_style);
    const styleSnapshot = styleSelection ? personalStyleSnapshot(styleSelection.id, styleSelection.revision) : undefined;
    const brief = typeof body.brief === "string" ? body.brief : undefined;
    // The scoped spatial check runs here for every option that can move or cover something,
    // so it never depends on the agent remembering a separate preflight.
    const spatialStarted = performance.now();
    const spatial = reviewProposalSpatial(projectId, reviewBase, readMetadata(projectId).lane_order_keys, proposal.options);
    // Text over the speaker's face is invisible to the element check, so judge it from the footage.
    const clearance = await reviewSpeakerClearance(projectId, reviewBase, proposal.options).catch(error => {
      console.warn("[proposals] speaker clearance unavailable", error);
      return [];
    });
    const spatialMs = Math.round(performance.now() - spatialStarted);
    const spatialReview = spatial.map(review => {
      const speaker = clearance.find(item => item.option_id === review.option_id);
      return { option_id: review.option_id, spatial_status: review.spatial_status,
        ...(review.overlap_status ? { overlap_status: review.overlap_status } : {}),
        ...(review.delta ? { summary: review.delta.summary, introduced: review.delta.introduced } : {}),
        ...(speaker ? { speaker_clearance: speaker } : {}) };
    });
    // Fingerprint the touched clips now; element-scoped staleness compares
    // later edits against these rather than against a whole-file hash.
    const record = saveProposal(projectId, proposal, {
      spatialReview,
      personalStyle: styleSnapshot ? { id: styleSnapshot.style.id, revision: styleSnapshot.style.revision, sha256: styleSnapshot.sha256 } : undefined,
      ...(brief ? { brief } : {}),
      touchedFingerprints: waveFingerprints(liveTimeline, base, proposal),
      touchedBaseValues: proposalBaseValues(liveTimeline, proposal),
    });
    const revision = timelineRevision(projectId);

    return NextResponse.json({
      proposal_id: record.proposal_id,
      created_at: record.created_at,
      status: record.status,
      revision,
      stale: proposal.expected_revision !== revision,
      proposal,
      review: reviewProposal(reviewBase, proposal),
      spatial_review: spatialReview,
      spatial_review_ms: spatialMs,
      ...([...proposalWarnings(proposal), ...spatialWarnings(spatial), ...speakerClearanceWarnings(clearance)].length
        ? { warnings: [...proposalWarnings(proposal), ...spatialWarnings(spatial), ...speakerClearanceWarnings(clearance)] } : {}),
    }, { status: 201 });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save proposal" }, { status });
  }
});
