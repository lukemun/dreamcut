import { readProjectFrameRate } from "./store";
import { COMPOSITION_FPS } from "@/lib/timeline/frame-quantization";
import { readPreviewSettings } from "./preview-settings";
import type { PreviewQuality } from "../preview-quality";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnBackgroundWorker, startBackgroundWorkerOnce } from "./background-worker";
import { projectDir, projectMediaDir } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { validatePreviewProxy } from "./preview-proxy-validation";
import type { ColorManagedVideoReceipt } from "../../../scripts/lib/color-managed-video";

export const PREVIEW_POLICY_VERSION = 2;
export const PREPARATION_RECIPE = "editor-media-v1";
export type BrowsePreview = {
  source_hash: string; preview: string; preview_hash: string; audio?: string; duration: number;
  width: number; height: number; frame_count: number;
  color_stage: string; color_stage_hash: string;
};
export type PreparedMedia = {
  recipe: typeof PREPARATION_RECIPE;
  source: string;
  size: number;
  mtime: number;
  state: "preparing" | "ready" | "failed";
  error?: string;
  stage?: "queued" | "preview" | "full_quality";
  browse_preview?: BrowsePreview;
  preview_quality?: PreviewQuality;
  /** Quality of the retained completed file, distinct from a pending request. */
  prepared_preview_quality?: PreviewQuality;
  preview_policy_version?: number;
  render_color_management?: ColorManagedVideoReceipt;
  preview?: string;
  audio?: string;
  render?: string;
  duration?: number;
  alpha?: boolean;
  source_hash?: string;
  preview_hash?: string;
  preview_probe?: { width: number; height: number; frame_rate: string; frame_count: number; duration_seconds: number };
  /** Frame rate the preview proxy is (being) prepared at: the consuming project's rate. Absent means 30. */
  preview_frame_rate?: number;
  /** Frame rate a derived render authority (HDR to SDR) was resampled to. Absent means 30. */
  render_frame_rate?: number;
  color_management?: ColorManagedVideoReceipt;
};
export const preparationDir = (projectId: string) => path.join(projectDir(projectId), "preprocess", "media-preparation");
export const preparationKey = (source: string) => createHash("sha256").update(source).digest("hex");
export function preparationSourcePath(projectId: string, source: string) {
  const root = path.resolve(projectMediaDir(projectId));
  const file = path.resolve(root, source);
  if (!file.startsWith(root + path.sep)) throw new Error("Media must be inside the project");
  return file;
}
export function readPreparation(projectId: string, source: string): PreparedMedia | null {
  const record = readJsonFile<PreparedMedia | null>(path.join(preparationDir(projectId), preparationKey(source) + ".json"), null);
  if (!record || record.recipe !== PREPARATION_RECIPE) return null;
  try {
    const stat = fs.statSync(preparationSourcePath(projectId, source));
    if (record.size !== stat.size || record.mtime !== stat.mtimeMs) return null;
    if (record.state === "ready" && (!record.preview || !record.render ||
      [record.preview, record.render, record.audio].filter(Boolean).some(p => !fs.existsSync(preparationSourcePath(projectId, p!))))) return null;
    if (record.browse_preview && [record.browse_preview.preview, record.browse_preview.audio, record.browse_preview.color_stage].filter(Boolean).some(p => !fs.existsSync(preparationSourcePath(projectId, p!)))) delete record.browse_preview;
    return record;
  } catch { return null; }
}
export function writePreparation(projectId: string, record: PreparedMedia) {
  writeJsonFileAtomic(path.join(preparationDir(projectId), preparationKey(record.source) + ".json"), record);
}
export function startPreparationWorker(projectId: string) {
  if (process.env.MEDIA_PREPARATION_AUTOSTART === "0") return;
  try {
    const pid = Number(fs.readFileSync(path.join(preparationDir(projectId), "worker.lock"), "utf8"));
    if (pid > 0) { process.kill(pid, 0); return; }
  } catch { /* No live worker owns this queue. */ }
  startBackgroundWorkerOnce(preparationDir(projectId), () => {
    fs.mkdirSync(preparationDir(projectId), { recursive: true });
    const log = fs.openSync(path.join(preparationDir(projectId), "worker.log"), "a");
    try {
      const child = spawnBackgroundWorker(process.execPath, ["--import", "tsx", path.resolve("scripts/prepare-media.ts"), projectId], {
        detached: true, stdio: ["ignore", log, log], env: process.env,
      });
      child.on("error", error => console.error("Media preparation worker could not start", error));
      child.unref();
      return child;
    } finally { fs.closeSync(log); }
  });
}
export function enqueueMediaPreparation(projectId: string, source: string, retry = false, frameRate = readProjectFrameRate(projectId)): PreparedMedia | null {
  if (!/\.(mov|mp4|webm|m4v)$/i.test(source) || source.startsWith(".prepared/")) return null;
  const quality = readPreviewSettings().quality;
  const existing = readPreparation(projectId, source);
  const rateCurrent = (existing?.preview_frame_rate ?? COMPOSITION_FPS) === frameRate;
  // A ready package whose preview is HDR (made before HDR conversion covered it) is prepared again.
  const hdrPreview = existing?.state === "ready" && !!existing.preview
    && validatePreviewProxy(`/api/projects/${projectId}/media/${existing.preview.split("/").map(encodeURIComponent).join("/")}`, existing.alpha === true).hdr;
  if (existing && rateCurrent && !hdrPreview && (existing.preview_policy_version === PREVIEW_POLICY_VERSION || existing.alpha !== true || quality !== "prepared") && (existing.preview_quality ?? "prepared") === quality && !(retry && existing.state === "failed")) {
    if (existing.state === "preparing") startPreparationWorker(projectId);
    return existing;
  }
  const stat = fs.statSync(preparationSourcePath(projectId, source));
  const record: PreparedMedia = { ...existing, recipe: PREPARATION_RECIPE, source, size: stat.size, mtime: stat.mtimeMs, state: "preparing", stage: "queued", preview_policy_version: PREVIEW_POLICY_VERSION, preview_quality: quality, preview_frame_rate: frameRate };
  delete record.error;
  writePreparation(projectId, record);
  startPreparationWorker(projectId);
  return record;
}

export function preparedPlacement(projectId: string, sourceUrl: string, props: Record<string, unknown>) {
  const prefix = `/api/projects/${projectId}/media/`;
  const archival = typeof props.archival_source_url === "string" ? props.archival_source_url : sourceUrl;
  const source = archival.startsWith(prefix) ? decodeURIComponent(archival.slice(prefix.length)) : null;
  const ready = source ? readPreparation(projectId, source) : null;
  if (!ready || ready.state !== "ready") throw Object.assign(new Error("Video is not ready. Prepare its preview before adding it to the timeline."), { status: 409 });
  const url = (relative: string) => prefix + relative.split("/").map(encodeURIComponent).join("/");
  if (sourceUrl !== archival && sourceUrl !== url(ready.render!)) throw Object.assign(new Error("Prepared media does not match the selected source"), { status: 409 });
  return { source_url: url(ready.render!), props: { ...props,
    preview_source_url: url(ready.preview!),
    ...(ready.audio ? { preview_audio_source_url: url(ready.audio), preview_audio_baked_gain: 1 } : {}),
    source_duration_seconds: ready.duration,
    has_alpha: ready.alpha,
    archival_source_url: archival,
    media_preparation_recipe: ready.recipe,
  } };
}

/** Prepare the project shelf up front after a system-quality change. */
export function prepareProjectPreviews(projectId: string) {
  const dir = preparationDir(projectId);
  if (!fs.existsSync(dir)) return [];
  const records = fs.readdirSync(dir).filter(name => name.endsWith(".json")).map(name => readJsonFile<PreparedMedia | null>(path.join(dir, name), null)).filter((r): r is PreparedMedia => !!r);
  return records.map(record => enqueueMediaPreparation(projectId, record.source, true)).filter(Boolean);
}
