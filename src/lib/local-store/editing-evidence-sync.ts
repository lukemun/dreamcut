import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { setImmediate as yieldToEditor } from "node:timers/promises";
import { projectsRoot } from "./paths";
import { writeJsonFileAtomic } from "./atomic-json";
import { buildExportEvidence, projectEvidenceClipState } from "./export-evidence";
import { EXPORT_PACKET_SCHEMA, evidenceUploadsAllowed, exportSharingEnabled, installId, sendEditingEvidence } from "./export-sharing";
import { readEnv } from "@/lib/env-name";
import { redactCredentials } from "../observability/agent-activity";
import { cloudAccountStatus } from "./cloud-account";
import { proposalNumericOverridesSchema } from "../agent/proposal-overrides";
import { syncUsageEvidence } from "./usage-evidence-sync";

// Project records are the durable queue. Never copy or delete them for upload retries.
// Only bounded pending batches and acknowledgements are written; the cloud deduplicates job IDs.
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_PACKET_BYTES = 4 * 1024 * 1024; // existing cloud limit is 5 MiB
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_SENDS = 10; // below the existing account ingestion limit (60/hour)
const INTERVAL_MS = 15 * 60 * 1000;
const sources = ["history", "proposals", "memory/events"] as const;
type Kind = typeof sources[number];
type Json = Record<string, unknown>;
type Receipt = { signature: string; hash: string };
type State = { version: 1; records: Record<string, Receipt>; failures: number; retry_at: number; pending?: { body: string; receipts: Record<string, Receipt>; account: string | null } };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const signature = (s: fs.Stats) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(":");
const text = (value: unknown) => typeof value === "string" ? redactCredentials(value)
  .replace(/data:[^\s]+/gi, "[embedded data]")
  .replace(/https?:\/\/[^\s]+/gi, "[link]")
  .replace(/(?:\/Users\/|\/home\/|[A-Z]:[\\/]|\\\\)[^\s]+/gi, "[local path]") : undefined;
function clean(value: unknown): unknown {
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, clean(v)]));
  return value;
}
const emptyEvidence = () => ({ chapters: [], proposals: [], events: [], core_skills: [] });
// History snapshots repeat the whole timeline; most uploads send only what changed since the previous
// snapshot. Every FULL_SNAPSHOT_EVERY-th snapshot (and the first) is sent whole so a reader can
// rebuild any state from the nearest full one.
export const FULL_SNAPSHOT_EVERY = 200;
type Projected = Json & { elements: Json[]; transitions: Json[] };

/** A history record against the previous snapshot: changed or added items, plus removed IDs. */
export function historyRecord(current: Projected, previous: { id: string; record: Projected } | null, full: boolean): Json {
  if (full || !previous) return { ...current, snapshot: "full" };
  const changes = (now: Json[], before: Json[]) => {
    const old = new Map(before.map(item => [String(item.id), JSON.stringify(item)]));
    const ids = new Set(now.map(item => String(item.id)));
    return { changed: now.filter(item => old.get(String(item.id)) !== JSON.stringify(item)), removed: [...old.keys()].filter(id => !ids.has(id)) };
  };
  const elements = changes(current.elements, previous.record.elements);
  const transitions = changes(current.transitions, previous.record.transitions);
  return { ...current, snapshot: "delta", base_record_id: previous.id,
    elements: elements.changed, removed_element_ids: elements.removed,
    transitions: transitions.changed, removed_transition_ids: transitions.removed };
}

/** Explicit projections, never raw snapshots, arbitrary tool results, media or source manifests. */
export function projectEditingRecord(kind: Kind, raw: Json): unknown {
  if (kind === "history") {
    const timeline = object(raw.timeline);
    if (!Array.isArray(timeline.elements)) throw new Error("History snapshot has no timeline.");
    const settings = buildExportEvidence({ ...emptyEvidence(), metadata: raw.metadata }).export_settings;
    return clean({ at: raw.at, operation: raw.op, actor: raw.actor ?? "unknown",
      initiated_by: raw.initiated_by ?? "unknown", attribution_source: raw.attribution_source ?? "unknown",
      transaction_id: raw.transaction_id, proposal_ids: raw.proposal_ids,
      responds_to_feedback_ids: raw.responds_to_feedback_ids, restores_snapshot_id: raw.restores_snapshot_id,
      history_action: raw.history_action,
      settings,
      transitions: (Array.isArray(timeline.transitions) ? timeline.transitions : []).map(value => {
        const transition = object(value);
        const params = object(transition.params);
        return { id: transition.id, from_element_id: transition.from_element_id, to_element_id: transition.to_element_id,
          type: transition.type, duration_seconds: transition.duration_seconds, removed: Boolean(transition.removed_at),
          params: Object.fromEntries(Object.entries(params).filter(([key, value]) =>
            ["direction", "motion", "bezier", "motion_start_progress", "audio_fade_start_progress",
              "audio_fade_duration_seconds", "whip_blur_strength", "whip_zoom_percent", "smear_zoom_percent",
              "smear_travel_percent", "accent_strength", "accent_hold", "page_curl", "page_turn_origin"].includes(key)
            && (typeof value === "number" || typeof value === "string" || Array.isArray(value) && value.every(n => typeof n === "number")))) };
      }),
      // Keep element IDs so snapshots can be compared without uploading source identities.
      elements: timeline.elements.map(e => {
        const element = object(e);
        return { id: element.id, lane_key: element.lane_key, lane_index: element.lane_index,
          source_ref: typeof element.source_url === "string" ? hash(element.source_url) : null,
          ...projectEvidenceClipState(element) };
      }),
    });
  }
  if (kind === "proposals") {
    if (!raw.proposal_id || !object(raw.proposal).summary) throw new Error("Invalid proposal record.");
    return clean(buildExportEvidence({ ...emptyEvidence(), proposals: [raw] }).proposals[0]);
  }
  if (!raw.id || typeof raw.type !== "string") throw new Error("Invalid memory event.");
  const data = object(raw.data);
  const tuning = raw.type === "proposal.tuned" ? proposalNumericOverridesSchema.safeParse(data.overrides) : null;
  return clean({ ...buildExportEvidence({ ...emptyEvidence(), events: [raw] }).events[0], time: raw.time,
    ...(tuning?.success ? { option_id: data.option_id, overrides: tuning.data } : {}) });
}

function directory(dir: string) {
  try { return fs.lstatSync(dir).isDirectory() && !fs.lstatSync(dir).isSymbolicLink(); }
  catch { return false; }
}
function readState(file: string): State {
  if (!fs.existsSync(file)) return { version: 1, records: {}, failures: 0, retry_at: 0 };
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > MAX_STATE_BYTES) throw new Error("Invalid upload acknowledgement file.");
  const state = JSON.parse(fs.readFileSync(file, "utf8")) as State;
  if (state.version !== 1 || !state.records || !Number.isFinite(state.retry_at)) throw new Error("Invalid upload acknowledgement state.");
  return state;
}
function saveState(file: string, state: State) {
  const bytes = Buffer.byteLength(JSON.stringify(state, null, 2)) + 1;
  if (bytes > MAX_STATE_BYTES) throw new Error("Upload acknowledgement limit reached; source records remain pending.");
  // Check the actual project volume before allocating metadata, including atomic replacement overlap.
  const volume = fs.statfsSync(path.dirname(path.dirname(file)));
  if (volume.bavail * volume.bsize < 16 * 1024 * 1024 + bytes * 2) throw new Error("Insufficient space for upload acknowledgements.");
  writeJsonFileAtomic(file, state);
}

let running: Promise<{ sent: number; errors: string[] }> | undefined;
let nextProject = 0;
/** A bounded pass; sources survive every failure, and acknowledgements survive process restarts. */
export function syncEditingEvidence(fetcher?: Fetcher, now = Date.now()) {
  if (running) return running;
  running = syncPass(fetcher, now).finally(() => { running = undefined; });
  return running;
}
async function syncPass(fetcher: Fetcher | undefined, now: number) {
  const result = { sent: 0, errors: [] as string[] };
  if (!evidenceUploadsAllowed() || !exportSharingEnabled()) return result;
  // Profile usage (tool totals, product signals) first: small, and independent of any project.
  try {
    const usage = await syncUsageEvidence(fetcher, now);
    result.sent += usage.sent; result.errors.push(...usage.errors.map(error => `usage: ${error}`));
  } catch (error) { result.errors.push(`usage: ${error instanceof Error ? error.message : "Upload failed"}`); }
  const root = projectsRoot();
  if (!directory(root)) return result;
  const projects = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && /^[A-Za-z0-9._-]{1,128}$/.test(e.name)).map(e => e.name).sort();
  if (!projects.length) return result;
  let attempts = 0;
  const start = nextProject % projects.length;
  for (let i = 0; i < projects.length && attempts < MAX_SENDS; i++) {
    const index = (start + i) % projects.length;
    nextProject = index + 1;
    const project = projects[index]!;
    const dir = path.join(root, project);
    if (!directory(path.join(dir, "memory"))) continue;
    const stateDir = path.join(dir, "memory", "cloud-editing");
    if (fs.existsSync(stateDir) && !directory(stateDir)) continue;
    const stateFile = path.join(stateDir, "state.json");
    try {
      const state = readState(stateFile);
      if (state.retry_at > now) continue;
      const flush = async () => {
        if (!state.pending) return true;
        if (attempts >= MAX_SENDS) return false;
        const account = cloudAccountStatus();
        if (state.pending.account && (!account.signed_in || account.email !== state.pending.account)) return false;
        attempts++;
        try {
          const response = await sendEditingEvidence(state.pending.body, fetcher);
          if (!response) return false;
          if (!response.ok) throw new Error(`Cloud ingestion HTTP ${response.status}`);
          Object.assign(state.records, state.pending.receipts);
          delete state.pending;
          state.failures = 0; state.retry_at = 0;
          saveState(stateFile, state);
          result.sent++;
          return true;
        } catch (error) {
          state.failures++;
          state.retry_at = now + Math.min(24 * 60 * 60 * 1000, INTERVAL_MS * 2 ** Math.min(state.failures - 1, 7));
          saveState(stateFile, state);
          throw error;
        }
      };
      if (!await flush()) return result;
      let batch: unknown[] = [];
      let receipts: Record<string, Receipt> = {};
      let batchBytes = 0;
      const stage = async () => {
        if (!batch.length) return true;
        const digest = hash(JSON.stringify(batch));
        const body = JSON.stringify({ schema: EXPORT_PACKET_SCHEMA, packet_type: "editing_records",
          install_id: installId(), project_id: /^[A-Za-z0-9_-]{1,128}$/.test(project) ? project : `project-${hash(project)}`,
          job_id: `edits-${digest}`, app_version: readEnv("APP_VERSION") ?? process.env.npm_package_version ?? null,
          evidence: { schema: "dreamcut.editing-records.v2", records: batch } });
        if (Buffer.byteLength(body) > MAX_PACKET_BYTES) throw new Error("Projected batch exceeds packet limit; retained locally.");
        const account = cloudAccountStatus();
        state.pending = { body, receipts, account: account.signed_in ? account.email : null };
        saveState(stateFile, state); // freeze exact retry bytes before any network request
        batch = []; receipts = {}; batchBytes = 0;
        return flush();
      };
      for (const kind of sources) {
        const sourceDir = path.join(dir, kind);
        if (!directory(sourceDir)) continue;
        const names = fs.readdirSync(sourceDir).filter(n => n.endsWith(".json")).sort();
        // The previous history snapshot's projection, kept so consecutive uploads read each file once.
        let previous: { name: string; record: Projected } | null = null;
        const projectedAt = (index: number): Projected | null => {
          const name = names[index];
          if (!name) return null;
          if (previous?.name === name) return previous.record;
          try {
            const file = path.join(sourceDir, name);
            if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).size > MAX_SOURCE_BYTES) return null;
            return projectEditingRecord("history", JSON.parse(fs.readFileSync(file, "utf8")) as Json) as Projected;
          } catch { return null; }
        };
        for (const [index, name] of names.entries()) {
          if (attempts >= MAX_SENDS || !exportSharingEnabled() || !evidenceUploadsAllowed()) return result;
          await yieldToEditor();
          const file = path.join(sourceDir, name);
          const stat = fs.lstatSync(file);
          if (!stat.isFile()) continue;
          const id = `${kind}/${name}`;
          if (state.records[id]?.signature === signature(stat)) continue;
          if (stat.size > MAX_SOURCE_BYTES) { result.errors.push(`${project}: source record exceeds read limit (${kind}).`); continue; }
          let record: unknown;
          try { record = projectEditingRecord(kind, JSON.parse(fs.readFileSync(file, "utf8")) as Json); }
          catch { result.errors.push(`${project}: unreadable ${kind} record; retained locally.`); continue; }
          if (kind === "history") {
            // A delta needs its base in the cloud: when the previous record was never sent (too large,
            // unreadable), this one goes as a full snapshot so the history can still be rebuilt.
            const baseId = index > 0 ? `history/${names[index - 1]}` : null;
            const baseStat = baseId ? (() => { try { return fs.lstatSync(path.join(sourceDir, names[index - 1]!)); } catch { return null; } })() : null;
            const baseSent = Boolean(baseId && baseStat && (receipts[baseId] ?? state.records[baseId])?.signature === signature(baseStat));
            const base = baseSent ? projectedAt(index - 1) : null;
            const current = record as Projected;
            record = historyRecord(current, base ? { id: baseId!, record: base } : null, index % FULL_SNAPSHOT_EVERY === 0);
            previous = { name, record: current };
          }
          const digest = hash(JSON.stringify({ id, record }));
          if (state.records[id]?.hash === digest) continue;
          const row = { kind, record_id: id, revision: digest, record };
          const bytes = Buffer.byteLength(JSON.stringify(row));
          if (bytes > MAX_PACKET_BYTES - 4096) { result.errors.push(`${project}: projected record exceeds packet limit (${kind}); retained locally.`); continue; }
          if (batch.length && (batchBytes + bytes > 1024 * 1024 || batch.length >= 100)) {
            if (!await stage()) return result;
          }
          batch.push(row); batchBytes += bytes;
          receipts[id] = { signature: signature(stat), hash: digest };
        }
      }
      if (!await stage()) return result;
    } catch (error) { result.errors.push(`${project}: ${error instanceof Error ? error.message : "Upload failed"}`); }
  }
  return result;
}

const loopKey = Symbol.for("dreamcut.editingEvidenceLoop");
export function startEditingEvidenceSync() {
  if (process.env.NODE_TEST_CONTEXT || process.env.NEXT_PHASE === "phase-production-build") return;
  const shared = globalThis as typeof globalThis & { [loopKey]?: NodeJS.Timeout };
  if (shared[loopKey]) return;
  const tick = () => void syncEditingEvidence().then(result => {
    if (result.errors.length) console.error("[editing-evidence-sync]", result.errors.join("; "));
  }).catch(() => console.error("[editing-evidence-sync] background scan failed"));
  // Startup delay keeps evidence scanning out of the first editor request.
  const initial = setTimeout(tick, 15_000); initial.unref();
  shared[loopKey] = setInterval(tick, INTERVAL_MS); shared[loopKey].unref();
}
