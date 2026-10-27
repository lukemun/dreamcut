import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { profileDir } from "../local-store/editing-memory";
import { redactCredentials } from "./agent-activity";

// The activity journal of docs/architecture/agent-activity.md: what an agent proposed, did and
// reasoned, in order, and what the creator decided, so a review can see where the
// harness let a model down or cost it time. See docs/architecture/desktop-data-layout.md.
// Episodes keep every request, assistant message, reasoning summary, tool call and result,
// tagged with the agent; images the model saw are stored once by hash. Outcomes (tuning,
// approval, rejection) join to episodes by proposal id; the project's own history records
// what the creator then did to the timeline. Only credentials are removed and the home
// folder is shortened to `~`.
const RETENTION_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_RECORD_BYTES = 20 * 1024 * 1024;
const HOME = os.homedir();

export function activityJournalDir() { return path.join(profileDir(), "activity-journal"); }

const recordSchema = z.object({
  seq: z.number().int().min(0),
  at: z.string().datetime(),
  type: z.enum(["episode_start", "snapshot", "user", "assistant_text", "reasoning", "model", "tool_call", "tool_result", "episode_end"]),
  data: z.unknown(),
}).strict();
export const episodeBatchSchema = z.object({
  episode_id: z.string().uuid(),
  records: z.array(recordSchema).min(1).max(500),
}).strict();

const IMAGE_DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i;
const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Store image bytes once by hash and return the reference that replaces them. */
let journalRoot = activityJournalDir;
function storeImage(base64: string, mime: string) {
  const bytes = Buffer.from(base64, "base64");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const dir = path.join(journalRoot(), "media");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${sha}.${EXTENSION[mime.toLowerCase()] ?? "bin"}`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { mode: 0o600 });
  return { media_sha256: sha, mime_type: mime };
}

/** Images become media references; strings lose credentials and the home folder. */
function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    const image = IMAGE_DATA_URL.exec(value);
    if (image) return storeImage(image[2]!, image[1]!);
    return redactCredentials(value.split(HOME).join("~"));
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    // MCP image content: {type: "image", data, mimeType}.
    if (object.type === "image" && typeof object.data === "string" && typeof object.mimeType === "string") {
      return { type: "image", ...storeImage(object.data, object.mimeType) };
    }
    return Object.fromEntries(Object.entries(object).map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

/** Snapshot contents (instructions, tool schemas) are stored once and referenced by hash. */
function storeSnapshot(data: unknown) {
  const text = JSON.stringify(normalize(data));
  const sha = createHash("sha256").update(text).digest("hex");
  const dir = path.join(journalRoot(), "snapshots");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${sha}.json`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, text, { mode: 0o600 });
  return { snapshot_sha256: sha, kind: (data as { kind?: unknown } | null)?.kind ?? null };
}

export function recordEpisodeBatch(raw: unknown, journalDir = activityJournalDir()) {
  const batch = episodeBatchSchema.parse(raw);
  const dir = path.join(journalDir, "episodes");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${batch.episode_id}.jsonl`);
  const fresh = !fs.existsSync(file);
  journalRoot = () => journalDir; // blobs sit beside the episodes they belong to
  const lines = batch.records.map(record => {
    const data = record.type === "snapshot" ? storeSnapshot(record.data) : normalize(record.data);
    const line = JSON.stringify({ ...record, data });
    if (Buffer.byteLength(line) > MAX_RECORD_BYTES) return JSON.stringify({ ...record, data: { omitted: "record exceeds 20 MB" } });
    return line;
  });
  fs.appendFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
  if (fresh) prune(journalDir);
  return { recorded: batch.records.length };
}

export const activityOutcomeSchema = z.object({
  project_id: z.string().max(128),
  proposal_id: z.string().max(128),
  event: z.enum(["tuned", "approved", "rejected", "superseded"]),
  option_id: z.string().max(64).optional(),
  data: z.unknown(),
}).strict();

/** A creator's decision on a proposal, joined to the episode that made it by proposal id. */
export function recordActivityOutcome(raw: z.input<typeof activityOutcomeSchema>) {
  const outcome = activityOutcomeSchema.parse(raw);
  const at = new Date().toISOString();
  const dir = path.join(activityJournalDir(), "outcomes");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.appendFileSync(path.join(dir, `${at.slice(0, 10)}.jsonl`), JSON.stringify({ at, ...outcome, data: normalize(outcome.data) }) + "\n", { mode: 0o600 });
}

/** Outcome capture never blocks the creator's action. */
export function safeActivityOutcome(raw: z.input<typeof activityOutcomeSchema>) {
  try { recordActivityOutcome(raw); } catch { /* A lost record never changes an edit. */ }
}

/** Keep the store under its byte budget, removing the oldest episodes first. Media is shared and kept. */
function prune(journalDir: string) {
  const dir = path.join(journalDir, "episodes");
  const files = fs.readdirSync(dir).map(name => ({ name, stat: fs.statSync(path.join(dir, name)) })).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  let bytes = 0;
  for (const [index, file] of files.entries()) {
    bytes += file.stat.size;
    if (index > 0 && bytes > RETENTION_BYTES) fs.rmSync(path.join(dir, file.name));
  }
}

export type EpisodeRecord = z.infer<typeof recordSchema>;

/** One episode in order, for inspection and export. */
export function readEpisode(episodeId: string, dir = activityJournalDir()): EpisodeRecord[] {
  if (!/^[0-9a-f-]{36}$/.test(episodeId)) throw new Error("Invalid episode id");
  const file = path.join(dir, "episodes", `${episodeId}.jsonl`);
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as EpisodeRecord)
    .sort((a, b) => a.seq - b.seq);
}

function episodeSummary(episodeId: string, dir: string) {
    const records = readEpisode(episodeId, dir);
    const start = (records.find(record => record.type === "episode_start")?.data ?? {}) as Record<string, unknown>;
    const end = (records.find(record => record.type === "episode_end")?.data ?? {}) as Record<string, unknown>;
    const user = (records.find(record => record.type === "user")?.data ?? {}) as Record<string, unknown>;
    return { episode_id: episodeId, started_at: String(start.started_at ?? records[0]?.at ?? ""), project_id: String(start.project_id ?? ""), agent: String(start.agent ?? ""),
      status: typeof end.status === "string" ? end.status : "open", request: typeof user.display === "string" ? user.display : "", proposal_ids: Array.isArray(end.proposal_ids) ? end.proposal_ids as string[] : [],
      eval: start.eval as Record<string, unknown> | undefined, tool_calls: records.filter(record => record.type === "tool_call").length };
}

// Cache only listing projections, never event bodies. Serialized values both bound retained
// bytes and give each caller its own object. Appends and atomic replacements invalidate.
const episodeSummaries = new Map<string, { stamp: string; text: string; bytes: number }>();
let episodeSummaryBytes = 0;
const SUMMARY_CACHE_BYTES = 2 * 1024 * 1024;
function episodeStamp(file: string) {
  const s = fs.statSync(file, { bigint: true });
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
}
function listedEpisode(file: string, episodeId: string, dir: string, scanCache: ReadonlyMap<string, { stamp: string; text: string; bytes: number }>): ReturnType<typeof episodeSummary> {
  const stamp = episodeStamp(file), cached = scanCache.get(file) ?? episodeSummaries.get(file);
  if (cached?.stamp === stamp) {
    if (episodeSummaries.get(file) === cached) { episodeSummaries.delete(file); episodeSummaries.set(file, cached); }
    const summary = JSON.parse(cached.text) as ReturnType<typeof episodeSummary>;
    return { ...summary, eval: summary.eval };
  }
  const retained = episodeSummaries.get(file);
  if (retained) { episodeSummaries.delete(file); episodeSummaryBytes -= retained.bytes; }
  const summary = episodeSummary(episodeId, dir);
  const text = JSON.stringify(summary), bytes = Buffer.byteLength(text);
  if (bytes <= 64 * 1024 && episodeStamp(file) === stamp) {
    episodeSummaries.set(file, { stamp, text, bytes }); episodeSummaryBytes += bytes;
    while (episodeSummaries.size > 128 || episodeSummaryBytes > SUMMARY_CACHE_BYTES) {
      const oldest = episodeSummaries.keys().next().value!;
      episodeSummaryBytes -= episodeSummaries.get(oldest)!.bytes; episodeSummaries.delete(oldest);
    }
  }
  return summary;
}

/** Every episode's header, newest first, for listing. */
export function listEpisodes(dir = activityJournalDir()) {
  const episodes = path.resolve(dir, "episodes");
  if (!fs.existsSync(episodes)) return [];
  // Preserve this scan's reusable summaries even if an earlier miss evicts them.
  const scanCache = new Map(episodeSummaries);
  return fs.readdirSync(episodes).filter(name => name.endsWith(".jsonl"))
    .map(name => listedEpisode(path.join(episodes, name), name.slice(0, -6), dir, scanCache))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Creator decisions on the given proposals, oldest first. */
export function readOutcomes(proposalIds: readonly string[], dir = activityJournalDir()) {
  const outcomes = path.join(dir, "outcomes");
  if (!fs.existsSync(outcomes) || !proposalIds.length) return [];
  const wanted = new Set(proposalIds);
  return fs.readdirSync(outcomes).filter(name => name.endsWith(".jsonl")).sort().flatMap(name =>
    fs.readFileSync(path.join(outcomes, name), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as { at: string; proposal_id: string; event: string; option_id?: string; data: unknown })
      .filter(outcome => wanted.has(outcome.proposal_id)));
}
