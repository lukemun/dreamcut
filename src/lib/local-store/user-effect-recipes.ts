import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { GuideEffect } from "../effects/guide";

const text = z.string().trim().min(1).max(2000);
const relativeFile = z.string().regex(/^[a-z0-9-]+\/[a-z0-9.-]+\.mp4$/);
const relativePoster = z.string().regex(/^[a-z0-9-]+\/[a-z0-9.-]+\.jpg$/);
export const userEffectRecipesSchema = z.object({
  schema_version: z.literal(1),
  recipes: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/),
    title: text, description: text,
    skill: z.string().regex(/^[a-z0-9-]{1,80}$/),
    status: z.literal("candidate"),
    family: z.object({
      id: z.string().regex(/^[a-z0-9-]{1,80}$/),
      title: text,
      variant: text,
    }).strict().optional(),
    inputs: z.array(z.object({ title: text, directions: text }).strict()).min(1).max(20),
    preparation: text, prompt: text,
    limitations: z.array(text).min(1).max(20),
    tutorial: z.object({ file: relativeFile, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
    reference: z.object({
      url: z.string().url().refine(value => /^https?:/.test(value)),
      credit: text,
      file: relativeFile,
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
      source_start_seconds: z.number().finite().min(0),
      source_end_seconds: z.number().finite().positive(),
      /** A still for the gallery card, chosen where the effect shows and free of third-party marks. */
      poster: z.object({ file: relativePoster, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
    }).strict().refine(value => value.source_end_seconds > value.source_start_seconds, "Invalid reference interval"),
  }).strict()).max(500),
}).strict().superRefine((catalog, context) => {
  const ids = new Set<string>();
  const families = new Map<string, { title: string; variants: Set<string> }>();
  for (const [index, recipe] of catalog.recipes.entries()) {
    if (ids.has(recipe.id)) context.addIssue({ code: "custom", path: ["recipes", index, "id"], message: "Duplicate user recipe ID" });
    ids.add(recipe.id);
    if (recipe.family) {
      const family = families.get(recipe.family.id);
      if (family?.title !== undefined && family.title !== recipe.family.title) context.addIssue({ code: "custom", path: ["recipes", index, "family", "title"], message: "Family title must match" });
      if (family?.variants.has(recipe.family.variant)) context.addIssue({ code: "custom", path: ["recipes", index, "family", "variant"], message: "Duplicate family variant" });
      if (family) family.variants.add(recipe.family.variant);
      else families.set(recipe.family.id, { title: recipe.family.title, variants: new Set([recipe.family.variant]) });
    }
  }
});

/** User recipes never enter the repository catalog or shared skill evidence. */
export function readUserEffectRecipes(profileDirectory: string) {
  const file = path.join(profileDirectory, "effect-recipes", "catalog.json");
  return userEffectRecipesSchema.parse(fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8")) : { schema_version: 1, recipes: [] });
}

export function userGuideEffects(profileDirectory: string): GuideEffect[] {
  return readUserEffectRecipes(profileDirectory).recipes.map(recipe => ({
    id: `user-${recipe.id}`, origin: "user", skill: recipe.skill,
    family: recipe.family,
    title: recipe.id === "subject-flash-glow" ? "Mask Glitch · Glow" : recipe.id === "speed-entrance-exit" ? "Speed Entrance & Exit" : recipe.title, description: recipe.description, status: recipe.status,
    exampleKind: "reference", sourceUrl: recipe.reference.url,
    video: `/api/guide/user-effects/${encodeURIComponent(recipe.id)}/media?v=${recipe.reference.sha256.slice(0, 16)}`,
    poster: recipe.reference.poster ? `/api/guide/user-effects/${encodeURIComponent(recipe.id)}/media?poster=1&v=${recipe.reference.poster.sha256.slice(0, 16)}` : undefined,
    tutorialVideo: recipe.tutorial ? `/api/guide/user-effects/${encodeURIComponent(recipe.id)}/media?full=1&v=${recipe.tutorial.sha256.slice(0, 16)}` : undefined,
    inputs: [], inputDirections: recipe.inputs, preparation: recipe.preparation,
    prompt: recipe.prompt, credit: recipe.reference.credit, limitations: recipe.limitations,
  }));
}

/** Identity-only lookup; validate containment and content before streaming private media. */
export function resolveUserEffectMedia(id: string, profileDirectory: string, kind: "reference" | "full" | "poster" | boolean = "reference") {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return null;
  const recipe = readUserEffectRecipes(profileDirectory).recipes.find(recipe => recipe.id === id);
  if (!recipe) return null;
  const which = kind === true ? "full" : kind === false ? "reference" : kind;
  const artifact = which === "full" ? recipe.tutorial : which === "poster" ? recipe.reference.poster : recipe.reference;
  if (!artifact) return null;
  try {
    const root = fs.realpathSync(path.join(profileDirectory, "effect-recipes"));
    const file = fs.realpathSync(path.join(root, artifact.file));
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) return null;
    const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (hash !== artifact.sha256) return null;
    return { file, contentType: which === "poster" ? "image/jpeg" : "video/mp4" };
  } catch { return null; }
}
