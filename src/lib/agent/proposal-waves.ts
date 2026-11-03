import { applyProposalReviewOverrides } from "@/lib/agent/proposal-overrides";
import { deriveProposalTimeline, proposalOption, type EditorAgentProposal } from "@/lib/agent/timeline-editor-agent-apply";
import { listProposals, type ProposalRecord } from "@/lib/local-store/proposals";
import { readProposalTuning } from "@/lib/local-store/proposal-tuning";
import type { TimelineFile } from "@/lib/local-store/store";

/**
 * Proposal waves: a large edit sent as an ordered queue of small proposals that share a
 * `wave.id`. The creator settles one step at a time. A step that needs earlier steps is
 * validated on top of them when drafted (`waveBaseTimeline`), waits while any of them is
 * pending, and opens once they are approved: the read-time refresh then re-validates it
 * against the real timeline (including the creator's tuning) and rebases it.
 */

export type WaveStepState = {
  id: string;
  step: number;
  title: string;
  /** Highest step number in the queue, counting settled steps. */
  total: number;
  /** Needed steps that are still pending; the step cannot be previewed or approved yet. */
  waiting_for: number[];
  /** Needed steps that were turned down; this step can no longer apply as drafted. */
  blocked_by: number[];
};

export function waveNeeds(proposal: Pick<EditorAgentProposal, "wave">): number[] {
  const wave = proposal.wave;
  if (!wave) return [];
  // Steps are an order, not dependencies: each applies on its own (assertCardStandsAlone).
  // Only legacy records name earlier steps explicitly.
  return wave.needs_steps ?? [];
}

/** The live record for each step: approved wins, else the newest pending draft not replaced by another. */
function stepRecords(records: readonly ProposalRecord[], waveId: string) {
  const inWave = records.filter(record => record.proposal.wave?.id === waveId);
  const replaced = new Set(inWave.filter(record => record.status === "pending").flatMap(record => record.proposal.supersedes_proposal_ids ?? []));
  const byStep = new Map<number, ProposalRecord>();
  const rank = (record: ProposalRecord) => record.status === "approved" ? 2 : record.status === "pending" && !replaced.has(record.proposal_id) ? 1 : 0;
  for (const record of inWave) {
    const step = record.proposal.wave!.step;
    const current = byStep.get(step);
    if (!current || rank(record) > rank(current) || (rank(record) === rank(current) && record.created_at > current.created_at)) byStep.set(step, record);
  }
  return byStep;
}

export function waveStepState(record: ProposalRecord, records: readonly ProposalRecord[]): WaveStepState | null {
  const wave = record.proposal.wave;
  if (!wave) return null;
  const steps = stepRecords(records, wave.id);
  const waiting_for: number[] = [];
  const blocked_by: number[] = [];
  for (const step of waveNeeds(record.proposal)) {
    const status = steps.get(step)?.status;
    if (status === "approved") continue;
    if (status === "pending") waiting_for.push(step);
    else blocked_by.push(step);
  }
  return { id: wave.id, step: wave.step, title: wave.title, total: Math.max(wave.step, ...steps.keys()), waiting_for, blocked_by };
}

/** Wave state for every record that belongs to a wave, keyed by proposal id. */
export function waveStates(records: readonly ProposalRecord[]): Map<string, WaveStepState> {
  const states = new Map<string, WaveStepState>();
  for (const record of records) {
    const state = waveStepState(record, records);
    if (state) states.set(record.proposal_id, state);
  }
  return states;
}

export function waveWaitingMessage(state: WaveStepState): string | null {
  if (state.blocked_by.length) return `Step ${state.blocked_by.join(" and ")} was turned down, so this step no longer applies.`;
  if (state.waiting_for.length) return `Approve step ${state.waiting_for.join(" and ")} first.`;
  return null;
}

/**
 * The timeline a new wave step is drafted on: the live timeline plus every still-pending step
 * it needs (and theirs), in step order, each with its recommended option and the creator's
 * saved tuning. Returns null when nothing it needs is pending.
 */
export function waveBaseTimeline(projectId: string, proposal: EditorAgentProposal, timeline: TimelineFile, selfProposalId?: string): TimelineFile | null {
  const wave = proposal.wave;
  if (!wave) return null;
  const records = listProposals(projectId);
  const steps = stepRecords(records, wave.id);
  for (const step of waveNeeds(proposal)) {
    const status = steps.get(step)?.status;
    if (status !== "approved" && status !== "pending") {
      throw Object.assign(new Error(`Wave "${wave.id}" has no pending or approved step ${step} for step ${wave.step} to build on`), { status: 409 });
    }
  }
  const pendingSameStep = steps.get(wave.step);
  if (pendingSameStep?.status === "pending" && pendingSameStep.proposal_id !== selfProposalId
    && !(proposal.supersedes_proposal_ids ?? []).includes(pendingSameStep.proposal_id)) {
    throw Object.assign(new Error(`Wave "${wave.id}" already has a pending step ${wave.step}; name it in supersedes_proposal_ids to replace it`), { status: 409 });
  }
  const chain = new Set<number>();
  const visit = (record: ProposalRecord) => {
    for (const step of waveNeeds(record.proposal)) {
      const needed = steps.get(step);
      if (needed?.status !== "pending" || chain.has(step)) continue;
      chain.add(step);
      visit(needed);
    }
  };
  visit({ proposal } as ProposalRecord);
  if (!chain.size) return null;
  let base = timeline;
  for (const step of [...chain].sort((a, b) => a - b)) {
    const record = steps.get(step)!;
    const option = proposalOption(record.proposal);
    const tuned = applyProposalReviewOverrides(record.proposal, option.id, readProposalTuning(projectId, record.proposal_id)[option.id] ?? [], base);
    const chosen = proposalOption(tuned, option.id);
    base = deriveProposalTimeline(base, chosen.operations, projectId, chosen.preserve_fields).timeline;
  }
  return base;
}

/** Refuses preview or approval of a step whose earlier steps are not approved yet (409). */
export function assertWaveStepOpen(projectId: string, record: ProposalRecord) {
  if (!record.proposal.wave) return;
  const state = waveStepState(record, listProposals(projectId));
  const message = state && waveWaitingMessage(state);
  if (message) throw Object.assign(new Error(message), { status: 409 });
}

/**
 * Whether approval of another card carries this pending card onto the new revision: cards
 * marked independent, and open wave steps (each step is its own reviewable card; the same
 * staleness and re-validation checks still decide whether it actually moves).
 */
export function carriedAcrossApproval(projectId: string, record: ProposalRecord): boolean {
  if (record.proposal.rebase_policy === "independent") return true;
  if (!record.proposal.wave) return false;
  const state = waveStepState(record, listProposals(projectId));
  return !!state && !state.waiting_for.length && !state.blocked_by.length;
}
