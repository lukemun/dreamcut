import { personalStyleSnapshot } from "@/lib/local-store/personal-styles";
import { expandCompiledOperations } from "@/lib/agent/compiled-operations";
import { cardWordingMessage, proposalWordingIssues } from "@/lib/agent/card-wording";
import { z } from "zod";
import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";
import { proposalRevisionPresentation } from "@/lib/agent/proposal-revisions";

import { safeParseJson } from "@/lib/api-helpers";
import { looksDirectory } from "@/lib/hyperframes/look-bundle";
import { cachedPolledJson } from "@/lib/local-store/poll-cache";
import { preparationRecordsKey } from "@/lib/local-store/media-preparation";
import { packInboxControlSets } from "@/lib/agent/inbox-control-sets";
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
import { deadMainDialMessage, dialSweepWarnings, sweepProposalDials } from "@/lib/agent/proposal-dial-sweep";
import { takeBlockCompileStats } from "@/lib/agent/proposal-blocks";
import { refreshedOptionDerivations, refreshPendingProposals } from "@/lib/agent/proposal-refresh";
import { evaluateProposalStaleness, proposalBaseValues, proposalElementFingerprints, proposalOverrides } from "@/lib/agent/proposal-staleness";
import { assertCardStandsAlone } from "@/lib/agent/proposal-standalone";
import { listProposals, readProposal, saveProposal } from "@/lib/local-store/proposals";
import { readMetadata, readTimeline, readTimelineSnapshot } from "@/lib/local-store/store";
import { pendingCardCollisions, pendingCollisionWarnings, reviewProposalSpatial, spatialWarnings } from "@/lib/agent/proposal-spatial-review";
import { reviewSpeakerClearance, speakerClearanceWarnings } from "@/lib/agent/proposal-speaker-clearance";
import { placementPolicyIssues, relationOverlapMessage, reviewPlacementRelations } from "@/lib/agent/proposal-placement";
import { waveBaseTimeline, waveStates, waveWaitingMessage } from "@/lib/agent/proposal-waves";
import { memoryEvents } from "@/lib/local-store/editing-memory";
import { feedbackCoverage, pendingFeedbackRequests } from "@/lib/timeline/editing-feedback";
import { listAgentRequests } from "@/lib/local-store/proposal-agent-requests";
import { waitingFirstBuild } from "@/lib/local-store/home-start";

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

// Reloading this route (a code change in development) starts a fresh poll cache.
const ROUTE_LOADED = Date.now();

/** GET — pending proposals first, each with computed staleness. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");
    const status = statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected"
      ? statusFilter
      : undefined;
    const withDetails = url.searchParams.get("include") === "pending_details";
    // Polled every few seconds: an unchanged project answers from the last body without rebuilding.
    // Preparation records count, since a card's validity can change when a clip finishes preparing.
    return cachedPolledJson(request, `proposals:${ROUTE_LOADED}:${status ?? "all"}:${withDetails ? "details" : "list"}`, projectId, () => proposalsBody(projectId, status, withDetails), [looksDirectory()], () => preparationRecordsKey(projectId));
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list proposals" }, { status });
  }
}

function proposalsBody(projectId: string, status: "pending" | "approved" | "rejected" | undefined, withDetails: boolean) {
  // Carry pending proposals across unrelated human edits before reporting
  // staleness, so ordinary editing does not strand the agent's work.
  // One timeline read serves the refresh, staleness and every card's detail (its rows are deep-frozen:
  // everything below only reads them).
  const snapshot = readTimelineSnapshot(projectId);
  const { revision, timeline } = snapshot;
  const refreshed = refreshPendingProposals(projectId, snapshot);
  const refreshedById = new Map(refreshed.map((result) => [result.record.proposal_id, result]));
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
  if (!withDetails) return { revision, proposals };
  // Inbox batch: the list plus every pending inbox entry's review detail in
  // one response (instead of one detail request per proposal). Polled with
  // If-None-Match, so an unchanged inbox answers 304 with no body.
  const records = new Map(listedRecords.map((record) => [record.proposal_id, record]));
  // The refresh already derived each card it validated onto this snapshot; detail reuses those (read-only).
  const derivations = refreshedOptionDerivations(refreshed);
  const details: Record<string, ProposalInboxDetail | { error: string }> = {};
  for (const entry of pendingProposalInbox(proposals).entries) {
    // A step waiting on earlier steps has no reviewable result yet; the queue shows its title.
    if (entry.wave?.waiting_for.length || entry.wave?.blocked_by.length) continue;
    try {
      const record = records.get(entry.proposal_id);
      if (!record) throw new Error("Proposal record is unavailable");
      const detail = proposalReviewDetail(projectId, record, { timeline, revision, laneOrderKeys }, derivations);
      details[entry.proposal_id] = { status: detail.status, stale: detail.stale, stale_reason: detail.stale_reason, review: detail.review, tuning: detail.tuning };
    } catch (error) {
      details[entry.proposal_id] = { error: error instanceof Error ? error.message : "Failed to load proposal details" };
    }
  }
  // Recorded requests not drafted yet ride the same poll, so the panel never hides them.
  // They are informational: an unreadable memory ledger must not take the review inbox down.
  let pending_requests: (ReturnType<typeof pendingFeedbackRequests>[number] & { agent_request: ReturnType<typeof agentRequests.get> | null; media?: string[] })[] = [];
  try {
    // A brief from Home waiting for its first cut shows the media it came with.
    const firstBuild = waitingFirstBuild(projectId);
    pending_requests = pendingFeedbackRequests(feedbackCoverage(memoryEvents(projectId), listedRecords))
      .map(request => ({ ...request, agent_request: agentRequests.get(request.id) ?? null,
        ...(firstBuild?.feedback_id === request.id ? { media: firstBuild.media } : {}) }));
  } catch (error) {
    console.warn("Proposals inbox: recorded requests unavailable", error);
  }
  // Each piece's control list is sent once for all pieces that share it.
  return packInboxControlSets({ revision, proposals, details, pending_requests });
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
    // A compile tool's stored operations (operations_from) are expanded before the draft is checked.
    const raw = withDefaultReviewControls(expandCompiledOperations(projectId, (body.proposal ?? body) as Record<string, unknown>));
    const declaredCap = (raw.caps as { max_mutations?: unknown } | undefined)?.max_mutations;
    // An omitted cap is the hard ceiling; the server counts the changes itself.
    if (declaredCap !== undefined && (typeof declaredCap !== "number" || !Number.isInteger(declaredCap) || declaredCap < 0 || declaredCap > EDITOR_AGENT_MAX_MUTATIONS)) {
      return NextResponse.json({ error: `caps.max_mutations must be an integer from 0 to ${EDITOR_AGENT_MAX_MUTATIONS}` }, { status: 400 });
    }

    const cap = declaredCap ?? EDITOR_AGENT_MAX_MUTATIONS;
    // Block compiles from here to the end of the dial sweep are reported as one lap.
    takeBlockCompileStats();
    const liveTimeline = readTimeline(projectId);
    // Every card must apply on its own: a step that only works on top of a pending step is refused.
    const base = waveBaseTimeline(projectId, validateEditorAgentProposal(raw, cap), liveTimeline);
    if (base) {
      return NextResponse.json({ error: "This step only applies on top of a pending step. Every card must apply on its own whatever happens to the others: put steps that depend on each other in one card, and give independent steps needs_steps: []." }, { status: 409 });
    }
    const proposal = validateEditorAgentProposalAgainstProject(raw, cap, projectId);
    // New cards only: settled and older drafts stay readable as written.
    const wording = proposalWordingIssues(proposal);
    if (wording.length) return NextResponse.json({ error: cardWordingMessage(wording) }, { status: 400 });
    // Text and drawn shapes are placed by relation; coordinates need a stated fallback reason.
    const placement = placementPolicyIssues(proposal.options, liveTimeline);
    if (placement.length) return NextResponse.json({ error: placement.join(" "), placement_issues: placement }, { status: 422 });
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
    const timings: Record<string, number> = { spatial: Math.round(performance.now() - spatialStarted) };
    const lap = (name: string, from: number) => { timings[name] = Math.round(performance.now() - from); return performance.now(); };
    let stepStarted = performance.now();
    // Text over the speaker's face is invisible to the element check, so judge it from the footage.
    const clearance = await reviewSpeakerClearance(projectId, reviewBase, proposal.options).catch(error => {
      console.warn("[proposals] speaker clearance unavailable", error);
      return [];
    });
    // A graphic on the speaker's face is refused, not just warned about, unless the creator asked for it.
    stepStarted = lap("speaker_clearance", stepStarted);
    const onFace = clearance.filter(review => review.covered.length && !proposal.options.find(option => option.id === review.option_id)?.speaker_overlap_intended);
    if (onFace.length) {
      return NextResponse.json({ error: `${speakerClearanceWarnings(onFace).join(" ")} Place it in open space (open_space_find) or keep a camera move off the face, then stage it again. Set the option's speaker_overlap_intended only if the creator asked for it to cover the face.`, speaker_clearance: onFace }, { status: 422 });
    }
    // A label placed beside its drawing must not land on it (the frame edge can push it back).
    const onAnchor = reviewPlacementRelations(projectId, reviewBase, proposal.options);
    if (onAnchor.length) return NextResponse.json({ error: relationOverlapMessage(onAnchor), relation_overlaps: onAnchor }, { status: 422 });
    // Every dial is dragged to both ends of its slider; one that breaks the preview is reported for repair.
    stepStarted = lap("placement", stepStarted);
    const dialSweep = await sweepProposalDials(projectId, reviewBase, proposal);
    stepStarted = lap("dial_sweep", stepStarted);
    const compiled = takeBlockCompileStats();
    if (compiled.compiles) { timings.block_compile = Math.round(compiled.ms); timings.block_compiles = compiled.compiles; }
    const deadDials = deadMainDialMessage(dialSweep);
    if (deadDials) return NextResponse.json({ error: deadDials, dead_dials: dialSweep.dead.filter(item => item.main) }, { status: 422 });
    // Previewing or applying several cards together must not stack one card's graphics on another's.
    // Drafts a newer pending card already replaces are leaving; only cards that can still be applied count.
    const pendingRecords = listProposals(projectId, { status: "pending" });
    const replaced = new Set([...proposal.supersedes_proposal_ids, ...pendingRecords.flatMap(record => record.proposal.supersedes_proposal_ids ?? [])]);
    const otherPending = pendingRecords.filter(record => !replaced.has(record.proposal_id));
    const collisions = pendingCardCollisions(projectId, reviewBase, readMetadata(projectId).lane_order_keys, proposal.options, otherPending);
    lap("pending_cards", stepStarted);
    const spatialMs = Math.round(performance.now() - spatialStarted);
    const spatialReview = spatial.map(review => {
      const speaker = clearance.find(item => item.option_id === review.option_id);
      return { option_id: review.option_id, spatial_status: review.spatial_status,
        ...(review.overlap_status ? { overlap_status: review.overlap_status } : {}),
        ...(review.delta ? { summary: review.delta.summary, introduced: review.delta.introduced } : {}),
        ...(speaker ? { speaker_clearance: speaker } : {}),
        ...(collisions.some(c => c.option_id === review.option_id) ? { pending_card_overlaps: collisions.filter(c => c.option_id === review.option_id) } : {}) };
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
      review_timings_ms: timings,
      dial_sweep: dialSweep,
      ...([...proposalWarnings(proposal), ...spatialWarnings(spatial), ...speakerClearanceWarnings(clearance), ...pendingCollisionWarnings(collisions), ...dialSweepWarnings(dialSweep)].length
        ? { warnings: [...proposalWarnings(proposal), ...spatialWarnings(spatial), ...speakerClearanceWarnings(clearance), ...pendingCollisionWarnings(collisions), ...dialSweepWarnings(dialSweep)] } : {}),
    }, { status: 201 });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save proposal" }, { status });
  }
});
