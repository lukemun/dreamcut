import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { spawnBackgroundWorker as spawn } from "./background-worker";
import { promisify } from "node:util";
import { z } from "zod";
import { projectDir, projectMediaDir } from "./paths";
import { assertProject, withProjectLock } from "./store";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { listMediaFiles, MEDIA_CONTENT_TYPES } from "./media";
import { readLibraryAnnotations } from "./library-annotations";
import { ingestMediaPath } from "./media-ingest";
import { enqueueImportJob, readImportJob } from "./media-import-jobs";
import { enqueueMediaPreparation, readPreparation } from "./media-preparation";
import { reconcileAssetBindings, readAnnotations, writeAnnotations } from "./media-analysis";
import { assetDraftSchema, validateAssetRequest, estimateAssetCost, buildFalAssetInput, assetMediaUrl, type AssetDraft, type AssetJob, type AssetOutput, type GenerationAsset, type GenerationApproval } from "../generation/assets";

import { ASSET_CATALOG_VERSION, MEDIA_ROLES, modelEndpoint, getAssetModel, modelTask, cloudUnavailableMessage } from "../generation/asset-models";
import { quoteCloudDraft, CLOUD_REFERENCE_MAX_BYTES } from "../generation/cloud-generation";
import { developmentFalKey } from "../generation/development-fal-key";
import { isCloudSignedIn } from "./cloud-account";
import { readEnv } from "@/lib/env-name";

export const execMedia = promisify(execFile);
export function assertGenerationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    const expected = new URL(request.url);
    const host = request.headers.get("host");
    if (host) expected.host = host;
    if (origin !== expected.origin) throw new Error("Generation requests must come from this editor.");
  }
}
export const generationDir = (projectId: string) => path.join(projectDir(projectId), "preprocess", "asset-generation");
export function jobPath(projectId: string, id: string) { z.uuid().parse(id); return path.join(generationDir(projectId), `${id}.json`); }
export function readAssetJob(projectId: string, id: string): AssetJob {
  assertProject(projectId);
  const job = readJsonFile<AssetJob | null>(jobPath(projectId, id), null);
  if (!job) throw new Error("Generation request not found.");
  for (const output of job.outputs) if (output.assetId) {
    try { output.annotationStatus = readImportJob(projectId, output.assetId).status; } catch { /* Preserve the recorded intake failure. */ }
  }
  return job;
}
export function listAssetJobs(projectId: string): AssetJob[] {
  assertProject(projectId);
  if (!fs.existsSync(generationDir(projectId))) return [];
  return fs.readdirSync(generationDir(projectId)).filter(n => /^[a-f0-9-]{36}\.json$/.test(n)).map(n => readAssetJob(projectId, n.slice(0, -5))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Cross-process, short critical section. Network/ffmpeg work never owns this lock. */
export async function withAssetJobLock<T>(projectId: string, id: string, fn: () => T): Promise<T> {
  const lock = jobPath(projectId, id) + ".lock";
  fs.mkdirSync(generationDir(projectId), { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    let fd: number;
    try { fd = fs.openSync(lock, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (attempt === 99) throw new Error("Generation record is busy. Try again.");
      await new Promise(r => setTimeout(r, 50)); continue;
    }
    try { return fn(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  throw new Error("Generation record is busy.");
}
export async function updateAssetJob(projectId: string, id: string, patch: Partial<AssetJob>) {
  return withAssetJobLock(projectId, id, () => {
    const updated = { ...readAssetJob(projectId, id), ...patch, updatedAt: new Date().toISOString() };
    writeJsonFileAtomic(jobPath(projectId, id), updated); return updated;
  });
}
export function resolveGenerationSource(projectId: string, source: string) {
  if (path.isAbsolute(source) || source.split(/[\\/]/).some(p => p === ".." || p === ".")) throw new Error("Select a project media asset.");
  const root = fs.realpathSync(projectMediaDir(projectId));
  const file = fs.realpathSync(path.join(root, source));
  if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error("Source must be managed project media.");
  if (!/\.(png|jpe?g|webp|mp4|mov|webm|m4v|mp3|ogg|wav|m4a|aac)$/i.test(file)) throw new Error("Choose a supported image, video, or audio file.");
  return file;
}
export async function hashAsset(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function probeGenerationSource(file: string, frames = false) {
  const { stdout } = await execMedia("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", frames ? "frame=best_effort_timestamp_time:stream=width,height,r_frame_rate:format=duration" : "stream=width,height,r_frame_rate:format=duration", ...(frames ? ["-show_frames"] : []), "-of", "json", file], { timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  if (!data.streams?.length) throw new Error("File contains no image or video stream.");
  const rawTimes = (data.frames ?? []).map((f: { best_effort_timestamp_time?: string }) => Number(f.best_effort_timestamp_time));
  if (frames && rawTimes.some((n: number) => !Number.isFinite(n))) throw new Error("Source has frames without timestamps.");
  const origin = rawTimes[0] ?? 0;
  const times: number[] = rawTimes.map((n: number) => n - origin);
  return { width: Number(data.streams[0].width), height: Number(data.streams[0].height), duration: Number(data.format?.duration) || 0, fps: String(data.streams[0].r_frame_rate), times, timeOrigin: origin };
}
export function stageSource(id: string, name: string) { z.uuid().parse(id); return `.generation/${id}/${name}`; }
export function stageFile(projectId: string, id: string, name: string) {
  if (path.basename(name) !== name) throw new Error("Invalid output filename.");
  const source = stageSource(id, name), file = path.join(projectMediaDir(projectId), source);
  fs.mkdirSync(path.dirname(file), { recursive: true }); return { source, file };
}
/** Seconds of any audio or video file. */
export async function probeMediaDuration(file: string) {
  const { stdout } = await execMedia("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { timeout: 120000 });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read the media length.");
  return duration;
}
export async function outputFromFile(projectId: string, id: string, name: string): Promise<AssetOutput> {
  const { source, file } = stageFile(projectId, id, name);
  const kind = /\.(mp4|mov|webm|m4v)$/i.test(file) ? "video" : /\.(mp3|wav|ogg|m4a|aac)$/i.test(file) ? "audio" : "image";
  if (kind === "audio") await probeMediaDuration(file); else await probeGenerationSource(file);
  if (kind === "video") enqueueMediaPreparation(projectId, source);
  return { id: name, source, kind, sha256: await hashAsset(file) };
}
export function generationAssets(projectId: string): GenerationAsset[] {
  const sources = listMediaFiles(projectId).filter(m => !m.relPath.startsWith(".prepared/"));
  const annotations = readLibraryAnnotations(projectId)?.assets;
  const assets: GenerationAsset[] = sources.filter(m => /\.(png|jpe?g|webp|mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg)$/i.test(m.relPath)).map(m => ({ source: m.relPath, name: annotations?.[m.relPath]?.display_name ?? m.name, kind: m.kind === "image" ? "image" : m.kind === "audio" ? "audio" : "video" }));
  for (const job of listAssetJobs(projectId)) for (const o of job.outputs) if (!o.keptSource) assets.push({ source: o.source, name: o.id, kind: o.kind, jobId: job.id });
  return assets.map(a => {
    if (a.kind === "image" || a.kind === "audio") return { ...a, preview: assetMediaUrl(projectId, a.source) };
    const p = readPreparation(projectId, a.source);
    return { ...a, preparation: p?.state ?? "imported", duration: p?.duration, preview: p?.state === "ready" && p.preview ? assetMediaUrl(projectId, p.preview) : undefined };
  });
}
/**
 * Records a request the creator made with Generate and starts its worker. A DreamCut model request needs a
 * DreamCut sign-in and the Cloud price the creator saw (`acceptedCredits`); credits are spent by the worker.
 * Staging (`prepareAssetWorkspace`) never calls this.
 */
export async function createAssetJob(projectId: string, input: unknown, id: string, acceptedCredits?: number, approval?: GenerationApproval) {
  assertProject(projectId); z.uuid().parse(id);
  const draft = assetDraftSchema.parse(input); validateAssetRequest(draft);
  if (draft.route === "fal" && modelTask(draft) !== draft.task) throw new Error("Request task does not match the model's selected inputs.");
  if (fs.existsSync(jobPath(projectId, id))) {
    const existing = readAssetJob(projectId, id);
    if (JSON.stringify(existing.request) !== JSON.stringify(draft)) throw new Error("Request ID already belongs to a different request.");
    return existing;
  }
  const development = draft.route === "fal" ? developmentFalKey() !== undefined : false;
  if (draft.route === "fal") {
    const model = getAssetModel(draft);
    if (model.cloud === false) throw new Error(cloudUnavailableMessage(model.name));
    if (!development && !isCloudSignedIn()) throw new Error("Sign in to DreamCut to generate.");
    if (acceptedCredits === undefined) throw new Error("Review the price in credits before generating.");
  }
  const references = await Promise.all(draft.references.map(async r => {
    const file = resolveGenerationSource(projectId, r.source);
    const video = /\.(mp4|mov|webm|m4v)$/i.test(file);
    const audio = /\.(mp3|ogg|wav|m4a|aac)$/i.test(file);
    if (r.role === "audio" ? !audio : ["source", "motion"].includes(r.role) !== video || audio) throw new Error(`Reference ${r.label} has the wrong media type for ${r.role}.`);
    if (draft.route === "fal") {
      if (MEDIA_ROLES.includes(r.role)) {
        // The worker sends only this window, re-encoded for the model; it must lie inside the file.
        const length = await probeMediaDuration(file);
        if (r.window && r.window.end > length + 0.05) throw new Error(`The chosen part of ${r.label || "a reference"} runs past its end.`);
      } else {
        if (!/\.(png|jpe?g|webp)$/i.test(file)) throw new Error("DreamCut models accept PNG, JPEG or WebP image references.");
        if (fs.statSync(file).size > CLOUD_REFERENCE_MAX_BYTES) throw new Error("Image references must be under 10 MB.");
        if (["kling", "motion"].includes(getAssetModel(draft).adapter)) {
          const p = await probeGenerationSource(file);
          if (p.width < 300 || p.height < 300 || p.width / p.height < 0.4 || p.width / p.height > 2.5) throw new Error("Kling references must be at least 300 pixels on each side, with an aspect ratio between 0.4 and 2.5.");
        }
      }
    }
    return { ...r, sha256: await hashAsset(file) };
  }));
  if (["sync3", "latentsync"].includes(getAssetModel(draft).adapter)) {
    const audio = resolveGenerationSource(projectId, references.find(r => r.role === "audio")!.source);
    const { stdout } = await execMedia("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio]);
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration < 3 || duration > 60 || Math.abs(duration - draft.duration) > 0.2) throw new Error("Singing audio must be 3–60 seconds and match the selected duration.");
  }
  let quote: AssetJob["quote"] = estimateAssetCost(draft);
  if (draft.route === "fal") {
    // The Cloud re-prices on create too; checking here keeps a stale price from ever reaching the worker.
    const current = await quoteCloudDraft(draft);
    if (current.credits !== acceptedCredits) throw new Error(`This now costs ${current.credits} credits. Review the price and Generate again.`);
    quote = { credits: current.credits, catalogVersion: current.catalogVersion, kind: "credits" };
  }
  const now = new Date().toISOString();
  const job: AssetJob = { id, projectId, createdAt: now, updatedAt: now, request: draft, references, quote, outputs: [], status: draft.route === "codex" ? "waiting_codex" : "queued", approval: approval ?? { source: "generate_button", recorded_at: now }, ...(draft.route === "fal" && draft.task !== "extract" ? {
    model: modelEndpoint(draft), catalogVersion: ASSET_CATALOG_VERSION, resolvedInput: buildFalAssetInput(draft, references.map((_, i) => referencePlaceholder(i))),
    ...(development ? { transport: "fal_development" as const } : { transport: "cloud" as const, cloud: { clientRequestId: id } }),
  } : {}) };
  await withAssetJobLock(projectId, id, () => {
    if (fs.existsSync(jobPath(projectId, id))) {
      if (JSON.stringify(readAssetJob(projectId, id).request) !== JSON.stringify(draft)) throw new Error("Request ID already belongs to a different request.");
    } else writeJsonFileAtomic(jobPath(projectId, id), job);
  });
  if (job.status === "queued") startAssetWorker(projectId, id);
  return readAssetJob(projectId, id);
}
/** Stands for reference `i` in a recorded provider input until the worker uploads it. */
export const referencePlaceholder = (i: number) => `reference:${i}`;
export function startAssetWorker(projectId: string, id: string) {
  jobPath(projectId, id);
  if (readEnv("ASSET_AUTOSTART") === "0") return;
  try {
    const pid = Number(fs.readFileSync(jobPath(projectId, id) + ".worker", "utf8"));
    if (Number.isInteger(pid) && pid > 0) { process.kill(pid, 0); return; }
  } catch { /* The worker serializes recovery of an interrupted owner. */ }
  const log = fs.openSync(path.join(generationDir(projectId), `${id}.log`), "a", 0o600);
  try {
    const child = spawn(process.execPath, ["--import", "tsx", path.resolve("scripts/generate-assets.ts"), projectId, id], { detached: true, stdio: ["ignore", log, log], env: process.env });
    child.on("error", e => { void updateAssetJob(projectId, id, { status: "failed", error: `Could not start generation worker: ${e.message}` }); }); child.unref();
  } finally { fs.closeSync(log); }
}
export function codexHandoff(job: AssetJob) {
  return `Complete image generation request ${job.id} for DreamCut project ${job.projectId}.\nRead the immutable request at ${jobPath(job.projectId, job.id)}.\nUse built-in image generation with Codex allowance. Do not use a paid API or silently change provider. If unavailable, report that limitation.\nTask: ${job.request.task}; individual images: ${job.request.count}; aspect: ${job.request.aspect}.\nPrompt: ${job.request.prompt}\nImages, numbered as the prompt names them (inspect each before generation):\n${job.references.map((r, i) => `Image ${i + 1} — ${r.label}: ${resolveGenerationSource(job.projectId, r.source)}`).join("\n")}\nSave individual output images. Register each result by POSTing multipart/form-data field file to /api/projects/${job.projectId}/asset-generation/${job.id}/outputs on the current local DreamCut server. Repeat for each image, then POST JSON {"action":"complete"} to /api/projects/${job.projectId}/asset-generation/${job.id}. Alternatively upload the images into this request's result area in the drawer. Do not alter the timeline. The user reviews and keeps the outputs in Library.\n`;
}
/** Where a kept result came from, recorded with the managed copy. */
export function generationProvenance(job: AssetJob) {
  const model = job.request.route === "codex" ? "GPT Image" : getAssetModel(job.request).name;
  const service = job.request.route === "codex" ? "Codex image tool" : job.transport === "cloud" ? "DreamCut Cloud" : job.transport === "fal_development" ? "fal (development override)" : "fal";
  return {
    service, model, request_id: job.id,
    ...(job.model ? { endpoint: job.model } : {}),
    ...(job.cloud?.generationId ? { cloud_generation_id: job.cloud.generationId } : {}),
    ...(job.quote?.kind === "credits" ? { credits: job.quote.credits } : {}),
  };
}
export async function keepAssetOutput(projectId: string, id: string, outputId: string, annotation?: string) {
  return withProjectLock(projectId, async () => {
    const job = readAssetJob(projectId, id);
    const output = job.outputs.find(o => o.id === outputId);
    if (!output) throw new Error("Output not found.");
    const asset = ingestMediaPath({ projectId, sourcePath: resolveGenerationSource(projectId, output.source), expectedSourceSha256: output.sha256, destinationDir: "generated", generation: generationProvenance(job) });
    const bindings = reconcileAssetBindings(projectId);
    const binding = bindings.assets.find(a => a.relative_path === asset.media_path);
    if (binding && annotation?.trim()) {
      const current = readAnnotations(projectId);
      const annotationId = createHash("sha256").update(`${id}/${outputId}`).digest("hex");
      const now = new Date().toISOString();
      writeAnnotations(projectId, { ...current, annotations: [...current.annotations.filter(a => a.annotation_id !== annotationId), {
        annotation_id: annotationId, asset_id: binding.asset_id, track_id: null, start_seconds: 0, end_seconds: 0,
        label: annotation.slice(0, 500), notes: `User description. Generation request ${id}. ${output.timestamp !== undefined ? `Source frame ${output.frameIndex} at ${output.timestamp}s.` : ""} Prompt is recorded separately as requested intent.`, created_at: now, updated_at: now,
      }] });
    }
    let annotationStatus = "queued";
    try { annotationStatus = enqueueImportJob(projectId, asset).status; } catch { annotationStatus = "failed"; }
    return withAssetJobLock(projectId, id, () => {
      const fresh = readAssetJob(projectId, id);
      const updated = { ...fresh, updatedAt: new Date().toISOString(), outputs: fresh.outputs.map(o => o.id === outputId ? { ...o, assetId: asset.asset_id, keptSource: asset.media_path, annotation: annotation?.trim() || o.annotation, annotationStatus } : o) };
      writeJsonFileAtomic(jobPath(projectId, id), updated); return updated;
    });
  });
}
export async function registerCodexOutput(projectId: string, id: string, file: File) {
  const job = readAssetJob(projectId, id);
  if (job.status !== "waiting_codex") throw new Error("This request is not waiting for Codex images.");
  const extension = path.extname(file.name).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension) || file.size > 40 * 1024 * 1024) throw new Error("Upload a PNG, JPEG or WebP under 40 MB.");
  const bytes = Buffer.from(await file.arrayBuffer()), sha = createHash("sha256").update(bytes).digest("hex");
  const name = `codex-${sha.slice(0, 20)}${extension}`, target = stageFile(projectId, id, name);
  if (!fs.existsSync(target.file)) fs.writeFileSync(target.file, bytes, { flag: "wx" });
  const output = await outputFromFile(projectId, id, name);
  return withAssetJobLock(projectId, id, () => {
    const fresh = readAssetJob(projectId, id);
    if (fresh.status !== "waiting_codex") throw new Error("Request is no longer waiting for results.");
    const outputs = fresh.outputs.some(o => o.sha256 === sha) ? fresh.outputs : [...fresh.outputs, output];
    if (outputs.length > fresh.request.count) throw new Error("All requested results are already attached.");
    const updated = { ...fresh, outputs, updatedAt: new Date().toISOString() }; writeJsonFileAtomic(jobPath(projectId, id), updated); return updated;
  });
}
export function assetContentType(file: string) { return MEDIA_CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream"; }
