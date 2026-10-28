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
import { forgetPreviewHydrationMemo, previewHydrationMemo, validatePreviewProxy } from "./preview-proxy-validation";
import { findMediaReferences } from "./media-references";
import type { ColorManagedVideoReceipt, HdrCodePreviewReceipt, HdrSourceEncoding } from "../../../scripts/lib/color-managed-video";
import { CURRENT_HDR_CODE_RECIPES } from "../media-analysis/color-profile";
import { getCachedLufs } from "./audio-loudness";
import type { HdrFrameDecode } from "./media-thumbnails";
import { workerCommand } from "@/lib/worker-command";

export const PREVIEW_POLICY_VERSION = 3;  // 3: alpha proxies bleed colour into transparent pixels (no dark edge fringe)
export const PREPARATION_RECIPE = "editor-media-v1";
export type BrowsePreview = {
  source_hash: string; preview: string; preview_hash: string; audio?: string; duration: number;
  width: number; height: number; frame_count: number;
  /** Full-resolution colour stage reused by final preparation; retired once the package is ready. */
  color_stage?: string; color_stage_hash?: string;
};
export type PreparedMedia = {
  recipe: typeof PREPARATION_RECIPE;
  source: string;
  size: number;
  mtime: number;
  /** Audio-only preparation also detects replacements that preserve size/mtime. */
  ctime?: number;
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
  /**
   * Opaque HDR whose full-resolution authority is not made yet: the preview came straight from the source
   * (this receipt), `render` names the original, and placement binds it with this `source_encoding`.
   * Export asks for the authority (`render_authority` "requested"); the worker makes it and moves `render` to it.
   */
  preview_color_management?: HdrCodePreviewReceipt;
  render_authority?: { state: "deferred" | "requested" | "failed"; error?: string; requested_at?: string };
  /** Optional analysis; unavailable loudness does not prevent using unchanged audio. */
  loudness?: { state: "ready" | "unavailable"; integrated_lufs?: number };
};
export const isAudioPreparationSource = (source: string) => /\.(wav|mp3|m4a|aac|flac|ogg|opus|aiff?|wma)$/i.test(source);
export const preparationDir = (projectId: string) => path.join(projectDir(projectId), "preprocess", "media-preparation");
/** A fingerprint of the preparation records only (not the worker's log or lock), for caches whose result
 * depends on which clips are ready. */
export function preparationRecordsKey(projectId: string): string {
  let names: string[];
  try { names = fs.readdirSync(preparationDir(projectId)).filter((name) => name.endsWith(".json")).sort(); } catch { return ""; }
  return names.map((name) => { try { const stat = fs.statSync(path.join(preparationDir(projectId), name)); return `${name}:${stat.size}:${stat.mtimeMs}`; } catch { return name; } }).join("|");
}
export const preparationKey = (source: string) => createHash("sha256").update(source).digest("hex");
export function preparationSourcePath(projectId: string, source: string) {
  const root = path.resolve(projectMediaDir(projectId));
  const file = path.resolve(root, source);
  if (!file.startsWith(root + path.sep)) throw new Error("Media must be inside the project");
  return file;
}
/** Inside a preview-hydration scope the same record is shared by every element of one read; callers must not mutate it. */
export function readPreparation(projectId: string, source: string): PreparedMedia | null {
  return previewHydrationMemo(`preparation\0${projectId}\0${source}`, () => readPreparationFromDisk(projectId, source));
}
function readPreparationFromDisk(projectId: string, source: string): PreparedMedia | null {
  const record = readJsonFile<PreparedMedia | null>(path.join(preparationDir(projectId), preparationKey(source) + ".json"), null);
  if (!record || record.recipe !== PREPARATION_RECIPE) return null;
  try {
    const stat = fs.statSync(preparationSourcePath(projectId, source));
    if (record.size !== stat.size || record.mtime !== stat.mtimeMs || (record.ctime !== undefined && record.ctime !== stat.ctimeMs)) return null;
    if (record.state === "ready" && (!record.preview || !record.render ||
      [record.preview, record.render, record.audio].filter(Boolean).some(p => !fs.existsSync(preparationSourcePath(projectId, p!))))) return null;
    if (record.browse_preview && [record.browse_preview.preview, record.browse_preview.audio, record.browse_preview.color_stage].filter(Boolean).some(p => !fs.existsSync(preparationSourcePath(projectId, p!)))) delete record.browse_preview;
    return record;
  } catch { return null; }
}
export function writePreparation(projectId: string, record: PreparedMedia) {
  forgetPreviewHydrationMemo();
  writeJsonFileAtomic(path.join(preparationDir(projectId), preparationKey(record.source) + ".json"), record);
}
/**
 * How a package's render authority encodes HDR code values, or null for an SDR picture. A package
 * prepared again around an existing authority keeps that authority's receipt as
 * `render_color_management`; it still describes the render, so binding and decoding read it too.
 */
export function preparedSourceEncoding(record: Pick<PreparedMedia, "render" | "color_management" | "render_color_management" | "source" | "render_authority" | "preview_color_management"> | null | undefined): HdrSourceEncoding | null {
  if (awaitsRenderAuthority(record)) return record!.preview_color_management!.source_encoding;
  const receipt = record?.color_management ?? record?.render_color_management;
  if (!receipt?.source_encoding || !record?.render) return null;
  // Receipts name absolute paths; a project copied elsewhere still ends with the same relative path.
  if (receipt.render_authority_path && !receipt.render_authority_path.split(path.sep).join("/").endsWith(`/${record.render}`)) return null;
  return receipt.source_encoding;
}
/** Opaque HDR placed and previewed from its fast proxy; its full-resolution authority is made at export. */
export function awaitsRenderAuthority(record: Pick<PreparedMedia, "render" | "source" | "render_authority" | "preview_color_management"> | null | undefined): boolean {
  return !!record?.render_authority && !!record.preview_color_management?.source_encoding && record.render === record.source;
}
/** A ready HDR package made by a superseded recipe (tone-mapped to SDR at preparation, or an earlier
 * code-value build), so its picture cannot match current code-value footage of the same source. */
export function preparedWithSupersededColor(record: PreparedMedia | null | undefined): boolean {
  const receipt = record?.color_management ?? record?.render_color_management;
  return record?.state === "ready" && !!receipt && !currentHdrCodeReceipt(record);
}
/** The package's HDR receipt says how to decode its authority and comes from a current recipe. */
export function currentHdrCodeReceipt(record: PreparedMedia | null | undefined): boolean {
  const receipt = record?.color_management ?? record?.render_color_management;
  return !!preparedSourceEncoding(record) && !!receipt && CURRENT_HDR_CODE_RECIPES.includes(receipt.recipe_id);
}
/**
 * The HDR encoding of a prepared render authority or preview proxy, whose pixels are HLG/PQ code values
 * tagged as BT.709 so browsers pass them through. Null for anything else.
 */
export function preparedCodeValues(projectId: string, relative: string): HdrFrameDecode | null {
  if (!relative.startsWith(".prepared/")) return null;
  let names: string[];
  try { names = fs.readdirSync(preparationDir(projectId)).filter((name) => name.endsWith(".json")); } catch { return null; }
  for (const name of names) {
    const record = readJsonFile<PreparedMedia | null>(path.join(preparationDir(projectId), name), null);
    const encoding = preparedSourceEncoding(record);
    if (!record || !encoding || (record.render !== relative && record.preview !== relative)) continue;
    return { space: { transfer: encoding.transfer, primaries: encoding.primaries }, maxCllNits: encoding.max_cll_nits, matrix: "bt709", range: "tv" };
  }
  return null;
}
/** Every file this record uses, including its browsing preview. */
export function preparationFiles(record: PreparedMedia): string[] {
  return [record.preview, record.render, record.audio, record.browse_preview?.preview, record.browse_preview?.audio, record.browse_preview?.color_stage]
    .filter((item): item is string => typeof item === "string");
}

/** Remove a generation directory this job created and never published. */
export function discardPreparationGeneration(projectId: string, relative: string) {
  const dir = preparationSourcePath(projectId, relative);
  const parent = path.dirname(dir);
  if (!/^\.prepared\/[^/]+\/[0-9a-f]{64}\/[0-9a-f-]{36}$/.test(relative) || !fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink()) return;
  fs.rmSync(dir, { recursive: true, force: true });
  try { fs.rmdirSync(parent); } catch { /* Other generations remain. */ }
}

export type PreparationRetirement = { removed: { path: string; bytes: number }[]; retained: { path: string; records: string[] }[] };

/**
 * Supersede this source's earlier generations once a package is ready. Removes files under its
 * `.prepared/<recipe>/<source-hash>/` that the ready record does not use and that no record in any
 * project names (timelines, history, proposals, evidence, other packages). Earlier previews and
 * the browsing colour stage are rebuildable; a render authority any record still names stays.
 */
export function retireSupersededPreparation(projectId: string, ready: PreparedMedia): PreparationRetirement {
  const result: PreparationRetirement = { removed: [], retained: [] };
  if (ready.state !== "ready" || !ready.source_hash || !/^[0-9a-f]{64}$/.test(ready.source_hash)) return result;
  const hashRelative = `.prepared/${ready.recipe}/${ready.source_hash}`;
  const hashDir = preparationSourcePath(projectId, hashRelative);
  if (!fs.existsSync(hashDir) || !fs.lstatSync(hashDir).isDirectory()) return result;
  const inUse = new Set(preparationFiles(ready));
  const candidates: string[] = [];
  const walk = (relative: string) => {
    for (const entry of fs.readdirSync(preparationSourcePath(projectId, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && !inUse.has(child)) candidates.push(child);
    }
  };
  walk(hashRelative);
  if (!candidates.length) return result;
  const references = findMediaReferences(candidates);
  // The package may have been re-queued while references were scanned; keep everything then.
  const current = readPreparation(projectId, ready.source);
  if (!current || current.state !== "ready" || [...new Set(preparationFiles(current))].sort().join("\n") !== [...inUse].sort().join("\n")) return result;
  for (const relative of candidates) {
    const records = references.get(relative);
    if (records) { result.retained.push({ path: relative, records: records.map(file => path.relative(path.dirname(projectDir(projectId)), file)) }); continue; }
    const file = preparationSourcePath(projectId, relative);
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) continue;
    fs.unlinkSync(file);
    result.removed.push({ path: relative, bytes: stat.size });
  }
  const pruneEmpty = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) pruneEmpty(path.join(dir, entry.name));
    if (dir !== hashDir) try { fs.rmdirSync(dir); } catch { /* Still holds retained files. */ }
  };
  pruneEmpty(hashDir);
  return result;
}

/**
 * Ask the worker for the full-resolution authorities of these sources and return the ones still waiting.
 * An export asks once with `retryFailed` (so an earlier failure is tried again), then polls until none wait.
 */
export function requestRenderAuthorities(projectId: string, sources: Iterable<string>, retryFailed = false): { waiting: string[]; failed: { source: string; error: string }[] } {
  const waiting: string[] = [], failed: { source: string; error: string }[] = [];
  let started = false;
  for (const source of new Set(sources)) {
    const record = readPreparationFromDisk(projectId, source);
    if (!record || record.state !== "ready" || !awaitsRenderAuthority(record)) continue;
    if (record.render_authority!.state === "failed" && !retryFailed) { failed.push({ source, error: record.render_authority!.error ?? "Full-quality preparation failed" }); continue; }
    if (record.render_authority!.state !== "requested") {
      writePreparation(projectId, { ...record, render_authority: { state: "requested", requested_at: new Date().toISOString() } });
    }
    waiting.push(source);
    if (!started) { startPreparationWorker(projectId); started = true; }
  }
  return { waiting, failed };
}
export function startPreparationWorker(projectId: string) {
  if (process.env.MEDIA_PREPARATION_AUTOSTART === "0") return;
  // Once per project per hydrated read: the lock check and start are idempotent.
  previewHydrationMemo(`worker\0${projectId}`, () => { startPreparationWorkerNow(projectId); return true; });
}
function startPreparationWorkerNow(projectId: string) {
  try {
    const pid = Number(fs.readFileSync(path.join(preparationDir(projectId), "worker.lock"), "utf8"));
    if (pid > 0) { process.kill(pid, 0); return; }
  } catch { /* No live worker owns this queue. */ }
  startBackgroundWorkerOnce(preparationDir(projectId), () => {
    fs.mkdirSync(preparationDir(projectId), { recursive: true });
    const log = fs.openSync(path.join(preparationDir(projectId), "worker.log"), "a");
    try {
      const job = workerCommand("scripts/prepare-media.ts", [projectId]);
      const child = spawnBackgroundWorker(job.command, job.args, {
        detached: true, stdio: ["ignore", log, log], env: process.env,
      });
      child.on("error", error => console.error("Media preparation worker could not start", error));
      child.unref();
      return child;
    } finally { fs.closeSync(log); }
  });
}
export function enqueueMediaPreparation(projectId: string, source: string, retry = false, frameRate = previewHydrationMemo(`frame-rate\0${projectId}`, () => readProjectFrameRate(projectId))): PreparedMedia | null {
  if (isAudioPreparationSource(source) && !source.startsWith(".prepared/")) {
    const file = preparationSourcePath(projectId, source);
    const existing = readPreparation(projectId, source);
    if (existing?.state === "preparing") { startPreparationWorker(projectId); return existing; }
    if (existing?.state === "ready" && (previewHydrationMemo(`lufs\0${projectId}\0${source}`, () => getCachedLufs(projectId, file, source)) != null
      || (!retry && existing.loudness?.state === "unavailable"))) return existing;
    if (existing?.state === "failed" && !retry) return existing;
    const stat = fs.statSync(file);
    const record: PreparedMedia = { recipe: PREPARATION_RECIPE, source, size: stat.size, mtime: stat.mtimeMs,
      ctime: stat.ctimeMs, state: "preparing", stage: "queued" };
    writePreparation(projectId, record);
    startPreparationWorker(projectId);
    return record;
  }
  if (!/\.(mov|mp4|webm|m4v)$/i.test(source) || source.startsWith(".prepared/")) return null;
  const existing = readPreparation(projectId, source);
  // Settings that cannot be read now keep the size already prepared: re-preparing a whole project
  // because of a failed read costs minutes of encoding and takes its videos out of placement.
  const settings = previewHydrationMemo(`preview-settings\0${projectId}`, () => readPreviewSettings(projectId));
  const quality = settings.known ? settings.quality : (existing?.preview_quality ?? settings.quality);
  const rateCurrent = (existing?.preview_frame_rate ?? COMPOSITION_FPS) === frameRate;
  // A ready package whose preview is HDR (made before HDR conversion covered it) is prepared again.
  const hdrPreview = existing?.state === "ready" && !!existing.preview
    && validatePreviewProxy(`/api/projects/${projectId}/media/${existing.preview.split("/").map(encodeURIComponent).join("/")}`, existing.alpha === true).hdr;
  // So does one whose HDR authority was tone-mapped to SDR by a superseded recipe.
  if (existing && rateCurrent && !hdrPreview && !preparedWithSupersededColor(existing) && (existing.preview_policy_version === PREVIEW_POLICY_VERSION || existing.alpha !== true || quality !== "prepared") && (existing.preview_quality ?? "prepared") === quality && !(retry && existing.state === "failed")) {
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

/** Ready, or being prepared again (a larger preview size, a newer policy) while the package it
 * already has stays on disk: placing and reviewing keep using that package until the new one lands,
 * and after that re-preparation fails, as playback does. */
export function placeable(projectId: string, record: PreparedMedia) {
  if (record.state === "ready") return true;
  if (record.state === "failed" && !record.prepared_preview_quality) return false;
  if (!record.render || !record.preview) return false;
  return [record.render, record.preview].every(relative => fs.existsSync(preparationSourcePath(projectId, relative)));
}

export function preparedPlacement(projectId: string, sourceUrl: string, props: Record<string, unknown>) {
  const prefix = `/api/projects/${projectId}/media/`;
  const archival = typeof props.archival_source_url === "string" ? props.archival_source_url : sourceUrl;
  const source = archival.startsWith(prefix) ? decodeURIComponent(archival.slice(prefix.length)) : null;
  const ready = source ? readPreparation(projectId, source) : null;
  if (!ready || !placeable(projectId, ready)) throw Object.assign(new Error("Video is not ready. Prepare its preview before adding it to the timeline."), { status: 409 });
  const url = (relative: string) => prefix + relative.split("/").map(encodeURIComponent).join("/");
  if (sourceUrl !== archival && sourceUrl !== url(ready.render!)) throw Object.assign(new Error("Prepared media does not match the selected source"), { status: 409 });
  return { source_url: url(ready.render!), props: { ...props,
    preview_source_url: url(ready.preview!),
    ...(ready.audio ? { preview_audio_source_url: url(ready.audio), preview_audio_baked_gain: 1 } : {}),
    source_duration_seconds: ready.duration,
    has_alpha: ready.alpha,
    archival_source_url: archival,
    media_preparation_recipe: ready.recipe,
    // A code-value HDR authority: the grade shader decodes HLG/PQ and tone-maps at output.
    ...(preparedSourceEncoding(ready) ? { source_color_space: preparedSourceEncoding(ready) } : {}),
  } };
}

/** Queue only previews made at another quality, so a project whose Automatic size changed
 * while it was closed catches up when it next opens. Failed and in-progress work is left alone. */
export function refreshStaleProjectPreviews(projectId: string) {
  const dir = preparationDir(projectId);
  if (!fs.existsSync(dir)) return 0;
  const settings = readPreviewSettings(projectId);
  if (!settings.known) return 0;
  const quality = settings.quality;
  let queued = 0;
  for (const name of fs.readdirSync(dir).filter(name => name.endsWith(".json"))) {
    const record = readJsonFile<PreparedMedia | null>(path.join(dir, name), null);
    if (!record || record.state !== "ready" || isAudioPreparationSource(record.source) || (record.preview_quality ?? "prepared") === quality) continue;
    try { if (enqueueMediaPreparation(projectId, record.source)?.state === "preparing") queued += 1; }
    catch { /* A source removed since it was prepared has nothing to refresh. */ }
  }
  return queued;
}

/** Prepare the project shelf up front after its quality changes. */
export function prepareProjectPreviews(projectId: string) {
  const dir = preparationDir(projectId);
  if (!fs.existsSync(dir)) return [];
  const records = fs.readdirSync(dir).filter(name => name.endsWith(".json")).map(name => readJsonFile<PreparedMedia | null>(path.join(dir, name), null)).filter((r): r is PreparedMedia => !!r);
  return records.map(record => enqueueMediaPreparation(projectId, record.source, true)).filter(Boolean);
}
