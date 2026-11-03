import fs from "node:fs";
import path from "node:path";

import { listJobs, readAssetBindings, readManifest, writeManifest } from "../local-store/media-analysis";
import { listProjectIds, mediaAnalysisContentDir, mediaAnalysisRoot } from "../local-store/paths";
import type { AnalysisJob, AnalysisManifest, AssetBinding, StageRecord } from "./schema";
import { invalidateStageAndDependants } from "./stage-cache";

export const DEFAULT_MEDIA_ANALYSIS_CACHE_BUDGET_BYTES = 20 * 1024 * 1024 * 1024;
export const MEDIA_ANALYSIS_CACHE_BUDGET_ENV = "MEDIA_ANALYSIS_CACHE_MAX_BYTES";

export type CacheReference = {
  project_id: string;
  asset_id: string;
  relative_path: string;
};

export type CacheArtifactUsage = {
  fingerprint_sha256: string;
  stage: string;
  relative_path: string;
  bytes: number;
  last_accessed_at: string;
  status: StageRecord["status"];
  manifest_linked: boolean;
  protected_by_active_lease: boolean;
  protected_by_running_job: boolean;
};

export type MediaAnalysisCacheUsage = {
  budget_bytes: number;
  tracked_derivative_bytes: number;
  evictable_derivative_bytes: number;
  protected_derivative_bytes: number;
  references: Record<string, CacheReference[]>;
  artifacts: CacheArtifactUsage[];
};

export type CacheEvictionResult = MediaAnalysisCacheUsage & {
  bytes_before: number;
  bytes_evicted: number;
  bytes_after: number;
  evicted: Array<{ fingerprint_sha256: string; stage: string; relative_path: string; bytes: number }>;
  budget_satisfied: boolean;
  skipped_reason: "lock_held" | null;
};

export type AssetAnalysisState = "not_started" | "queued" | "running" | "partial" | "stale" | "completed" | "failed" | "cancelled";

function parseBudget(value: string | undefined): number {
  if (value == null || value.trim() === "") return DEFAULT_MEDIA_ANALYSIS_CACHE_BUDGET_BYTES;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_MEDIA_ANALYSIS_CACHE_BUDGET_BYTES;
}

export function mediaAnalysisCacheBudgetBytes(): number {
  return parseBudget(process.env[MEDIA_ANALYSIS_CACHE_BUDGET_ENV]);
}

function contentFingerprints(): string[] {
  try {
    return fs.readdirSync(mediaAnalysisRoot(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function activeLeaseExists(fingerprint: string, now: number): boolean {
  const leaseDir = path.join(mediaAnalysisContentDir(fingerprint), "leases");
  let names: string[];
  try { names = fs.readdirSync(leaseDir).filter((name) => name.endsWith(".lock")); } catch { return false; }
  return names.some((name) => {
    const leasePath = path.join(leaseDir, name);
    try {
      const lease = JSON.parse(fs.readFileSync(leasePath, "utf8")) as { expires_at?: string };
      return !lease.expires_at || !Number.isFinite(Date.parse(lease.expires_at)) || Date.parse(lease.expires_at) > now;
    } catch {
      try { return now - fs.statSync(leasePath).mtimeMs < 30_000; } catch { return false; }
    }
  });
}

function referenceIndex(): Record<string, CacheReference[]> {
  const references: Record<string, CacheReference[]> = {};
  for (const projectId of listProjectIds()) {
    for (const asset of readAssetBindings(projectId).assets) {
      if (!asset.fingerprint_sha256) continue;
      (references[asset.fingerprint_sha256] ??= []).push({
        project_id: projectId,
        asset_id: asset.asset_id,
        relative_path: asset.relative_path,
      });
    }
  }
  for (const entries of Object.values(references)) entries.sort((a, b) => a.project_id.localeCompare(b.project_id) || a.asset_id.localeCompare(b.asset_id));
  return references;
}

function safeArtifactPath(fingerprint: string, relativePath: string): string | null {
  const contentDir = mediaAnalysisContentDir(fingerprint);
  const derivativesDir = path.join(contentDir, "derivatives");
  const candidate = path.resolve(contentDir, relativePath);
  return candidate.startsWith(`${derivativesDir}${path.sep}`) ? candidate : null;
}

function derivativeFiles(directory: string): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return []; }
  return entries.sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return derivativeFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

export function inspectMediaAnalysisCache(options: { runningJobs?: AnalysisJob[]; now?: number } = {}): MediaAnalysisCacheUsage {
  const now = options.now ?? Date.now();
  const runningFingerprints = new Set((options.runningJobs ?? listJobs()).filter((job) => job.status === "running" && job.fingerprint_sha256).map((job) => job.fingerprint_sha256!));
  const references = referenceIndex();
  const artifacts: CacheArtifactUsage[] = [];
  for (const fingerprint of contentFingerprints()) {
    const manifest = readManifest(fingerprint);
    const leaseProtected = activeLeaseExists(fingerprint, now);
    const runningProtected = runningFingerprints.has(fingerprint) || Object.values(manifest?.stage_records ?? {}).some((record) => record.status === "running");
    const seen = new Set<string>();
    for (const [stage, record] of Object.entries(manifest?.stage_records ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (!record.artifact_path || seen.has(record.artifact_path)) continue;
      const artifactPath = safeArtifactPath(fingerprint, record.artifact_path);
      if (!artifactPath) continue;
      let bytes: number;
      try { bytes = fs.statSync(artifactPath).size; } catch { continue; }
      seen.add(record.artifact_path);
      artifacts.push({
        fingerprint_sha256: fingerprint,
        stage,
        relative_path: record.artifact_path,
        bytes,
        last_accessed_at: record.updated_at,
        status: record.status,
        manifest_linked: true,
        protected_by_active_lease: leaseProtected,
        protected_by_running_job: runningProtected,
      });
    }
    const contentDir = mediaAnalysisContentDir(fingerprint);
    for (const artifactPath of derivativeFiles(path.join(contentDir, "derivatives"))) {
      const relativePath = path.relative(contentDir, artifactPath);
      if (seen.has(relativePath)) continue;
      const stat = fs.statSync(artifactPath);
      const [, stage = "unknown"] = relativePath.split(path.sep);
      artifacts.push({
        fingerprint_sha256: fingerprint,
        stage,
        relative_path: relativePath,
        bytes: stat.size,
        last_accessed_at: stat.mtime.toISOString(),
        status: "stale",
        manifest_linked: false,
        protected_by_active_lease: leaseProtected,
        protected_by_running_job: runningProtected,
      });
    }
  }
  artifacts.sort((a, b) => a.last_accessed_at.localeCompare(b.last_accessed_at)
    || a.fingerprint_sha256.localeCompare(b.fingerprint_sha256) || a.stage.localeCompare(b.stage));
  const tracked = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  const protectedBytes = artifacts.filter((artifact) => artifact.protected_by_active_lease || artifact.protected_by_running_job)
    .reduce((sum, artifact) => sum + artifact.bytes, 0);
  return {
    budget_bytes: mediaAnalysisCacheBudgetBytes(),
    tracked_derivative_bytes: tracked,
    evictable_derivative_bytes: tracked - protectedBytes,
    protected_derivative_bytes: protectedBytes,
    references,
    artifacts,
  };
}

function markArtifactEvicted(manifest: AnalysisManifest, stage: string, now: string): void {
  invalidateStageAndDependants(manifest, stage, "cache_budget_evicted");
  const record = manifest.stage_records[stage];
  manifest.stage_records[stage] = {
    ...record,
    status: "stale",
    artifact_path: null,
    artifact_sha256: null,
    output_bytes: 0,
    updated_at: now,
    stale_reason: "cache_budget_evicted",
  };
  manifest.stages[stage] = "stale";
  delete manifest.derivatives[stage];
  manifest.updated_at = now;
}

function acquireBudgetLock(now: number): (() => void) | null {
  fs.mkdirSync(mediaAnalysisRoot(), { recursive: true });
  const lockPath = path.join(mediaAnalysisRoot(), "cache-budget.lock");
  try {
    const fd = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, acquired_at: new Date(now).toISOString() })}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    return () => { try { fs.unlinkSync(lockPath); } catch { /* already released */ } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      if (now - fs.statSync(lockPath).mtimeMs > 5 * 60_000) {
        fs.unlinkSync(lockPath);
        return acquireBudgetLock(now);
      }
    } catch { /* another worker owns or released it */ }
    return null;
  }
}

export function enforceMediaAnalysisCacheBudget(options: { runningJobs?: AnalysisJob[]; now?: number } = {}): CacheEvictionResult {
  const now = options.now ?? Date.now();
  const release = acquireBudgetLock(now);
  const initial = inspectMediaAnalysisCache(options);
  if (!release) return {
    ...initial, bytes_before: initial.tracked_derivative_bytes, bytes_evicted: 0,
    bytes_after: initial.tracked_derivative_bytes, evicted: [],
    budget_satisfied: initial.tracked_derivative_bytes <= initial.budget_bytes, skipped_reason: "lock_held",
  };
  const evicted: CacheEvictionResult["evicted"] = [];
  let remaining = initial.tracked_derivative_bytes;
  try {
    for (const artifact of initial.artifacts) {
      if (remaining <= initial.budget_bytes) break;
      if (artifact.protected_by_active_lease || artifact.protected_by_running_job) continue;
      const artifactPath = safeArtifactPath(artifact.fingerprint_sha256, artifact.relative_path);
      const manifest = readManifest(artifact.fingerprint_sha256);
      if (!artifactPath) continue;
      if (artifact.manifest_linked && (!manifest || manifest.stage_records[artifact.stage]?.artifact_path !== artifact.relative_path)) continue;
      try { fs.unlinkSync(artifactPath); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") continue;
      }
      const timestamp = new Date(now).toISOString();
      if (artifact.manifest_linked && manifest) {
        markArtifactEvicted(manifest, artifact.stage, timestamp);
        writeManifest(manifest);
      }
      remaining -= artifact.bytes;
      evicted.push({ fingerprint_sha256: artifact.fingerprint_sha256, stage: artifact.stage, relative_path: artifact.relative_path, bytes: artifact.bytes });
    }
  } finally {
    release();
  }
  const final = inspectMediaAnalysisCache(options);
  return {
    ...final,
    bytes_before: initial.tracked_derivative_bytes,
    bytes_evicted: evicted.reduce((sum, artifact) => sum + artifact.bytes, 0),
    bytes_after: final.tracked_derivative_bytes,
    evicted,
    budget_satisfied: final.tracked_derivative_bytes <= final.budget_bytes,
    skipped_reason: null,
  };
}

export function assetAnalysisState(asset: AssetBinding, job: AnalysisJob | null, manifest: AnalysisManifest | null): AssetAnalysisState {
  if (job?.status === "queued") return "queued";
  if (job?.status === "running") return "running";
  if (job?.status === "failed") return "failed";
  if (job?.status === "cancelled") return "cancelled";
  if (!asset.fingerprint_sha256 || !manifest) return "not_started";
  const records = Object.values(manifest.stage_records);
  if (records.some((record) => record.status === "stale")) return "stale";
  if (records.some((record) => record.status === "failed" || record.status === "cancelled" || record.status === "partial" || record.status === "pending" || record.status === "running")) return "partial";
  return records.length > 0 && records.every((record) => record.status === "completed" || record.status === "unavailable") ? "completed" : "partial";
}
