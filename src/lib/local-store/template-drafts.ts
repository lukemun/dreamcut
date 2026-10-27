import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { profileDir } from "./profile-dir";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { readUserEffectRecipes, userEffectRecipesSchema } from "./user-effect-recipes";
import { posterFrame } from "./cloud-template-share";

/**
 * Template drafts: a video the creator dropped on the home page to become one of their own
 * templates. Each draft owns `<profileDir()>/effect-recipes/drafts/<id>/` (draft.json plus an
 * unchanged copy of the video). Discarding a draft removes only that folder; saving copies the
 * video into the user-only template store and then removes the draft.
 */
const DRAFT_ID = /^d-[a-f0-9]{12}$/;
const VIDEO_EXTENSION = /^\.(mp4|mov|webm|m4v)$/;
/** Reference clips are short; anything larger is almost certainly a whole edit. */
export const MAX_DRAFT_BYTES = 1024 * 1024 * 1024;
/** Kept free on the destination volume after the copy. */
const HEADROOM_BYTES = 2 * 1024 * 1024 * 1024;

const draftSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().regex(DRAFT_ID),
  title: z.string().trim().min(1).max(120),
  created_at: z.string(),
  /** new: waiting for the creator; requested: handed to an agent to recreate. */
  stage: z.enum(["new", "requested"]),
  requested_at: z.string().optional(),
  /** What to copy, in the creator's words. */
  note: z.string().max(2000).default(""),
  /** The part of the video that shows the effect, in source seconds. */
  mark: z.object({ start: z.number().finite().min(0), end: z.number().finite().positive() }).strict()
    .refine(value => value.end > value.start, "The end must come after the start").optional(),
  reference: z.object({
    file: z.string().regex(/^reference\.(mp4|mov|webm|m4v)$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
    original_name: z.string().max(260),
  }).strict(),
}).strict();
export type TemplateDraft = z.infer<typeof draftSchema>;

const draftsRoot = (profile = profileDir()) => path.join(profile, "effect-recipes", "drafts");
const draftDir = (id: string, profile?: string) => {
  if (!DRAFT_ID.test(id)) throw Object.assign(new Error("Unknown draft"), { status: 404 });
  return path.join(draftsRoot(profile), id);
};

export function readTemplateDraft(id: string, profile?: string): TemplateDraft {
  const file = path.join(draftDir(id, profile), "draft.json");
  if (!fs.existsSync(file)) throw Object.assign(new Error("Unknown draft"), { status: 404 });
  return draftSchema.parse(readJsonFile<unknown>(file, null));
}

/** Newest first; unreadable drafts are skipped rather than hiding the others. */
export function listTemplateDrafts(profile?: string): TemplateDraft[] {
  const root = draftsRoot(profile);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(id => DRAFT_ID.test(id)).flatMap(id => {
    try { return [readTemplateDraft(id, profile)]; } catch { return []; }
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const titleFrom = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Untitled";

export function createTemplateDraft(input: { buffer: Buffer; originalName: string }, profile?: string, now = new Date()): TemplateDraft {
  const extension = path.extname(input.originalName).toLowerCase();
  if (!VIDEO_EXTENSION.test(extension)) throw Object.assign(new Error("Drop an MP4, MOV or WebM video."), { status: 400 });
  if (input.buffer.length === 0) throw Object.assign(new Error("That video is empty."), { status: 400 });
  if (input.buffer.length > MAX_DRAFT_BYTES) throw Object.assign(new Error("That video is over 1 GB. Trim it to the effect first."), { status: 413 });
  const root = draftsRoot(profile);
  fs.mkdirSync(root, { recursive: true });
  const free = fs.statfsSync(root);
  if (free.bavail * free.bsize < input.buffer.length + HEADROOM_BYTES) throw Object.assign(new Error("Not enough free disk space for this video."), { status: 507 });
  const id = `d-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const dir = draftDir(id, profile);
  fs.mkdirSync(dir);
  const file = `reference${extension}`;
  try {
    fs.writeFileSync(path.join(dir, file), input.buffer, { flag: "wx" });
    const draft: TemplateDraft = draftSchema.parse({
      schema_version: 1, id, title: titleFrom(input.originalName), created_at: now.toISOString(), stage: "new", note: "",
      reference: { file, sha256: createHash("sha256").update(input.buffer).digest("hex"), bytes: input.buffer.length, original_name: input.originalName.slice(0, 260) },
    });
    writeJsonFileAtomic(path.join(dir, "draft.json"), draft);
    return draft;
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().max(2000).optional(),
  mark: z.object({ start: z.number().finite().min(0), end: z.number().finite().positive() }).strict().nullable().optional(),
  request: z.literal(true).optional(),
}).strict();

export function updateTemplateDraft(id: string, patch: unknown, profile?: string, now = new Date()): TemplateDraft {
  const change = patchSchema.parse(patch);
  const current = readTemplateDraft(id, profile);
  const { mark, request, ...rest } = change;
  const next = draftSchema.parse({
    ...current, ...rest,
    ...(mark === null ? { mark: undefined } : mark ? { mark } : {}),
    ...(request ? { stage: "requested", requested_at: now.toISOString() } : {}),
  });
  writeJsonFileAtomic(path.join(draftDir(id, profile), "draft.json"), next);
  return next;
}

export function deleteTemplateDraft(id: string, profile?: string) {
  readTemplateDraft(id, profile);
  fs.rmSync(draftDir(id, profile), { recursive: true, force: true });
}

/** The draft's video, after checking it is still the copy that was dropped. */
export function resolveTemplateDraftMedia(id: string, profile?: string) {
  const draft = readTemplateDraft(id, profile);
  const file = path.join(draftDir(id, profile), draft.reference.file);
  if (!fs.existsSync(file) || fs.statSync(file).size !== draft.reference.bytes) return null;
  return { file, contentType: contentTypeFor(draft.reference.file) };
}

export const contentTypeFor = (file: string) => file.endsWith(".webm") ? "video/webm" : file.endsWith(".mov") ? "video/quicktime" : "video/mp4";

const slug = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "template";

/**
 * Saves the draft as one of the creator's own templates: a reference card in Templates → Yours.
 * Only the creator's Save click calls this. The video moves into the template store unchanged.
 */
export async function saveTemplateDraft(id: string, profile = profileDir(), poster: (file: string, seconds?: number) => Promise<Buffer> = posterFrame): Promise<{ template_id: string }> {
  const draft = readTemplateDraft(id, profile);
  const media = resolveTemplateDraftMedia(id, profile);
  if (!media) throw Object.assign(new Error("The draft's video is missing or changed."), { status: 409 });
  // Finish asynchronous work before reading the shared catalog. The commit below is synchronous.
  const still = await poster(media.file, draft.mark?.start).catch(() => null);
  readTemplateDraft(id, profile); // A discarded draft must not be resurrected while its poster was prepared.
  const storeRoot = path.join(profile, "effect-recipes");
  const catalogFile = path.join(storeRoot, "catalog.json");
  const catalog = readUserEffectRecipes(profile);
  const base = slug(draft.title);
  let recipeId = base;
  for (let n = 2; catalog.recipes.some(recipe => recipe.id === recipeId) || fs.existsSync(path.join(storeRoot, recipeId)); n++) recipeId = `${base}-${n}`;
  const extension = path.extname(draft.reference.file);
  const description = draft.note.trim() || "An effect from your video, ready to recreate with your own footage.";
  const recipe = {
    id: recipeId, title: draft.title, description, skill: "recreate-effect", status: "candidate" as const,
    inputs: [{ title: "Your footage", directions: "The clips to apply this effect to." }],
    preparation: "The agent studies the reference video and builds the effect for your clips.",
    prompt: `Recreate the effect in my template "${draft.title}" with the selected clips.${draft.mark ? ` Study only ${draft.mark.start}–${draft.mark.end} seconds of the reference video.` : ""}${draft.note.trim() ? ` What to copy: ${draft.note.trim()}` : ""}`,
    limitations: ["Recreated from your reference video; the first use builds the effect."],
    reference: {
      credit: "Your video", file: `${recipeId}/reference${extension}`, sha256: draft.reference.sha256, source_sha256: draft.reference.sha256,
      source_start_seconds: draft.mark?.start ?? 0,
      ...(draft.mark ? { source_end_seconds: draft.mark.end, playback_window: draft.mark } : {}),
    },
  };
  const target = path.join(storeRoot, recipeId);
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(media.file, path.join(target, `reference${extension}`), fs.constants.COPYFILE_EXCL);
  // The card's still; a video ffmpeg cannot read still saves, with the card showing the video itself.
  if (still?.length) {
    fs.writeFileSync(path.join(target, "poster.jpg"), still);
    Object.assign(recipe.reference, { poster: { file: `${recipeId}/poster.jpg`, sha256: createHash("sha256").update(still).digest("hex") } });
  }
  try { writeJsonFileAtomic(catalogFile, userEffectRecipesSchema.parse({ ...catalog, recipes: [...catalog.recipes, recipe] })); }
  catch (error) { fs.rmSync(target, { recursive: true, force: true }); throw error; }
  fs.rmSync(draftDir(id, profile), { recursive: true, force: true });
  return { template_id: `user-${recipeId}` };
}
