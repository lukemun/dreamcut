import fs from "node:fs";
import path from "node:path";
import { memoryEvents, profileDir, type MemoryEvent } from "../local-store/editing-memory";
import { listMotionAuditSubjects, readMotionAudit, type MotionAuditEvent } from "../local-store/motion-audit";
import { listProposals } from "../local-store/proposals";
import { assertProject } from "../local-store/store";
import { productSignalsDir, productSignalSchema, type ProductSignal } from "./product-signals";
import { summarizeProposalWork } from "./proposal-work";
import { readToolEventsDay, type ToolEvent } from "./tool-events";

/**
 * What a bug report can carry about an agent session, from local files only, so a retro can be
 * read from the report without the agent's own transcript (docs/audits, 2026-10-27). Opt-in per
 * report; the dialog shows this manifest before anything is sent. Never the external agent's
 * conversation, never credentials, never media.
 */
export const SESSION_EVIDENCE_MEMORY_EVENTS = 50;
const MAX_MOTION_EVENTS = 200;
const MAX_WORK_ATTEMPTS = 20;
// Absolute local paths carry the account name; they are replaced, never sent.
const ABSOLUTE_PATH = /(?:\/Users\/|\/home\/|\/private\/|\/var\/folders\/|[A-Za-z]:\\\\?Users\\\\?)[^\s"',;)]*/g;

export type SessionEvidenceBundle = {
  schema_version: 1;
  generated_at: string;
  project_id: string;
  day: string;
  memory_events: MemoryEvent[];
  tool_events: ToolEvent[];
  product_signals: ProductSignal[];
  proposals: Array<{ id: string; status: string; created_at: string; supersedes_proposal_ids?: string[] }>;
  proposal_work: Array<{ attempt_id: string } & ReturnType<typeof summarizeProposalWork>>;
  motion_audit: Array<{ kind: string; id: string; events: MotionAuditEvent[]; invalid_lines: number }>;
  excluded: string[];
};

function dayRows(dir: string, day: string): ProductSignal[] {
  const file = path.join(dir, `${day}.jsonl`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !fs.existsSync(file)) return [];
  const rows: ProductSignal[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    try { rows.push(productSignalSchema.parse(JSON.parse(line))); } catch { /* counted nowhere: a damaged row is not evidence */ }
  }
  return rows;
}

/** Rows for this project, plus rows that name no project (editor_context_get before the project was known). */
const forProject = <T extends { project_id?: string }>(rows: T[], projectId: string) => rows.filter(row => !row.project_id || row.project_id === projectId);

function workAttempts(projectId: string) {
  const dir = path.join(profileDir(), "proposal-work", projectId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => /^[0-9a-f-]{36}$/.test(name)).map(attempt => {
    const attemptDir = path.join(dir, attempt);
    const events = fs.readdirSync(attemptDir).filter(f => f.endsWith(".json"))
      .map(f => JSON.parse(fs.readFileSync(path.join(attemptDir, f), "utf8")) as Parameters<typeof summarizeProposalWork>[0][number])
      .sort((a, b) => a.at.localeCompare(b.at));
    return { attempt_id: attempt, ...summarizeProposalWork(events) };
  }).sort((a, b) => (a.capture_started_at ?? "").localeCompare(b.capture_started_at ?? "")).slice(-MAX_WORK_ATTEMPTS);
}

export function sessionEvidenceBundle(projectId: string, { day = new Date().toISOString().slice(0, 10), lastEvents = SESSION_EVIDENCE_MEMORY_EVENTS, now = new Date() } = {}): SessionEvidenceBundle {
  assertProject(projectId);
  const bundle: SessionEvidenceBundle = {
    schema_version: 1,
    generated_at: now.toISOString(),
    project_id: projectId,
    day,
    memory_events: memoryEvents(projectId).slice(-lastEvents),
    tool_events: forProject(readToolEventsDay(day).events, projectId),
    product_signals: forProject(dayRows(productSignalsDir(), day), projectId),
    proposals: listProposals(projectId).map(record => ({ id: record.proposal_id, status: record.status, created_at: record.created_at,
      ...(record.proposal.supersedes_proposal_ids?.length ? { supersedes_proposal_ids: record.proposal.supersedes_proposal_ids } : {}) })),
    proposal_work: workAttempts(projectId),
    motion_audit: listMotionAuditSubjects(projectId).map(subject => {
      const { events, invalid_lines } = readMotionAudit(projectId, subject.kind, subject.id);
      return { ...subject, events: events.slice(-MAX_MOTION_EVENTS), invalid_lines };
    }),
    excluded: ["The conversation with an outside agent (Claude Code, Codex) stays in that agent's own folder and is not attached.",
      "Media, timelines, prompts, credentials and the account email are not attached."],
  };
  // One pass over the serialized bundle: a motion request or feedback summary may quote a path.
  return JSON.parse(JSON.stringify(bundle).replace(ABSOLUTE_PATH, "<local path>")) as SessionEvidenceBundle;
}

export type SessionEvidenceManifest = { items: Array<{ label: string; count: number }>; excluded: string[]; bytes: number };

/** What the report will carry, in the creator's words, shown before they send it. */
export function sessionEvidenceManifest(bundle: SessionEvidenceBundle): SessionEvidenceManifest {
  const motionEvents = bundle.motion_audit.reduce((sum, subject) => sum + subject.events.length, 0);
  return {
    items: [
      { label: `Editing memory events (last ${SESSION_EVIDENCE_MEMORY_EVENTS})`, count: bundle.memory_events.length },
      { label: "Agent tool calls today", count: bundle.tool_events.length },
      { label: "Agent tool signals today", count: bundle.product_signals.length },
      { label: "Proposal cards (ids and status)", count: bundle.proposals.length },
      { label: "Proposal timing attempts", count: bundle.proposal_work.length },
      { label: "Motion graphic audit events", count: motionEvents },
    ],
    excluded: bundle.excluded,
    bytes: Buffer.byteLength(JSON.stringify(bundle)),
  };
}
