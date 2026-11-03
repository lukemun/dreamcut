/** Keeps the profile's style (STYLE.md, preferences.json, personal-styles/) in step with the signed-in
 * DreamCut account. The account copy is authoritative; the profile is the cache agents and the editor
 * read. Writes carry the last synced revision; a stale write adopts the account copy and keeps the
 * local version as a dated conflict file. Nothing is merged silently. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { editingProfileSchema, profileDir, readPersonalStyleDocument, savePersonalStyleDocument } from "./editing-memory";
import { initialStyle, rememberStyle, withStyleLock, writeStyleText } from "./style-document";
import { personalStyleSchema, type PersonalStyle } from "./personal-style-schema";
import { CloudSignedOutError, cloudAccountStatus, cloudFetch, isCloudSignedIn, type Fetcher } from "./cloud-account";
import { onLocalStyleChanged } from "./style-change-signal";

export type StylePayload = { markdown: string; preferences: Record<string, unknown> | null; templates: PersonalStyle[] };
type RemoteStyle = StylePayload & { revision: number; updated_at: string | null };
const syncStateSchema = z.object({
  account: z.string(), revision: z.number().int().min(0), hash: z.string(), synced_at: z.string(),
  error: z.string().optional(), error_at: z.string().optional(),
});
export type StyleSyncState = z.infer<typeof syncStateSchema>;
export type StyleSyncResult =
  | { outcome: "signed_out" | "unchanged" | "pushed" | "pulled" | "uploaded_first"; revision?: number }
  | { outcome: "conflict"; revision: number; conflict_id: string | null }
  | { outcome: "failed"; error: string };

const syncDir = () => path.join(profileDir(), "cloud-sync");
const statePath = () => path.join(syncDir(), "style.json");
const conflictsDir = () => path.join(profileDir(), "style-conflicts");
const templatesDir = () => path.join(profileDir(), "personal-styles");

/** Stable JSON: key order does not change the hash (the Cloud stores JSON with its own key order). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
export const stylePayloadHash = (payload: StylePayload) => createHash("sha256").update(canonical({
  markdown: payload.markdown, preferences: payload.preferences, templates: [...payload.templates].sort((a, b) => String(a?.id).localeCompare(String(b?.id))),
})).digest("hex");

function readLocalTemplates(): PersonalStyle[] {
  if (!fs.existsSync(templatesDir())) return [];
  return fs.readdirSync(templatesDir()).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).flatMap(name => {
    const parsed = personalStyleSchema.safeParse(readJsonFile(path.join(templatesDir(), name), null));
    return parsed.success ? [parsed.data] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
}
export function readLocalStylePayload(): StylePayload {
  const markdown = readPersonalStyleDocument().markdown;
  const preferences = readJsonFile<Record<string, unknown> | null>(path.join(profileDir(), "preferences.json"), null);
  return { markdown, preferences, templates: readLocalTemplates() };
}
/** A profile that only holds the starting document has nothing worth keeping on conflict. */
function isUntouched(payload: StylePayload) {
  const preferences = (payload.preferences as { preferences?: unknown[] } | null)?.preferences ?? [];
  return payload.templates.length === 0 && preferences.length === 0 && payload.markdown.trim() === initialStyle([]).trim();
}

export function readStyleSyncState(): StyleSyncState | null {
  const parsed = syncStateSchema.safeParse(readJsonFile(statePath(), null));
  return parsed.success ? parsed.data : null;
}
function writeState(state: StyleSyncState) { writeJsonFileAtomic(statePath(), state); }
function recordError(account: string, error: string) {
  const previous = readStyleSyncState();
  const base = previous?.account === account ? previous : { account, revision: 0, hash: "", synced_at: "" };
  writeState({ ...base, error, error_at: new Date().toISOString() });
}

/** Replaces the cache with the account copy under the profile lock. Templates the account does not
 * have leave the active list; their immutable revisions stay under personal-styles/revisions/. */
export function applyRemoteStyle(remote: StylePayload) {
  const preferences = remote.preferences === null ? null : editingProfileSchema.parse(remote.preferences);
  const templates = remote.templates.flatMap(item => { const parsed = personalStyleSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
  withStyleLock(profileDir(), () => {
    // An account without settings clears the cached ones, or the next pass would push them back.
    if (preferences) writeJsonFileAtomic(path.join(profileDir(), "preferences.json"), preferences);
    else fs.rmSync(path.join(profileDir(), "preferences.json"), { force: true });
    rememberStyle(profileDir(), remote.markdown);
    writeStyleText(profileDir(), remote.markdown);
    fs.mkdirSync(templatesDir(), { recursive: true, mode: 0o700 });
    const keep = new Set(templates.map(template => `${template.id}.json`));
    for (const template of templates) {
      writeJsonFileAtomic(path.join(templatesDir(), "revisions", template.id, `${template.revision}.json`), template);
      writeJsonFileAtomic(path.join(templatesDir(), `${template.id}.json`), template);
    }
    for (const name of fs.readdirSync(templatesDir())) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name) || keep.has(name)) continue;
      // Keep a revision copy before the template leaves the active list.
      const parsed = personalStyleSchema.safeParse(readJsonFile(path.join(templatesDir(), name), null));
      const copy = parsed.success && path.join(templatesDir(), "revisions", parsed.data.id, `${parsed.data.revision}.json`);
      if (copy && !fs.existsSync(copy)) writeJsonFileAtomic(copy, parsed.data);
      fs.rmSync(path.join(templatesDir(), name));
    }
  });
}

const conflictSchema = z.object({
  id: z.string(), kept_at: z.string(), account: z.string(), remote_revision: z.number(),
  local: z.object({ markdown: z.string(), preferences: z.record(z.string(), z.unknown()).nullable(), templates: z.array(z.unknown()) }),
  dismissed_at: z.string().optional(),
});
export type StyleConflict = z.infer<typeof conflictSchema>;
function keepConflict(account: string, local: StylePayload, remoteRevision: number): string | null {
  if (isUntouched(local)) return null;
  const keptAt = new Date().toISOString();
  const id = `${keptAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  writeJsonFileAtomic(path.join(conflictsDir(), `${id}.json`), { id, kept_at: keptAt, account, remote_revision: remoteRevision, local });
  // A readable copy of the text beside the record.
  fs.writeFileSync(path.join(conflictsDir(), `${id}-STYLE.md`), local.markdown, { mode: 0o600 });
  return id;
}
export function listStyleConflicts(): StyleConflict[] {
  if (!fs.existsSync(conflictsDir())) return [];
  return fs.readdirSync(conflictsDir()).filter(name => name.endsWith(".json")).flatMap(name => {
    const parsed = conflictSchema.safeParse(readJsonFile(path.join(conflictsDir(), name), null));
    return parsed.success && !parsed.data.dismissed_at ? [parsed.data] : [];
  }).sort((a, b) => b.kept_at.localeCompare(a.kept_at));
}
function conflictPath(id: string) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid conflict id");
  return path.join(conflictsDir(), `${id}.json`);
}
/** Hides a kept version from Memory. The file stays in the profile. */
export function dismissStyleConflict(id: string) {
  const conflict = conflictSchema.parse(readJsonFile(conflictPath(id), null));
  writeJsonFileAtomic(conflictPath(id), { ...conflict, dismissed_at: new Date().toISOString() });
}
/** Makes a kept version's text the current style; the next sync sends it as a new revision. */
export function restoreStyleConflict(id: string) {
  const conflict = conflictSchema.parse(readJsonFile(conflictPath(id), null));
  const saved = savePersonalStyleDocument(conflict.local.markdown, readPersonalStyleDocument().revision);
  dismissStyleConflict(id);
  return saved;
}

async function readRemote(fetcher?: Fetcher): Promise<RemoteStyle> {
  const response = await cloudFetch("/api/v1/style", {}, fetcher);
  if (!response.ok) throw new Error(`Could not read your DreamCut style (HTTP ${response.status}).`);
  return parseRemote(await response.json());
}
function parseRemote(body: unknown): RemoteStyle {
  const value = body as Partial<RemoteStyle> | null;
  if (!value || typeof value.revision !== "number" || typeof value.markdown !== "string") throw new Error("DreamCut returned an unreadable style.");
  // Settings this version cannot read stop the sync before anything is kept, adopted or pushed.
  if (value.preferences != null && !editingProfileSchema.safeParse(value.preferences).success) {
    throw new Error("Your DreamCut account has style settings this version cannot read. Update DreamCut to keep syncing.");
  }
  return {
    revision: value.revision, markdown: value.markdown, updated_at: value.updated_at ?? null,
    preferences: (value.preferences ?? null) as Record<string, unknown> | null,
    templates: Array.isArray(value.templates) ? value.templates as PersonalStyle[] : [],
  };
}

function adopt(account: string, remote: RemoteStyle) {
  applyRemoteStyle(remote);
  writeState({ account, revision: remote.revision, hash: stylePayloadHash(readLocalStylePayload()), synced_at: new Date().toISOString() });
}

/** One sync pass. Never throws; failures are recorded on the sync state and retried next pass. */
export async function syncStyle(fetcher?: Fetcher): Promise<StyleSyncResult> {
  const status = cloudAccountStatus();
  if (!status.signed_in) return { outcome: "signed_out" };
  const account = status.email ?? "";
  try {
    const local = readLocalStylePayload();
    const localHash = stylePayloadHash(local);
    const previous = readStyleSyncState();
    const state = previous?.account === account && previous.synced_at ? previous : null;
    const remote = await readRemote(fetcher);

    if (!state) {
      // First sync for this account on this computer.
      if (remote.revision === 0) return await push(account, local, localHash, 0, "uploaded_first", fetcher);
      if (stylePayloadHash(remote) === localHash) { adopt(account, remote); return { outcome: "unchanged", revision: remote.revision }; }
      const conflictId = keepConflict(account, local, remote.revision);
      adopt(account, remote);
      return { outcome: "conflict", revision: remote.revision, conflict_id: conflictId };
    }
    const localChanged = localHash !== state.hash;
    if (localChanged) return await push(account, local, localHash, state.revision, "pushed", fetcher);
    if (remote.revision !== state.revision) { adopt(account, remote); return { outcome: "pulled", revision: remote.revision }; }
    if (state.error) writeState({ ...state, error: undefined, error_at: undefined });
    return { outcome: "unchanged", revision: state.revision };
  } catch (error) {
    if (error instanceof CloudSignedOutError) return { outcome: "signed_out" };
    const message = error instanceof Error ? error.message : String(error);
    recordError(account, message);
    return { outcome: "failed", error: message };
  }
}

async function push(account: string, local: StylePayload, localHash: string, baseRevision: number, outcome: "pushed" | "uploaded_first", fetcher?: Fetcher): Promise<StyleSyncResult> {
  const response = await cloudFetch("/api/v1/style", { method: "PUT", body: JSON.stringify({ base_revision: baseRevision, ...local }) }, fetcher);
  if (response.status === 409) {
    const body = await response.json().catch(() => null) as { current?: unknown } | null;
    const current = body?.current ? parseRemote(body.current) : await readRemote(fetcher);
    const conflictId = keepConflict(account, local, current.revision);
    adopt(account, current);
    return { outcome: "conflict", revision: current.revision, conflict_id: conflictId };
  }
  if (response.status === 413) throw new Error("Your style is too large to sync. Shorten it or remove saved templates.");
  if (!response.ok) throw new Error(`Could not save your style to DreamCut (HTTP ${response.status}).`);
  const body = await response.json() as { revision?: number };
  if (typeof body.revision !== "number") throw new Error("DreamCut returned an unreadable style revision.");
  writeState({ account, revision: body.revision, hash: localHash, synced_at: new Date().toISOString() });
  return { outcome, revision: body.revision };
}

// ---------------------------------------------------------------------------------------------
// Scheduling: one pass at a time per process; a timer while the editor runs; soon after local saves.
// ---------------------------------------------------------------------------------------------
const INTERVAL_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 3000;
const loopKey = Symbol.for("dreamcut.styleSyncLoop");
type Loop = { timer?: NodeJS.Timeout; debounce?: NodeJS.Timeout; running?: Promise<StyleSyncResult>; again?: boolean };
const loop = () => ((globalThis as typeof globalThis & { [loopKey]?: Loop })[loopKey] ??= {});

/** Runs a sync now, or after the one in progress. */
export function requestStyleSync(fetcher?: Fetcher): Promise<StyleSyncResult> {
  const state = loop();
  if (state.running) { state.again = true; return state.running; }
  const run = syncStyle(fetcher).finally(() => {
    state.running = undefined;
    if (state.again) { state.again = false; void requestStyleSync(fetcher); }
  });
  state.running = run;
  return run;
}

/** Starts the periodic sync and the after-save trigger. Idempotent; does nothing while signed out. */
export function startStyleSyncLoop() {
  const state = loop();
  if (state.timer || process.env.NODE_TEST_CONTEXT || process.env.DREAMCUT_STYLE_SYNC === "off") return;
  state.timer = setInterval(() => { if (isCloudSignedIn()) void requestStyleSync(); }, INTERVAL_MS);
  state.timer.unref?.();
  onLocalStyleChanged(() => {
    if (!isCloudSignedIn()) return;
    clearTimeout(state.debounce);
    state.debounce = setTimeout(() => void requestStyleSync(), DEBOUNCE_MS);
    state.debounce.unref?.();
  });
  if (isCloudSignedIn()) void requestStyleSync();
}

// ---------------------------------------------------------------------------------------------
// Style suggestions: reviewed findings the DreamCut team sends to the account. The creator decides;
// accepting appends the suggestion's text in the Cloud and the next pull brings it into the cache.
// ---------------------------------------------------------------------------------------------
const suggestionSchema = z.object({
  id: z.string().uuid(), title: z.string(), rationale: z.string(), markdown_addition: z.string(),
  evidence: z.array(z.object({ ref: z.string(), note: z.string() })).default([]), created_at: z.string(),
});
export type StyleSuggestion = z.infer<typeof suggestionSchema>;

export async function listStyleSuggestions(fetcher?: Fetcher): Promise<StyleSuggestion[]> {
  const response = await cloudFetch("/api/v1/style/suggestions", {}, fetcher);
  if (!response.ok) throw new Error(`Could not load style suggestions (HTTP ${response.status}).`);
  const body = await response.json() as { suggestions?: unknown[] };
  return (body.suggestions ?? []).flatMap(item => { const parsed = suggestionSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
}

/** Sends local changes first so the decision is based on the current revision, retries once on a
 * stale revision, then pulls the resulting style. */
export async function decideStyleSuggestion(id: string, decision: "accept" | "reject", fetcher?: Fetcher) {
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid suggestion id");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const synced = await requestStyleSync(fetcher);
    if (synced.outcome === "signed_out") throw new CloudSignedOutError();
    if (synced.outcome === "failed") throw new Error(synced.error);
    const response = await cloudFetch(`/api/v1/style/suggestions/${id}`, {
      method: "POST", body: JSON.stringify({ decision, base_revision: readStyleSyncState()?.revision ?? 0 }),
    }, fetcher);
    if (response.status === 409) continue;
    if (response.status === 404) throw new Error("This suggestion was already decided.");
    if (!response.ok) throw new Error(`Could not ${decision} the suggestion (HTTP ${response.status}).`);
    const result = await requestStyleSync(fetcher);
    return { decision, style_sync: result };
  }
  throw new Error("Your style changed while deciding. Try again.");
}
