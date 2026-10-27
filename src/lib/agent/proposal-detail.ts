import { readOnlyProposalPreview, type LiveOptionDerivation } from "@/lib/agent/timeline-editor-agent-apply";
import { reviewProposal } from "@/lib/agent/proposal-review";
import { evaluateProposalStaleness } from "@/lib/agent/proposal-staleness";
import { withMotionControls } from "@/lib/local-store/motion-proposal-review";
import type { ProposalRecord } from "@/lib/local-store/proposals";
import { readProposalTuning, tunedProposalBaseline } from "@/lib/local-store/proposal-tuning";
import type { TimelineFile } from "@/lib/local-store/store";
import { listProposals } from "@/lib/local-store/proposals";
import { waveBaseTimeline, waveStepState, waveWaitingMessage } from "@/lib/agent/proposal-waves";
import { resolveProposalPlaybackRange, proposalPlaybackLeadInSeconds } from "@/lib/timeline/audition-playback";

/**
 * Option derives a caller already made onto the detail's timeline (the inbox's refresh validates every
 * pending card against the same snapshot), keyed by `proposalOptionDerivationKey`. They are read-only
 * (validation's `"read_only"` access): detail only reads them.
 */
export type ProposalOptionDerivations = ReadonlyMap<string, LiveOptionDerivation>;

export function proposalOptionDerivationKey(proposalId: string, optionId: string, revision: string) {
  return JSON.stringify([proposalId, optionId, revision]);
}

/**
 * One proposal's review detail: derived per-option review rows, computed
 * staleness and saved tuning. Shared by the single-proposal GET and the
 * inbox batch so both present identical review state.
 */
export function proposalReviewDetail(
  projectId: string,
  record: ProposalRecord,
  context: { timeline: TimelineFile; revision: string; laneOrderKeys?: readonly string[] },
  /** Derives to reuse; one is used only when its proposal, option and revision match and it was derived onto `context.timeline`. */
  derivations?: ProposalOptionDerivations,
) {
  const { timeline, revision } = context;
  const wave = record.proposal.wave ? waveStepState(record, listProposals(projectId)) : null;
  const waveMessage = wave && record.status === "pending" ? waveWaitingMessage(wave) : null;
  if (waveMessage) {
    // A waiting step's rows describe it on top of the earlier steps it was drafted on;
    // it has no playable preview until they are approved.
    const tuning = readProposalTuning(projectId, record.proposal_id);
    const base = wave!.blocked_by.length ? timeline : waveBaseTimeline(projectId, record.proposal, timeline, record.proposal_id) ?? timeline;
    return { ...record, tuning, tuned_baseline: tunedProposalBaseline(record, tuning), revision, wave,
      stale: wave!.blocked_by.length > 0, stale_reason: waveMessage,
      review: wave!.blocked_by.length ? [] : reviewProposal(base, record.proposal) };
  }
  const staleness = evaluateProposalStaleness(record, timeline, revision, context.laneOrderKeys);
  const tuning = readProposalTuning(projectId, record.proposal_id);
  return {
    ...record,
    tuning,
    tuned_baseline: tunedProposalBaseline(record, tuning),
    revision,
    wave,
    stale: staleness.stale,
    stale_reason: staleness.reason,
    review: reviewProposal(timeline, record.proposal).map(review => (
      review.motion_items ? { ...review, motion_items: withMotionControls(projectId, review.motion_items) } : review
    )).map(review => {
      if (staleness.stale || record.proposal.decision !== "propose") return review;
      // Derived onto the timeline this detail already holds (the same revision), rather than reading
      // and hashing the file again per option; the playback range only reads the result.
      const prior = derivations?.get(proposalOptionDerivationKey(record.proposal_id, review.option_id, revision));
      const preview = prior && prior.base === timeline && prior.option.id === review.option_id
        ? { touched: prior.derived.touched, timeline: prior.derived.timeline }
        : readOnlyProposalPreview(record.proposal, review.option_id, timeline);
      const range = resolveProposalPlaybackRange(preview.touched, preview.timeline.elements, timeline.elements, review);
      if (!range) return review;
      const start = Math.max(0, range.startSeconds - proposalPlaybackLeadInSeconds(review));
      return { ...review, playback_range: { start_seconds: start, end_seconds: Math.max(range.endSeconds, start + 0.8) } };
    }),
  };
}
