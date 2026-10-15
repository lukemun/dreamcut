import { z } from "zod";

export const feedbackIdsSchema = z.array(z.string().min(1).max(300)).max(100)
  .refine(ids => new Set(ids).size === ids.length, "Duplicate feedback references");
export const feedbackTargetsSchema = z.object({
  element_ids: z.array(z.string().min(1).max(200)).max(100).optional(),
  proposal_ids: z.array(z.string().min(1).max(200)).max(100).optional(),
  review_mark_ids: z.array(z.string().min(1).max(200)).max(100).optional(),
  timeline_range: z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative() })
    .strict().refine(range => range.end >= range.start, "Range end must follow start").optional(),
}).strict();

export const feedbackContentSchema = z.object({
  direction: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(1).max(2000).optional(),
  provenance: z.enum(["user_words", "agent_paraphrase", "inferred_reasoning"]),
  targets: feedbackTargetsSchema.optional(),
});

type Event = { id: string; time: string; type: string; summary: string; actor: string; evidence?: string; data?: Record<string, unknown> };
type Proposal = { proposal_id: string; status: string; proposal: { summary: string; responds_to_feedback_ids?: string[] }; resolution?: { superseded_by_proposal_id?: string } };

/** Pure projection shared by Memory, agent coverage checks and frozen export evidence. */
export function feedbackCoverage(events: Event[], proposals: Proposal[]) {
  const feedback = events.filter(event => event.type === "editorial.feedback");
  const directions = feedback.map(event => {
    const data = event.data ?? {};
    const linkedProposals = proposals.filter(p => p.proposal.responds_to_feedback_ids?.includes(event.id)).map(p => ({
      id: p.proposal_id, summary: p.proposal.summary,
      status: p.resolution?.superseded_by_proposal_id ? "superseded" : p.status,
    }));
    const changes = events.filter(e => e.type === "timeline.snapshot" && Array.isArray(e.data?.responds_to_feedback_ids)
      && e.data.responds_to_feedback_ids.includes(event.id)).map(e => ({
        id: e.id, history_id: e.evidence, operation: e.summary,
        transaction_id: e.data?.transaction_id as string | undefined,
        restores_snapshot_id: e.data?.restores_snapshot_id as string | undefined,
      }));
    const dispositions = events.filter(e => e.type === "editorial.feedback_disposition" && e.data?.feedback_id === event.id)
      .sort((a, b) => (Number(a.data?.sequence) || 0) - (Number(b.data?.sequence) || 0) || a.time.localeCompare(b.time));
    const latest = dispositions.at(-1);
    const supersededBy = feedback.filter(e => e.data?.supersedes_event_id === event.id).map(e => e.id);
    const disposition = supersededBy.length ? "superseded" : typeof latest?.data?.disposition === "string" ? latest.data.disposition : null;
    // A saved response accounts for work, not user satisfaction or permanent adoption.
    const accountedFor = Boolean(supersededBy.length || latest || linkedProposals.length || changes.length);
    return {
      id: event.id, time: event.time, direction: typeof data.direction === "string" ? data.direction : event.summary,
      reason: typeof data.reason === "string" ? data.reason : null,
      provenance: typeof data.provenance === "string" ? data.provenance : "unknown",
      recorded_by: event.actor, session_id: data.session_id as string | undefined, turn_id: data.turn_id as string | undefined,
      targets: data.targets as z.infer<typeof feedbackTargetsSchema> | undefined,
      supersedes_event_id: data.supersedes_event_id as string | undefined, superseded_by: supersededBy,
      disposition, disposition_reason: latest?.summary ?? null, proposals: linkedProposals, changes, accounted_for: accountedFor,
    };
  });
  return {
    directions,
    unaccounted_feedback_ids: directions.filter(d => !d.accounted_for).map(d => d.id),
    limitation: "Coverage includes recorded feedback only. Linked work and declared dispositions do not prove satisfaction, and unrecorded conversation cannot be detected.",
  };
}

/** One line of a recorded direction for a quiet queue row: first line, collapsed spaces, capped. */
export function requestLine(direction: string, max = 140) {
  // Quoted user words read as the request itself; drop the wrapping quote marks.
  const text = direction.trim().replace(/^["“'‘]+/, "").replace(/["”'’]+$/, "");
  const line = text.split(/\r?\n/).map(part => part.trim()).find(Boolean)?.replace(/\s+/g, " ") ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * Recorded directions nobody has drafted, linked or set aside yet: exactly the set
 * `editing_feedback_check` reports as unaccounted (superseded directions are accounted
 * for). The Proposals panel lists them as "Not drafted yet" so a request is never invisible.
 */
export function pendingFeedbackRequests(coverage: ReturnType<typeof feedbackCoverage>) {
  return coverage.directions.filter(direction => !direction.accounted_for)
    .sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id))
    .map(direction => ({ id: direction.id, direction: requestLine(direction.direction), time: direction.time }));
}
