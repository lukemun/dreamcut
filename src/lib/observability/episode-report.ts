import fs from "node:fs";
import path from "node:path";
import { projectHistoryDir, projectProposalPath } from "../local-store/paths";
import { activityJournalDir, readEpisode, readOutcomes, type EpisodeRecord } from "./activity-journal";

// One activity-journal episode as a readable timeline for a learning review: the request,
// the agent's reasoning and calls in order, the proposals it staged, what the creator decided,
// and the creator's own later edits to the clips the proposals touched.
const LATER_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_LATER_EDITS = 20;

type Outcome = ReturnType<typeof readOutcomes>[number];
export type LaterEdit = { at: string; op: string; actor: string; label: string | null; changed_elements: string[] };
export type EpisodeContext = {
  outcomes: Outcome[];
  /** Element ids each staged proposal changes, read from the project's proposal record. */
  proposals: Record<string, { elements: string[]; status: string | null }>;
  later_edits: LaterEdit[];
  limits: string[];
};

const data = (record: EpisodeRecord | undefined) => (record?.data ?? {}) as Record<string, unknown>;
const readJson = (file: string): unknown => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };

/** Element ids a proposal's options touch. */
function proposalElements(projectId: string, proposalId: string) {
  const record = readJson(projectProposalPath(projectId, proposalId)) as { status?: string; proposal?: { options?: Array<{ operations?: Array<{ element_id?: string }> }> } } | null;
  if (!record) return null;
  const elements = new Set<string>();
  for (const option of record.proposal?.options ?? []) for (const operation of option.operations ?? []) if (typeof operation.element_id === "string") elements.add(operation.element_id);
  return { elements: [...elements], status: record.status ?? null };
}

/** The creator's own timeline writes after the episode that change the proposals' clips. */
function laterEdits(projectId: string, endedAt: string, touched: Set<string>): LaterEdit[] {
  const dir = projectHistoryDir(projectId);
  if (!fs.existsSync(dir) || !touched.size) return [];
  const files = fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort();
  const edits: LaterEdit[] = [];
  let previous: Record<string, string> | null = null;
  const elementsOf = (snapshot: { timeline?: { elements?: Array<{ id: string }> } } | null) =>
    Object.fromEntries((snapshot?.timeline?.elements ?? []).filter(element => touched.has(element.id)).map(element => [element.id, JSON.stringify(element)]));
  const end = Date.parse(endedAt);
  for (const name of files) {
    const snapshot = readJson(path.join(dir, name)) as { at?: string; op?: string; actor?: string; label?: string; timeline?: { elements?: Array<{ id: string }> } } | null;
    if (!snapshot?.at) continue;
    const current = elementsOf(snapshot);
    const at = Date.parse(snapshot.at);
    if (at > end && at - end <= LATER_EDIT_WINDOW_MS && snapshot.actor === "human" && previous) {
      const changed = [...touched].filter(id => (previous![id] ?? null) !== (current[id] ?? null));
      if (changed.length) edits.push({ at: snapshot.at, op: snapshot.op ?? "?", actor: snapshot.actor, label: snapshot.label ?? null, changed_elements: changed });
      if (edits.length >= MAX_LATER_EDITS) break;
    }
    previous = current;
  }
  return edits;
}

export function loadEpisodeContext(records: EpisodeRecord[], journalDir = activityJournalDir()): EpisodeContext {
  const start = data(records.find(record => record.type === "episode_start"));
  const end = records.find(record => record.type === "episode_end");
  const projectId = typeof start.project_id === "string" ? start.project_id : "";
  const proposalIds = (Array.isArray(data(end).proposal_ids) ? data(end).proposal_ids as string[] : []);
  const limits: string[] = [];
  const proposals: EpisodeContext["proposals"] = {};
  const touched = new Set<string>();
  for (const id of proposalIds) {
    let found: ReturnType<typeof proposalElements> = null;
    try { found = proposalElements(projectId, id); } catch { found = null; }
    if (!found) { limits.push(`Proposal ${id} is not in this machine's projects folder; its clips and status are unknown.`); continue; }
    proposals[id] = found;
    for (const element of found.elements) touched.add(element);
  }
  if (!end) limits.push("The episode has no end record; the turn was interrupted or is still running.");
  let later: LaterEdit[] = [];
  try { later = end ? laterEdits(projectId, end.at, touched) : []; } catch { limits.push("Project history could not be read."); }
  return { outcomes: readOutcomes(proposalIds, journalDir), proposals, later_edits: later, limits };
}

const clip = (value: unknown, max: number) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;
};
const offset = (from: string, to: string) => {
  const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

/** A short account of a tool result: its error, or its size and the proposal it staged. */
function resultSummary(record: Record<string, unknown>, full: boolean) {
  if (typeof record.error === "string") return `✗ threw: ${clip(record.error, 200)}`;
  const result = record.result as { isError?: boolean; content?: Array<{ type?: string; text?: string; media_sha256?: string }> } | undefined;
  const text = (result?.content ?? []).filter(block => block.type === "text" || typeof block.text === "string").map(block => block.text ?? "").join("\n");
  const images = (result?.content ?? []).filter(block => block.media_sha256 || block.type === "image").length;
  if (result?.isError) return `✗ ${clip(text, full ? Infinity : 400)}`;
  let staged = "";
  try { const id = JSON.parse(text)?.proposal_id; if (typeof id === "string") staged = ` → proposal ${id}`; } catch { /* Not a proposal result. */ }
  return `ok${staged}${images ? ` · ${images} image${images === 1 ? "" : "s"}` : ""} · ${clip(text, full ? Infinity : 160)}`;
}

export function renderEpisode(episodeId: string, records: EpisodeRecord[], context: EpisodeContext, { full = false } = {}) {
  const start = data(records.find(record => record.type === "episode_start"));
  const end = data(records.find(record => record.type === "episode_end"));
  const user = data(records.find(record => record.type === "user"));
  const model = data([...records].reverse().find(record => record.type === "model")).model ?? start.model ?? "default model";
  const startedAt = String(start.started_at ?? records[0]?.at ?? "");
  const endedAt = records.find(record => record.type === "episode_end")?.at;
  const lines: string[] = [];
  lines.push(`Episode ${episodeId} · ${start.agent ?? start.provider} (${model}) · project ${start.project_id} · ${startedAt.replace("T", " ").slice(0, 19)}`);
  lines.push(`Ended: ${end.status ?? "open"}${endedAt ? ` after ${offset(startedAt, endedAt)}` : ""}${typeof end.dropped_records === "number" && end.dropped_records ? ` · ${end.dropped_records} records lost` : ""}`);
  const evaluation = start.eval as { case?: string; run?: number; request?: string } | undefined;
  if (evaluation) lines.push(`Eval: ${evaluation.case} run ${evaluation.run ?? "?"} · ${end.eval_pass === true ? "pass" : end.eval_pass === false ? "fail" : "unscored"}`);
  lines.push(`Request: ${clip(user.display ?? user.sent ?? "", full ? Infinity : 500)}`);
  if (Array.isArray(user.attachments) && user.attachments.length) lines.push(`Attachments: ${clip(user.attachments, 300)}`);
  const snapshot = data(records.find(record => record.type === "snapshot"));
  if (snapshot.snapshot_sha256) lines.push(`Contract: snapshots/${String(snapshot.snapshot_sha256).slice(0, 12)}…`);
  lines.push("");
  for (const record of records) {
    const at = offset(startedAt, record.at);
    const body = record.data as Record<string, unknown>;
    switch (record.type) {
      case "reasoning": lines.push(`${at}  thinking   ${clip(body.text, full ? Infinity : 400)}`); break;
      case "assistant_text": lines.push(`${at}  says       ${clip(body.text, full ? Infinity : 500)}`); break;
      case "tool_call": lines.push(`${at}  call       ${body.tool} ${clip(body.arguments, full ? Infinity : 300)}`); break;
      case "tool_result": lines.push(`${at}  result     ${body.tool}: ${resultSummary(body, full)}`); break;
      case "model": lines.push(`${at}  model      ${body.model}`); break;
      default: break;
    }
  }
  lines.push("");
  const proposalIds = Array.isArray(end.proposal_ids) ? end.proposal_ids as string[] : [];
  if (proposalIds.length) {
    lines.push("Proposals staged:");
    for (const id of proposalIds) {
      const known = context.proposals[id];
      lines.push(`  ${id}${known ? ` · ${known.status ?? "?"} · clips ${known.elements.join(", ") || "none"}` : " · not on this machine"}`);
    }
  } else lines.push("Proposals staged: none");
  if (context.outcomes.length) {
    lines.push("Creator decisions:");
    for (const outcome of context.outcomes) lines.push(`  ${outcome.at.replace("T", " ").slice(0, 19)}  ${outcome.event}${outcome.option_id ? ` option ${outcome.option_id}` : ""} · ${clip(outcome.data, full ? Infinity : 300)}`);
  } else if (proposalIds.length) lines.push("Creator decisions: none recorded yet");
  if (context.later_edits.length) {
    lines.push("Creator's later edits to those clips:");
    for (const edit of context.later_edits) lines.push(`  ${edit.at.replace("T", " ").slice(0, 19)}  ${edit.op}${edit.label ? ` · ${edit.label}` : ""} · ${edit.changed_elements.join(", ")}`);
  }
  if (typeof end.final_text === "string" && end.final_text) lines.push("", `Reply: ${clip(end.final_text, full ? Infinity : 800)}`);
  for (const limit of context.limits) lines.push(`Note: ${limit}`);
  return lines.join("\n");
}

export function episodeReport(episodeId: string, { journalDir = activityJournalDir(), full = false } = {}) {
  const records = readEpisode(episodeId, journalDir);
  const context = loadEpisodeContext(records, journalDir);
  return { records, context, text: renderEpisode(episodeId, records, context, { full }) };
}
