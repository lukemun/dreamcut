import type { ProposalOptionReview } from "./timeline-client";

export type ProposalWaveInfo = { id: string; step: number; title: string; total: number; waiting_for: number[]; blocked_by: number[] };

const waitingStep = (entry: { wave?: ProposalWaveInfo | null }) => Boolean(entry.wave?.waiting_for.length) && !entry.wave?.blocked_by.length;

/** A stale pending decision still belongs in the inbox; only applying it is blocked. A wave step waiting on earlier steps is queued, not actionable. */
export function pendingProposalInbox<T extends { status: string; stale: boolean; wave?: ProposalWaveInfo | null; replaced_by_pending_proposal_id?: string | null; replaced_by_approved_proposal_id?: string | null }>(entries: readonly T[]) {
  const pending = entries.filter(entry => entry.status === "pending" && !entry.replaced_by_pending_proposal_id && !entry.replaced_by_approved_proposal_id);
  return {
    entries: pending,
    actionable: pending.filter(entry => !entry.stale && !waitingStep(entry)).length,
    stale: pending.filter(entry => entry.stale).length,
  };
}

/** A preview cannot outlive any proposal it is showing, including a batch member. */
export function previewHasPendingProposals<T extends { proposal_id: string; status: string }>(
  entries: readonly T[],
  preview: { proposalId: string; batch?: readonly { proposalId: string }[] },
) {
  const pendingIds = new Set(entries.filter(entry => entry.status === "pending").map(entry => entry.proposal_id));
  const previewIds = preview.batch?.length ? preview.batch.map(item => item.proposalId) : [preview.proposalId];
  return previewIds.every(id => pendingIds.has(id));
}

export type ProposalQueueItem<T> = { entry: T; mode: "card" | "next" | "waiting" | "done" };

/**
 * Review order. A wave (one large edit sent as steps) shows one step as a full card: the step the
 * creator opened, else the first open step. Its other open steps are "Up next" rows they can
 * open, steps waiting on earlier ones are queued rows, and approved steps stay as done rows so
 * the queue reads as progress. Proposals outside a wave are cards in their usual order.
 */
export function proposalQueue<T extends { proposal_id: string; status: string; wave?: ProposalWaveInfo | null }>(
  pending: readonly T[],
  settled: readonly T[],
  opened: Readonly<Record<string, string>>,
): ProposalQueueItem<T>[] {
  const items: ProposalQueueItem<T>[] = [];
  const emitted = new Set<string>();
  for (const entry of pending) {
    const wave = entry.wave;
    if (!wave) { items.push({ entry, mode: "card" }); continue; }
    if (emitted.has(wave.id)) continue;
    emitted.add(wave.id);
    const members = pending.filter(candidate => candidate.wave?.id === wave.id);
    const open = members.filter(candidate => !waitingStep(candidate)).sort((a, b) => a.wave!.step - b.wave!.step);
    const focused = open.find(candidate => candidate.proposal_id === opened[wave.id]) ?? open[0];
    const done = settled.filter(candidate => candidate.status === "approved" && candidate.wave?.id === wave.id
      && !members.some(member => member.wave!.step === candidate.wave!.step));
    const rows: ProposalQueueItem<T>[] = [
      ...done.map(candidate => ({ entry: candidate, mode: "done" as const })),
      ...members.map(candidate => ({ entry: candidate, mode: candidate === focused ? "card" as const : waitingStep(candidate) ? "waiting" as const : "next" as const })),
    ];
    items.push(...rows.sort((a, b) => a.entry.wave!.step - b.entry.wave!.step));
  }
  return items;
}

/** "You changed Length on Section: Thesis since this was drafted. Apply replaces it." */
export function overrideNotice(overrides: readonly { element_id: string; field: string }[], review: readonly Pick<ProposalOptionReview, "rows" | "adjustment_rows">[]) {
  const rows = review.flatMap((option) => [...(option.adjustment_rows ?? []), ...option.rows]);
  const names = [...new Set(overrides.map(({ element_id, field }) => {
    const bare = field.replace(/^props\./, "");
    const row = rows.find((candidate) => candidate.element_id === element_id);
    const change = row?.changes.find((candidate) => candidate.field === bare || candidate.field === field);
    const setting = change?.label ?? bare.replace(/_/g, " ");
    return row?.element_label ? `${setting} on ${row.element_label}` : setting;
  }))];
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `You changed ${list} since this was drafted. Apply replaces ${names.length > 1 ? "them" : "it"}.`;
}
