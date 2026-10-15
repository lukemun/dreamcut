import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { listMediaFiles } from "./media";
import {
  mediaAnalysisContentDir,
  mediaAnalysisJobPath,
  mediaAnalysisJobsDir,
  projectAnalysisAnnotationsPath,
  projectMediaAssetsPath,
  projectMediaDir,
  projectExists,
} from "./paths";
import type {
  AnalysisAnnotationsFile,
  AnalysisJob,
  AnalysisManifest,
  AssetBinding,
  AssetBindingsFile,
} from "../media-analysis/schema";

const EMPTY_ASSETS: AssetBindingsFile = { schema_version: 1, assets: [] };
const EMPTY_ANNOTATIONS: AnalysisAnnotationsFile = { schema_version: 1, annotations: [] };

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${name}`);
}

function validateAssetBindings(value: unknown): void {
  assertObject(value, "asset bindings");
  if (value.schema_version !== 1 || !Array.isArray(value.assets)) throw new Error("Invalid asset bindings");
}

function validateJob(value: unknown): void {
  assertObject(value, "analysis job");
  if (value.schema_version !== 1 || typeof value.job_id !== "string" || typeof value.project_id !== "string") throw new Error("Invalid analysis job");
}

function validateManifest(value: unknown): void {
  assertObject(value, "analysis manifest");
  if (value.schema_version !== 2 || typeof value.fingerprint_sha256 !== "string"
    || !Array.isArray(value.attempts) || !value.stage_records || typeof value.stage_records !== "object") {
    throw new Error("Invalid analysis manifest");
  }
}

function validateAnnotations(value: unknown): void {
  assertObject(value, "analysis annotations");
  if (value.schema_version !== 1 || !Array.isArray(value.annotations)) throw new Error("Invalid analysis annotations");
}

function assertExistingProject(projectId: string): void {
  if (!projectExists(projectId)) {
    const error = new Error(`Project not found: ${projectId}`);
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
}

export function readAssetBindings(projectId: string): AssetBindingsFile {
  return readJsonFile(projectMediaAssetsPath(projectId), EMPTY_ASSETS);
}

export function reconcileAssetBindings(projectId: string): AssetBindingsFile {
  assertExistingProject(projectId);
  const previous = readAssetBindings(projectId);
  const byPath = new Map(previous.assets.map((asset) => [asset.relative_path, asset]));
  const now = new Date().toISOString();
  const assets = listMediaFiles(projectId).map((media): AssetBinding => {
    const stat = fs.statSync(path.join(projectMediaDir(projectId), media.relPath));
    const existing = byPath.get(media.relPath);
    const changed = !existing || existing.size_bytes !== stat.size || existing.mtime_ms !== stat.mtimeMs;
    return {
      asset_id: existing?.asset_id ?? randomUUID(),
      project_id: projectId,
      relative_path: media.relPath,
      kind: media.kind,
      size_bytes: stat.size,
      mtime_ms: stat.mtimeMs,
      fingerprint_sha256: changed ? null : existing.fingerprint_sha256,
      current_job_id: changed ? null : existing.current_job_id,
      updated_at: now,
    };
  });
  const next = { schema_version: 1 as const, assets };
  writeJsonFileAtomic(projectMediaAssetsPath(projectId), next, validateAssetBindings);
  return next;
}

export function writeAssetBindings(projectId: string, value: AssetBindingsFile): void {
  writeJsonFileAtomic(projectMediaAssetsPath(projectId), value, validateAssetBindings);
}

export function readJob(jobId: string): AnalysisJob | null {
  return readJsonFile<AnalysisJob | null>(mediaAnalysisJobPath(jobId), null);
}

export function writeJob(job: AnalysisJob): void {
  writeJsonFileAtomic(mediaAnalysisJobPath(job.job_id), job, validateJob);
}

export function listJobs(projectId?: string): AnalysisJob[] {
  let names: string[] = [];
  try { names = fs.readdirSync(mediaAnalysisJobsDir()); } catch { return []; }
  return names.filter((name) => name.endsWith(".json")).flatMap((name) => {
    const job = readJsonFile<AnalysisJob | null>(path.join(mediaAnalysisJobsDir(), name), null);
    return job && (!projectId || job.project_id === projectId) ? [job] : [];
  }).sort((a, b) => b.requested_at.localeCompare(a.requested_at));
}

export function enqueueAssets(projectId: string, assetIds?: string[]): AnalysisJob[] {
  const bindings = reconcileAssetBindings(projectId);
  const selected = bindings.assets.filter((asset) => !assetIds || assetIds.includes(asset.asset_id));
  const now = new Date().toISOString();
  const jobs = selected.map((asset): AnalysisJob => ({
    schema_version: 1,
    job_id: randomUUID(), project_id: projectId, asset_id: asset.asset_id,
    relative_path: asset.relative_path, source_size_bytes: asset.size_bytes,
    source_mtime_ms: asset.mtime_ms, status: "queued", requested_at: now,
    started_at: null, finished_at: null, cancellation_requested_at: null,
    lease: null, attempt_number: 0, fingerprint_sha256: asset.fingerprint_sha256, timing: null, attempts: [], error: null,
  }));
  for (const job of jobs) writeJob(job);
  const jobByAsset = new Map(jobs.map((job) => [job.asset_id, job.job_id]));
  writeAssetBindings(projectId, {
    ...bindings,
    assets: bindings.assets.map((asset) => ({ ...asset, current_job_id: jobByAsset.get(asset.asset_id) ?? asset.current_job_id })),
  });
  return jobs;
}

export function requestCancellation(jobId: string): AnalysisJob {
  const job = readJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  const now = new Date().toISOString();
  const next: AnalysisJob = job.status === "queued"
    ? { ...job, status: "cancelled", cancellation_requested_at: now, finished_at: now }
    : { ...job, cancellation_requested_at: now };
  writeJob(next);
  return next;
}

export function retryJob(jobId: string): AnalysisJob {
  const job = readJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  return enqueueAssets(job.project_id, [job.asset_id])[0];
}

export function claimNextJob(owner: string, leaseMs = 30_000): AnalysisJob | null {
  const now = Date.now();
  const candidate = listJobs().reverse().find((job) => job.status === "queued"
    || (job.status === "running" && job.lease && Date.parse(job.lease.expires_at) <= now));
  if (!candidate) return null;
  const claimPath = `${mediaAnalysisJobPath(candidate.job_id)}.claim`;
  let descriptor: number;
  try {
    descriptor = fs.openSync(claimPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify({ owner, expires_at: new Date(now + leaseMs).toISOString() })}\n`);
    fs.fsyncSync(descriptor);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      try {
        const stale = readJsonFile<{ expires_at?: string }>(claimPath, {});
        if ((stale.expires_at && Date.parse(stale.expires_at) <= now) || now - fs.statSync(claimPath).mtimeMs > leaseMs) {
          fs.unlinkSync(claimPath);
          return claimNextJob(owner, leaseMs);
        }
      } catch { /* another worker reclaimed it */ }
    }
    return null;
  }
  try {
    const current = readJob(candidate.job_id);
    if (!current || (current.status !== "queued" && !(current.lease && Date.parse(current.lease.expires_at) <= now))) return null;
    const timestamp = new Date(now).toISOString();
    const claimed: AnalysisJob = {
      ...current, status: "running", started_at: current.started_at ?? timestamp,
      finished_at: null, attempt_number: current.attempt_number + 1, error: null,
      lease: { owner, heartbeat_at: timestamp, expires_at: new Date(now + leaseMs).toISOString() },
    };
    writeJob(claimed);
    return claimed;
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(claimPath);
  }
}

export function heartbeatJob(jobId: string, owner: string, leaseMs = 30_000): AnalysisJob {
  const job = readJob(jobId);
  if (!job || job.lease?.owner !== owner) throw new Error(`Lease lost for job ${jobId}`);
  const now = Date.now();
  const next = { ...job, lease: { owner, heartbeat_at: new Date(now).toISOString(), expires_at: new Date(now + leaseMs).toISOString() } };
  writeJob(next);
  return next;
}

export function manifestPath(fingerprint: string): string {
  return path.join(mediaAnalysisContentDir(fingerprint), "manifest.json");
}

export function readManifest(fingerprint: string): AnalysisManifest | null {
  const value = readJsonFile<AnalysisManifest | null>(manifestPath(fingerprint), null);
  if (!value) return null;
  return {
    ...value,
    schema_version: 2,
    stage_records: value.stage_records ?? {},
    stage_history: value.stage_history ?? [],
  };
}

export function writeManifest(manifest: AnalysisManifest): void {
  writeJsonFileAtomic(manifestPath(manifest.fingerprint_sha256), { ...manifest, schema_version: 2 }, validateManifest);
}

export function readAnnotations(projectId: string): AnalysisAnnotationsFile {
  assertExistingProject(projectId);
  return readJsonFile(projectAnalysisAnnotationsPath(projectId), EMPTY_ANNOTATIONS);
}

export function writeAnnotations(projectId: string, value: AnalysisAnnotationsFile): void {
  writeJsonFileAtomic(projectAnalysisAnnotationsPath(projectId), value, validateAnnotations);
}
