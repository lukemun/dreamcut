import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { profileDir } from "../local-store/editing-memory";
import { assertProject } from "../local-store/store";

const phase = z.enum(["preparation", "composition", "validation", "engineering", "verification", "waiting"]);
// The MCP server records proposal_create and motion_graphic_prepare spans itself (mcp/proposal-work-auto.mjs);
// those events say so, so a report can tell server-timed phases from the agent's own marks.
const recorder = { recorded_by: z.enum(["agent", "server"]).optional() };
export const proposalWorkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), feedback_ids: z.array(z.string().max(150)).max(20).default([]), session_id: z.string().uuid().optional(), ...recorder }).strict(),
  z.object({ action: z.literal("begin"), attempt_id: z.string().uuid(), phase, ...recorder }).strict(),
  z.object({ action: z.literal("end"), attempt_id: z.string().uuid(), span_id: z.string().uuid(), outcome: z.enum(["completed", "failed", "reused"]), ...recorder }).strict(),
  z.object({ action: z.literal("saved"), attempt_id: z.string().uuid(), proposal_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), ...recorder }).strict(),
  z.object({ action: z.literal("handoff"), attempt_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("report"), attempt_id: z.string().uuid() }).strict(),
]);
type Event = { id: string; at: string; action: string; phase?: string; span_id?: string; outcome?: string; proposal_id?: string; feedback_ids?: string[]; recorded_by?: "agent" | "server"; session_id?: string };

export function summarizeProposalWork(events: Event[]) {
  const start = events.find(e => e.action === "start");
  const handoff = events.find(e => e.action === "handoff");
  const saved = events.find(e => e.action === "saved");
  const elapsed = (a?: Event, b?: Event) => a && b ? Date.parse(b.at) - Date.parse(a.at) : null;
  const spans = events.filter(e => e.action === "begin").map(e => {
    const end = events.find(v => v.action === "end" && v.span_id === e.id);
    return { span_id: e.id, phase: e.phase, elapsed_ms: elapsed(e, end), outcome: end?.outcome ?? "open", recorded_by: e.recorded_by ?? "agent" };
  });
  return { capture_started_at: start?.at ?? null, proposal_id: saved?.proposal_id ?? null, recorded_by: start?.recorded_by ?? "agent", session_id: start?.session_id ?? null,
    capture_to_saved_ms: elapsed(start, saved), capture_to_handoff_ms: elapsed(start, handoff), spans,
    coverage: "Agent-marked phases, plus the server's own spans for proposal_create (validation) and motion_graphic_prepare (preparation); capture starts at start call, not original user-message arrival. Spans may overlap; do not sum them as wall time. Unmarked work, tokens and cost remain unknown." };
}

/** Private operational evidence, separate from editorial Memory and timeline history. */
export function proposalWork(projectId: string, raw: unknown) {
  assertProject(projectId);
  const input = proposalWorkSchema.parse(raw);
  const attempt = input.action === "start" ? randomUUID() : input.attempt_id;
  const dir = path.join(profileDir(), "proposal-work", projectId, attempt);
  if (input.action === "start") fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const events: Event[] = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).sort((a, b) => a.at.localeCompare(b.at));
  if (input.action === "report") return { attempt_id: attempt, ...summarizeProposalWork(events) };
  if (files.length >= 500) throw new Error("Attempt event budget reached");
  if (events.some(e => e.action === "handoff")) throw new Error("Attempt is already handed off");
  if (input.action === "end" && (!events.some(e => e.action === "begin" && e.id === input.span_id) || events.some(e => e.action === "end" && e.span_id === input.span_id))) throw new Error("Span must exist and remain open");
  if (input.action === "saved" && events.some(e => e.action === "saved")) throw new Error("Use a new attempt for a revised proposal");
  if (input.action === "handoff" && (!events.some(e => e.action === "saved") || events.some(e => e.action === "begin" && !events.some(end => end.action === "end" && end.span_id === e.id)))) throw new Error("Handoff requires a saved proposal and closed spans");
  const { action, ...data } = input;
  const event: Event = { ...data, id: randomUUID(), at: new Date().toISOString(), action };
  fs.writeFileSync(path.join(dir, `${event.id}.json`), JSON.stringify(event), { flag: "wx" });
  return { attempt_id: attempt, event_id: event.id, ...(action === "begin" ? { span_id: event.id } : {}), ...summarizeProposalWork([...events, event]) };
}
