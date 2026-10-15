import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { feedbackContentSchema, feedbackIdsSchema } from "../timeline/editing-feedback";
import { memoryDir, memoryHash, memoryEvents, recordMemoryEvent, type MemoryEvent } from "./editing-memory";
import { projectDir } from "./paths";

export const editingFeedbackSchema = z.object({
  project_id: z.string().min(1).max(128), session_id: z.string().min(1).max(200),
  turn_id: z.string().min(1).max(200), ordinal: z.number().int().nonnegative().default(0),
  summary: z.string().trim().min(1).max(2000).optional(),
  ...feedbackContentSchema.partial().shape,
  supersedes_event_id: z.string().max(300).optional(),
}).strict().refine(value => value.direction || value.summary, "Direction or legacy summary is required");

/** Explicit agent capture into the existing ledger; never treats a paraphrase as a human quote. */
export function recordEditingFeedback(input: unknown, recordedBy: "agent" | "human" = "agent") {
  const value = editingFeedbackSchema.parse(input);
  if (!fs.existsSync(path.join(projectDir(value.project_id), "timeline.json"))) throw new Error("Existing project required; never infer or create a feedback destination.");
  const id = `feedback:${memoryHash([value.session_id, value.turn_id, value.project_id, value.ordinal])}`;
  if (value.supersedes_event_id) assertFeedbackReferences(value.project_id, [value.supersedes_event_id]);
  if (id === value.supersedes_event_id) throw new Error("Feedback cannot supersede itself");
  const structured = value.direction !== undefined || value.reason !== undefined || value.targets !== undefined || value.provenance !== undefined;
  const body = { id, type: "editorial.feedback", actor: recordedBy, summary: value.direction ?? value.summary!,
    data: { ...(structured ? { schema_version: 1, direction: value.direction ?? value.summary, reason: value.reason, targets: value.targets } : {}),
      provenance: value.provenance ?? (structured ? "agent_paraphrase" : "agent_recorded_interpretation_not_verified_quote"), session_id: value.session_id,
      turn_id: value.turn_id, supersedes_event_id: value.supersedes_event_id } };
  const file = path.join(memoryDir(value.project_id), "events", `${memoryHash(id)}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Short synchronous critical section. A crash leaves an explicit lock requiring
  // inspection, rather than guessing an owner dead and overwriting evidence.
  const lock = `${file}.capture-lock`;
  const fd = fs.openSync(lock, "wx", 0o600);
  try {
    if (fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, "utf8")) as MemoryEvent;
      const { hash, time, ...previous } = saved;
      if (memoryHash({ ...previous, time }) !== hash || memoryHash(previous) !== memoryHash(JSON.parse(JSON.stringify(body)))) {
        throw new Error("Feedback ID conflict or damaged event. Use a new ordinal and supersedes_event_id; do not overwrite.");
      }
    } else {
      recordMemoryEvent(value.project_id, body);
    }
    return { project_id: value.project_id, event_id: id, path: file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") };
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

/** Validate project-local immutable evidence, including its integrity, before accepting links. */
export function assertFeedbackReferences(projectId: string, raw: unknown): string[] {
  const ids = feedbackIdsSchema.parse(raw);
  for (const id of ids) {
    const file = path.join(memoryDir(projectId), "events", `${memoryHash(id)}.json`);
    if (!fs.existsSync(file)) throw new Error(`Feedback reference does not exist in this project: ${id}`);
    const { hash, ...event } = JSON.parse(fs.readFileSync(file, "utf8")) as MemoryEvent;
    if (event.id !== id || event.type !== "editorial.feedback" || memoryHash(event) !== hash) throw new Error("Invalid feedback evidence");
  }
  return ids;
}

const dispositionSchema = z.object({
  project_id: z.string(), feedback_id: z.string(), session_id: z.string().min(1).max(200), turn_id: z.string().min(1).max(200),
  ordinal: z.number().int().nonnegative().default(0),
  disposition: z.enum(["addressed", "deferred", "unresolved"]), reason: z.string().trim().min(1).max(2000),
}).strict();

export function recordFeedbackDisposition(input: unknown) {
  const value = dispositionSchema.parse(input);
  assertFeedbackReferences(value.project_id, [value.feedback_id]);
  const id = `feedback-disposition:${memoryHash([value.feedback_id, value.session_id, value.turn_id, value.ordinal])}`;
  const body = { id, type: "editorial.feedback_disposition", actor: "agent" as const, summary: value.reason,
    data: { feedback_id: value.feedback_id, disposition: value.disposition, session_id: value.session_id, turn_id: value.turn_id,
      provenance: "agent_declared_disposition_not_user_satisfaction" } };
  const file = path.join(memoryDir(value.project_id), "events", `${memoryHash(id)}.json`);
  // Serialize all dispositions for one direction, including those in the same millisecond.
  const lock = path.join(memoryDir(value.project_id), "events", `${memoryHash(value.feedback_id)}.disposition-lock`);
  const fd = fs.openSync(lock, "wx", 0o600);
  try {
    if (fs.existsSync(file)) {
      const { time, hash, ...saved } = JSON.parse(fs.readFileSync(file, "utf8")) as MemoryEvent;
      const { sequence: _sequence, ...data } = saved.data ?? {};
      if (memoryHash({ ...saved, time }) !== hash || memoryHash({ ...saved, data }) !== memoryHash(body)) throw new Error("Disposition ID conflict; use a new ordinal");
    } else {
      const previous = memoryEvents(value.project_id).filter(event => event.type === "editorial.feedback_disposition" && event.data?.feedback_id === value.feedback_id);
      const sequence = Math.max(0, ...previous.map(event => Number(event.data?.sequence) || 0)) + 1;
      recordMemoryEvent(value.project_id, { ...body, data: { ...body.data, sequence } });
    }
    return { event_id: id };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
