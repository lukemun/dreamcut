import { safeActivityOutcome } from "../observability/activity-journal";
import { assertProposalControlBudget } from "../agent/proposal-control-budget";
import { recordEditingFeedback, assertFeedbackReferences } from "./editing-feedback";
import { currentEditAttribution } from "./edit-attribution";
import { randomUUID } from "node:crypto";
import { safeMemoryEvent } from "./editing-memory";
import fs from "node:fs";
import { proposalRevisionAncestors } from "../agent/proposal-revisions";

import type { EditorAgentProposal } from "@/lib/agent/timeline-editor-agent-apply";
import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import {
  isSafeProposalId,
  projectProposalPath,
  projectProposalsDir,
} from "@/lib/local-store/paths";
import { assertProject, captureProjectHistorySnapshot, readTimeline, withProjectLock } from "@/lib/local-store/store";

/**
 * Pending proposals live beside the project as their own files. They are never
 * part of timeline.json and an apply never writes here — approving a proposal
 * writes the timeline and then marks this record resolved, so the record is an
 * audit trail rather than editor state.
 *
 * Staleness is COMPUTED on read (expected_revision vs the live timeline), never
 * stored, so a hand-edit to timeline.json cannot leave a record lying about
 * whether it still applies.
 */

export const PROPOSAL_RECORD_VERSION = 1;

export type ProposalStatus = "pending" | "approved" | "rejected";

export type ProposalResolution = {
  numeric_overrides?: unknown[];
  at: string;
  option_id?: string;
  reason?: string;
  before_revision?: string;
  after_revision?: string;
  superseded_by_proposal_id?: string;
  rejected_with_proposal_id?: string;
};

export type ProposalRecord = {
  schema_version: typeof PROPOSAL_RECORD_VERSION;
  proposal_id: string;
  created_at: string;
  status: ProposalStatus;
  brief?: string;
  personal_style?: { id: string; revision: number; sha256: string };
  proposal: EditorAgentProposal;
  resolution?: ProposalResolution;
  /**
   * Per-element hashes of the clips this proposal touches, as of the moment it
   * was saved. Element-scoped staleness compares against these, so an unrelated
   * edit elsewhere on the timeline no longer invalidates it. Absent on records
   * written before this existed — those fall back to whole-file staleness.
   */
  touched_fingerprints?: Record<string, string>;
  /** Draft-time values of the settings the card writes, so the panel can say which ones the creator has since changed. */
  touched_base_values?: Record<string, Record<string, unknown>>;
  /**
   * The scoped spatial check run when the proposal was staged: per option, whether it applied
   * and the introduced, resolved and worsened overlaps. Absent on records staged before it ran.
   */
  spatial_review?: Array<{ option_id: string; spatial_status: string; overlap_status?: string; summary?: Record<string, unknown>; introduced?: unknown[] }>;
};

function compactTimestamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
}

export function newProposalId(now = new Date()): string {
  return `${compactTimestamp(now)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export function saveProposal(
  projectId: string,
  proposal: EditorAgentProposal,
  options: {
    brief?: string;
    personalStyle?: { id: string; revision: number; sha256: string };
    proposalId?: string;
    now?: Date;
    /** Element fingerprints for element-scoped staleness (see proposal-staleness.ts). */
    touchedFingerprints?: Record<string, string>;
    touchedBaseValues?: Record<string, Record<string, unknown>>;
    spatialReview?: ProposalRecord["spatial_review"];
  } = {},
): ProposalRecord {
  assertProject(projectId);
  assertProposalControlBudget(readTimeline(projectId), proposal.options);
  assertFeedbackReferences(projectId, proposal.responds_to_feedback_ids ?? []);
  const now = options.now ?? new Date();
  const record: ProposalRecord = {
    schema_version: PROPOSAL_RECORD_VERSION,
    proposal_id: options.proposalId ?? newProposalId(now),
    created_at: now.toISOString(),
    status: "pending",
    ...(options.brief ? { brief: options.brief.slice(0, 8_000) } : {}),
    ...(options.personalStyle ? { personal_style: options.personalStyle } : {}),
    proposal,
    ...(options.touchedFingerprints ? { touched_fingerprints: options.touchedFingerprints } : {}),
    ...(options.touchedBaseValues ? { touched_base_values: options.touchedBaseValues } : {}),
    ...(options.spatialReview ? { spatial_review: options.spatialReview } : {}),
  };
  writeJsonFileAtomic(projectProposalPath(projectId, record.proposal_id), record);
  safeMemoryEvent(projectId, { type: "proposal.created", actor: "agent", summary: proposal.summary, evidence: record.proposal_id, data: { responds_to_feedback_ids: proposal.responds_to_feedback_ids ?? [] } });
  return record;
}

/*
 * Parsed records, reused while a file's stat is unchanged. A project can hold over a hundred
 * records of up to about 1 MB, nearly all resolved and never rewritten, and the inbox lists them
 * several times per rebuild. Stat comes before the read, so a write racing the read only causes
 * one extra read next time. Stored records never leave this module: callers get a copy, which a
 * plain JSON-value copy makes about three times cheaper than parsing again (structuredClone is
 * slower than parsing). Bounded by the files' bytes, least recently used first out.
 */
const PROPOSAL_MEMO_MAX_BYTES = 32 * 1024 * 1024;
const proposalMemo = new Map<string, { key: string; bytes: number; record: ProposalRecord }>();
let proposalMemoBytes = 0;

function forgetStoredProposal(filePath: string) {
  const entry = proposalMemo.get(filePath);
  if (!entry) return;
  proposalMemo.delete(filePath);
  proposalMemoBytes -= entry.bytes;
}

/** The file's parsed contents (null when missing or unreadable). Shared: never return it to a caller. */
function storedProposal(filePath: string): ProposalRecord | null {
  let key: string;
  let bytes: number;
  try {
    const stat = fs.statSync(filePath, { bigint: true });
    key = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    bytes = Number(stat.size);
  } catch {
    forgetStoredProposal(filePath);
    return null;
  }
  const hit = proposalMemo.get(filePath);
  if (hit?.key === key) {
    proposalMemo.delete(filePath);
    proposalMemo.set(filePath, hit);
    return hit.record;
  }
  forgetStoredProposal(filePath);
  const record = readJsonFile<ProposalRecord | null>(filePath, null);
  if (record && typeof record === "object" && bytes <= PROPOSAL_MEMO_MAX_BYTES) {
    proposalMemo.set(filePath, { key, bytes, record });
    proposalMemoBytes += bytes;
    for (const [oldest] of proposalMemo) {
      if (proposalMemoBytes <= PROPOSAL_MEMO_MAX_BYTES) break;
      forgetStoredProposal(oldest);
    }
  }
  return record;
}

/** Deep copy of a JSON.parse result (plain objects, arrays and primitives only). */
function copyJsonValue<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let index = 0; index < value.length; index++) out[index] = copyJsonValue(value[index]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const child = copyJsonValue((value as Record<string, unknown>)[key]);
    if (key === "__proto__") Object.defineProperty(out, key, { value: child, enumerable: true, writable: true, configurable: true });
    else out[key] = child;
  }
  return out as T;
}

function storedProposalRecord(projectId: string, proposalId: string): ProposalRecord {
  const record = storedProposal(projectProposalPath(projectId, proposalId));
  if (!record || record.proposal_id !== proposalId) {
    throw Object.assign(new Error(`Proposal not found: ${proposalId}`), { status: 404 });
  }
  return record;
}

export function readProposal(projectId: string, proposalId: string): ProposalRecord {
  assertProject(projectId);
  if (!isSafeProposalId(proposalId)) {
    throw Object.assign(new Error(`Invalid proposal id: ${proposalId}`), { status: 400 });
  }
  return copyJsonValue(storedProposalRecord(projectId, proposalId));
}

export function listProposalIds(projectId: string): string[] {
  assertProject(projectId);
  try {
    return fs
      .readdirSync(projectProposalsDir(projectId), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -".json".length))
      .filter(isSafeProposalId)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function listProposals(projectId: string, filter: { status?: ProposalStatus } = {}): ProposalRecord[] {
  // listProposalIds asserted the project and returns only safe ids; filter before copying.
  return listProposalIds(projectId)
    .flatMap((proposalId) => {
      try {
        return [storedProposalRecord(projectId, proposalId)];
      } catch {
        return [];
      }
    })
    .filter((record) => (filter.status ? record.status === filter.status : true))
    .map(copyJsonValue);
}

/**
 * Move one still-pending proposal onto a newer project revision. Callers must
 * validate the proposal against that revision before persisting it here.
 */
export function rebasePendingProposal(
  projectId: string,
  proposalId: string,
  expectedRevision: string,
  touchedFingerprints?: Record<string, string>,
): ProposalRecord {
  const record = readProposal(projectId, proposalId);
  if (record.status !== "pending") {
    throw Object.assign(
      new Error(`Proposal ${proposalId} is already ${record.status}`),
      { status: 409 },
    );
  }
  const next: ProposalRecord = {
    ...record,
    proposal: {
      ...record.proposal,
      expected_revision: expectedRevision,
    },
    ...(touchedFingerprints ? { touched_fingerprints: touchedFingerprints } : {}),
  };
  writeJsonFileAtomic(projectProposalPath(projectId, proposalId), next);
  return next;
}

/** Mark a pending record resolved. Refuses to re-resolve, so an approve cannot run twice. */
export function resolveProposal(
  projectId: string,
  proposalId: string,
  status: Exclude<ProposalStatus, "pending">,
  resolution: Omit<ProposalResolution, "at"> & { at?: string },
): ProposalRecord {
  const record = readProposal(projectId, proposalId);
  if (record.status !== "pending") {
    throw Object.assign(
      new Error(`Proposal ${proposalId} is already ${record.status}`),
      { status: 409 },
    );
  }
  if (status === "rejected" && resolution.reason?.trim() && !resolution.superseded_by_proposal_id && !resolution.rejected_with_proposal_id
    && currentEditAttribution("proposal_resolution").actor === "human") {
    recordEditingFeedback({ project_id: projectId, session_id: "proposal-review", turn_id: currentEditAttribution("proposal_resolution").transaction_id ?? randomUUID(),
      direction: resolution.reason, provenance: "user_words", targets: { proposal_ids: [proposalId] },
    }, "human");
  }
  const next: ProposalRecord = {
    ...record,
    status,
    resolution: { ...resolution, at: resolution.at ?? new Date().toISOString() },
  };
  writeJsonFileAtomic(projectProposalPath(projectId, proposalId), next);
  // The creator's decision, with any final dial values: the activity outcome for the episode that proposed it.
  const settled = next.resolution!;
  safeActivityOutcome({ project_id: projectId, proposal_id: proposalId,
    event: status === "rejected" && settled.superseded_by_proposal_id ? "superseded" : status,
    ...(settled.option_id ? { option_id: settled.option_id } : {}), data: { resolution: settled, actor: currentEditAttribution("proposal_resolution").actor } });
  safeMemoryEvent(projectId, { type: `proposal.${status}`, actor: "human", summary: record.proposal.summary, evidence: proposalId, data: { resolution: next.resolution, responds_to_feedback_ids: record.proposal.responds_to_feedback_ids ?? [], transaction_id: currentEditAttribution("proposal_resolution").transaction_id } });
  return next;
}

/** Reject the selected revision and its pending ancestors, preserving every record.
 * Resolve the selected card last: an interrupted write cannot expose its ancestors.
 * Only explicit backward revision links participate; independent cards are untouched.
 * Before/after snapshots carry every record it resolves, so Undo returns them pending.
 */
export async function rejectProposalRevisionChain(projectId: string, proposalId: string, reason?: string) {
  return withProjectLock(projectId, async () => {
    const root = readProposal(projectId, proposalId);
    if (root.status !== "pending") {
      throw Object.assign(new Error(`Proposal ${proposalId} is already ${root.status}`), { status: 409 });
    }
    const records = new Map(listProposals(projectId).map(record => [record.proposal_id, record]));
    const visited = new Set<string>([proposalId]);
    const ancestors: ProposalRecord[] = [];
    const visit = (record: ProposalRecord) => {
      for (const id of record.proposal.supersedes_proposal_ids ?? []) {
        const previous = records.get(id);
        if (!previous || visited.has(id) || previous.created_at > record.created_at) continue;
        visited.add(id);
        visit(previous);
        if (previous.status === "pending") ancestors.push(previous);
      }
    };
    visit(root);
    const historyIds = [...ancestors.map(record => record.proposal_id), proposalId];
    const before = captureProjectHistorySnapshot(projectId, "proposal_reject_before", { proposalIds: historyIds });
    const at = new Date().toISOString();
    for (const previous of ancestors) {
      resolveProposal(projectId, previous.proposal_id, "rejected", {
        at, rejected_with_proposal_id: proposalId,
        reason: `Rejected with latest revision ${proposalId}`,
      });
    }
    const record = resolveProposal(projectId, proposalId, "rejected", { at, ...(reason ? { reason } : {}) });
    const after = captureProjectHistorySnapshot(projectId, "proposal_reject", { proposalIds: historyIds });
    return { record, rejected_proposal_ids: historyIds, history: { before, after } };
  });
}

/**
 * Resolve explicitly replaced drafts as part of approving their successor.
 * The human approval is the authority for this bookkeeping; proposal creation
 * alone never changes an older record. Human rejection uses the separate
 * revision-chain rejection path above.
 */
export function resolveSupersededProposals(
  projectId: string,
  supersedingProposalId: string,
  supersededProposalIds: readonly string[],
): string[] {
  const resolved: string[] = [];
  const records = listProposals(projectId).map(record => ({ ...record, supersedes_proposal_ids: record.proposal_id === supersedingProposalId ? supersededProposalIds : record.proposal.supersedes_proposal_ids ?? [] }));
  for (const { proposal_id: proposalId } of proposalRevisionAncestors(records, supersedingProposalId)) {
    if (proposalId === supersedingProposalId) continue;
    const record = readProposal(projectId, proposalId);
    if (record.status !== "pending") continue;
    resolveProposal(projectId, proposalId, "rejected", {
      reason: `Superseded by approved proposal ${supersedingProposalId}`,
      superseded_by_proposal_id: supersedingProposalId,
    });
    resolved.push(proposalId);
  }
  return resolved;
}
