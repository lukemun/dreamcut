import { readUserSkills } from "./user-skills";
import { feedbackCoverage } from "../timeline/editing-feedback";
import type { ProposalRecord } from "./proposals";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { projectDir, projectHistoryDir, projectsRoot } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { derivedStyle, ensureStyleDocument, rememberStyle, styleHash, updateStyleFromPreferences, withStyleLock, writeStyleText } from "./style-document";
import type { EditActor, EditAttribution } from "./edit-attribution";
import { readEnv } from "@/lib/env-name";
import { notifyLocalStyleChanged } from "./style-change-signal";
import { profileDir } from "./profile-dir";

export const memoryHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");
export function memoryDir(projectId: string) { return path.join(projectDir(projectId), "memory"); }
export { migrateLegacyProfileDirectory, profileDir } from "./profile-dir";

export const retroReasoningSchema = z.object({
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
  reasoning: retroReasoningSchema.optional(),
});
export type EditingPreference = z.infer<typeof preferenceSchema>;
const profileSchema = z.object({ version: z.literal(1), learning: z.boolean(), agent_retros: z.boolean(), auto_apply_preferences: z.boolean().optional(), cloud_sharing: z.boolean().optional(), preferences: z.array(preferenceSchema).max(500) });
type EditingProfile = z.infer<typeof profileSchema>;
/** preferences.json as written to the profile; style sync validates a pulled copy against it. */
export const editingProfileSchema = profileSchema;
const profileBases = new WeakMap<object, { revision: string; profile: string }>();
function rawEditingProfile(): EditingProfile {
  const file = path.join(profileDir(), "preferences.json");
  if (!fs.existsSync(file)) return profileSchema.parse({ version: 1, learning: true, agent_retros: true, preferences: [] });
  return profileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
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
  const legacy = editChapters(projectId).filter(c => !known.has(c.id)).map(c => {
    const body = { id: `history:${c.id}`, time: c.time, type: "timeline.snapshot", summary: c.summary, actor: c.actor ?? "unknown", evidence: c.id,
      data: { initiated_by: c.initiated_by ?? "unknown", attribution_source: c.attribution_source ?? "unknown", responds_to_feedback_ids: c.responds_to_feedback_ids, transaction_id: c.transaction_id, proposal_ids: c.proposal_ids, restores_snapshot_id: c.restores_snapshot_id } };
    return { ...body, hash: memoryHash(body) };
  });
  return [...legacy, ...captured].sort((a,b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}

type Clip = { id: string; type: string; timeline_start: number; duration: number; removed_at?: string | null; props?: Record<string, unknown>; source_url?: string | null };
type Snapshot = Partial<EditAttribution> & { op: string; at: string; timeline: { elements: Clip[]; transitions?: unknown[] }; metadata?: Record<string, unknown>; frame_tags?: unknown; auditions?: unknown; layout_proposals?: unknown };
export type EditChapter = Partial<EditAttribution> & { id: string; time: string; operation: string; category: string; summary: string; seconds: number | null; context_changes: { field: string; before: unknown; after: unknown }[]; changes: { id: string; label: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }[] };
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
const chapterCache = new Map<string, { signature: string; chapters: EditChapter[] }>();
export function editChapters(projectId: string): EditChapter[] {
  const dir = projectHistoryDir(projectId);
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const signature = names.map(name => {
    const stat = fs.statSync(path.join(dir, name));
    return `${name}:${stat.mtimeMs}:${stat.size}`;
  }).join("|");
  const cached = chapterCache.get(dir);
  if (cached?.signature === signature) return cached.chapters;
  let previous: Snapshot | undefined;
  const chapters: EditChapter[] = [];
  for (const name of names) {
    const snap = readJsonFile<Snapshot | null>(path.join(dir, name), null);
    if (!snap?.timeline?.elements) continue;
    const before = new Map((previous?.timeline.elements ?? []).map(c => [c.id, c]));
    const after = new Map(snap.timeline.elements.map(c => [c.id, c]));
    const changes: EditChapter["changes"] = [];
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(id), b = after.get(id);
      if (memoryHash(a ? clipSummary(a) : null) === memoryHash(b ? clipSummary(b) : null)) continue;
      const c = b ?? a!;
      changes.push({ id, label: String(c.props?.text ?? c.props?.label ?? c.type).slice(0, 120), before: a ? clipSummary(a) : null, after: b ? clipSummary(b) : null });
    }
    const context_changes = (["metadata", "frame_tags", "auditions", "layout_proposals", "transitions"] as const).flatMap(field => {
      const a = (field === "transitions" ? previous?.timeline.transitions : previous?.[field]) ?? null;
      const b = (field === "transitions" ? snap.timeline.transitions : snap[field]) ?? null;
      return memoryHash(a) === memoryHash(b) ? [] : [{ field, before: a, after: b }];
    });
    const otherChanged = context_changes.length > 0;
    if (changes.length || otherChanged || /frame_tag/.test(snap.op) && !snap.op.endsWith("_before")) {
      chapters.push({ id: name, time: snap.at, operation: snap.op, category: category(snap.op),
        actor: savedActor(snap.actor), initiated_by: savedActor(snap.initiated_by), attribution_source: snap.attribution_source ?? "unknown",
        responds_to_feedback_ids: snap.responds_to_feedback_ids, transaction_id: snap.transaction_id, proposal_ids: snap.proposal_ids, restores_snapshot_id: snap.restores_snapshot_id,
        summary: `${snap.op.replaceAll("_", " ")} · ${changes.length ? `${changes.length} clip${changes.length === 1 ? "" : "s"} changed` : "project settings or review marks"}`,
        seconds: changes.length ? Math.min(...changes.map(c => Number(c.after?.timeline_start ?? c.before?.timeline_start ?? 0))) : null, changes, context_changes });
    }
    previous = snap;
  }
  if (chapterCache.size >= 8) chapterCache.delete(chapterCache.keys().next().value!);
  chapterCache.set(dir, { signature, chapters });
  return chapters;
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
    return [{ name, version: memoryHash(content), description: skillDescription(content), purpose, evolution, evolution_version: memoryHash(evolution), content, catalog: catalogBySkill.get(name) ?? null }];
  });
  const shippedNames = new Set(skills.map(skill => skill.name));
  const missing = catalog.entries.find(entry => !shippedNames.has(entry.skill));
  if (missing) throw new Error(`Skill catalog references missing skill: ${missing.skill}`);
  return skills;
}

const maintenanceSourceSchema = z.object({
  title: z.string().min(1).max(300), url: z.string().url(), claim: z.string().min(1).max(1000),
}).strict();
const maintenanceEvaluationSchema = z.object({
  request: z.string().min(1).max(1000), expected_behavior: z.string().min(1).max(1500),
}).strict();
export const skillMaintenanceInspectionSchema = z.object({
  skill: z.string().regex(/^[a-z0-9-]{1,64}$/), recommendation: z.enum(["keep", "revise", "research"]),
  rationale: z.string().min(1).max(2000), focus: z.array(z.string().min(1).max(500)).max(20),
  research_questions: z.array(z.string().min(1).max(500)).max(20),
}).strict();
export const skillMaintenanceWorkerSchema = z.object({
  skill: z.string().regex(/^[a-z0-9-]{1,64}$/), outcome: z.enum(["propose", "blocked"]),
  summary: z.string().min(1).max(2000), proposed_content: z.string().max(50_000).nullable(),
  research_sources: z.array(maintenanceSourceSchema).max(30),
  evaluation_cases: z.array(maintenanceEvaluationSchema).max(20),
  included_refinements: z.array(z.string().min(1).max(1000)).max(50),
  risks: z.array(z.string().min(1).max(1000)).max(30),
}).strict();
export const skillMaintenanceEvaluatorSchema = z.object({
  summary: z.string().min(1).max(3000), verdicts: z.array(z.object({
    skill: z.string().regex(/^[a-z0-9-]{1,64}$/), verdict: z.enum(["approve", "revise", "reject"]),
    rationale: z.string().min(1).max(2000), concerns: z.array(z.string().min(1).max(1000)).max(30),
  }).strict()).max(12),
}).strict();

const skillMaintenanceChangeSchema = skillMaintenanceWorkerSchema.extend({
  proposed_content: z.string().min(1).max(50_000),
  expected_version: z.string().regex(/^[a-f0-9]{64}$/), current_content: z.string().max(50_000),
  evaluator_rationale: z.string().min(1).max(2000),
}).strict();
export const skillMaintenanceJobSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), project_id: z.string().min(1).max(200),
  created_at: z.string(), updated_at: z.string(), status: z.enum(["queued", "running", "ready", "failed", "stale", "applied", "rejected"]),
  expected_library_version: z.string().regex(/^[a-f0-9]{64}$/), skill_versions: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  pid: z.number().int().positive().optional(), error: z.string().max(4000).optional(), summary: z.string().max(3000).optional(),
  inspections: z.array(skillMaintenanceInspectionSchema).max(100).optional(), changes: z.array(skillMaintenanceChangeSchema).max(12).optional(),
  evaluation_verdicts: skillMaintenanceEvaluatorSchema.shape.verdicts.optional(),
  worker_count: z.number().int().min(0).max(20).optional(), applied_at: z.string().optional(),
}).strict();
export type SkillMaintenanceJob = z.infer<typeof skillMaintenanceJobSchema>;

function skillLibraryVersion() {
  return memoryHash(coreSkills().map(skill => [skill.name, skill.version]).sort(([a], [b]) => a.localeCompare(b)));
}
function skillMaintenanceDir() { return path.join(profileDir(), "skill-maintenance"); }
function skillMaintenancePath(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid skill maintenance id");
  return path.join(skillMaintenanceDir(), `${id}.json`);
}
export function saveSkillMaintenanceJob(job: SkillMaintenanceJob) {
  const parsed = skillMaintenanceJobSchema.parse(job);
  writeJsonFileAtomic(skillMaintenancePath(job.id), parsed);
  return parsed;
}
export function readSkillMaintenanceJobs() {
  return jsonFiles<unknown>(skillMaintenanceDir()).flatMap(raw => {
    const parsed = skillMaintenanceJobSchema.safeParse(raw); return parsed.success ? [parsed.data] : [];
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function createSkillMaintenanceJob(projectId: string) {
  const active = readSkillMaintenanceJobs().map(reconcileSkillMaintenanceJob).find(job => ["queued", "running", "ready"].includes(job.status));
  if (active) return active;
  const skills = coreSkills();
  const now = new Date().toISOString();
  return saveSkillMaintenanceJob({ version: 1, id: randomUUID(), project_id: projectId, created_at: now, updated_at: now, status: "queued",
    expected_library_version: memoryHash(skills.map(skill => [skill.name, skill.version]).sort(([a], [b]) => a.localeCompare(b))),
    skill_versions: Object.fromEntries(skills.map(skill => [skill.name, skill.version])) });
}
export function readSkillMaintenanceJob(id: string) {
  return skillMaintenanceJobSchema.parse(readJsonFile<unknown>(skillMaintenancePath(id), null));
}
export function reconcileSkillMaintenanceJob(job: SkillMaintenanceJob) {
  let next = job;
  if (job.status === "running" && job.pid) {
    try { process.kill(job.pid, 0); } catch { next = { ...job, status: "failed", updated_at: new Date().toISOString(), error: "Skill maintenance was interrupted. Run it again." }; }
  }
  if (job.status === "ready" && skillLibraryVersion() !== job.expected_library_version) {
    next = { ...job, status: "stale", updated_at: new Date().toISOString(), error: "The skill library changed after this review started. Run maintenance again against the current skills." };
  }
  if (next !== job) saveSkillMaintenanceJob(next);
  return next;
}
export function validateMaintainedSkill(skill: string, content: string) {
  if (!content.startsWith("---\n")) throw new Error(`Proposed ${skill} skill is missing YAML frontmatter`);
  if (!new RegExp(`^name:\\s*${skill.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "m").test(content)) throw new Error(`Proposed skill name does not match ${skill}`);
  if (!/^description:\s*.+$/m.test(content)) throw new Error(`Proposed ${skill} skill is missing its description`);
}
export function resolveSkillMaintenanceJob(projectId: string, id: string, decision: "apply" | "reject") {
  const job = reconcileSkillMaintenanceJob(readSkillMaintenanceJob(id));
  if (job.status !== "ready") throw new Error(`Skill maintenance is ${job.status}, not ready for review`);
  const now = new Date().toISOString();
  if (decision === "reject") {
    const rejected = saveSkillMaintenanceJob({ ...job, status: "rejected", updated_at: now });
    safeMemoryEvent(job.project_id, { type: "skill.maintenance_rejected", actor: "human", summary: "Rejected the skill maintenance bundle", evidence: id,
      data: projectId === job.project_id ? undefined : { reviewed_from_project: projectId } });
    return rejected;
  }
  if (skillLibraryVersion() !== job.expected_library_version) throw new Error("The skill library changed after this review started. Run maintenance again.");
  const changes = job.changes ?? [];
  const originals = changes.map(change => {
    const file = path.join(skillsDirectory(), change.skill, "SKILL.md");
    const current = fs.readFileSync(file, "utf8");
    if (memoryHash(current) !== change.expected_version) throw new Error(`${change.skill} changed after maintenance started`);
    validateMaintainedSkill(change.skill, change.proposed_content);
    const evolution = path.join(path.dirname(file), "evolution.md");
    const previousEvolution = fs.existsSync(evolution) ? fs.readFileSync(evolution, "utf8") : null;
    const evolutionBase = previousEvolution ?? `# ${change.skill} evolution\n`;
    const nextEvolution = evolutionBase.includes(job.id) ? evolutionBase
      : `${evolutionBase.trimEnd()}\n\n${now.slice(0, 10)}: Applied consolidated skill maintenance bundle \`${job.id}\`. ${change.summary}\n`;
    return { change, file, current, evolution, previousEvolution, nextEvolution };
  });
  const writes = originals.flatMap(item => [
    { file: item.file, before: item.current, after: item.change.proposed_content },
    { file: item.evolution, before: item.previousEvolution, after: item.nextEvolution },
  ]);
  const written: typeof writes = [];
  let applied: SkillMaintenanceJob;
  try {
    for (const write of writes) { if (write.after !== write.before) { writeTextFileAtomic(write.file, write.after); written.push(write); } }
    applied = saveSkillMaintenanceJob({ ...job, status: "applied", updated_at: now, applied_at: now });
  } catch (error) {
    for (const write of written.reverse()) {
      if (write.before === null) { try { fs.unlinkSync(write.file); } catch { /* the failed write may not exist */ } }
      else writeTextFileAtomic(write.file, write.before);
    }
    throw error;
  }
  safeMemoryEvent(job.project_id, { type: "skill.maintenance_applied", actor: "human", summary: `Applied maintenance to ${changes.length} skill${changes.length === 1 ? "" : "s"}`, evidence: id,
    data: projectId === job.project_id ? undefined : { reviewed_from_project: projectId } });
  return applied;
}

const skillCandidateSchema = z.object({
  reasoning: retroReasoningSchema.optional(),
  version: z.literal(1), id: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["pending", "approved", "rejected"]),
  created_at: z.string(), reviewed_at: z.string().optional(), retro_id: z.string(), target_skill: z.string().regex(/^[a-z0-9-]{1,64}$/).nullable(),
  proposed_change: z.string().min(1).max(1000), category: preferenceSchema.shape.category, evidence: z.array(z.string()).min(1).max(20),
  counterevidence: z.array(z.string()).max(20), checkpoint_revision: z.string(), expected_skill_version: z.string().nullable(), cases: z.array(z.unknown()).max(200),
  gate: z.string(), evolution_log: z.string().optional(),
  promotion_mode: z.enum(["exact_version", "merged_onto_changed_skill", "already_present"]).optional(),
  applied_skill_version: z.string().optional(),
  reconciled_into: z.string().optional(),
  source_candidate_ids: z.array(z.string()).optional(),
  source_retro_ids: z.array(z.string()).optional(),
}).strict();
export type SkillCandidate = z.infer<typeof skillCandidateSchema>;

/** Explicit human-approved reconciliation. Originals remain immutable evidence of wording. */
export function reconcileAndApplySkillCandidates(projectId: string, ids: string[], instruction: string) {
  const originals = [...new Set(ids)].map(id => skillCandidateSchema.parse(readJsonFile<unknown>(skillCandidatePath(projectId, id), null)));
  if (originals.length < 2 || originals.some(c => c.status !== "pending" || c.target_skill !== originals[0]!.target_skill)) throw new Error("Reconciliation requires pending candidates for the same skill");
  const id = memoryHash({ candidates: [...ids].sort(), instruction });
  const merged = skillCandidateSchema.parse({ ...originals[0], id, proposed_change: instruction,
    source_candidate_ids: originals.map(c => c.id), source_retro_ids: [...new Set(originals.map(c => c.retro_id))],
    evidence: [...new Set(originals.flatMap(c => c.evidence))], counterevidence: [...new Set(originals.flatMap(c => c.counterevidence))],
    cases: originals.flatMap(c => c.cases), gate: "Explicitly reconciled and approved by the user." });
  writeJsonFileAtomic(skillCandidatePath(projectId, id), merged);
  const approved = reviewSkillCandidate(projectId, id, "approve");
  for (const original of originals) writeJsonFileAtomic(skillCandidatePath(projectId, original.id), {
    ...original, status: "approved", reviewed_at: approved.reviewed_at, reconciled_into: id,
    evolution_log: approved.evolution_log, applied_skill_version: approved.applied_skill_version,
  });
  return approved;
}

function skillCandidatesDir(projectId: string) { return path.join(memoryDir(projectId), "skill-candidates"); }
function skillCandidatePath(projectId: string, id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid skill improvement id");
  return path.join(skillCandidatesDir(projectId), `${id}.json`);
}
export function readSkillCandidates(projectId: string): SkillCandidate[] {
  const directory = skillCandidatesDir(projectId);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith(".json")).flatMap((name) => {
    const raw = readJsonFile<unknown>(path.join(directory, name), null);
    const parsed = skillCandidateSchema.safeParse(raw);
    if (parsed.success) return [parsed.data];
    if (!raw || typeof raw !== "object") return [];
    const legacy = raw as { lesson?: unknown; status?: unknown; category?: unknown; evidence?: unknown; counterevidence?: unknown; checkpoint_revision?: unknown; cases?: unknown; gate?: unknown };
    if (typeof legacy.lesson !== "string") return [];
    const filenameId = path.basename(name, ".json");
    return [skillCandidateSchema.parse({ version: 1, id: /^[a-f0-9]{64}$/.test(filenameId) ? filenameId : memoryHash(raw), status: legacy.status === "rejected" ? "rejected" : "pending", created_at: new Date(0).toISOString(), retro_id: "legacy",
      target_skill: null, proposed_change: legacy.lesson, category: legacy.category, evidence: legacy.evidence, counterevidence: legacy.counterevidence ?? [],
      checkpoint_revision: legacy.checkpoint_revision ?? "legacy", expected_skill_version: null, cases: legacy.cases ?? [], gate: legacy.gate ?? "Assign a target skill before promotion." })];
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function memoryAttentionCount(projectId: string) {
  const readyMaintenance = readSkillMaintenanceJobs().some(job => reconcileSkillMaintenanceJob(job).status === "ready") ? 1 : 0;
  return readSkillCandidates(projectId).filter(candidate => candidate.status === "pending").length + readyMaintenance;
}

function normalizedInstruction(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Both preview and approval use this additive merge; never preview a rewrite
 * while committing an append (or vice versa). */
export function previewSkillCandidate(candidate: SkillCandidate) {
  const skill = coreSkills().find(s => s.name === candidate.target_skill);
  if (!skill) return null;
  const current = skill.content;
  const change = normalizedInstruction(candidate.proposed_change);
  const heading = "## Learned refinements";
  const proposed = normalizedInstruction(current).includes(change) ? current
    : `${current.trimEnd()}${current.includes(heading) ? "\n" : `\n\n${heading}\n\n`}- ${change}\n`;
  return { current, proposed };
}

function skillCandidateReviewState(candidate: SkillCandidate) {
  if (!candidate.target_skill || !candidate.expected_skill_version) return "unassigned" as const;
  const skillPath = path.join(skillsDirectory(), candidate.target_skill, "SKILL.md");
  if (!fs.existsSync(skillPath)) return "missing" as const;
  const current = fs.readFileSync(skillPath, "utf8");
  if (normalizedInstruction(current).includes(normalizedInstruction(candidate.proposed_change))) return "already_present" as const;
  return memoryHash(current) === candidate.expected_skill_version ? "current" as const : "changed" as const;
}

function writeTextFileAtomic(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

export function reviewSkillCandidate(projectId: string, id: string, decision: "approve" | "reject") {
  const file = skillCandidatePath(projectId, id);
  const candidate = skillCandidateSchema.parse(readJsonFile<unknown>(file, null));
  if (candidate.status !== "pending") throw new Error("This skill improvement has already been reviewed");
  const reviewedAt = new Date().toISOString();
  if (decision === "reject") {
    const rejected = skillCandidateSchema.parse({ ...candidate, status: "rejected", reviewed_at: reviewedAt });
    writeJsonFileAtomic(file, rejected);
    safeMemoryEvent(projectId, { type: "skill.candidate_rejected", actor: "human", summary: `Rejected improvement for ${candidate.target_skill ?? "an unassigned skill"}`, evidence: id });
    return rejected;
  }
  if (!candidate.target_skill || !candidate.expected_skill_version) throw new Error("This older candidate needs a target skill before it can be approved");
  const skillDir = path.join(skillsDirectory(), candidate.target_skill);
  const skillPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillPath)) throw new Error(`Skill no longer exists: ${candidate.target_skill}`);
  const current = fs.readFileSync(skillPath, "utf8");
  const change = candidate.proposed_change.replace(/\s+/g, " ").trim();
  const alreadyPresent = normalizedInstruction(current).includes(change);
  const changedSinceRetro = memoryHash(current) !== candidate.expected_skill_version;
  const promotionMode = alreadyPresent ? "already_present" as const
    : changedSinceRetro ? "merged_onto_changed_skill" as const
      : "exact_version" as const;
  const nextSkill = previewSkillCandidate(candidate)!.proposed;
  const evolutionName = "evolution.md";
  const evolutionPath = path.join(skillDir, evolutionName);
  const previousEvolution = fs.existsSync(evolutionPath) ? fs.readFileSync(evolutionPath, "utf8") : `# ${candidate.target_skill} evolution\n`;
  const action = promotionMode === "already_present" ? "Reconciled already-incorporated Memory improvement"
    : promotionMode === "merged_onto_changed_skill" ? "Approved and additively merged Memory improvement"
      : "Approved Memory improvement";
  const evolutionEntry = `\n\n## ${reviewedAt.slice(0, 10)}\n- **Observation:** ${change} Evidence: ${candidate.evidence.join(", ")}.\n- **Decision:** Updated — ${action} \`${id}\` from retros ${(candidate.source_retro_ids ?? [candidate.retro_id]).map(value => `\`${value}\``).join(", ")}. Reconciled candidates: ${(candidate.source_candidate_ids ?? [id]).join(", ")}.\n- **Verification:** Human-approved instruction incorporated once; operational verification remains required when applying the skill to an edit.\n`;
  const nextEvolution = previousEvolution.includes(id) ? previousEvolution : `${previousEvolution.trimEnd()}${evolutionEntry}`;
  if (nextSkill !== current) writeTextFileAtomic(skillPath, nextSkill);
  try {
    if (nextEvolution !== previousEvolution) writeTextFileAtomic(evolutionPath, nextEvolution);
  } catch (error) {
    if (nextSkill !== current) writeTextFileAtomic(skillPath, current);
    throw error;
  }
  const approved = skillCandidateSchema.parse({ ...candidate, status: "approved", reviewed_at: reviewedAt, evolution_log: evolutionName,
    promotion_mode: promotionMode, applied_skill_version: memoryHash(nextSkill) });
  writeJsonFileAtomic(file, approved);
  safeMemoryEvent(projectId, { type: "skill.candidate_promoted", actor: "human",
    summary: promotionMode === "already_present" ? `Reconciled existing improvement in ${candidate.target_skill}`
      : promotionMode === "merged_onto_changed_skill" ? `Merged improvement into current ${candidate.target_skill}`
        : `Promoted improvement to ${candidate.target_skill}`, evidence: id });
  return approved;
}
const proposalCache = new Map<string, { signature: string; value: ProposalRecord[] }>();
function memoryProposals(projectId: string) {
  const directory = path.join(projectDir(projectId), "proposals");
  const names = listDirectory(directory).filter(f => f.endsWith(".json"));
  return statCached(proposalCache, directory, `${names.join("/")}\n${statSignature(names.map(name => path.join(directory, name)))}`, () => jsonFiles<ProposalRecord>(directory));
}
function memorySequences(projectId: string) {
  const timeline = readJsonFile<{ elements: Clip[] }>(path.join(projectDir(projectId), "timeline.json"), { elements: [] });
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
    sequences, retros: jsonFiles<RetroRecord>(path.join(memoryDir(projectId), "retros")).map(r => reconcileRetro(projectId, r)).sort((a,b) => b.created_at.localeCompare(a.created_at)).map(({ checkpoint: _checkpoint, ...summary }) => summary),
    skill_candidates: readSkillCandidates(projectId).map(candidate => ({ ...candidate, review_state: skillCandidateReviewState(candidate), preview: previewSkillCandidate(candidate) })),
    skill_maintenance_jobs: readSkillMaintenanceJobs().slice(0, 10).map(reconcileSkillMaintenanceJob),
    core_skills: coreSkills(), user_skills: readUserSkills(coreSkills().map(({ name, description, content, catalog }) => ({ name, description, content, catalog })), profileDir()), effective_preferences: effectivePreferences(projectId, String(metadata.output_aspect_ratio)),
    project_id: projectId };
}
const viewVersionCache = new Map<string, { signature: string; value: string }>();
/** Version of everything readMemoryView/readMemoryPage derive from. Inputs are stat-keyed, so
 * an unchanged view costs a few stats instead of re-reading every skill. */
export function memoryViewVersion(projectId: string) {
  const files = [projectHistoryDir(projectId), path.join(projectDir(projectId), "proposals"), path.join(projectDir(projectId), "timeline.json"), path.join(projectDir(projectId), "metadata.json"), path.join(profileDir(), "preferences.json"), path.join(profileDir(), "STYLE.md"), skillMaintenanceDir(), ...["events", "retros", "skill-candidates"].map(name => path.join(memoryDir(projectId), name))];
  const stats = files.map(file => { try { const s = fs.statSync(file); return [s.mtimeMs, s.size]; } catch { return null; } });
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
  const matching = editChapters(projectId).filter(chapter => !category || chapter.category === category);
  const end = query.cursor ? matching.filter(chapter => chapter.id < query.cursor!).length : matching.length;
  const start = Math.max(0, end - limit);
  const chapters: MemoryChapterSummary[] = matching.slice(start, end).reverse().map(({ changes, context_changes, ...summary }) => ({ ...summary, change_count: changes.length, context_change_count: context_changes.length }));
  return { chapters, chapter_page: { total: matching.length, limit, category: category ?? "All", next_cursor: start > 0 ? matching[start]!.id : null } };
}
export function memoryChapter(projectId: string, id: string) {
  const chapter = editChapters(projectId).find(item => item.id === id);
  if (!chapter) throw new Error("Chapter not found");
  return chapter;
}

type RetroSummary = Omit<RetroRecord, "checkpoint">;
const retroSummaryCache = new Map<string, { signature: string; value: (RetroSummary & { trigger: unknown })[] }>();
/** Retro records without their large checkpoints, with reconciliation applied in memory only.
 * Persisting a reconciled status and dispatching queued work belong to resumeProjectRetros. */
export function memoryRetroSummaries(projectId: string): RetroSummary[] {
  const directory = path.join(memoryDir(projectId), "retros");
  const names = listDirectory(directory).filter(f => f.endsWith(".json"));
  const records = statCached(retroSummaryCache, directory, `${names.join("/")}\n${statSignature(names.map(name => path.join(directory, name)))}`, () => names.flatMap(name => {
    const record = readJsonFile<RetroRecord | null>(path.join(directory, name), null);
    if (!record) return [];
    const { checkpoint, ...summary } = record;
    return [{ ...summary, trigger: checkpoint?.trigger }];
  }));
  return records.map(({ trigger, ...summary }) => {
    const patch = retroTransition(summary, trigger);
    return patch ? { ...summary, ...patch } : summary;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
function retroOutbox(retros: RetroSummary[]) {
  const count = (status: RetroRecord["status"]) => retros.filter(retro => retro.status === status).length;
  return { waiting: count("waiting"), queued: count("queued"), running: count("running") };
}
/** Retros the outbox may still dispatch; all zero means resuming would be a no-op. */
export function memoryRetroOutbox(projectId: string) { return retroOutbox(memoryRetroSummaries(projectId)); }

/** Bounded projection for the editing-memory page. The default full view stays the agent/tool contract. */
export function readMemoryPage(projectId: string, section: "user" | "history", chapterQuery: MemoryChapterQuery = {}) {
  const profile = readEditingProfile();
  const retros = memoryRetroSummaries(projectId);
  const common = { project_id: projectId, profile, retro_outbox: retroOutbox(retros) };
  if (section === "user") {
    const skills = coreSkills();
    return { ...common, section,
      style_document: readPersonalStyleDocument(),
      skill_update_events: capturedMemoryEvents(projectId).filter(event => event.type === "skill.direct_update").sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id)),
      skill_candidates: readSkillCandidates(projectId).map(candidate => ({ ...candidate, review_state: skillCandidateReviewState(candidate), preview: previewSkillCandidate(candidate) })),
      skill_maintenance_jobs: readSkillMaintenanceJobs().slice(0, 10).map(reconcileSkillMaintenanceJob),
      user_skills: readUserSkills(skills.map(({ name, description, content, catalog }) => ({ name, description, content, catalog })), profileDir()),
    };
  }
  const proposals = memoryProposals(projectId);
  const skillCandidateCounts: Record<string, number> = {};
  for (const candidate of readSkillCandidates(projectId)) skillCandidateCounts[candidate.retro_id] = (skillCandidateCounts[candidate.retro_id] ?? 0) + 1;
  return { ...common, section,
    feedback: feedbackCoverage(memoryEvents(projectId), proposals),
    sequences: memorySequences(projectId),
    proposals: proposals.map(proposal => ({ proposal_id: proposal.proposal_id, status: proposal.status, proposal: { summary: proposal.proposal.summary } })),
    retros, retro_skill_candidate_counts: skillCandidateCounts,
    ...memoryChapterPage(projectId, chapterQuery),
  };
}
export type MemoryPage = ReturnType<typeof readMemoryPage>;

export type RetroRecord = { id: string; created_at: string; revision: string; status: "waiting" | "queued" | "running" | "complete" | "failed"; error?: string; pid?: number; attempt_count?: number; summary?: string; findings?: RetroFinding[]; checkpoint: Record<string, unknown> };
export const retroFindingSchema = z.object({ category: preferenceSchema.shape.category, lesson: z.string().min(1).max(1000), scope: preferenceSchema.shape.scope,
  disposition: z.enum(["observation", "preference", "skill_candidate", "bug"]), evidence: z.array(z.string()).min(1).max(20), counterevidence: z.array(z.string()).max(20),
  reasoning: retroReasoningSchema.optional(),
  target_skill: z.string().regex(/^[a-z0-9-]{1,64}$/).nullable().optional(), proposed_change: z.string().min(1).max(1000).nullable().optional() });
export type RetroFinding = z.infer<typeof retroFindingSchema>;
export const retroOutputSchema = z.object({ summary: z.string().min(1).max(2000), findings: z.array(retroFindingSchema).max(20) }).strict();

/** Limit generation to the same IDs included in the bounded evidence payload. */
export function retroOutputSchemaForEvidence(ids: string[]) {
  const unique = [...new Set(ids)];
  // Structured outputs require every declared object property in `required`.
  // Keep these nullable on the generation wire instead of optional; the
  // canonical parser remains backwards-compatible with older saved retros.
  const generationFindingSchema = retroFindingSchema.extend({
    reasoning: retroReasoningSchema,
    target_skill: z.string().regex(/^[a-z0-9-]{1,64}$/).nullable(),
    proposed_change: z.string().min(1).max(1000).nullable(),
  });
  if (!unique.length) return retroOutputSchema.extend({ findings: z.array(generationFindingSchema).max(0) });
  const citation = z.enum(unique as [string, ...string[]]);
  return retroOutputSchema.extend({ findings: z.array(generationFindingSchema.extend({
    evidence: z.array(citation).min(1).max(20),
    counterevidence: z.array(citation).max(20),
  })).max(20) });
}

export function retroPath(projectId: string, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new Error("Invalid retro id");
  return path.join(memoryDir(projectId), "retros", `${id}.json`);
}
export function saveRetro(projectId: string, record: RetroRecord) { writeJsonFileAtomic(retroPath(projectId, record.id), record); }
function retroTransition(record: Pick<RetroRecord, "id" | "status" | "pid" | "attempt_count">, trigger: unknown): Pick<RetroRecord, "status"> & Partial<Pick<RetroRecord, "error">> | null {
  const alive = (pid?: number) => { try { if (!pid) return false; process.kill(pid, 0); return true; } catch { return false; } };
  if (record.status === "running" && !alive(record.pid)) return { status: (record.attempt_count ?? 0) < 3 ? "queued" : "failed", error: "Retrospective interrupted by a server restart. Retrying the saved checkpoint; after three interruptions manual retry is required." };
  if (record.status === "waiting" && trigger === "export") {
    const job = readJsonFile<{ status: string; pid?: number } | null>(path.join(projectsRoot(), ".cache", "render-jobs", `${record.id}.json`), null);
    if (job?.status === "completed") return { status: "queued" };
    if (!job || ["failed", "canceled"].includes(job.status) || !alive(job.pid)) return { status: "failed", error: "Export did not finish. Export again to review a successful delivery." };
  }
  return null;
}
export function reconcileRetro(projectId: string, record: RetroRecord): RetroRecord {
  const patch = retroTransition(record, record.checkpoint.trigger);
  if (!patch) return record;
  const next: RetroRecord = { ...record, ...patch };
  saveRetro(projectId, next);
  return next;
}
export function exportCheckpointReady(record: RetroRecord) {
  if (record.checkpoint.trigger !== "export") return true;
  return readJsonFile<{ status: string } | null>(path.join(projectsRoot(), ".cache", "render-jobs", `${record.id}.json`), null)?.status === "completed";
}
export function createRetroCheckpoint(projectId: string, id: string, checkpoint: Record<string, unknown>, waiting = true) {
  const file = retroPath(projectId, id);
  if (fs.existsSync(file)) return readJsonFile<RetroRecord>(file, null!);
  const view = readMemoryView(projectId);
  const record: RetroRecord = { id, created_at: new Date().toISOString(), revision: memoryHash(checkpoint), status: waiting ? "waiting" : "queued",
    checkpoint: { ...checkpoint, chapters: view.chapters, proposals: view.proposals, events: view.events, feedback: view.feedback, core_skills: view.core_skills, preferences: view.effective_preferences } };
  saveRetro(projectId, record); return record;
}
export function acceptRetroOutput(projectId: string, record: RetroRecord, raw: unknown) {
  if (record.checkpoint.retro_workflow === "slices-v1") throw new Error("Slice coordinator is dry-review only; adoption is not enabled");
  if (!exportCheckpointReady(record)) throw new Error("Export did not finish; cannot adopt its retrospective");
  const result = retroOutputSchema.parse(raw);
  const chapters = record.checkpoint.chapters as EditChapter[];
  const events = record.checkpoint.events as MemoryEvent[];
  const proposals = record.checkpoint.proposals as { proposal_id: string }[];
  const allowed = new Set([...chapters.map(c => c.id), ...events.map(e => e.id), ...proposals.map(p => p.proposal_id)]);
  for (const finding of result.findings) for (const id of [...finding.evidence, ...finding.counterevidence]) {
    if (!allowed.has(id)) throw new Error(`Retro cited evidence outside its frozen checkpoint: ${JSON.stringify(id)}`);
  }
  // Retro output is staged as data. Only the separate human review action can change a skill.
  const profile = readEditingProfile();
  const candidateFindings = result.findings.filter(f => f.disposition === "skill_candidate");
  const skills = record.checkpoint.core_skills as { name: string; version: string }[];
  for (const finding of candidateFindings) {
    const target = skills.find(skill => skill.name === finding.target_skill);
    if (!target || !finding.proposed_change) throw new Error("A skill candidate must name an existing target skill and the proposed change");
    const id = memoryHash({ retro: record.id, finding });
    const fixture: SkillCandidate = { version: 1, id, status: "pending", created_at: new Date().toISOString(), retro_id: record.id,
      target_skill: target.name, proposed_change: finding.proposed_change, category: finding.category, evidence: finding.evidence,
      checkpoint_revision: record.revision, cases: chapters.filter(c => finding.evidence.includes(c.id)), counterevidence: finding.counterevidence,
      expected_skill_version: target.version, ...(finding.reasoning ? { reasoning: finding.reasoning } : {}), gate: "Review the exact behavior change, evidence and any inferred rationale. Approval updates the skill and appends its evolution log." };
    writeJsonFileAtomic(skillCandidatePath(projectId, id), fixture);
  }
  if (profile.learning) for (const f of result.findings.filter(f => f.disposition === "preference")) {
    if (profile.preferences.some(p => p.text === f.lesson)) continue;
    // New inferred lessons may promote, but confidence alone is not actor proof.
    // Legacy saved findings keep their existing adoption policy.
    const humanEvidence = f.evidence.some(id => chapters.some(c => c.id === id && c.actor === "human") || events.some(e => e.id === id && e.actor === "human"));
    const uncertain = f.reasoning && (f.reasoning.basis === "unknown" || f.reasoning.confidence !== "high" || !humanEvidence);
    const needsReview = !profile.auto_apply_preferences && (f.counterevidence.length > 0 || Boolean(uncertain));
    profile.preferences.push({ id: randomUUID(), text: f.lesson, category: f.category, scope: f.scope, project_id: f.scope === "project" ? projectId : undefined,
      origin: "retro", status: needsReview ? "suggested" : "active", evidence: [...new Set([...f.evidence, ...f.counterevidence])].map(id => `${projectId}:${id}`), updated_at: new Date().toISOString(), ...(f.reasoning ? { reasoning: f.reasoning } : {}) });
    safeMemoryEvent(projectId, { type: needsReview && f.counterevidence.length ? "preference.conflict" : needsReview ? "preference.suggested" : "preference.learned", actor: "system", summary: needsReview ? `Style inference or conflict needs review: ${f.lesson}` : `Style learned automatically: ${f.lesson}`, evidence: record.id, ...(f.reasoning ? { data: { reasoning: f.reasoning } } : {}) });
  }
  writeEditingProfile(profile);
  saveRetro(projectId, { ...record, ...result, status: "complete", error: undefined });
  safeMemoryEvent(projectId, { type: "retro.completed", actor: "system", summary: result.summary, evidence: record.id });
}
