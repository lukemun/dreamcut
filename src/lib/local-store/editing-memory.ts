import { readUserSkills } from "./user-skills";
import { feedbackCoverage } from "../timeline/editing-feedback";
import type { ProposalRecord } from "./proposals";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { projectDir, projectHistoryDir } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { derivedStyle, ensureStyleDocument, rememberStyle, styleHash, updateStyleFromPreferences, withStyleLock, writeStyleText } from "./style-document";
import type { EditActor, EditAttribution } from "./edit-attribution";
import { readEnv } from "@/lib/env-name";
import { notifyLocalStyleChanged } from "./style-change-signal";
import { profileDir } from "./profile-dir";
import { snapshotLabel } from "./history-list";

export const memoryHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");
export function memoryDir(projectId: string) { return path.join(projectDir(projectId), "memory"); }
export { migrateLegacyProfileDirectory, profileDir } from "./profile-dir";

export const preferenceReasoningSchema = z.object({
  basis: z.enum(["explicit", "inferred", "unknown"]),
  rationale: z.string().min(1).max(2000),
  confidence: z.enum(["low", "medium", "high"]),
  alternatives: z.array(z.string().min(1).max(500)).max(5),
}).strict();

export const preferenceSchema = z.object({
  id: z.string().uuid(), text: z.string().trim().min(1).max(100000),
  scope: z.enum(["all", "vertical-social", "project"]), project_id: z.string().optional(),
  status: z.enum(["suggested", "active", "retired"]),
  category: z.enum(["Pacing", "Captions", "Visuals", "Audio", "Delivery", "Workflow"]),
  evidence: z.array(z.string().max(300)).max(30), origin: z.enum(["human", "retro"]),
  updated_at: z.string(),
  reasoning: preferenceReasoningSchema.optional(),
});
export type EditingPreference = z.infer<typeof preferenceSchema>;
const profileSchema = z.object({ version: z.literal(1), cloud_sharing: z.boolean().optional(), preferences: z.array(preferenceSchema).max(500) });
type EditingProfile = z.infer<typeof profileSchema>;
/** preferences.json as written to the profile; style sync validates a pulled copy against it. */
export const editingProfileSchema = profileSchema;
const profileBases = new WeakMap<object, { revision: string; profile: string }>();
function rawEditingProfile(): EditingProfile {
  const file = path.join(profileDir(), "preferences.json");
  if (!fs.existsSync(file)) return profileSchema.parse({ version: 1, preferences: [] });
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  // Earlier versions shared evidence only while learning was on; keep that choice.
  if (raw?.learning === false && raw.cloud_sharing === undefined) raw.cloud_sharing = false;
  return profileSchema.parse(raw);
}
export function readEditingProfile() {
  return withStyleLock(profileDir(), () => {
    const raw = rawEditingProfile();
    const document = ensureStyleDocument(profileDir(), raw.preferences);
    const profile = { ...raw, preferences: derivedStyle(document.markdown, raw.preferences) };
    profileBases.set(profile, { revision: document.revision, profile: styleHash(JSON.stringify(raw)) });
    return profile;
  });
}
export function readPersonalStyleDocument() {
  return withStyleLock(profileDir(), () => ensureStyleDocument(profileDir(), rawEditingProfile().preferences));
}
export function savePersonalStyleDocument(markdown: string, expectedRevision: string) {
  if (markdown.length > 100000 || markdown.includes("\0")) throw new Error("Style document must be valid text under 100,000 characters.");
  const saved = withStyleLock(profileDir(), () => {
    const current = ensureStyleDocument(profileDir(), rawEditingProfile().preferences);
    if (current.revision !== expectedRevision) throw new Error("My style changed elsewhere. Reload the latest version before saving.");
    rememberStyle(profileDir(), markdown);
    writeStyleText(profileDir(), markdown);
    return { markdown, revision: styleHash(markdown) };
  });
  notifyLocalStyleChanged();
  return saved;
}
export function writeEditingProfile(profile: EditingProfile) {
  const parsed = profileSchema.parse(profile);
  const written = withStyleLock(profileDir(), () => {
    const raw = rawEditingProfile();
    const document = ensureStyleDocument(profileDir(), raw.preferences);
    const base = profileBases.get(profile);
    if (base && (base.revision !== document.revision || base.profile !== styleHash(JSON.stringify(raw)))) throw new Error("My style changed elsewhere. Read the latest profile and retry.");
    const current = derivedStyle(document.markdown, raw.preferences);
    const markdown = updateStyleFromPreferences(document.markdown, current, parsed.preferences);
    rememberStyle(profileDir(), markdown);
    // The document is the active personal authority. JSON retains settings,
    // evidence, project exceptions and pending/retired preferences.
    writeJsonFileAtomic(path.join(profileDir(), "preferences.json"), parsed);
    if (markdown !== document.markdown) writeStyleText(profileDir(), markdown);
    profileBases.set(profile, { revision: styleHash(markdown), profile: styleHash(JSON.stringify(parsed)) });
    return parsed;
  });
  notifyLocalStyleChanged();
  return written;
}
export function effectivePreferences(projectId: string, aspectRatio: string) {
  return readEditingProfile().preferences.filter(p => p.status === "active" &&
    (p.scope === "all" || (p.scope === "project" && p.project_id === projectId) || (p.scope === "vertical-social" && aspectRatio === "9:16")))
    .sort((a, b) => ({ project: 0, "vertical-social": 1, all: 2 })[a.scope] - ({ project: 0, "vertical-social": 1, all: 2 })[b.scope]);
}

export type MemoryEvent = {
  id: string; time: string; type: string; summary: string; actor: "human" | "agent" | "system" | "unknown";
  evidence?: string; data?: Record<string, unknown>; hash: string;
};
// One immutable, atomically published file per event avoids interleaved JSONL writes
// across editor and worker processes. JSONL is a downloadable projection.
export function recordMemoryEvent(projectId: string, input: Omit<MemoryEvent, "id" | "time" | "hash"> & { id?: string; time?: string }) {
  const event = { ...input, id: input.id ?? randomUUID(), time: input.time ?? new Date().toISOString() };
  const filename = `${memoryHash(event.id)}.json`;
  const file = path.join(memoryDir(projectId), "events", filename);
  if (!fs.existsSync(file)) writeJsonFileAtomic(file, { ...event, hash: memoryHash(event) });
  return event.id;
}
export function safeMemoryEvent(projectId: string, input: Parameters<typeof recordMemoryEvent>[1]) {
  try { recordMemoryEvent(projectId, input); } catch (error) { console.error("[editing-memory] evidence capture failed", error); }
}
function jsonFiles<T>(directory: string): T[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(f => f.endsWith(".json")).sort().flatMap(f => {
    const item = readJsonFile<T | null>(path.join(directory, f), null); return item ? [item] : [];
  });
}
/** Bounded per-directory cache, keyed by a stat signature so any rewrite re-reads from disk. */
function statCached<T>(cache: Map<string, { signature: string; value: T }>, key: string, signature: string, read: () => T): T {
  const cached = cache.get(key);
  if (cached?.signature === signature) return cached.value;
  const value = read();
  cache.delete(key);
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, { signature, value });
  return value;
}
const capturedEventCache = new Map<string, { signature: string; value: MemoryEvent[] }>();
function capturedMemoryEvents(projectId: string): MemoryEvent[] {
  const directory = path.join(memoryDir(projectId), "events");
  const names = listDirectory(directory).filter(f => f.endsWith(".json"));
  return statCached(capturedEventCache, directory, `${names.join("/")}\n${statSignature(names.map(name => path.join(directory, name)))}`, () => names.map(name => {
    const event = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")) as MemoryEvent;
    const { hash, ...body } = event;
    if (memoryHash(body) !== hash) throw new Error("Editing memory evidence failed its integrity check.");
    return event;
  }));
}
export function memoryEvents(projectId: string): MemoryEvent[] {
  const captured = capturedMemoryEvents(projectId);
  // Legacy snapshots remain their immutable authority; do not invent attribution.
  const known = new Set(captured.map(e => e.evidence));
  const legacy = editChapterHeads(projectId).filter(c => !known.has(c.id)).map(c => {
    const body = { id: `history:${c.id}`, time: c.time, type: "timeline.snapshot", summary: c.summary, actor: c.actor ?? "unknown", evidence: c.id,
      data: { initiated_by: c.initiated_by ?? "unknown", attribution_source: c.attribution_source ?? "unknown", responds_to_feedback_ids: c.responds_to_feedback_ids, transaction_id: c.transaction_id, proposal_ids: c.proposal_ids, restores_snapshot_id: c.restores_snapshot_id } };
    return { ...body, hash: memoryHash(body) };
  });
  return [...legacy, ...captured].sort((a,b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}

type Clip = { id: string; type: string; timeline_start: number; duration: number; removed_at?: string | null; props?: Record<string, unknown>; source_url?: string | null };
type Snapshot = Partial<EditAttribution> & { op: string; at: string; timeline: { elements: Clip[]; transitions?: unknown[] }; metadata?: Record<string, unknown>; frame_tags?: unknown; auditions?: unknown; layout_proposals?: unknown };
export type EditChapter = Partial<EditAttribution> & { id: string; time: string; operation: string; category: string; summary: string; label: string; seconds: number | null; context_changes: { field: string; before: unknown; after: unknown }[]; changes: { id: string; label: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }[] };
const savedActor = (value: unknown): EditActor => ["human", "agent", "system"].includes(String(value)) ? value as EditActor : "unknown";
function category(op: string) {
  if (/caption|text|font/.test(op)) return "Captions";
  if (/audio|music|voice|volume/.test(op)) return "Audio";
  if (/mark|frame_tag/.test(op)) return "Marks";
  if (/trim|cut|split|duration|ripple/.test(op)) return "Pacing";
  if (/agent|proposal/.test(op)) return "Review";
  return "Timeline";
}
function clipSummary(c: Clip): Record<string, unknown> {
  const { updated_at: _at, created_at: _created, ...values } = c as Clip & { updated_at?: string; created_at?: string };
  return values;
}
/** A parsed snapshot with each compared value serialised once (equal JSON ⇔ equal memoryHash). */
type ParsedSnapshot = { snap: Snapshot; clips: Map<string, Clip>; clipJson: Map<string, string>; contextJson: string[] };
const CONTEXT_FIELDS = ["metadata", "frame_tags", "auditions", "layout_proposals", "transitions"] as const;
const contextValue = (snap: Snapshot | undefined, field: typeof CONTEXT_FIELDS[number]) => (field === "transitions" ? snap?.timeline.transitions : snap?.[field]) ?? null;
const jsonKey = (value: unknown) => JSON.stringify(value) ?? "null";
function parseSnapshot(file: string): ParsedSnapshot | null {
  const snap = readJsonFile<Snapshot | null>(file, null);
  if (!snap?.timeline?.elements) return null;
  const clips = new Map(snap.timeline.elements.map(c => [c.id, c]));
  const clipJson = new Map<string, string>();
  for (const [id, clip] of clips) clipJson.set(id, jsonKey(clipSummary(clip)));
  return { snap, clips, clipJson, contextJson: CONTEXT_FIELDS.map(field => jsonKey(contextValue(snap, field))) };
}
const EMPTY_SNAPSHOT: Omit<ParsedSnapshot, "snap"> = { clips: new Map(), clipJson: new Map(), contextJson: CONTEXT_FIELDS.map(() => "null") };
/** The chapter for one snapshot against the previous readable one, without its label (labels read proposal files and are refreshed on every rebuild). */
function snapshotChapter(name: string, current: ParsedSnapshot, previous: ParsedSnapshot | undefined): Omit<EditChapter, "label"> | null {
  const { snap } = current;
  const prior = previous ?? EMPTY_SNAPSHOT;
  const changes: EditChapter["changes"] = [];
  for (const id of new Set([...prior.clips.keys(), ...current.clips.keys()])) {
    if ((prior.clipJson.get(id) ?? "null") === (current.clipJson.get(id) ?? "null")) continue;
    const a = prior.clips.get(id), b = current.clips.get(id);
    const c = b ?? a!;
    changes.push({ id, label: String(c.props?.text ?? c.props?.label ?? c.type).slice(0, 120), before: a ? clipSummary(a) : null, after: b ? clipSummary(b) : null });
  }
  const context_changes = CONTEXT_FIELDS.flatMap((field, index) => prior.contextJson[index] === current.contextJson[index] ? []
    : [{ field, before: contextValue(previous?.snap, field), after: contextValue(snap, field) }]);
  if (!changes.length && !context_changes.length && !(/frame_tag/.test(snap.op) && !snap.op.endsWith("_before"))) return null;
  return { id: name, time: snap.at, operation: snap.op, category: category(snap.op),
    actor: savedActor(snap.actor), initiated_by: savedActor(snap.initiated_by), attribution_source: snap.attribution_source ?? "unknown",
    responds_to_feedback_ids: snap.responds_to_feedback_ids, transaction_id: snap.transaction_id, proposal_ids: snap.proposal_ids, restores_snapshot_id: snap.restores_snapshot_id,
    summary: `${snap.op.replaceAll("_", " ")} · ${changes.length ? `${changes.length} clip${changes.length === 1 ? "" : "s"} changed` : "project settings or review marks"}`,
    seconds: changes.length ? Math.min(...changes.map(c => Number(c.after?.timeline_start ?? c.before?.timeline_start ?? 0))) : null, changes, context_changes };
}
/**
 * Per snapshot: its stat key, the readable snapshot it was diffed against, and what the
 * caller keeps of the result (null when the snapshot yields no chapter). A chapter depends
 * only on its own snapshot and its readable predecessor, so a rebuild re-reads only
 * snapshots that are new, rewritten, or whose predecessor changed.
 */
type ChapterEntry<T> = { key: string; readable: boolean; previous: string | null; value: T | null };
type HistoryListing = { dir: string; names: string[]; keys: string[]; signature: string };
function historyListing(projectId: string): HistoryListing | null {
  const dir = projectHistoryDir(projectId);
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const keys = names.map(name => {
    const stat = fs.statSync(path.join(dir, name));
    return `${stat.mtimeMs}:${stat.size}`;
  });
  return { dir, names, keys, signature: names.map((name, index) => `${name}:${keys[index]}`).join("|") };
}
function chapterEntries<T>({ dir, names, keys }: HistoryListing, known: Map<string, ChapterEntry<T>>,
  keep: (chapter: Omit<EditChapter, "label">, header: Record<string, unknown>) => T) {
  const entries = new Map<string, ChapterEntry<T>>();
  let changed = known.size !== names.length;
  // `previousId` names the last readable snapshot and its stat key; `parsed` holds it only when already read this pass.
  let previousId: string | null = null;
  let parsed: { id: string; value: ParsedSnapshot } | undefined;
  names.forEach((name, index) => {
    const id = `${name}:${keys[index]}`;
    let entry = known.get(name);
    if (!entry || entry.key !== keys[index] || (entry.readable && entry.previous !== previousId)) {
      changed = true;
      const current = parseSnapshot(path.join(dir, name));
      if (!current) entry = { key: keys[index], readable: false, previous: null, value: null };
      else {
        let previous: ParsedSnapshot | undefined;
        if (previousId) {
          if (parsed?.id !== previousId) {
            const previousName = previousId.slice(0, previousId.indexOf(".json:") + 5);
            const value = parseSnapshot(path.join(dir, previousName));
            if (value) parsed = { id: previousId, value };
          }
          previous = parsed?.id === previousId ? parsed.value : undefined;
        }
        const chapter = snapshotChapter(name, current, previous);
        const { timeline: _timeline, ...header } = current.snap;
        entry = { key: keys[index], readable: true, previous: previousId, value: chapter ? keep(chapter, header) : null };
        parsed = { id, value: current };
      }
    }
    entries.set(name, entry);
    if (entry.readable) previousId = id;
  });
  return { entries, changed };
}
function remember<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key);
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
}
/** Same key order as the chapter has always had: label sits before summary. */
function labelled(projectId: string, chapter: Omit<EditChapter, "label">, header: Record<string, unknown>): EditChapter {
  const { summary, seconds, changes, context_changes, ...lead } = chapter;
  return { ...lead, label: snapshotLabel(projectId, header, chapter.operation), summary, seconds, changes, context_changes };
}
/** `header` keeps only the snapshot header fields the label reads (LABEL_HEADER_FIELDS). */
type FullChapter = { chapter: Omit<EditChapter, "label">; header: Record<string, unknown> };
const chapterCache = new Map<string, { signature: string; chapters: EditChapter[]; entries: Map<string, ChapterEntry<FullChapter>> }>();
export function editChapters(projectId: string): EditChapter[] {
  const listing = historyListing(projectId);
  if (!listing) return [];
  const cached = chapterCache.get(listing.dir);
  if (cached?.signature === listing.signature) return cached.chapters;
  // After a restart, the persisted heads and per-chapter changes stand in for the snapshots they came from.
  const known = cached?.entries ?? readPersistedChapters(projectId, listing);
  const { entries } = chapterEntries<FullChapter>(listing, known, (chapter, header) => ({ chapter, header: labelHeader(header) }));
  persistChapters(projectId, listing, known, entries);
  const chapters = listing.names.flatMap(name => {
    const value = entries.get(name)!.value;
    return value ? [labelled(projectId, value.chapter, value.header)] : [];
  });
  remember(chapterCache, listing.dir, { signature: listing.signature, chapters, entries });
  return chapters;
}

/**
 * A chapter without its clip changes and with only the snapshot header fields its label reads:
 * what memoryEvents and the paged memory page need. Small enough to persist, so a restarted
 * server need not parse every history snapshot again. Labels stay live (they read proposals).
 */
type ChapterHead = Omit<EditChapter, "label" | "changes" | "context_changes"> & { change_count: number; context_change_count: number; label_header: Record<string, unknown> };
/** Bump when snapshotChapter, snapshotLabel's header fields or the head projection change what a snapshot yields. */
export const CHAPTER_HEADS_VERSION = 2;
const MAX_PERSISTED_HEADS = 10_000;
const LABEL_HEADER_FIELDS = ["label", "history_action", "proposal_ids", "restores_snapshot_id"] as const;
type PersistedHeads = { version: number; entries: Record<string, ChapterEntry<ChapterHead>> };
const labelHeader = (header: Record<string, unknown>) => Object.fromEntries(LABEL_HEADER_FIELDS.flatMap(field => header[field] === undefined ? [] : [[field, header[field]]]));
function chapterHead({ changes, context_changes, ...head }: Omit<EditChapter, "label">, header: Record<string, unknown>): ChapterHead {
  return { ...head, change_count: changes.length, context_change_count: context_changes.length, label_header: labelHeader(header) };
}
/** Rebuildable cache (see docs/architecture/storage-management.md); deleting it only costs one full history read. */
export const chapterHeadsPath = (projectId: string) => path.join(projectDir(projectId), "preprocess", "edit-chapter-heads.json");
function readPersistedHeads(file: string): Map<string, ChapterEntry<ChapterHead>> {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as PersistedHeads;
    if (value?.version === CHAPTER_HEADS_VERSION && value.entries && typeof value.entries === "object" && !Array.isArray(value.entries)) {
      return new Map(Object.entries(value.entries).filter(([, entry]) => entry && typeof entry.key === "string" && typeof entry.readable === "boolean"
        && (entry.previous === null || typeof entry.previous === "string")
        && (entry.value === null || (typeof entry.value?.id === "string" && typeof entry.value.change_count === "number" && typeof entry.value.label_header === "object" && entry.value.label_header !== null))));
    }
  } catch { /* Missing or unreadable heads only cost a history read. */ }
  return new Map();
}
function writePersistedHeads(file: string, listing: HistoryListing, entries: Map<string, ChapterEntry<ChapterHead>>) {
  if (listing.names.length > MAX_PERSISTED_HEADS) return;
  try {
    const body: PersistedHeads = { version: CHAPTER_HEADS_VERSION, entries: Object.fromEntries(listing.names.map(name => [name, entries.get(name)!])) };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(body));
    fs.renameSync(temporary, file);
  } catch { /* Heads that cannot be written only cost a history read next start. */ }
}
const headCache = new Map<string, { signature: string; heads: ChapterHead[]; entries: Map<string, ChapterEntry<ChapterHead>> }>();
function editChapterHeadEntries(projectId: string) {
  const listing = historyListing(projectId);
  if (!listing) return null;
  const cached = headCache.get(listing.dir);
  if (cached?.signature === listing.signature) return { listing, ...cached };
  const file = chapterHeadsPath(projectId);
  const { entries, changed } = chapterEntries<ChapterHead>(listing, cached?.entries ?? readPersistedHeads(file), chapterHead);
  if (changed) writePersistedHeads(file, listing, entries);
  const heads = listing.names.flatMap(name => entries.get(name)!.value ?? []);
  const value = { signature: listing.signature, heads, entries };
  remember(headCache, listing.dir, value);
  return { listing, ...value };
}
function editChapterHeads(projectId: string): ChapterHead[] {
  return editChapterHeadEntries(projectId)?.heads ?? [];
}

/**
 * Each chapter's clip and context changes, one file per snapshot that yields a chapter, so the
 * full chapters (default memory view, export checkpoints) survive a restart without parsing
 * history. Rebuildable cache (see docs/architecture/storage-management.md); the persisted heads
 * index it, and a file is used only when its stat key and predecessor match its head.
 */
export const chapterChangesDir = (projectId: string) => path.join(projectDir(projectId), "preprocess", "edit-chapter-changes");
const MAX_PERSISTED_CHANGE_BYTES = 256 * 1024 * 1024;
const CHANGES_FREE_SPACE_RESERVE = 5 * 1024 * 1024 * 1024;
type PersistedChanges = { version: number; key: string; previous: string | null; chapter: Omit<EditChapter, "label">; label_header: Record<string, unknown> };
function readPersistedChapters(projectId: string, listing: HistoryListing): Map<string, ChapterEntry<FullChapter>> {
  const cachedHeads = headCache.get(listing.dir);
  const heads = cachedHeads?.signature === listing.signature ? cachedHeads.entries : readPersistedHeads(chapterHeadsPath(projectId));
  const dir = chapterChangesDir(projectId);
  const known = new Map<string, ChapterEntry<FullChapter>>();
  for (const name of listing.names) {
    const head = heads.get(name);
    if (!head) continue;
    if (!head.readable || !head.value) { known.set(name, { key: head.key, readable: head.readable, previous: head.previous, value: null }); continue; }
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as PersistedChanges;
      if (saved?.version !== CHAPTER_HEADS_VERSION || saved.key !== head.key || saved.previous !== head.previous || saved.chapter?.id !== name
        || !Array.isArray(saved.chapter.changes) || !Array.isArray(saved.chapter.context_changes) || typeof saved.label_header !== "object" || saved.label_header === null) continue;
      known.set(name, { key: head.key, readable: true, previous: head.previous, value: { chapter: saved.chapter, header: saved.label_header } });
    } catch { /* Missing or unreadable changes only cost re-reading that snapshot. */ }
  }
  return known;
}
function freeBytes(directory: string) {
  try { const stat = fs.statfsSync(directory); return stat.bavail * stat.bsize; } catch { return 0; }
}
/** Writes changes for chapters rebuilt this pass, removes files for snapshots that no longer yield one, and keeps the heads in step. */
function persistChapters(projectId: string, listing: HistoryListing, known: Map<string, ChapterEntry<FullChapter>>, entries: Map<string, ChapterEntry<FullChapter>>) {
  const fresh = listing.names.filter(name => entries.get(name) !== known.get(name));
  const headEntries = new Map(listing.names.map(name => {
    const { value, ...entry } = entries.get(name)!;
    return [name, { ...entry, value: value ? chapterHead(value.chapter, value.header) : null }];
  }));
  const cachedHeads = headCache.get(listing.dir);
  if (cachedHeads?.signature !== listing.signature) {
    if (fresh.length || known.size !== listing.names.length) writePersistedHeads(chapterHeadsPath(projectId), listing, headEntries);
    remember(headCache, listing.dir, { signature: listing.signature, heads: listing.names.flatMap(name => headEntries.get(name)!.value ?? []), entries: headEntries });
  }
  if (!fresh.length && known.size === listing.names.length) return;
  const dir = chapterChangesDir(projectId);
  try {
    const current = new Set(listing.names.length > MAX_PERSISTED_HEADS ? [] : listing.names.filter(name => entries.get(name)!.value));
    const rebuilt = new Set(fresh);
    let bytes = 0;
    for (const name of listDirectory(dir)) {
      const file = path.join(dir, name);
      if (name.endsWith(".tmp")) { try { if (Date.now() - fs.statSync(file).mtimeMs > 10 * 60_000) fs.rmSync(file, { force: true }); } catch { /* another writer's */ } continue; }
      if (!current.has(name) || rebuilt.has(name)) { fs.rmSync(file, { force: true }); continue; }
      try { bytes += fs.statSync(file).size; } catch { /* removed meanwhile */ }
    }
    const writes = fresh.filter(name => current.has(name));
    if (!writes.length) return;
    fs.mkdirSync(dir, { recursive: true });
    if (freeBytes(dir) < CHANGES_FREE_SPACE_RESERVE) return;
    for (const name of writes) {
      const entry = entries.get(name)!;
      const body: PersistedChanges = { version: CHAPTER_HEADS_VERSION, key: entry.key, previous: entry.previous, chapter: entry.value!.chapter, label_header: entry.value!.header };
      const text = JSON.stringify(body);
      // Past the budget, the remaining chapters are rebuilt from history after a restart instead.
      if (bytes + text.length > MAX_PERSISTED_CHANGE_BYTES) break;
      const temporary = path.join(dir, `.${name}.${process.pid}.${randomUUID()}.tmp`);
      fs.writeFileSync(temporary, text);
      fs.renameSync(temporary, path.join(dir, name));
      bytes += text.length;
    }
  } catch { /* Changes that cannot be written only cost a history read next start. */ }
}
const skillCatalogEntrySchema = z.object({
  skill: z.string().min(1),
  title: z.string().min(1).max(80),
  category: z.enum(["Start here", "Edit", "Captions & text", "Audio", "Visuals", "Delivery"]),
  featured: z.boolean(),
  summary: z.string().min(1).max(240).optional(),
  inputs: z.array(z.string().min(1).max(80)).min(1).max(5).optional(),
  output: z.string().min(1).max(100).optional(),
  order: z.number().int().nonnegative().optional(),
  prompt: z.string().min(1).max(1000),
  use_cases: z.array(z.string().min(1).max(100)).min(1).max(6),
  example: z.object({
    request: z.string().min(1).max(500),
    outcome: z.string().min(1).max(700),
    timeline: z.array(z.object({
      label: z.string().min(1).max(100),
      detail: z.string().min(1).max(200),
    })).min(1).max(6),
  }),
  demo: z.object({
    project_id: z.string().min(1).max(150),
    label: z.string().min(1).max(100),
    summary: z.string().min(1).max(300),
  }).strict().optional(),
}).strict();
const skillCatalogSchema = z.object({
  version: z.literal(1),
  entries: z.array(skillCatalogEntrySchema).max(100),
}).strict();
export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>;

function skillDescription(content: string) {
  return content.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "DreamCut editing skill";
}

export function skillsDirectory() {
  const configured = readEnv("SKILLS_DIR");
  return configured ? path.resolve(configured) : path.join(process.cwd(), ".agents", "skills");
}

/** Stat-only signature: changes whenever any listed file is replaced, rewritten or removed. */
function statSignature(files: string[]) {
  return files.map(file => { try { const s = fs.statSync(file); return `${s.ino}:${s.mtimeMs}:${s.ctimeMs}:${s.size}`; } catch { return "-"; } }).join("|");
}
function listDirectory(directory: string) {
  try { return fs.readdirSync(directory).sort(); } catch { return []; }
}
function coreSkillFilesSignature() {
  const directory = skillsDirectory();
  const names = listDirectory(directory);
  return `${directory}\n${names.join("/")}\n${statSignature([path.join(directory, "catalog.json"), ...names.flatMap(name => [path.join(directory, name, "SKILL.md"), path.join(directory, name, "evolution.md")])])}`;
}
function personalSkillFilesSignature() {
  const directory = path.join(profileDir(), "skills");
  const names = listDirectory(directory);
  return `${directory}\n${names.join("/")}\n${statSignature(names.map(name => path.join(directory, name, "SKILL.md")))}`;
}
let coreSkillsCache: { signature: string; skills: ReturnType<typeof readCoreSkills> } | null = null;
/** Skills are re-read only when a skill, evolution log or catalog file changes. */
export function coreSkills() {
  const signature = coreSkillFilesSignature();
  if (coreSkillsCache?.signature === signature) return coreSkillsCache.skills;
  const skills = readCoreSkills();
  coreSkillsCache = { signature, skills };
  return skills;
}
function readCoreSkills() {
  const directory = skillsDirectory();
  if (!fs.existsSync(directory)) return [];
  const catalogFile = path.join(directory, "catalog.json");
  const catalog = fs.existsSync(catalogFile)
    ? skillCatalogSchema.parse(JSON.parse(fs.readFileSync(catalogFile, "utf8")))
    : { version: 1 as const, entries: [] };
  if (new Set(catalog.entries.map(entry => entry.skill)).size !== catalog.entries.length) throw new Error("Skill catalog entries must have unique skill names");
  const catalogBySkill = new Map(catalog.entries.map(entry => [entry.skill, entry]));
  const skills = fs.readdirSync(directory).sort().flatMap(name => {
    const file = path.join(directory, name, "SKILL.md");
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, "utf8");
    const evolutionFile = path.join(directory, name, "evolution.md");
    const evolution = fs.existsSync(evolutionFile) ? fs.readFileSync(evolutionFile, "utf8") : "";
    const purpose = evolution.match(/^## Purpose\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1]?.trim() || null;
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const aliases = (frontmatter.match(/^aliases:\s*\[(.*)\]\s*$/m)?.[1] ?? "").split(",").map(alias => alias.trim()).filter(alias => /^[a-z0-9-]+$/.test(alias));
    return [{ name, aliases, version: memoryHash(content), description: skillDescription(content), purpose, evolution, evolution_version: memoryHash(evolution), content, catalog: catalogBySkill.get(name) ?? null }];
  });
  const shippedNames = new Set(skills.map(skill => skill.name));
  const missing = catalog.entries.find(entry => !shippedNames.has(entry.skill));
  if (missing) throw new Error(`Skill catalog references missing skill: ${missing.skill}`);
  return skills;
}

/** A shipped skill by its name or a former name it still answers to (`aliases:` in its frontmatter). */
export function findCoreSkill(name: string) {
  const skills = coreSkills();
  return skills.find(skill => skill.name === name) ?? skills.find(skill => skill.aliases.includes(name));
}

const proposalCache = new Map<string, { signature: string; value: ProposalRecord[] }>();
function memoryProposals(projectId: string) {
  const directory = path.join(projectDir(projectId), "proposals");
  const names = listDirectory(directory).filter(f => f.endsWith(".json"));
  return statCached(proposalCache, directory, `${names.join("/")}\n${statSignature(names.map(name => path.join(directory, name)))}`, () => jsonFiles<ProposalRecord>(directory));
}
const sequenceCache = new Map<string, { signature: string; value: ReturnType<typeof readMemorySequences> }>();
/** Keyed by timeline.json's stat, so a poll after an unrelated change does not parse the whole timeline again. */
function memorySequences(projectId: string) {
  const file = path.join(projectDir(projectId), "timeline.json");
  return statCached(sequenceCache, file, statSignature([file]), () => readMemorySequences(file));
}
function readMemorySequences(file: string) {
  const timeline = readJsonFile<{ elements: Clip[] }>(file, { elements: [] });
  return timeline.elements.filter(c => !c.removed_at && (c.type === "video_clip" || c.type === "still")).sort((a,b) => a.timeline_start - b.timeline_start).map(c => ({
    id: c.id, label: String(c.props?.label ?? c.source_url?.split("/").pop() ?? c.type), start: c.timeline_start, duration: c.duration, lane: (c as Clip & { lane_key?: string }).lane_key,
  }));
}
export function readMemoryView(projectId: string) {
  const metadata = readJsonFile<Record<string, unknown>>(path.join(projectDir(projectId), "metadata.json"), {});
  const proposals = memoryProposals(projectId);
  const sequences = memorySequences(projectId);
  const events = memoryEvents(projectId);
  return { feedback: feedbackCoverage(events, proposals), profile: readEditingProfile(), style_document: readPersonalStyleDocument(), events, chapters: editChapters(projectId), proposals,
    sequences,
    core_skills: coreSkills(), user_skills: readUserSkills(coreSkills().map(({ name, description, content, catalog }) => ({ name, description, content, catalog })), profileDir()), effective_preferences: effectivePreferences(projectId, String(metadata.output_aspect_ratio)),
    project_id: projectId };
}
const viewVersionCache = new Map<string, { signature: string; value: string }>();
/** Version of everything readMemoryView/readMemoryPage derive from. Inputs are stat-keyed, so
 * an unchanged view costs a few stats instead of re-reading every skill. */
export function memoryViewVersion(projectId: string, section: "full" | "history" = "full") {
  const files = [projectHistoryDir(projectId), path.join(projectDir(projectId), "proposals"), path.join(projectDir(projectId), "timeline.json"), path.join(projectDir(projectId), "metadata.json"), path.join(profileDir(), "preferences.json"), path.join(profileDir(), "STYLE.md"), ...["events"].map(name => path.join(memoryDir(projectId), name))];
  const stats = files.map(file => { try { const s = fs.statSync(file); return [s.mtimeMs, s.size]; } catch { return null; } });
  // The history page reads no skills, so its poll need not stat every skill file.
  if (section === "history") return memoryHash({ files: stats, section });
  const signature = JSON.stringify([stats, coreSkillFilesSignature(), personalSkillFilesSignature()]);
  return statCached(viewVersionCache, projectId, signature, () => memoryHash({
    files: stats,
    skills: coreSkills().map(({ name, version, catalog }) => [name, version, catalog]),
    personalSkills: readUserSkills([], profileDir()),
  }));
}

export const MEMORY_CHAPTER_PAGE_SIZE = 50;
export const MEMORY_CHAPTER_PAGE_MAX = 1000;
export type MemoryChapterSummary = Omit<EditChapter, "changes" | "context_changes"> & { change_count: number; context_change_count: number };
export type MemoryChapterQuery = { limit?: number; cursor?: string | null; category?: string | null };
/** Newest-first chapter summaries. `cursor` is the oldest chapter id already returned; ids sort chronologically. */
export function memoryChapterPage(projectId: string, query: MemoryChapterQuery = {}) {
  const limit = Math.min(MEMORY_CHAPTER_PAGE_MAX, Math.max(1, Math.floor(query.limit ?? MEMORY_CHAPTER_PAGE_SIZE)));
  const category = query.category && query.category !== "All" ? query.category : null;
  // Heads are persisted, so a restarted server pages without diffing every snapshot.
  const matching = editChapterHeads(projectId).filter(chapter => !category || chapter.category === category);
  const end = query.cursor ? matching.filter(chapter => chapter.id < query.cursor!).length : matching.length;
  const start = Math.max(0, end - limit);
  const label = proposalLabels(projectId);
  const chapters: MemoryChapterSummary[] = matching.slice(start, end).reverse().map(({ summary, seconds, change_count, context_change_count, label_header, ...lead }) => ({
    ...lead, label: label(label_header, lead.operation), summary, seconds, change_count, context_change_count }));
  return { chapters, chapter_page: { total: matching.length, limit, category: category ?? "All", next_cursor: start > 0 ? matching[start]!.id : null } };
}
/** Labels read the proposals they name, so they are kept only while the proposal files are unchanged. */
const labelMemo = new WeakMap<ProposalRecord[], Map<string, string>>();
function proposalLabels(projectId: string) {
  const proposals = memoryProposals(projectId);
  let labels = labelMemo.get(proposals);
  if (!labels) labelMemo.set(proposals, labels = new Map());
  return (header: Record<string, unknown>, op: string) => {
    const key = `${projectId}\0${op}\0${jsonKey(header)}`;
    let label = labels.get(key);
    if (label === undefined) labels.set(key, label = snapshotLabel(projectId, header, op));
    return label;
  };
}
/** One chapter in full: diffs only its snapshot and the readable one before it. */
export function memoryChapter(projectId: string, id: string) {
  const heads = editChapterHeadEntries(projectId);
  const entry = heads?.entries.get(id);
  if (!heads || !entry?.value) throw new Error("Chapter not found");
  const saved = chapterCache.get(heads.listing.dir)?.signature === heads.listing.signature ? chapterCache.get(heads.listing.dir)!.entries.get(id)?.value
    : readPersistedChapters(projectId, { ...heads.listing, names: [id] }).get(id)?.value;
  if (saved) return labelled(projectId, saved.chapter, saved.header);
  const current = parseSnapshot(path.join(heads.listing.dir, id));
  const previous = entry.previous ? parseSnapshot(path.join(heads.listing.dir, entry.previous.slice(0, entry.previous.indexOf(".json:") + 5))) ?? undefined : undefined;
  const chapter = current && snapshotChapter(id, current, previous);
  if (!chapter) throw new Error("Chapter not found");
  const { timeline: _timeline, ...header } = current.snap;
  return labelled(projectId, chapter, header);
}

/** Bounded projection for the editing-memory page. The default full view stays the agent/tool contract. */
export function readMemoryPage(projectId: string, section: "user" | "history", chapterQuery: MemoryChapterQuery = {}) {
  const profile = readEditingProfile();
  const common = { project_id: projectId, profile };
  if (section === "user") {
    const skills = coreSkills();
    return { ...common, section,
      style_document: readPersonalStyleDocument(),
      user_skills: readUserSkills(skills.map(({ name, description, content, catalog }) => ({ name, description, content, catalog })), profileDir()),
    };
  }
  const proposals = memoryProposals(projectId);
  return { ...common, section,
    feedback: feedbackCoverage(memoryEvents(projectId), proposals),
    sequences: memorySequences(projectId),
    proposals: proposals.map(proposal => ({ proposal_id: proposal.proposal_id, status: proposal.status, created_at: proposal.created_at, proposal: { summary: proposal.proposal.summary } })),
    ...memoryChapterPage(projectId, chapterQuery),
  };
}
export type MemoryPage = ReturnType<typeof readMemoryPage>;

/** A frozen, privacy-limited copy of the project at export time. Export sharing uploads
 * its evidence; nothing in the editor reviews or learns from it. Records live in
 * memory/retros/ for compatibility with checkpoints written by earlier versions. */
export type ExportCheckpoint = { id: string; created_at: string; revision: string; checkpoint: Record<string, unknown> };
export function exportCheckpointPath(projectId: string, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new Error("Invalid export checkpoint id");
  return path.join(memoryDir(projectId), "retros", `${id}.json`);
}
export function createExportCheckpoint(projectId: string, id: string, checkpoint: Record<string, unknown>) {
  const file = exportCheckpointPath(projectId, id);
  if (fs.existsSync(file)) return readJsonFile<ExportCheckpoint>(file, null!);
  const view = readMemoryView(projectId);
  const record: ExportCheckpoint = { id, created_at: new Date().toISOString(), revision: memoryHash(checkpoint),
    checkpoint: { ...checkpoint, chapters: view.chapters, proposals: view.proposals, events: view.events, feedback: view.feedback, core_skills: view.core_skills, preferences: view.effective_preferences } };
  writeJsonFileAtomic(file, record);
  return record;
}
