import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnBackgroundWorker as spawn, startBackgroundWorkerOnce } from "./background-worker";
import { projectDir, projectMediaDir } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { verifyCatalogSource, readVideoDescription, publishVideoDescription } from "./video-descriptions";
import { fileHash, importArtifacts, processImportedMedia } from "../agent/media-import-workflow";
import { readEnv } from "@/lib/env-name";

export type MediaImportJob = {
  id: string; asset_id: string; media_path: string; source_sha256: string;
  workflow: "media-process/import";
  reused_context_id?: string;
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  attempt: number; updated_at: string; error?: string; outputs?: string[]; cancel_requested?: boolean; search_text?: string;
};
const directory = (projectId: string) => path.join(projectDir(projectId), "preprocess", "import-jobs");
const jobPath = (projectId: string, id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid import job id");
  return path.join(directory(projectId), `${id}.json`);
};
const save = (projectId: string, job: MediaImportJob) => writeJsonFileAtomic(jobPath(projectId, job.id), { ...job, updated_at: new Date().toISOString() });
export function readImportJob(projectId: string, id: string) {
  const job = readJsonFile<MediaImportJob | null>(jobPath(projectId, id), null);
  if (!job) throw new Error("Import job not found");
  return job;
}
export function listImportJobs(projectId: string): MediaImportJob[] {
  if (!fs.existsSync(directory(projectId))) return [];
  return fs.readdirSync(directory(projectId)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name))
    .map(name => readImportJob(projectId, name.slice(0, -5)));
}
/**
 * Background import analysis runs a separately configured model (worker-runner.ts), so it is opt-in:
 * DREAMCUT_IMPORT_ANALYSIS=worker. Otherwise footage is described by the agent the creator is already
 * using, through media_describe, and no other model runs on their behalf.
 */
export const importAnalysisByWorker = (env: NodeJS.ProcessEnv = process.env) => readEnv("IMPORT_ANALYSIS", env) === "worker";

/** Queue background analysis for an import, or null when it is not enabled (see importAnalysisByWorker). */
export function enqueueImportJob(projectId: string, asset: Pick<MediaImportJob, "asset_id" | "media_path" | "source_sha256">): MediaImportJob | null {
  if (!importAnalysisByWorker()) return null;
  const existing = readJsonFile<MediaImportJob | null>(jobPath(projectId, asset.asset_id), null);
  if (existing) return existing;
  const job: MediaImportJob = { ...asset, id: asset.asset_id, workflow: "media-process/import", status: "queued", attempt: 0, updated_at: new Date().toISOString() };
  save(projectId, job);
  startImportWorker(projectId);
  return job;
}
/** Explicit backfill/upgrade, separate from importing or silently retrying failures. */
export function analyzeImportedVideo(projectId: string, asset: Pick<MediaImportJob, "asset_id" | "media_path" | "source_sha256">) {
  if (!/\.(mov|mp4|m4v|webm)$/i.test(asset.media_path)) throw new Error("Select an imported video");
  if (!verifyCatalogSource(projectId, asset.media_path, asset.source_sha256)) throw new Error("Imported source changed; reimport it before analysis");
  if (readVideoDescription(asset.source_sha256)) return { status: "ready" as const };
  if (!importAnalysisByWorker()) throw new Error("Background analysis is off; ask your agent to describe this video (media_describe)");
  const existing = listImportJobs(projectId).find(job => job.asset_id === asset.asset_id);
  if (!existing) return enqueueImportJob(projectId, asset)!;
  if (existing.media_path !== asset.media_path || existing.source_sha256 !== asset.source_sha256) throw new Error("Import source identity changed");
  if (["queued", "running"].includes(existing.status)) return existing;
  save(projectId, { ...existing, status: "queued", cancel_requested: false, error: undefined });
  startImportWorker(projectId);
  return readImportJob(projectId, existing.id);
}

export function updateImportJob(projectId: string, id: string, action: "retry" | "cancel") {
  const job = readImportJob(projectId, id);
  if (action === "retry" && !["failed", "cancelled"].includes(job.status)) throw new Error("Only failed or cancelled jobs can be retried");
  if (action === "cancel" && !["queued", "running"].includes(job.status)) throw new Error("Job is no longer active");
  save(projectId, { ...job, status: action === "retry" ? "queued" : job.status === "running" ? "running" : "cancelled", cancel_requested: action === "cancel", error: undefined });
  if (action === "retry") startImportWorker(projectId);
}

export function startImportWorker(projectId: string) {
  if ((readEnv("IMPORT_AUTOSTART")) === "0") return;
  const lock = path.join(directory(projectId), "worker.lock");
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    try { if (pid > 0) { process.kill(pid, 0); return; } } catch { /* Let the worker reconcile an interrupted queue. */ }
  }
  startBackgroundWorkerOnce(directory(projectId), () => {
    fs.mkdirSync(directory(projectId), { recursive: true });
    const log = fs.openSync(path.join(directory(projectId), "worker.log"), "a", 0o600);
    try {
      const child = spawn(process.execPath, ["--import", "tsx", path.resolve("scripts/process-imports.ts"), projectId], {
        cwd: process.cwd(), detached: true, stdio: ["ignore", log, log], env: process.env,
      });
      child.on("error", error => {
        for (const job of listImportJobs(projectId).filter(j => j.status === "queued")) save(projectId, { ...job, status: "failed", error: `Import worker unavailable: ${error.message}` });
      });
      child.unref();
      return child;
    } finally { fs.closeSync(log); }
  });
}

/** One process per project owns this queue. Stale owners fail in-flight jobs, never silently rerun them. */
export async function runImportQueue(projectId: string, processMedia = processImportedMedia) {
  fs.mkdirSync(directory(projectId), { recursive: true });
  const lock = path.join(directory(projectId), "worker.lock");
  // Serialize ownership recovery too: two starters must never unlink a fresh owner's lock.
  const claim = path.join(directory(projectId), "claim.lock");
  let claimFd: number;
  try {
    claimFd = fs.openSync(claim, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (Date.now() - fs.statSync(claim).mtimeMs > 30_000) {
      for (const job of listImportJobs(projectId).filter(j => j.status === "queued")) save(projectId, { ...job, status: "failed", error: "Worker ownership recovery was interrupted. Ask the local maintainer to check preprocess/import-jobs/claim.lock before retrying." });
    }
    return;
  }
  try {
    if (fs.existsSync(lock)) {
      const pid = Number(fs.readFileSync(lock, "utf8"));
      try { if (pid > 0) { process.kill(pid, 0); return; } } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") return;
      }
      fs.unlinkSync(lock);
    }
    const fd = fs.openSync(lock, "wx", 0o600);
    fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  } finally {
    fs.closeSync(claimFd);
    fs.unlinkSync(claim);
  }
  try {
    for (const job of listImportJobs(projectId).filter(j => j.status === "running")) save(projectId, { ...job, status: "failed", error: "Worker interrupted. Retry processing." });
    for (;;) {
      const job = listImportJobs(projectId).find(j => j.status === "queued");
      if (!job) break;
      const working: MediaImportJob = { ...job, status: "running", attempt: job.attempt + 1, error: undefined, cancel_requested: false };
      save(projectId, working);
      const controller = new AbortController();
      const timer = setInterval(() => { if (readImportJob(projectId, job.id).cancel_requested) controller.abort(); }, 500);
      try {
        const root = fs.realpathSync(projectMediaDir(projectId));
        const source = fs.realpathSync(path.resolve(root, job.media_path));
        if (!source.startsWith(root + path.sep)) throw new Error("Imported source is outside project media");
        if (/\.(mov|mp4|m4v|webm)$/i.test(job.media_path)) {
          const cached = readVideoDescription(job.source_sha256);
          if (cached && fileHash(source) === job.source_sha256) {
            save(projectId, { ...working, status: "complete", outputs: [], reused_context_id: `sha256:${job.source_sha256}`,
              search_text: [cached.summary, ...cached.tags, ...cached.frames.map(frame => frame.description)].join(" ") });
            continue;
          }
        }
        const result = await processMedia({ source, sha256: job.source_sha256, signal: controller.signal,
          skillPath: readEnv("MEDIA_PROCESS_SKILL") ?? path.join(os.homedir(), ".agents", "skills", "media-process", "SKILL.md"),
        });
        if (fileHash(source) !== job.source_sha256) throw new Error("Imported source changed; reimport it");
        if (readImportJob(projectId, job.id).cancel_requested) { save(projectId, { ...working, status: "cancelled" }); continue; }
        const outputDir = path.join(projectDir(projectId), "preprocess", "media-process", job.id, `attempt-${working.attempt}`);
        fs.mkdirSync(outputDir, { recursive: true });
        const outputs: string[] = [];
        for (const [name, content] of Object.entries(importArtifacts(result, job))) {
          const file = path.join(outputDir, name);
          fs.writeFileSync(file, content, { flag: "wx", mode: 0o600 });
          outputs.push(path.relative(projectDir(projectId), file));
        }
        if (result.media_type === "video") {
          publishVideoDescription(JSON.parse(fs.readFileSync(path.join(outputDir, "video-description.json"), "utf8")));
        }
        save(projectId, { ...working, status: "complete", outputs, search_text: [result.summary, ...result.tags, ...result.entries.map(e => e.summary), ...(result.frame_descriptions ?? []).map(f => f.description)].join(" ") });
      } catch (error) {
        if (readImportJob(projectId, job.id).cancel_requested) save(projectId, { ...working, status: "cancelled" });
        else save(projectId, { ...working, status: "failed", error: error instanceof Error ? error.message : "Processing failed" });
      } finally { clearInterval(timer); }
    }
  } finally {
    fs.unlinkSync(lock);
    // Imports may have arrived between the final queue read and releasing ownership.
    if (listImportJobs(projectId).some(job => job.status === "queued")) startImportWorker(projectId);
  }
}

/**
 * The agent's own description of an imported video (media_describe): one observation per planned sample
 * time (videoDescriptionTimes) plus a whole-clip summary. Published like a worker's result, so video_search
 * and the Library read it; recorded as a complete import job with the agent as its author.
 */
export function recordAgentVideoDescription(projectId: string, input: {
  asset: Pick<MediaImportJob, "asset_id" | "media_path" | "source_sha256">; duration_seconds: number;
  summary: string; tags: string[]; frames: { time_seconds: number; description: string; tags: string[] }[]; uncertainties: string[]; author: string;
}) {
  const { asset } = input;
  if (!verifyCatalogSource(projectId, asset.media_path, asset.source_sha256)) throw new Error("Imported source changed; reimport it before describing it");
  const frames = input.frames.map((frame, i) => ({ id: `${asset.asset_id}:f${i + 1}`, time_seconds: frame.time_seconds, description: frame.description, tags: frame.tags }));
  const description = { schema_version: 1, recipe: "video-descriptions-v1", source_sha256: asset.source_sha256, duration_seconds: input.duration_seconds,
    summary: input.summary, tags: input.tags, frames, summary_input_ids: frames.map(frame => frame.id), uncertainties: input.uncertainties };
  publishVideoDescription(description);
  const outputDir = path.join(projectDir(projectId), "preprocess", "media-process", asset.asset_id, `agent-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const file = path.join(outputDir, "video-description.json");
  fs.writeFileSync(file, `${JSON.stringify({ ...description, described_by: input.author }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const previous = readJsonFile<MediaImportJob | null>(jobPath(projectId, asset.asset_id), null);
  const job: MediaImportJob = { ...asset, id: asset.asset_id, workflow: "media-process/import", status: "complete", attempt: (previous?.attempt ?? 0) + 1,
    updated_at: new Date().toISOString(), outputs: [path.relative(projectDir(projectId), file)],
    search_text: [input.summary, ...input.tags, ...frames.map(frame => `${frame.description} ${frame.tags.join(" ")}`)].join(" ") };
  save(projectId, job);
  return job;
}
