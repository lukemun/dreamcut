/**
 * The message the review panel's Repair and Draft buttons send to the editing agent. The
 * agent works through the ordinary proposal tools, so its result is a new card for the
 * creator to review; nothing here approves, rejects or writes a timeline.
 */

export type RepairTarget = {
  proposal_id: string;
  summary: string;
  reason: string | null;
  wave?: { id: string; step: number; title: string; blocked_by: number[] } | null;
};

export function repairPrompt(projectId: string, target: RepairTarget) {
  const lines = [
    `Repair proposal ${target.proposal_id} in project ${projectId}. The creator pressed Repair in the review panel.`,
    `Card: "${target.summary}"`,
    `Why it no longer applies: ${target.reason ?? "the timeline changed under it."}`,
    "",
    "1. Read it with proposal_get, including tuned_baseline: the creator's tuning is their choice and must carry over.",
    "2. Read the live timeline with timeline_get and work out what changed under the card.",
    `3. Call proposal_create for a replacement that names ${target.proposal_id} in supersedes_proposal_ids. Keep its intent, options, dials and tuned values; change only what it needs to apply to the current timeline.`,
  ];
  if (target.wave?.blocked_by.length) {
    lines.push(`4. It was step ${target.wave.step} of "${target.wave.title}", built on step ${target.wave.blocked_by.join(" and ")}, which the creator turned down. Draft it on the live timeline without that step: drop that step from needs_steps, or send it outside the wave if nothing else is needed.`);
  }
  lines.push(
    "",
    "If the edit can no longer be made the way the card describes, do not guess: say what blocks it in one or two sentences and leave the card as it is.",
    "Follow open-edit-proposals. Never approve or reject anything.",
  );
  return lines.join("\n");
}

export type DraftTarget = { feedback_id: string; direction: string };

export function draftPrompt(projectId: string, target: DraftTarget) {
  return [
    `Draft a proposal in project ${projectId} for a request the creator made that has no card yet. The creator pressed Draft in the review panel.`,
    `Request (${target.feedback_id}): "${target.direction}"`,
    "",
    "Read the recorded request with editing_feedback_check, read the live timeline and pending proposals, then follow open-edit-proposals and call proposal_create with this id in responds_to_feedback_ids.",
    "It must apply on its own whatever the creator does with the other pending cards: touch only what this request needs. proposal_create refuses a card that overlaps or depends on another pending card; then combine the two into one card that replaces the earlier one (supersedes_proposal_ids).",
    "If the request was already done by an approved proposal, record that with editing_feedback_disposition instead of drafting it again.",
    "Never approve or reject anything.",
  ].join("\n");
}
