import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { activityJournalDir } from "../observability/activity-journal";

/**
 * Read-only evidence index for learning reviews of one project. It points at the records a
 * review reads instead of copying them: canonical project records (feedback events, proposals,
 * history, retros), the activity journal's episodes for this project (each agent turn in order,
 * with the proposals it staged) and creator outcomes on those proposals, plus the desktop
 * chat's per-conversation tool journals and the agents' own transcripts (tool traces, token
 * usage). It never includes prompt or transcript text.
 */

export type AgentProvider = "claude" | "codex";
export type ConversationEvidence = {
  provider: AgentProvider;
  state: "current" | "archived";
  archiveId: string | null;
  journal: string;
  threadId: string | null;
  toolCalls: number;
  byTool: Record<string, number>;
  byStatus: Record<string, number>;
  modelCalls: number;
  /** Tool calls whose outcome is not settled; these block a new conversation. */
  unsettled: number;
  transcript: { path: string; userTurns: number; tokens: Record<string, number> } | null;
};
export type EpisodeEvidence = {
  episodeId: string;
  path: string;
  provider: string | null;
  agent: string | null;
  model: string | null;
  startedAt: string | null;
  status: string | null;
  toolCalls: number;
  byTool: Record<string, number>;
  /** Calls whose result was an error, including rejected arguments. */
  failedCalls: number;
  proposalIds: string[];
};
export type LearningEvidence = {
  projectId: string;
  projectDir: string;
  /** Agent turns recorded for this project, oldest first, and creator decisions on their proposals. */
  journal: { directory: string; found: boolean; episodes: EpisodeEvidence[]; outcomes: Array<{ at: string; proposalId: string; event: string; optionId: string | null }> };
  project: {
    memoryEvents: Array<{ path: string; sha256: string; type: string | null; recordedAt: string | null }>;
    proposals: number;
    historySnapshots: number;
    retros: number;
  };
  desktop: { userData: string; found: boolean; conversations: ConversationEvidence[] };
  limits: string[];
};

const LIMITS = [
  "Episodes exist only for turns sent after the activity journal shipped (2026-10-10); earlier turns have just a conversation journal and transcript.",
  "Session-closeout hook receipts are not produced by the desktop chat (it runs without hooks or a shell); run closeout from a coding agent.",
  "Paths reference private local records; read them in place and do not commit or paste transcripts.",
  "Token totals come from each agent's own transcript; providers count and cache differently.",
];

/** Electron's userData for the desktop app (unpackaged dev and packaged builds share it). */
export function desktopUserDataDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform, home = os.homedir()) {
  if (env.DREAMCUT_USER_DATA) return path.resolve(env.DREAMCUT_USER_DATA);
  if (platform === "win32") return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), "DreamCut");
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "DreamCut");
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "DreamCut");
}

/** The desktop host keys a project's journals and conversations by its real path. */
export function desktopProjectKey(projectDir: string) {
  return createHash("sha256").update(fs.realpathSync(projectDir)).digest("hex");
}

/** Claude Code stores transcripts under ~/.claude/projects/<cwd with non-alphanumerics as dashes>. */
export function claudeTranscriptDir(workspace: string, home = os.homedir()) {
  return path.join(home, ".claude", "projects", workspace.replace(/[^A-Za-z0-9]/g, "-"));
}

const sha256File = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file: string): unknown => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const listFiles = (dir: string, pattern = /\.json$/) => { try { return fs.readdirSync(dir).filter(name => pattern.test(name)).sort().map(name => path.join(dir, name)); } catch { return []; } };
const lines = (file: string) => { try { return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean); } catch { return []; } };

function claudeTranscript(file: string) {
  const usageById = new Map<string, Record<string, number>>();
  let userTurns = 0;
  for (const entry of lines(file)) {
    const message = entry.message ?? {};
    if (entry.type === "user" && entry.parent_tool_use_id == null) {
      const content = message.content;
      if (typeof content === "string" || (Array.isArray(content) && content.some((block: { type?: string }) => block?.type === "text"))) userTurns++;
    }
    // Streaming repeats one message's usage on several lines; keep the last per message id.
    if (entry.type === "assistant" && message.usage && message.id) usageById.set(message.id, message.usage);
  }
  const tokens: Record<string, number> = {};
  for (const usage of usageById.values()) for (const [key, value] of Object.entries(usage)) if (typeof value === "number") tokens[key] = (tokens[key] ?? 0) + value;
  return { path: file, userTurns, tokens };
}

function codexTranscript(threadId: string, home = os.homedir()) {
  const root = path.join(home, ".codex", "sessions");
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || found.length) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith(`${threadId}.jsonl`)) { found.push(full); return; }
    }
  };
  walk(root, 0);
  if (!found.length) return null;
  let userTurns = 0, tokens: Record<string, number> = {};
  for (const entry of lines(found[0])) {
    const payload = entry.payload ?? {};
    if (entry.type === "event_msg" && payload.type === "task_started") userTurns++;
    if (payload.type === "token_count" && payload.info?.total_token_usage) tokens = payload.info.total_token_usage;
  }
  return { path: found[0], userTurns, tokens };
}

function conversation(provider: AgentProvider, journalDir: string, state: ConversationEvidence["state"], archiveId: string | null, ownershipFile: string | null, userData: string, key: string, home: string): ConversationEvidence | null {
  const checkpoint = readJson(path.join(journalDir, "checkpoint.json")) as { operations?: Array<{ id?: string; tool?: string; status?: string }>; budgets?: { used?: Record<string, number> } } | null;
  if (!checkpoint) return null;
  const operations = checkpoint.operations ?? [];
  const byTool: Record<string, number> = {}, byStatus: Record<string, number> = {};
  for (const operation of operations) {
    byTool[operation.tool ?? "unknown"] = (byTool[operation.tool ?? "unknown"] ?? 0) + 1;
    byStatus[operation.status ?? "unknown"] = (byStatus[operation.status ?? "unknown"] ?? 0) + 1;
  }
  const ownership = ownershipFile ? readJson(ownershipFile) as { threadId?: string } | null : null;
  // Codex operation ids begin with the thread id; Claude's thread id is its saved session.
  const threadId = ownership?.threadId ?? operations.find(operation => operation.id?.includes(":"))?.id?.split(":")[0] ?? null;
  let transcript: ConversationEvidence["transcript"] = null;
  if (threadId && provider === "claude") {
    const file = path.join(claudeTranscriptDir(path.join(userData, "claude-workspaces", key), home), `${threadId}.jsonl`);
    if (fs.existsSync(file)) transcript = claudeTranscript(file);
  } else if (threadId) transcript = codexTranscript(threadId, home);
  return {
    provider, state, archiveId, journal: journalDir, threadId, toolCalls: operations.length, byTool, byStatus,
    modelCalls: checkpoint.budgets?.used?.model_calls ?? 0,
    unsettled: operations.filter(operation => !["completed", "not_executed"].includes(operation.status ?? "")).length,
    transcript,
  };
}

/** Episodes whose first record names this project, with per-episode call counts and staged proposals. */
function journalEpisodes(journalDir: string, projectId: string): EpisodeEvidence[] {
  const episodes: EpisodeEvidence[] = [];
  for (const file of listFiles(path.join(journalDir, "episodes"), /\.jsonl$/)) {
    const records = lines(file) as Array<{ type?: string; data?: Record<string, unknown> }>;
    const start = records.find(record => record.type === "episode_start")?.data;
    if (start?.project_id !== projectId) continue;
    const end = records.find(record => record.type === "episode_end")?.data;
    const byTool: Record<string, number> = {};
    let failed = 0;
    for (const record of records) {
      if (record.type === "tool_call") byTool[String(record.data?.tool ?? "unknown")] = (byTool[String(record.data?.tool ?? "unknown")] ?? 0) + 1;
      if (record.type === "tool_result" && (record.data?.error !== undefined || (record.data?.result as { isError?: boolean } | undefined)?.isError)) failed++;
    }
    episodes.push({
      episodeId: path.basename(file, ".jsonl"), path: file,
      provider: typeof start.provider === "string" ? start.provider : null, agent: typeof start.agent === "string" ? start.agent : null,
      model: typeof records.find(record => record.type === "model")?.data?.model === "string" ? String(records.find(record => record.type === "model")!.data!.model) : typeof start.model === "string" ? start.model : null,
      startedAt: typeof start.started_at === "string" ? start.started_at : null, status: typeof end?.status === "string" ? end.status : null,
      toolCalls: Object.values(byTool).reduce((sum, count) => sum + count, 0), byTool, failedCalls: failed,
      proposalIds: Array.isArray(end?.proposal_ids) ? end.proposal_ids.filter((id): id is string => typeof id === "string") : [],
    });
  }
  return episodes.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
}

function journalOutcomes(journalDir: string, projectId: string) {
  return listFiles(path.join(journalDir, "outcomes"), /\.jsonl$/).flatMap(file => lines(file) as Array<Record<string, unknown>>)
    .filter(outcome => outcome.project_id === projectId)
    .map(outcome => ({ at: String(outcome.at), proposalId: String(outcome.proposal_id), event: String(outcome.event), optionId: typeof outcome.option_id === "string" ? outcome.option_id : null }));
}

export function collectLearningEvidence(projectDir: string, { userData = desktopUserDataDir(), home = os.homedir(), journalDir = activityJournalDir() } = {}): LearningEvidence {
  const resolved = fs.realpathSync(projectDir);
  const projectId = path.basename(resolved);
  const memoryEvents = listFiles(path.join(resolved, "memory", "events")).map(file => {
    const event = readJson(file) as { type?: string; event_type?: string; recorded_at?: string; created_at?: string } | null;
    return { path: file, sha256: sha256File(file), type: event?.type ?? event?.event_type ?? null, recordedAt: event?.recorded_at ?? event?.created_at ?? null };
  });
  const key = desktopProjectKey(resolved);
  const conversations: ConversationEvidence[] = [];
  for (const provider of ["claude", "codex"] as const) {
    const current = conversation(provider, path.join(userData, `${provider}-editing-journals`, key), "current", null, path.join(userData, `${provider}-sessions`, `${key}.json`), userData, key, home);
    if (current) conversations.push(current);
    const archives = path.join(userData, `${provider}-conversation-archives`, key);
    let archiveIds: string[] = [];
    try { archiveIds = fs.readdirSync(archives).sort(); } catch { /* No archived conversations. */ }
    for (const archiveId of archiveIds) {
      const dir = path.join(archives, archiveId);
      const archived = conversation(provider, path.join(dir, "journal"), "archived", archiveId, path.join(dir, "ownership.json"), userData, key, home);
      if (archived) conversations.push(archived);
    }
  }
  return {
    projectId,
    projectDir: resolved,
    journal: { directory: journalDir, found: fs.existsSync(journalDir), episodes: journalEpisodes(journalDir, projectId), outcomes: journalOutcomes(journalDir, projectId) },
    project: {
      memoryEvents,
      proposals: listFiles(path.join(resolved, "proposals")).length,
      historySnapshots: listFiles(path.join(resolved, "history")).length,
      retros: listFiles(path.join(resolved, "memory", "retros")).length,
    },
    desktop: { userData, found: fs.existsSync(userData), conversations },
    limits: LIMITS,
  };
}
