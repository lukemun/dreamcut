import type { ProposalListEntry, ProposalOptionReview } from "./timeline-client";

export type ProposalSelectionDetail = {
  stale: boolean;
  review: ProposalOptionReview[];
};

type TimelineSpan = { laneKey: string; start: number; end: number };

function createdSpans(option: ProposalOptionReview, target: "create_visual" | "create_audio"): TimelineSpan[] {
  const operations = new Map<number, Record<string, unknown>>();
  for (const row of option.rows) {
    for (const change of row.changes) {
      if (change.target !== target) continue;
      const values = operations.get(change.operation_index) ?? {};
      values[change.field] = change.after_value;
      operations.set(change.operation_index, values);
    }
  }
  return [...operations.values()].flatMap((values) => {
    const laneKey = values.lane_key;
    const start = values.timeline_start;
    const sourceWindowDuration = typeof values.source_start_seconds === "number"
      && typeof values.source_end_seconds === "number"
      ? values.source_end_seconds - values.source_start_seconds
      : undefined;
    const duration = target === "create_visual"
      ? typeof values.duration_seconds === "number"
        ? values.duration_seconds
        : sourceWindowDuration
      : typeof sourceWindowDuration === "number"
        && typeof values.playback_rate === "number"
        && values.playback_rate > 0
        ? sourceWindowDuration / values.playback_rate
        : undefined;
    if (typeof laneKey !== "string" || typeof start !== "number" || typeof duration !== "number" || duration <= 0) return [];
    return [{ laneKey, start, end: start + duration }];
  });
}

function spansOverlap(left: TimelineSpan[], right: TimelineSpan[]): boolean {
  return left.some((a) => right.some((b) => (
    a.laneKey === b.laneKey && a.start < b.end - 1e-6 && b.start < a.end - 1e-6
  )));
}

function createdTransitionPairs(option: ProposalOptionReview): Set<string> {
  const operations = new Map<number, Record<string, unknown>>();
  for (const row of option.rows) for (const change of row.changes) {
    if (change.target !== "create_transition") continue;
    const values = operations.get(change.operation_index) ?? {};
    values[change.field] = change.after_value;
    operations.set(change.operation_index, values);
  }
  return new Set([...operations.values()].flatMap(values =>
    typeof values.from_element_id === "string" && typeof values.to_element_id === "string"
      ? [JSON.stringify([values.from_element_id, values.to_element_id])] : []));
}

function touchedElements(option: ProposalOptionReview): Set<string> {
  return new Set(option.rows.flatMap((row) => (
    row.changes.some((change) => change.target !== "create_visual" && change.target !== "create_audio")
      ? [row.element_id]
      : []
  )));
}

function removedElements(option: ProposalOptionReview): Set<string> {
  return new Set(option.rows.flatMap((row) => (
    row.changes.some((change) => change.target === "remove_visual") ? [row.element_id] : []
  )));
}

function fieldClaims(option: ProposalOptionReview): Map<string, string> {
  const claims = new Map<string, string>();
  for (const row of option.rows) {
    for (const change of row.changes) {
      if (change.target === "create_visual" || change.target === "create_audio") continue;
      const scope = change.target === "set_lane_order"
        || change.target === "set_output_format"
        || change.target === "replace_captions"
        ? "timeline"
        : row.element_id;
      if (change.target === "props" && change.field === "transition_keyframes"
        && change.after_value && typeof change.after_value === "object") {
        // Native tracks merge by channel. Entrance glow and exit motion are
        // composable even when both belong to the same continuous subject.
        for (const [field, points] of Object.entries(change.after_value)) {
          claims.set(`${scope}:props:${field}`, JSON.stringify(points));
        }
        continue;
      }
      claims.set(
        `${scope}:${change.target}:${change.field}`,
        JSON.stringify(change.after_value),
      );
    }
  }
  return claims;
}

function replacesCaptionRail(option: ProposalOptionReview): boolean {
  return option.rows.some((row) => row.changes.some((change) => change.target === "replace_captions"));
}

function touchesCaptionRail(option: ProposalOptionReview): boolean {
  return option.rows.some((row) => (
    row.element_type === "caption_text"
    && row.changes.some((change) => change.target !== "create_visual" && change.target !== "create_audio")
  ));
}

export function proposalOptionsConflict(left: ProposalOptionReview, right: ProposalOptionReview): boolean {
  // Transition IDs differ across drafts, but a native boundary has one owner.
  const leftPairs = createdTransitionPairs(left);
  if ([...createdTransitionPairs(right)].some(pair => leftPairs.has(pair))) return true;
  if (spansOverlap(createdSpans(left, "create_visual"), createdSpans(right, "create_visual"))) return true;
  if (spansOverlap(createdSpans(left, "create_audio"), createdSpans(right, "create_audio"))) return true;

  const leftTouched = touchedElements(left);
  const rightTouched = touchedElements(right);
  if ([...removedElements(left)].some((elementId) => rightTouched.has(elementId))) return true;
  if ([...removedElements(right)].some((elementId) => leftTouched.has(elementId))) return true;

  // Replacing the speech-caption rail removes every current caption id before
  // inserting the replacement cues. Any proposal that patches one of those
  // live caption ids is therefore an alternative treatment, not a composable
  // batch edit.
  if (replacesCaptionRail(left) && touchesCaptionRail(right)) return true;
  if (replacesCaptionRail(right) && touchesCaptionRail(left)) return true;

  const leftClaims = fieldClaims(left);
  return [...fieldClaims(right)].some(([claim, rightValue]) => (
    leftClaims.has(claim) && leftClaims.get(claim) !== rightValue
  ));
}

/** Keep a batch composable. Entries are newest-first, so refinements win. */
export function compatibleProposalSelection(
  entries: ProposalListEntry[],
  details: Record<string, ProposalSelectionDetail>,
  desired: Record<string, string>,
  preferredProposalId?: string,
): Record<string, string> {
  const newestFirst = [...entries].sort((left, right) => (
    Date.parse(right.created_at) - Date.parse(left.created_at)
  ));
  const ordered = preferredProposalId
    ? [
        ...newestFirst.filter((entry) => entry.proposal_id === preferredProposalId),
        ...newestFirst.filter((entry) => entry.proposal_id !== preferredProposalId),
      ]
    : newestFirst;
  const selected: Array<{ proposalId: string; option: ProposalOptionReview }> = [];
  for (const entry of ordered) {
    const detail = details[entry.proposal_id];
    if (!detail || entry.stale || detail.stale) continue;
    const optionId = desired[entry.proposal_id];
    const option = detail.review.find((candidate) => candidate.option_id === optionId);
    if (!option || selected.some((candidate) => proposalOptionsConflict(candidate.option, option))) continue;
    selected.push({ proposalId: entry.proposal_id, option });
  }
  return Object.fromEntries(selected.map(({ proposalId, option }) => [proposalId, option.option_id]));
}

/** Number keys mirror checkbox toggles; choosing another alternative replaces it. */
export function toggleProposalSelection(
  entries: ProposalListEntry[],
  details: Record<string, ProposalSelectionDetail>,
  current: Record<string, string> | null,
  proposalId: string,
  optionId: string,
): Record<string, string> {
  const next = { ...(current ?? {}) };
  if (next[proposalId] === optionId) {
    delete next[proposalId];
    return next;
  }
  next[proposalId] = optionId;
  return compatibleProposalSelection(entries, details, next, proposalId);
}

export function recommendedProposalSelection(
  entries: ProposalListEntry[],
  details: Record<string, ProposalSelectionDetail>,
): Record<string, string> {
  const desired = Object.fromEntries(entries.flatMap((entry) => {
    const detail = details[entry.proposal_id];
    if (!detail || entry.stale || detail.stale) return [];
    const option = detail.review.find((candidate) => candidate.recommended) ?? detail.review[0];
    return option ? [[entry.proposal_id, option.option_id]] : [];
  }));
  return compatibleProposalSelection(entries, details, desired);
}

/** Review starts with the first displayed option, including auditions. */
export function firstProposalSelection(
  entries: ProposalListEntry[],
  details: Record<string, ProposalSelectionDetail>,
): Record<string, string> {
  const desired = Object.fromEntries(entries.flatMap((entry) => {
    const detail = details[entry.proposal_id];
    const option = detail?.review[0];
    return option && !entry.stale && !detail.stale
      ? [[entry.proposal_id, option.option_id]] : [];
  }));
  return compatibleProposalSelection(entries, details, desired);
}

/**
 * Default newly actionable proposals into batch review exactly once. Existing
 * selections (including deliberate manual unchecks) stay untouched, while a
 * proposal whose details have only just become available joins the batch with
 * its first displayed option.
 */
export function selectionWithNewProposalDefaults(
  entries: ProposalListEntry[],
  details: Record<string, ProposalSelectionDetail>,
  current: Record<string, string>,
  previouslySeenProposalIds: ReadonlySet<string>,
): Record<string, string> {
  const defaults = firstProposalSelection(entries, details);
  const desired = { ...current };
  for (const [proposalId, optionId] of Object.entries(defaults)) {
    if (!previouslySeenProposalIds.has(proposalId)) desired[proposalId] = optionId;
  }
  return compatibleProposalSelection(entries, details, desired);
}
