import { isDeepStrictEqual } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

const text = z.string().min(1);
const artifact = z.object({
  path: text, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["video", "image", "audio"]), credit: text,
  rights: z.enum(["owned", "licensed", "synthetic", "credited-excerpt", "pexels-license"]),
}).strict();
const evidenceSchema = z.object({ before: z.array(artifact), after: z.array(artifact),
  observations: z.array(text), limitations: z.array(text) }).strict();
const recipeBase = z.object({
  version: z.literal(1), reference: artifact,
  skill: z.string().regex(/^[a-z0-9-]+$/), skill_path: text, evidence_path: text,
  inputs: z.array(text).min(1), preparation: text, success_criteria: z.array(text).min(1),
}).strict();
// Status constraints are represented in exported JSON Schema as well as runtime validation.
export const effectRecipeSchema = z.discriminatedUnion("status", [
  recipeBase.extend({ status: z.literal("candidate"), recreation: z.null(),
    evidence: evidenceSchema.extend({limitations: z.array(text).min(1)}) }),
  recipeBase.extend({ status: z.literal("partial"), recreation: artifact,
    evidence: evidenceSchema.extend({before: z.array(artifact).min(1), after: z.array(artifact).min(1), limitations: z.array(text).min(1)}) }),
  recipeBase.extend({ status: z.literal("complete"), recreation: artifact,
    evidence: evidenceSchema.extend({before: z.array(artifact).min(1), after: z.array(artifact).min(1), limitations: z.array(text).max(0)}) }),
]);
export const effectCatalogSchema = z.object({
  schema_version: z.literal(1), entries: z.array(z.object({
    catalog_id: z.string().regex(/^FX-[A-Z0-9-]+$/), name: text, recipe_name: text,
    recipe: effectRecipeSchema,
  }).passthrough()).min(1),
}).passthrough();
export type EffectRecipe = z.infer<typeof effectRecipeSchema>;

/** Resolve portable repository paths, including symlinks, without leaving the repo. */
function resolveArtifact(root: string, base: string, relative: string) {
  if (path.isAbsolute(relative) || relative.includes("\\")) throw new Error(`Non-portable path: ${relative}`);
  const actual = fs.realpathSync(path.resolve(base, relative));
  if (!actual.startsWith(fs.realpathSync(root) + path.sep)) throw new Error(`Path escapes repository: ${relative}`);
  return actual;
}
export function validateEffectCatalog(root = process.cwd()) {
  const base = path.join(root, "docs/effects");
  const catalog = effectCatalogSchema.parse(JSON.parse(fs.readFileSync(path.join(base, "catalog.json"), "utf8")));
  const ids = new Set<string>();
  for (const entry of catalog.entries) {
    if (ids.has(entry.catalog_id)) throw new Error(`Duplicate effect: ${entry.catalog_id}`);
    ids.add(entry.catalog_id);
    const r = entry.recipe;
    const skill = resolveArtifact(root, base, r.skill_path);
    if (skill !== fs.realpathSync(path.join(root, ".agents/skills", r.skill, "SKILL.md"))) throw new Error("Skill identity mismatch");
    const evidencePath = resolveArtifact(root, base, r.evidence_path);
    if (evidencePath !== path.join(path.dirname(skill), "references/effect-evidence.json")) throw new Error("Evidence must live with its owning skill at references/effect-evidence.json");
    const source = fs.readFileSync(skill, "utf8");
    if (!source.includes("references/effect-evidence.json")) throw new Error(`Missing skill evidence link: ${r.skill}`);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const receipt = evidence.entries.find((x: { catalog_id: string }) => x.catalog_id === entry.catalog_id);
    if (!receipt || !isDeepStrictEqual(receipt.recipe, r) || !receipt.catalog.endsWith(`catalog.json#${entry.catalog_id}`))
      throw new Error(`Missing or stale skill evidence backlink: ${entry.catalog_id}`);
    if (resolveArtifact(root, path.dirname(evidencePath), receipt.catalog.split("#")[0]) !== fs.realpathSync(path.join(base, "catalog.json"))) throw new Error("Evidence backlink targets a different catalog");
    if (r.recreation && !r.evidence.after.some(a => a.path === r.recreation!.path && a.sha256 === r.recreation!.sha256)) throw new Error("Recreation must be included in after evidence");
    for (const item of [r.reference, r.recreation, ...r.evidence.before, ...r.evidence.after].filter(x => x !== null)) {
      const file = resolveArtifact(root, base, item.path);
      const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      if (hash !== item.sha256) throw new Error(`Evidence hash mismatch: ${item.path}`);
    }
  }
  // Check inverse ownership too: a removed catalog row cannot strand skill evidence.
  for (const skillName of fs.readdirSync(path.join(root, ".agents/skills"))) {
    const file = path.join(root, ".agents/skills", skillName, "references/effect-evidence.json");
    if (!fs.existsSync(file)) continue;
    for (const receipt of JSON.parse(fs.readFileSync(file, "utf8")).entries) {
      if (!catalog.entries.some(e => e.catalog_id === receipt.catalog_id && e.recipe.skill === skillName))
        throw new Error(`Orphan skill evidence: ${skillName}/${receipt.catalog_id}`);
    }
  }
  return catalog;
}
