import { createHash } from "node:crypto";
import { z } from "zod";
import { redactActivity, type Activity } from "./agent-activity";

export const activityRetroSelectionSchema = z.object({
  mode: z.enum(["export", "standalone"]).default("export"),
  project_id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).optional(),
  checkpoint_id: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/).optional(),
  task_id: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/).optional(),
  task_description: z.string().min(10).max(1000).optional(),
  selections: z.array(z.object({
    session: z.string().regex(/^[a-f0-9]{24}$/),
    call_event_id: z.string().regex(/^[a-f0-9]{24}$/),
    role: z.enum(["editing", "media-preparation", "verification", "delivery"]),
    relevance: z.string().min(10).max(1000),
  }).strict()).min(1).max(24),
}).strict().superRefine((value, ctx) => {
  if (value.mode === "export" && (!value.project_id || !value.checkpoint_id)) ctx.addIssue({ code: "custom", message: "Export mode requires project_id and checkpoint_id" });
  if (value.mode === "standalone" && (!value.task_id || !value.task_description || value.checkpoint_id)) ctx.addIssue({ code: "custom", message: "Standalone mode requires task_id and task_description and cannot claim an export checkpoint" });
});
export type ActivityRetroSelection = z.input<typeof activityRetroSelectionSchema>;
export type ActivitySessionEvidence = { events: Activity[]; gaps: number; pending_bytes: number };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Explicit editorial scope is supplied by the reviewing agent, never inferred from a chat's last project. */
export function buildActivityRetroPacket(input: {
  selection: ActivityRetroSelection; checkpoint?: { id: string; revision: string; checkpoint: Record<string, unknown> };
  learning: boolean; agentRetros: boolean; exportCompleted: boolean; standaloneRequested?: boolean;
  sessions: Record<string, ActivitySessionEvidence>;
}) {
  const selection = activityRetroSelectionSchema.parse(input.selection);
  if (selection.mode === "export") {
    if (!input.learning || !input.agentRetros) throw new Error("Tool-candidate review is disabled by learning/retro settings");
    if (!input.checkpoint || input.checkpoint.id !== selection.checkpoint_id || input.checkpoint.checkpoint.trigger !== "export" || !input.exportCompleted) {
      throw new Error("A completed export and its matching checkpoint are required");
    }
  } else if (!input.standaloneRequested) throw new Error("Standalone review requires an explicit request; use --standalone for that request");
  const seen = new Set<string>();
  const evidence = selection.selections.map(item => {
    const key = `${item.session}:${item.call_event_id}`;
    if (seen.has(key)) throw new Error("Duplicate selected call");
    seen.add(key);
    const session = input.sessions[item.session];
    if (!session) throw new Error("Selected session is unavailable");
    const events = [...new Map(session.events.map(event => [event.id, event])).values()];
    const call = events.find(event => event.id === item.call_event_id && event.kind === "call");
    if (!call || call.call_id === "unknown") throw new Error("Selected call is missing or has no usable native identity");
    const results = events.filter(event => event.kind === "result" && event.call_id === call.call_id);
    if (results.length > 1) throw new Error("Ambiguous result identity; narrow or repair the source adapter");
    const result = results[0];
    return {
      session: item.session, role: item.role, relevance: redactActivity(item.relevance),
      relevance_basis: "reviewing-agent-selected" as const,
      call: { ...call, input: redactActivity(call.input ?? "").slice(0, 6000), truncated: Boolean(call.truncated || (call.input?.length ?? 0) > 6000) },
      result: result ? { ...result, output: redactActivity(result.output ?? "").slice(0, 4000), truncated: Boolean(result.truncated || (result.output?.length ?? 0) > 4000) } : null,
      session_coverage: { gaps: session.gaps, pending_bytes: session.pending_bytes },
      source_event_hashes: { call: digest(call), result: result ? digest(result) : null },
    };
  });
  const body = {
    version: 2, purpose: "chat-only-tool-candidate-review", mode: selection.mode,
    project_id: selection.project_id ?? null,
    task_id: selection.mode === "standalone" ? selection.task_id : null,
    task_description: selection.mode === "standalone" ? redactActivity(selection.task_description!) : null,
    checkpoint_id: selection.mode === "export" ? selection.checkpoint_id : null,
    checkpoint_revision: selection.mode === "export" ? input.checkpoint!.revision : null,
    checkpoint_hash: selection.mode === "export" ? digest(input.checkpoint!.checkpoint) : null, evidence,
    limitations: ["Explicit selection is agent attribution, not automatic proof of relevance.",
      "Snapshot of selected activity at packet creation; may include delivery verification after the export checkpoint.",
      "Missing results and session capture gaps stay unknown. Command text alone does not prove execution or a missing capability.",
      "No automatic candidate decision, UI finding, skill change, preference update or modification of the original export checkpoint."],
  };
  return { ...body, packet_id: digest(body) };
}
