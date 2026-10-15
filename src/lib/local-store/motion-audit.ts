import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectDir } from "./paths";

/**
 * Append-only audit trail for model-authored motion graphics and synthesized sounds.
 * See docs/architecture/model-authored-motion-graphics.md#audit-trail.
 *
 * The trail lives outside the composition source so appending never changes the
 * source fingerprint. Entries are never rewritten; corrections append new events.
 */

export type MotionAuditSubjectKind = "composition" | "sound";

export type MotionAuditActor =
  | { type: "person"; via: "editor" | "chat" }
  | { type: "agent"; name: string | null; model: string | null; effort: string | null };

export type MotionAuditCoverage = {
  has_manifest: boolean;
  declared_controls: number;
  declared_actors: number;
  declared_markers: number;
  /** Actor ids found as data-actor attributes in source but not declared in the manifest. */
  undeclared_actor_attributes: number;
  /** Declared actor ids with no matching data-actor attribute in source. */
  missing_actor_attributes: number;
};

export type MotionAuditEventBody =
  | {
    type: "revision";
    source_fingerprint_sha256: string;
    manifest_sha256: string | null;
    files: Array<{ path: string; sha256: string }>;
    feedback_ids: string[];
    proposal_id: string | null;
    request: string | null;
  }
  | { type: "coverage"; source_fingerprint_sha256: string; coverage: MotionAuditCoverage }
  | {
    type: "validation";
    source_fingerprint_sha256: string;
    ok: boolean;
    errors: string[];
    warnings: string[];
  }
  | {
    type: "render";
    source_fingerprint_sha256: string;
    manifest_sha256: string | null;
    values_sha256: string | null;
    values: Record<string, unknown> | null;
    output_path: string;
    output_sha256: string;
    duration_seconds: number;
    renderer: string;
    elapsed_ms: number;
    approval_required: boolean;
    approved: boolean;
  }
  | {
    type: "value_change";
    target: string;
    old_value: unknown;
    new_value: unknown;
    proposal_id: string | null;
    element_id: string | null;
  }
  | {
    type: "placement";
    element_id: string;
    source_fingerprint_sha256: string | null;
    timeline_start: number | null;
    duration: number | null;
  }
  | {
    type: "model_request";
    feedback_id: string;
    satisfiable_by: string[];
    note: string | null;
  }
  | {
    type: "library_add";
    catalog_id: string;
    file: string;
    sha256: string;
    analyzed: boolean;
  }
  | {
    type: "review";
    source_fingerprint_sha256: string;
    decision: "approved" | "rejected";
    /** Creator's 1–5 rating of the motion, or null when the reviewer skipped it. */
    rating: number | null;
    proposal_id: string | null;
  };

export type MotionAuditEvent = MotionAuditEventBody & {
  schema_version: 1;
  event_id: string;
  at: string;
  subject: { kind: MotionAuditSubjectKind; id: string };
  actor: MotionAuditActor;
};

const SHA256_RE = /^[a-f0-9]{64}$/;
const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const EVENT_TYPES = new Set([
  "revision", "coverage", "validation", "render", "value_change", "placement", "model_request", "library_add", "review",
]);

export function isSafeMotionSubjectId(id: string): boolean {
  return SAFE_ID_RE.test(id) && id !== "." && id !== "..";
}

export function motionAuditPath(projectId: string, kind: MotionAuditSubjectKind, id: string): string {
  if (!isSafeMotionSubjectId(id)) throw new Error(`Invalid ${kind} id: ${id}`);
  return path.join(projectDir(projectId), "audit", "motion", `${kind}s`, `${id}.jsonl`);
}

function isSha(value: unknown): boolean {
  return typeof value === "string" && SHA256_RE.test(value);
}

function isShaOrNull(value: unknown): boolean {
  return value === null || isSha(value);
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function validateActor(actor: unknown): void {
  if (!actor || typeof actor !== "object") throw new Error("Audit event needs an actor");
  const value = actor as Record<string, unknown>;
  if (value.type === "person") {
    if (value.via !== "editor" && value.via !== "chat") throw new Error("Person actor needs via: editor or chat");
    return;
  }
  if (value.type === "agent") {
    if (!isStringOrNull(value.name) || !isStringOrNull(value.model) || !isStringOrNull(value.effort)) {
      throw new Error("Agent actor fields must be strings or null");
    }
    return;
  }
  throw new Error("Audit actor must be a person or an agent");
}

export function validateMotionAuditEvent(value: unknown): asserts value is MotionAuditEvent {
  if (!value || typeof value !== "object") throw new Error("Invalid motion audit event");
  const event = value as Record<string, unknown>;
  if (event.schema_version !== 1) throw new Error("Unsupported motion audit schema");
  if (typeof event.event_id !== "string" || event.event_id.length === 0) throw new Error("Audit event needs an id");
  if (typeof event.at !== "string" || Number.isNaN(Date.parse(event.at))) throw new Error("Audit event needs a timestamp");
  const subject = event.subject as Record<string, unknown> | undefined;
  if (!subject || (subject.kind !== "composition" && subject.kind !== "sound")
    || typeof subject.id !== "string" || !isSafeMotionSubjectId(subject.id)) {
    throw new Error("Audit event needs a composition or sound subject");
  }
  validateActor(event.actor);
  if (typeof event.type !== "string" || !EVENT_TYPES.has(event.type)) throw new Error("Unknown audit event type");

  switch (event.type) {
    case "revision": {
      if (!isSha(event.source_fingerprint_sha256) || !isShaOrNull(event.manifest_sha256)) {
        throw new Error("Revision needs source and manifest hashes");
      }
      if (!Array.isArray(event.files) || !event.files.every((file) =>
        file && typeof file === "object" && typeof (file as { path?: unknown }).path === "string"
        && isSha((file as { sha256?: unknown }).sha256))) {
        throw new Error("Revision files need paths and hashes");
      }
      if (!Array.isArray(event.feedback_ids) || !event.feedback_ids.every((id) => typeof id === "string")) {
        throw new Error("Revision feedback ids must be strings");
      }
      if (!isStringOrNull(event.proposal_id) || !isStringOrNull(event.request)) {
        throw new Error("Revision proposal id and request must be strings or null");
      }
      return;
    }
    case "coverage": {
      const coverage = event.coverage as Record<string, unknown> | undefined;
      if (!isSha(event.source_fingerprint_sha256) || !coverage || typeof coverage.has_manifest !== "boolean"
        || !["declared_controls", "declared_actors", "declared_markers", "undeclared_actor_attributes", "missing_actor_attributes"]
          .every((key) => Number.isInteger(coverage[key]) && (coverage[key] as number) >= 0)) {
        throw new Error("Invalid coverage event");
      }
      return;
    }
    case "validation": {
      if (!isSha(event.source_fingerprint_sha256) || typeof event.ok !== "boolean"
        || !Array.isArray(event.errors) || !Array.isArray(event.warnings)) {
        throw new Error("Invalid validation event");
      }
      return;
    }
    case "render": {
      if (!isSha(event.source_fingerprint_sha256) || !isShaOrNull(event.manifest_sha256)
        || !isShaOrNull(event.values_sha256) || !isSha(event.output_sha256)
        || typeof event.output_path !== "string" || typeof event.renderer !== "string"
        || !Number.isFinite(event.duration_seconds) || !Number.isFinite(event.elapsed_ms)
        || typeof event.approval_required !== "boolean" || typeof event.approved !== "boolean"
        || (event.values !== null && (typeof event.values !== "object" || Array.isArray(event.values)))) {
        throw new Error("Invalid render event");
      }
      return;
    }
    case "value_change": {
      if (typeof event.target !== "string" || event.target.length === 0
        || !isStringOrNull(event.proposal_id) || !isStringOrNull(event.element_id)) {
        throw new Error("Invalid value change event");
      }
      return;
    }
    case "placement": {
      if (typeof event.element_id !== "string" || !isShaOrNull(event.source_fingerprint_sha256)) {
        throw new Error("Invalid placement event");
      }
      return;
    }
    case "model_request": {
      if (typeof event.feedback_id !== "string" || !Array.isArray(event.satisfiable_by)
        || !isStringOrNull(event.note)) {
        throw new Error("Invalid model request event");
      }
      return;
    }
    case "library_add": {
      if (typeof event.catalog_id !== "string" || typeof event.file !== "string" || !isSha(event.sha256)
        || typeof event.analyzed !== "boolean") {
        throw new Error("Invalid library add event");
      }
      return;
    }
    case "review": {
      if (!isSha(event.source_fingerprint_sha256)
        || (event.decision !== "approved" && event.decision !== "rejected")
        || !(event.rating === null || (Number.isInteger(event.rating) && (event.rating as number) >= 1 && (event.rating as number) <= 5))
        || !isStringOrNull(event.proposal_id)) {
        throw new Error("Invalid review event");
      }
      return;
    }
  }
}

export function appendMotionAuditEvent(
  projectId: string,
  subject: { kind: MotionAuditSubjectKind; id: string },
  actor: MotionAuditActor,
  body: MotionAuditEventBody,
  now: () => Date = () => new Date(),
): MotionAuditEvent {
  const event = {
    schema_version: 1 as const,
    event_id: randomUUID(),
    at: now().toISOString(),
    subject,
    actor,
    ...body,
  } as MotionAuditEvent;
  validateMotionAuditEvent(event);
  const filePath = motionAuditPath(projectId, subject.kind, subject.id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // One write per line; O_APPEND keeps concurrent appenders from interleaving short records.
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, { flag: "a" });
  return event;
}

export type MotionAuditReadResult = { events: MotionAuditEvent[]; invalid_lines: number };

export function readMotionAudit(
  projectId: string,
  kind: MotionAuditSubjectKind,
  id: string,
): MotionAuditReadResult {
  let text: string;
  try {
    text = fs.readFileSync(motionAuditPath(projectId, kind, id), "utf8");
  } catch {
    return { events: [], invalid_lines: 0 };
  }
  const events: MotionAuditEvent[] = [];
  let invalid = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      validateMotionAuditEvent(parsed);
      events.push(parsed);
    } catch {
      invalid += 1;
    }
  }
  return { events, invalid_lines: invalid };
}

export function listMotionAuditSubjects(projectId: string): Array<{ kind: MotionAuditSubjectKind; id: string }> {
  const subjects: Array<{ kind: MotionAuditSubjectKind; id: string }> = [];
  for (const kind of ["composition", "sound"] as const) {
    const directory = path.join(projectDir(projectId), "audit", "motion", `${kind}s`);
    let entries: string[];
    try {
      entries = fs.readdirSync(directory);
    } catch {
      continue;
    }
    for (const name of entries.sort()) {
      if (!name.endsWith(".jsonl")) continue;
      const id = name.slice(0, -".jsonl".length);
      if (isSafeMotionSubjectId(id)) subjects.push({ kind, id });
    }
  }
  return subjects;
}

/** Append a revision event only when the source differs from the last recorded revision. */
export function recordRevisionIfChanged(
  projectId: string,
  subject: { kind: MotionAuditSubjectKind; id: string },
  actor: MotionAuditActor,
  revision: Extract<MotionAuditEventBody, { type: "revision" }>,
): MotionAuditEvent | null {
  const { events } = readMotionAudit(projectId, subject.kind, subject.id);
  const last = [...events].reverse().find((event) => event.type === "revision");
  if (last && last.type === "revision"
    && last.source_fingerprint_sha256 === revision.source_fingerprint_sha256) {
    return null;
  }
  return appendMotionAuditEvent(projectId, subject, actor, revision);
}

export type MotionAuditSummary = {
  kind: MotionAuditSubjectKind;
  id: string;
  revisions: number;
  renders: number;
  latest_coverage: MotionAuditCoverage | null;
  value_changes: { by_person: number; by_agent: number; by_target: Record<string, number> };
  model_requests: number;
  missed_controls: number;
  library_adds: number;
  reviews: { approved: number; rejected: number; ratings: number[]; mean_rating: number | null };
  invalid_lines: number;
};

export function summarizeMotionAudit(
  projectId: string,
  kind: MotionAuditSubjectKind,
  id: string,
): MotionAuditSummary {
  const { events, invalid_lines } = readMotionAudit(projectId, kind, id);
  const summary: MotionAuditSummary = {
    kind,
    id,
    revisions: 0,
    renders: 0,
    latest_coverage: null,
    value_changes: { by_person: 0, by_agent: 0, by_target: {} },
    model_requests: 0,
    missed_controls: 0,
    library_adds: 0,
    reviews: { approved: 0, rejected: 0, ratings: [], mean_rating: null },
    invalid_lines,
  };
  for (const event of events) {
    switch (event.type) {
      case "revision": summary.revisions += 1; break;
      case "render": summary.renders += 1; break;
      case "coverage": summary.latest_coverage = event.coverage; break;
      case "value_change":
        if (event.actor.type === "person") summary.value_changes.by_person += 1;
        else summary.value_changes.by_agent += 1;
        summary.value_changes.by_target[event.target] = (summary.value_changes.by_target[event.target] ?? 0) + 1;
        break;
      case "model_request":
        summary.model_requests += 1;
        if (event.satisfiable_by.length > 0) summary.missed_controls += 1;
        break;
      case "library_add": summary.library_adds += 1; break;
      case "review":
        if (event.decision === "approved") summary.reviews.approved += 1;
        else summary.reviews.rejected += 1;
        if (event.rating != null) summary.reviews.ratings.push(event.rating);
        break;
      default: break;
    }
  }
  const ratings = summary.reviews.ratings;
  summary.reviews.mean_rating = ratings.length > 0
    ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 100) / 100
    : null;
  return summary;
}

export function summarizeProjectMotionAudit(projectId: string): MotionAuditSummary[] {
  return listMotionAuditSubjects(projectId).map((subject) => summarizeMotionAudit(projectId, subject.kind, subject.id));
}

export type MotionAuditCliContext = {
  actor: MotionAuditActor;
  feedbackIds: string[];
  proposalId: string | null;
  request: string | null;
};

/**
 * Shared audit flags for motion CLIs. Without --agent the action is recorded as a
 * person in the editor, because the editor's action routes call these CLIs.
 */
export function motionAuditContextFromArgs(args: string[]): MotionAuditCliContext {
  const value = (name: string) => {
    const index = args.indexOf(name);
    const found = index >= 0 ? args[index + 1] : undefined;
    return found && !found.startsWith("--") ? found : null;
  };
  return {
    actor: args.includes("--agent") ? agentActorFromArgs(args) : { type: "person", via: "editor" },
    feedbackIds: (value("--feedback-ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean),
    proposalId: value("--proposal-id"),
    request: value("--request"),
  };
}

/** Read agent identity from CLI flags; unknown fields stay null rather than guessed. */
export function agentActorFromArgs(args: string[]): MotionAuditActor {
  const value = (name: string) => {
    const index = args.indexOf(name);
    const found = index >= 0 ? args[index + 1] : undefined;
    return found && !found.startsWith("--") ? found : null;
  };
  return { type: "agent", name: value("--agent"), model: value("--model"), effort: value("--effort") };
}

/** CLI audit flags for an agent request made through an API route; unknown fields are omitted. */
export function agentAuditArgs(agent: unknown): string[] {
  const value = (agent && typeof agent === "object" ? agent : {}) as Record<string, unknown>;
  const text = (input: unknown) => typeof input === "string" && input.trim() && input.length <= 200 ? input.trim() : null;
  const args = ["--agent", text(value.name) ?? "editor-agent"];
  const model = text(value.model);
  const effort = text(value.effort);
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);
  return args;
}
