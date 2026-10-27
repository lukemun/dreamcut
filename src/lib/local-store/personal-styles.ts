import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { coreSkills, profileDir, recordMemoryEvent } from "./editing-memory";
import { readMetadata, assertProject } from "./store";
import { timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import { writeJsonFileAtomic } from "./atomic-json";
import { notifyLocalStyleChanged } from "./style-change-signal";
import { effectCatalogSchema } from "@/lib/effects/recipes";

import { personalStyleSchema, styleInputSchema, type PersonalStyle } from "./personal-style-schema";
export { personalStyleSchema, styleBundleSchema, styleInputSchema, type PersonalStyle } from "./personal-style-schema";
function directory() { return path.join(profileDir(), "personal-styles"); }
function file(id: string) { return path.join(directory(), `${z.string().uuid().parse(id)}.json`); }
export function readPersonalStyle(id: string) {
  const value = personalStyleSchema.parse(JSON.parse(fs.readFileSync(file(id), "utf8")));
  if (value.id !== id) throw new Error("Style identity mismatch");
  return value;
}
export function listPersonalStyles() {
  if (!fs.existsSync(directory())) return [];
  return fs.readdirSync(directory()).filter(f => /^[a-f0-9-]{36}\.json$/.test(f))
    .map(f => readPersonalStyle(f.slice(0, -5))).sort((a,b) => a.name.localeCompare(b.name));
}
export function validateStyleReferences(bundles: PersonalStyle["bundles"]) {
  const names = new Set(coreSkills().flatMap(s => [s.name, ...s.aliases]));
  for (const bundle of bundles) {
    if (!names.has(bundle.skill)) throw new Error(`Unavailable skill: ${bundle.skill}`);
    if (!Object.keys(bundle.parameters).length) throw new Error("Style needs explicit parameters");
    if (bundle.recipe_id) {
      const catalog = effectCatalogSchema.parse(JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs/effects/catalog.json"), "utf8")));
      const entry = catalog.entries.find(e => e.catalog_id === bundle.recipe_id);
      if (!entry || entry.recipe.skill !== bundle.skill || entry.recipe.status === "candidate") throw new Error("Recipe is unavailable for this skill");
    }
  }
}
export function savePersonalStyle(projectId: string, input: unknown, existing?: { id: string; expected_revision: number }) {
  assertProject(projectId);
  const parsed = styleInputSchema.parse(input);
  validateStyleReferences(parsed.bundles);
  const id = existing?.id ?? randomUUID();
  fs.mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const lock = `${file(id)}.lock`;
  const fd = fs.openSync(lock, "wx", 0o600);
  try {
    const old = existing ? readPersonalStyle(id) : null;
    if (old && old.revision !== existing!.expected_revision) throw Object.assign(new Error("Style changed; reload before saving"), { status: 409 });
    const now = new Date().toISOString();
    const style = personalStyleSchema.parse({ ...parsed, schema_version: 1, id, revision: (old?.revision ?? 0) + 1,
      created_at: old?.created_at ?? now, updated_at: now,
      source_edit: old?.source_edit ?? { project_id: projectId, title: readMetadata(projectId).title ?? projectId, timeline_revision: timelineRevision(projectId) } });
    writeJsonFileAtomic(path.join(directory(), "revisions", id, `${style.revision}.json`), style);
    writeJsonFileAtomic(file(id), style);
    // Keep personal content out of the project ledger / potential contribution records.
    try { recordMemoryEvent(projectId, { type: "style.saved", actor: "human", summary: "A personal style was saved locally.", data: { local_only: true } }); } catch {
      // The immutable local revision remains the save receipt if the project ledger is unavailable.
    }
    notifyLocalStyleChanged();
    return style;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
export function personalStyleSnapshot(id: string, revision: number) {
  const style = readPersonalStyle(id);
  if (style.revision !== revision) throw Object.assign(new Error("Style changed; reload before preparing a proposal"), { status: 409 });
  validateStyleReferences(style.bundles);
  return { style, sha256: createHash("sha256").update(JSON.stringify(style)).digest("hex") };
}
