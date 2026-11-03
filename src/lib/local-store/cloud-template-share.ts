/** Shares one of the creator's own templates to DreamCut Cloud's shared recipes, with an example
 * video chosen from a project's exports and a poster frame taken from it. Uses the site's flow:
 * POST /api/v1/recipes (draft + signed upload URLs) → upload both files → POST /recipes/{id}/submit.
 * Moderation publishes it; until then it is pending. */
import fs from "node:fs";
import { shareEffectPackage } from "./effect-package-share";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { z } from "zod";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { profileDir } from "./editing-memory";
import { projectRendersDir } from "./paths";
import { listPersonalStyles } from "./personal-styles";
import { readUserEffectRecipes } from "./user-effect-recipes";
import { cloudAccountStatus, cloudFetch, type Fetcher } from "./cloud-account";
import { fetchCommunityRecipes } from "@/lib/effects/community-recipes";

export const MAX_EXAMPLE_BYTES = 50 * 1024 * 1024;
// Mirrors the Cloud's check: a shared recipe must not carry a path on the author's computer.
const LOCAL_PATH = /(^|[\s"'(=:])(\/(Users|home|private|var|tmp|Volumes|mnt)\/|~\/|[A-Za-z]:[\\/]|\\\\|file:\/\/)/;

type Portable = {
  schema_version: 1; prompt: string; preparation?: string;
  input_directions?: { title: string; directions: string }[]; limitations?: string[];
  family?: { title: string; variant: string };
  bundles?: { skill: string; recipe_id?: string; parameters: Record<string, string | number | boolean> }[];
};
export type ShareableTemplate = { id: string; title: string; description: string; skill: string; recipe: Portable };
export type TemplateShareRecord = { cloud_id: string; status: "pending" | "published"; shared_at: string; title: string; example: string };

const clip = (text: string, max: number) => text.trim().slice(0, max);
const statePath = () => path.join(profileDir(), "cloud-sync", "shared-templates.json");
const readShares = () => readJsonFile<Record<string, TemplateShareRecord>>(statePath(), {});

/** The creator's own templates only: saved templates (`saved-<id>`) and user recipes (`user-<id>`). */
export function shareableTemplate(templateId: string): ShareableTemplate {
  if (templateId.startsWith("saved-")) {
    const style = listPersonalStyles().find(item => `saved-${item.id}` === templateId);
    if (!style) throw new Error("Template not found.");
    return {
      id: templateId, title: clip(style.name, 100), description: clip(style.description || "A template with saved settings.", 500), skill: style.bundles[0]!.skill,
      recipe: {
        schema_version: 1,
        prompt: clip(`Apply the "${style.name}" template to the supplied footage. Start from its saved settings, adapt timing and preparation to the new material, and prepare an editable proposal for review.`, 2000),
        bundles: style.bundles.map(bundle => ({ skill: bundle.skill, ...(bundle.recipe_id && /^[A-Za-z0-9-]{1,80}$/.test(bundle.recipe_id) ? { recipe_id: bundle.recipe_id } : {}), parameters: bundle.parameters })),
      },
    };
  }
  if (templateId.startsWith("user-")) {
    const recipe = readUserEffectRecipes(profileDir()).recipes.find(item => `user-${item.id}` === templateId);
    if (!recipe) throw new Error("Template not found.");
    return {
      id: templateId, title: clip(recipe.title, 100), description: clip(recipe.description, 500), skill: recipe.skill,
      recipe: {
        schema_version: 1, prompt: clip(recipe.prompt, 2000), preparation: clip(recipe.preparation, 2000),
        input_directions: recipe.inputs.slice(0, 20).map(input => ({ title: clip(input.title, 100), directions: clip(input.directions, 2000) })),
        limitations: recipe.limitations.slice(0, 20).map(item => clip(item, 500)),
        ...(recipe.family ? { family: { title: clip(recipe.family.title, 100), variant: clip(recipe.family.variant, 100) } } : {}),
      },
    };
  }
  throw new Error("Only your own templates can be shared.");
}

function assertPortable(template: ShareableTemplate) {
  const texts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk([template.title, template.description, template.recipe]);
  if (texts.some(text => LOCAL_PATH.test(text))) throw new Error("This template mentions a file on this computer. Remove local file paths before sharing.");
}

export type ProjectExport = { file: string; bytes: number; modified_at: string };
/** MP4 exports in the project's renders folder that fit the shared-example limit, newest first. */
export function listProjectExports(projectId: string): ProjectExport[] {
  const directory = projectRendersDir(projectId);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^[^/\\]+\.mp4$/i.test(entry.name))
    .map(entry => { const stat = fs.statSync(path.join(directory, entry.name)); return { file: entry.name, bytes: stat.size, modified_at: stat.mtime.toISOString() }; })
    .filter(item => item.bytes > 0 && item.bytes <= MAX_EXAMPLE_BYTES)
    .sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}
function exportPath(projectId: string, file: string) {
  if (!listProjectExports(projectId).some(item => item.file === file)) throw new Error("Choose an export from this project.");
  return path.join(projectRendersDir(projectId), file);
}

function ffmpegFrame(file: string, seconds: number) {
  return new Promise<Buffer>((resolve, reject) => {
    execFile("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", file, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-f", "image2", "-c:v", "mjpeg", "-q:v", "3", "pipe:1"],
      { encoding: "buffer", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}
/** A JPEG poster from about one second in (the first frame for very short examples). */
export async function posterFrame(file: string, seconds = 1): Promise<Buffer> {
  const frame = await ffmpegFrame(file, seconds).catch(() => Buffer.alloc(0));
  const poster = frame.length ? frame : seconds === 1 ? await ffmpegFrame(file, 0) : frame;
  if (!poster.length) throw new Error("Could not take a poster frame from this export.");
  return poster;
}

const draftSchema = z.object({
  id: z.string().uuid(),
  uploads: z.object({
    video: z.object({ uploadUrl: z.string().url(), contentType: z.string() }),
    poster: z.object({ uploadUrl: z.string().url(), contentType: z.string() }),
  }),
});

async function upload(url: string, contentType: string, body: Buffer, fetcher: Fetcher) {
  if (!url.startsWith("https://") && !url.startsWith("http://127.0.0.1")) throw new Error("DreamCut returned an unexpected upload address.");
  const response = await fetcher(url, { method: "PUT", headers: { "Content-Type": contentType, "x-upsert": "true" }, body: new Uint8Array(body), signal: AbortSignal.timeout(5 * 60_000) });
  if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
}

async function cloudError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return new Error(body?.message || `${fallback} (HTTP ${response.status}).`);
}

export async function shareTemplate(input: { projectId: string; templateId: string; exportFile: string; creditName: string }, fetcher: Fetcher = fetch, poster = posterFrame) {
  const template = shareableTemplate(input.templateId);
  assertPortable(template);
  const creditName = input.creditName.trim();
  if (!creditName || creditName.length > 60 || LOCAL_PATH.test(creditName)) throw new Error("Enter a credit name of up to 60 characters.");
  if (readShares()[template.id]) throw new Error("This template is already shared.");
  const videoPath = exportPath(input.projectId, input.exportFile);
  const video = fs.readFileSync(videoPath);
  const image = await poster(videoPath);

  const created = await cloudFetch("/api/v1/recipes", { method: "POST", body: JSON.stringify({
    title: template.title, description: template.description, skill: template.skill, creditName, recipe: template.recipe,
    video: { contentType: "video/mp4", bytes: video.length }, poster: { contentType: "image/jpeg", bytes: image.length },
  }) }, fetcher);
  if (!created.ok) throw await cloudError(created, "Could not start sharing");
  const draft = draftSchema.parse(await created.json());
  await upload(draft.uploads.video.uploadUrl, "video/mp4", video, fetcher);
  await upload(draft.uploads.poster.uploadUrl, "image/jpeg", image, fetcher);
  const submitted = await cloudFetch(`/api/v1/recipes/${draft.id}/submit`, { method: "POST" }, fetcher);
  if (!submitted.ok) throw await cloudError(submitted, "Could not send the template for review");
  const record: TemplateShareRecord = { cloud_id: draft.id, status: "pending", shared_at: new Date().toISOString(), title: template.title, example: input.exportFile };
  writeJsonFileAtomic(statePath(), { ...readShares(), [template.id]: record });
  return record;
}

/** Pending until the Cloud's published listing includes it. */
export async function templateShareState(templateId: string, options: Parameters<typeof fetchCommunityRecipes>[0] = {}): Promise<TemplateShareRecord | null> {
  const record = readShares()[templateId];
  if (!record || record.status === "published") return record ?? null;
  const published = (await fetchCommunityRecipes({ awaitRefresh: true, ...options })).some(effect => effect.id === `community-${record.cloud_id}`);
  if (!published) return record;
  const next = { ...record, status: "published" as const };
  writeJsonFileAtomic(statePath(), { ...readShares(), [templateId]: next });
  return next;
}


/** Agent contract: prepare has no network side effects; submit pins the reviewed bytes. */
export const templateShareRequestSchema = z.object({
  action: z.enum(["prepare", "submit"]),
  template: z.string().regex(/^(saved|user)-[a-z0-9-]{1,80}$/),
  export_file: z.string().min(1).max(255),
  credit_name: z.string().trim().min(1).max(60),
  package_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  authorization: z.string().trim().min(1).max(2000).optional(),
}).strict();

export function prepareTemplateShare(input: { projectId: string; templateId: string; exportFile: string; creditName: string }) {
  const template = shareableTemplate(input.templateId);
  assertPortable(template);
  if (LOCAL_PATH.test(input.creditName)) throw new Error("Remove local paths from the credit name.");
  const video = fs.readFileSync(exportPath(input.projectId, input.exportFile));
  const payload = { title: template.title, description: template.description, skill: template.skill, recipe: template.recipe, credit_name: input.creditName.trim(), video_sha256: createHash("sha256").update(video).digest("hex") };
  return {
    schema_version: 1, destination: "DreamCut Cloud community catalog review", package: payload,
    package_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    example: { file: input.exportFile, bytes: video.length }, signed_in: cloudAccountStatus().signed_in,
    share: readShares()[template.id] ?? null,
    includes: ["portable recipe", "example video", "generated poster", "credit name"],
    excludes: ["original input footage", "skill source code", "project files"],
    publication: "Submission is pending moderation, not published. New skills and runtime changes require a code contribution first.",
  };
}

export async function agentTemplateShare(projectId: string, raw: unknown, fetcher: Fetcher = fetch, poster = posterFrame) {
  if (raw && typeof raw === "object" && "action" in raw && ["prepare_package", "submit_package"].includes(String(raw.action))) return shareEffectPackage(projectId, raw, fetcher);
  const request = templateShareRequestSchema.parse(raw);
  const input = { projectId, templateId: request.template, exportFile: request.export_file, creditName: request.credit_name };
  const prepared = prepareTemplateShare(input);
  if (request.action === "prepare") return prepared;
  if (!request.authorization) throw new Error("Submit requires the creator's explicit words authorizing this template and example to be shared with DreamCut.");
  if (!request.package_sha256 || request.package_sha256 !== prepared.package_sha256) throw new Error("The sharing package changed or was not prepared. Run prepare again and review the exact contents before submitting.");
  const share = await shareTemplate(input, fetcher, poster);
  writeJsonFileAtomic(path.join(profileDir(), "cloud-sync", "template-share-receipts", `${share.cloud_id}.json`), {
    schema_version: 1, package_sha256: prepared.package_sha256, authorization: request.authorization,
    project_id: projectId, template_id: request.template, share,
  });
  return { share, package_sha256: prepared.package_sha256, publication: "Waiting for review; not published." };
}
