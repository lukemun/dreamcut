import { projectFrameRate } from "@/lib/timeline/frame-quantization";
import fs from "node:fs";
import { traceOperation } from "@/lib/observability/operations";
import { createExportCheckpoint, safeMemoryEvent } from "./editing-memory";
import { exportSharingEnabled, shareExportPacket } from "./export-sharing";
import path from "node:path";

import type { GenerationJobStatus } from "@/lib/generation/jobs";
import type { TimelineAspectRatio } from "@/components/studio/timeline/types";
import { buildTimelineTransitionLayout } from "@/lib/timeline/transitions";
import { MAX_EXPORT_DURATION_SECONDS } from "@/lib/render/constants";
import { renderProjectVideo } from "@/lib/render/pipeline";
import type { ExportStage } from "@/lib/render/browser-renderer";
import { DEFAULT_EXPORT_RESOLUTION } from "@/lib/render/export-resolution";
import { projectRendersDir, projectsRoot } from "@/lib/local-store/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { activeElements, activeTransitions, readMetadata, readTimeline } from "@/lib/local-store/store";
import { newId } from "@/lib/local-store/store";
import { readEnv } from "@/lib/env-name";
import { deferredRenderAuthorities, sdrExportSources, sourcesAwaitingRenderAuthority } from "./export-render-sources";
import { requestRenderAuthorities } from "./media-preparation";
import { addToExportsFolder } from "./export-library";

// Durable render-job registry standing in for the app's generation_jobs table.
// The in-memory Map is a hot cache; every state change is written through to
// projects/.cache/render-jobs/<jobId>.json, so jobs survive a dev-server
// restart (Next resets module state on every recompile). Each record carries
// the writer's pid: a "processing" job whose process is gone reads back as
// failed-interrupted instead of showing an eternal spinner. Finished renders
// additionally survive via latestRenderJob()'s renders/-dir fallback.

export type LocalRenderJob = {
  id: string;
  projectId: string;
  targetType: "render";
  backend?: "standard" | "rust" | "gpu";
  status: GenerationJobStatus;
  statusLabel?: string;
  /** Export progress, 0–1. */
  progress?: number;
  error: string | null;
  fileName: string | null;
  createdAt: string;
  completedAt: string | null;
  /** pid of the process running the render; used to detect interrupted jobs. */
  pid?: number;
  /** The finished file's copy in the creator's shared exports folder (Library → Exports). */
  libraryPath?: string | null;
};

const jobs = new Map<string, LocalRenderJob>();

function renderJobsDir(): string {
  return path.join(projectsRoot(), ".cache", "render-jobs");
}

function jobPath(jobId: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(jobId)) throw new Error(`Invalid job id: ${jobId}`);
  return path.join(renderJobsDir(), `${jobId}.json`);
}

// A stop asked for by another editor process: the stable editor swaps to a fresh process after a rebuild,
// and an export started before the swap keeps running in the old one, out of reach of the new one's memory.
function stopRequestPath(jobId: string): string {
  return jobPath(jobId).replace(/\.json$/, ".stop");
}

/** Whether some editor process has asked this export to stop. */
export function renderStopRequested(jobId: string): boolean {
  return fs.existsSync(stopRequestPath(jobId));
}

function persistJob(job: LocalRenderJob): void {
  writeJsonFileAtomic(jobPath(job.id), job);
}

function processAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Normalize a disk record: a processing job whose writer died was interrupted. */
function reviveJob(job: LocalRenderJob): LocalRenderJob {
  const active = job.status !== "completed" && job.status !== "failed" && job.status !== "canceled";
  if (active && !processAlive(job.pid)) {
    const failed: LocalRenderJob = {
      ...job,
      status: "failed",
      statusLabel: "Failed",
      error: "Render was interrupted by a server restart; start it again.",
      completedAt: new Date().toISOString(),
    };
    persistJob(failed);
    return failed;
  }
  return job;
}

function listJobsFromDisk(): LocalRenderJob[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(renderJobsDir()).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const job = readJsonFile<LocalRenderJob | null>(path.join(renderJobsDir(), name), null);
    return job && typeof job.id === "string" ? [reviveJob(job)] : [];
  });
}

export function getJob(jobId: string): LocalRenderJob | undefined {
  const cached = jobs.get(jobId);
  if (cached) return cached;
  try {
    const onDisk = readJsonFile<LocalRenderJob | null>(jobPath(jobId), null);
    return onDisk && onDisk.id === jobId ? reviveJob(onDisk) : undefined;
  } catch {
    return undefined;
  }
}

export function listJobs(filter: { projectId?: string; activeOnly?: boolean; targetType?: string }): LocalRenderJob[] {
  // The Map wins per id (it is the live object the render loop mutates).
  const merged = new Map<string, LocalRenderJob>();
  for (const job of listJobsFromDisk()) merged.set(job.id, job);
  for (const [id, job] of jobs) merged.set(id, job);
  return [...merged.values()]
    .filter((job) => (filter.projectId ? job.projectId === filter.projectId : true))
    .filter((job) => (filter.targetType ? job.targetType === filter.targetType : true))
    .filter((job) =>
      filter.activeOnly
        ? job.status !== "completed" && job.status !== "failed" && job.status !== "canceled"
        : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function activeRenderJobForProject(projectId: string): LocalRenderJob | undefined {
  return listJobs({ projectId, activeOnly: true, targetType: "render" })[0];
}

export type StartRenderResult =
  | { ok: true; job: LocalRenderJob; alreadyInProgress: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

export function startRender(
  projectId: string,
  mutedLaneKeys: string[],
  mediaBaseUrl: string,
  options: Pick<Parameters<typeof renderProjectVideo>[0], "renderScale" | "resolution" | "dynamicRange" | "concurrency" | "imageFormat" | "backend" | "hiddenLaneKeys"> = {},
): StartRenderResult {
  if (options.backend === "rust" && readEnv("NATIVE_PREVIEW") !== "1") return {ok:false,status:400,body:{error:"Rust rendering is not enabled on this server"}};
  const existing = activeRenderJobForProject(projectId);
  if (existing) {
    if ((existing.backend ?? "standard") !== (options.backend ?? "standard")) return {ok:false,status:409,body:{error:"An export with a different engine is still running. Wait for it to finish before changing export engines.",job_id:existing.id}};
    return { ok: true, job: existing, alreadyInProgress: true };
  }

  const timeline = readTimeline(projectId);
  const metadata = readMetadata(projectId);
  const active = activeElements(timeline);
  const exportSources = () => { const resolved = deferredRenderAuthorities(projectId, active); return options.backend === "gpu" ? sdrExportSources(projectId, resolved) : resolved; };
  // Durations do not depend on which file a clip renders from; the sources are resolved again once
  // any deferred full-quality authorities exist.
  let elements = exportSources();
  const transitions = activeTransitions(timeline);
  // Callers that predate the mute/hide split send only muted keys; hidden lanes then follow the project.
  const hiddenLaneKeys = options.hiddenLaneKeys ?? metadata.hidden_lane_keys;

  const layout = buildTimelineTransitionLayout(elements, transitions);
  const durationSeconds = Math.max(1, layout.effectiveDurationSeconds);
  if (durationSeconds > MAX_EXPORT_DURATION_SECONDS) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Render duration exceeds the export limit",
        error_code: "render_duration_limit_exceeded",
        user_message: `Maximum export length is ${Math.floor(MAX_EXPORT_DURATION_SECONDS / 60)} minute${
          MAX_EXPORT_DURATION_SECONDS % 60 ? ` ${MAX_EXPORT_DURATION_SECONDS % 60} seconds` : ""
        }.`,
        duration_seconds: durationSeconds,
        max_duration_seconds: MAX_EXPORT_DURATION_SECONDS,
      },
    };
  }

  const job: LocalRenderJob = {
    id: newId(),
    projectId,
    targetType: "render",
    backend: options.backend ?? "standard",
    status: "processing",
    statusLabel: "Rendering",
    error: null,
    fileName: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    pid: process.pid,
  };
  jobs.set(job.id, job);
  persistJob(job);
  const controller = new AbortController();
  stops.set(job.id, { controller, job });
  const stopWatch = setInterval(() => { if (!controller.signal.aborted && renderStopRequested(job.id)) stopRunning(job.id); }, 500);
  stopWatch.unref?.();

  try {
    if (exportSharingEnabled()) createExportCheckpoint(projectId, job.id, { timeline, metadata, muted_lane_keys: mutedLaneKeys, hidden_lane_keys: hiddenLaneKeys, resolution: options.resolution ?? DEFAULT_EXPORT_RESOLUTION, trigger: "export" });
    safeMemoryEvent(projectId, { type: "export.started", actor: "human", summary: "Started export", evidence: job.id });
  } catch (error) {
    job.status = "failed";
    job.error = `Could not save export checkpoint: ${String(error)}`;
    job.completedAt = new Date().toISOString();
    persistJob(job);
    return { ok: false, status: 500, body: { error: job.error } };
  }
  void (async () => {
    try {
      const awaiting = sourcesAwaitingRenderAuthority(projectId, active);
      if (awaiting.length) {
        await awaitRenderAuthorities(projectId, awaiting, controller.signal, (label) => { if (job.statusLabel !== label) { job.statusLabel = label; job.progress = undefined; persistJob(job); } });
        elements = exportSources();
      }
      const result = await traceOperation("render.export", () => renderProjectVideo({
        projectId,
        elements,
        transitions,
        laneOrderKeys: metadata.lane_order_keys,
        mutedLaneKeys,
        aspectRatio: metadata.output_aspect_ratio as TimelineAspectRatio,
        frameRate: projectFrameRate(metadata),
        mediaBaseUrl,
        ...options,
        hiddenLaneKeys,
        signal: controller.signal,
        onProgress: (progress, stage) => {
          const label = exportStageLabel(stage, progress);
          // Startup and sharpening motion graphics have no fraction of the whole export; the dialog animates until frames begin.
          const percent = stage === "starting" || stage === "motion-graphics" ? undefined : Math.floor(progress * 100) / 100;
          if (job.statusLabel !== label || job.progress !== percent) { job.statusLabel = label; job.progress = percent; persistJob(job); }
        },
      }));
      job.fileName = result.fileName;
      job.status = "completed";
      job.statusLabel = "Completed";
      job.progress = 1;
      job.completedAt = new Date().toISOString();
      job.libraryPath = addToExportsFolder(path.join(projectRendersDir(projectId), path.basename(result.fileName)), metadata.title ?? projectId, new Date(job.completedAt));
      persistJob(job);
      safeMemoryEvent(projectId, { type: "export.completed", actor: "system", summary: "Export ready", evidence: job.id });
      // The completed job makes its frozen checkpoint reviewable and uploads its evidence.
      void shareExportPacket(projectId, job.id).catch(error => console.error("[export-sharing] upload failed", error));
    } catch (error) {
      job.completedAt = new Date().toISOString();
      if (controller.signal.aborted) {
        job.status = "canceled";
        job.statusLabel = "Stopped";
        job.error = null;
        safeMemoryEvent(projectId, { type: "export.failed", actor: "human", summary: "Export stopped", evidence: job.id });
      } else {
        job.status = "failed";
        job.statusLabel = "Failed";
        job.error = exportErrorMessage(error);
        safeMemoryEvent(projectId, { type: "export.failed", actor: "system", summary: "Export failed; no delivery preferences inferred", evidence: job.id });
        console.error("[render] job failed", job.error);
      }
    } finally {
      clearInterval(stopWatch);
      stops.delete(job.id);
      fs.rmSync(stopRequestPath(job.id), { force: true });
      persistJob(job);
    }
  })();

  return { ok: true, job, alreadyInProgress: false };
}

/**
 * Opaque HDR clips are placed from a fast proxy; their full-resolution code-value authority is made by the
 * preparation worker the first time an export needs it. Wait for it here, before the renderer starts.
 */
async function awaitRenderAuthorities(projectId: string, sources: string[], signal: AbortSignal, onLabel: (label: string) => void) {
  let status = requestRenderAuthorities(projectId, sources, true);
  while (status.waiting.length || status.failed.length) {
    if (status.failed.length) throw new Error(`Could not make the full-quality copy of ${status.failed.map(item => path.basename(item.source)).join(", ")}: ${status.failed[0]!.error}`);
    if (signal.aborted) throw new Error("Export stopped");
    onLabel(`Preparing full-quality source ${sources.length - status.waiting.length + 1} of ${sources.length}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    status = requestRenderAuthorities(projectId, status.waiting);
  }
}

// Route handlers are bundled separately, each with its own copy of this module, so the exports
// running in this server are kept where the stop route can reach them.
const stopsKey = Symbol.for("dreamcut.render-job-stops");
const stops = ((globalThis as typeof globalThis & { [stopsKey]?: Map<string, { controller: AbortController; job: LocalRenderJob }> })[stopsKey] ??= new Map());

function stopRunning(jobId: string): boolean {
  const running = stops.get(jobId);
  if (!running) return false;
  running.job.statusLabel = "Stopping";
  persistJob(running.job);
  running.controller.abort();
  return true;
}

/**
 * Stop a running export. One started by this process stops at once; one still running in another live
 * editor process gets a stop request it picks up within a second. False when no such export is running.
 */
export function stopRender(jobId: string): boolean {
  if (stopRunning(jobId)) return true;
  const job = getJob(jobId);
  if (!job || job.status !== "processing" || !job.pid || job.pid === process.pid || !processAlive(job.pid)) return false;
  fs.writeFileSync(stopRequestPath(jobId), new Date().toISOString());
  return true;
}

/** The failure the export dialog shows: the browser's own message without its terminal colour codes or
 *  step-by-step call log, which read as noise to a person. */
export function exportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  // eslint-disable-next-line no-control-regex
  const plain = message.replace(/\u001b\[[0-9;]*m/g, "").split(/\n\s*Call log:/)[0]!.trim();
  return plain || "Render failed";
}

/** What the export dialog says the export is doing. */
export function exportStageLabel(stage: ExportStage, progress: number) {
  if (stage === "starting") return "Starting renderer";
  if (stage === "motion-graphics") return `Sharpening motion graphics ${Math.floor(progress * 100)}%`;
  if (stage === "rendering") return `Rendering ${Math.floor(progress * 100)}%`;
  if (stage === "encoding") return "Encoding video";
  if (stage === "mixing-audio") return "Mixing audio";
  if (stage === "watermark") return "Adding watermark";
  return "Saving";
}

export function latestRenderFile(projectId: string): { fileName: string; mtimeMs: number } | null {
  const rendersDir = projectRendersDir(projectId);
  let entries: string[];
  try {
    entries = fs.readdirSync(rendersDir).filter((name) => name.endsWith(".mp4"));
  } catch {
    return null;
  }
  let latest: { fileName: string; mtimeMs: number } | null = null;
  for (const fileName of entries) {
    const mtimeMs = fs.statSync(path.join(rendersDir, fileName)).mtimeMs;
    if (!latest || mtimeMs > latest.mtimeMs) latest = { fileName, mtimeMs };
  }
  return latest;
}

/** The most recent render job for a project — falling back to the newest mp4
 *  on disk when the in-memory registry is empty (e.g. after a restart). */
export function latestRenderJob(projectId: string): LocalRenderJob | null {
  const inMemory = listJobs({ projectId, targetType: "render" })[0];
  if (inMemory) return inMemory;

  const onDisk = latestRenderFile(projectId);
  if (!onDisk) return null;
  return {
    id: `disk-${onDisk.fileName}`,
    projectId,
    targetType: "render",
    status: "completed",
    statusLabel: "Completed",
    error: null,
    fileName: onDisk.fileName,
    createdAt: new Date(onDisk.mtimeMs).toISOString(),
    completedAt: new Date(onDisk.mtimeMs).toISOString(),
  };
}
