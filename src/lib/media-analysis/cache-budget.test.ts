import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeAssetBindings, writeManifest } from "../local-store/media-analysis";
import { mediaAnalysisContentDir } from "../local-store/paths";
import type { AnalysisJob, AnalysisManifest, StageRecord, TimingRollup } from "./schema";
import { assetAnalysisState, enforceMediaAnalysisCacheBudget, inspectMediaAnalysisCache, MEDIA_ANALYSIS_CACHE_BUDGET_ENV } from "./cache-budget";

const EMPTY_TIMING: TimingRollup = {
  elapsed_wall_ms: 0, summed_stage_wall_ms: 0, total_queue_wait_ms: 0,
  critical_path_ms: 0, critical_path_stages: [], observed_parallelism: 0, effective_parallelism: null,
  max_concurrency: 0, average_concurrency: 0, cache_hits: 0, cache_misses: 0,
  cache_resumes: 0, cache_skips: 0, cache_time_avoided_ms: 0, active_union_ms: 0,
  worker_busy_ms: 0, worker_idle_ms: 0, dependency_wait_ms: 0,
  io_throughput_bytes_per_second: null, derived_bytes: 0, peak_rss_bytes: null,
  serial_baseline_wall_ms: null, parallel_speedup: null, parallel_efficiency: null,
  time_by_stage_ms: {}, by_resource: {},
};

function stage(stageName: string, artifactPath: string, updatedAt: string, dependencies: Record<string, string> = {}): StageRecord {
  return {
    stage: stageName, cache_key: `${stageName}-key`, schema_version: 1,
    tool: { name: "fixture", version: "1" }, parameters: {}, dependency_cache_keys: dependencies,
    status: "completed", artifact_path: artifactPath, artifact_sha256: "hash", output_bytes: 0,
    updated_at: updatedAt, stale_reason: null,
  };
}

function manifest(fingerprint: string, records: Record<string, StageRecord>): AnalysisManifest {
  return {
    schema_version: 2, fingerprint_sha256: fingerprint, source_size_bytes: 123,
    probe: null,
    derivatives: Object.fromEntries(Object.entries(records).map(([name, record]) => [name, record.artifact_path!])),
    stages: Object.fromEntries(Object.keys(records).map((name) => [name, "completed" as const])),
    stage_records: records, stage_history: [], attempts: [], timing: EMPTY_TIMING,
    detector: { status: "unavailable", reason: null }, updated_at: new Date(0).toISOString(),
  };
}

function job(fingerprint: string, status: AnalysisJob["status"]): AnalysisJob {
  return {
    schema_version: 1, job_id: "job-1", project_id: "one", asset_id: "asset-one", relative_path: "source.mp4",
    source_size_bytes: 123, source_mtime_ms: 1, status, requested_at: new Date(0).toISOString(), started_at: null,
    finished_at: null, cancellation_requested_at: null, lease: null, attempt_number: 1,
    fingerprint_sha256: fingerprint, timing: null, error: null,
  };
}

function addArtifact(fingerprint: string, relativePath: string, bytes: number): void {
  const target = path.join(mediaAnalysisContentDir(fingerprint), relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.alloc(bytes, 1));
}

function addProject(root: string, projectId: string, fingerprint: string, assetId: string): void {
  const mediaDir = path.join(root, projectId, "media");
  const annotationsDir = path.join(root, projectId, "instruments", "media-index");
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(annotationsDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, "source.mp4"), "original");
  fs.writeFileSync(path.join(annotationsDir, "annotations.json"), JSON.stringify({ schema_version: 1, annotations: [{ annotation_id: "keep" }] }));
  writeAssetBindings(projectId, { schema_version: 1, assets: [{
    asset_id: assetId, project_id: projectId, relative_path: "source.mp4", kind: "video",
    size_bytes: 8, mtime_ms: 1, fingerprint_sha256: fingerprint, current_job_id: null, updated_at: new Date(0).toISOString(),
  }] });
}

function fixture(run: (root: string) => void): void {
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  const previousBudget = process.env[MEDIA_ANALYSIS_CACHE_BUDGET_ENV];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cache-budget-"));
  process.env.TIMELINE_PROJECTS_DIR = root;
  try { run(root); } finally {
    if (previousRoot == null) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    if (previousBudget == null) delete process.env[MEDIA_ANALYSIS_CACHE_BUDGET_ENV]; else process.env[MEDIA_ANALYSIS_CACHE_BUDGET_ENV] = previousBudget;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("inspection reports all project references to shared content once", () => fixture((root) => {
  const fingerprint = "a".repeat(64);
  addProject(root, "one", fingerprint, "asset-one");
  addProject(root, "two", fingerprint, "asset-two");
  const record = stage("proxy", "derivatives/proxy/key/proxy.mp4", "2026-01-01T00:00:00.000Z");
  addArtifact(fingerprint, record.artifact_path!, 12);
  writeManifest(manifest(fingerprint, { proxy: record }));
  const usage = inspectMediaAnalysisCache({ runningJobs: [] });
  assert.equal(usage.tracked_derivative_bytes, 12);
  assert.deepEqual(usage.references[fingerprint].map((entry) => entry.project_id), ["one", "two"]);
  assert.equal(usage.artifacts.length, 1);
}));

test("versioned derivatives no longer linked by a manifest still count toward the budget", () => fixture(() => {
  const fingerprint = "9".repeat(64);
  const current = stage("proxy", "derivatives/proxy/current/proxy.mp4", "2026-01-02T00:00:00.000Z");
  addArtifact(fingerprint, current.artifact_path!, 10);
  addArtifact(fingerprint, "derivatives/proxy/old/proxy.mp4", 7);
  fs.utimesSync(path.join(mediaAnalysisContentDir(fingerprint), "derivatives/proxy/old/proxy.mp4"), new Date("2025-01-01T00:00:00.000Z"), new Date("2025-01-01T00:00:00.000Z"));
  writeManifest(manifest(fingerprint, { proxy: current }));
  process.env[MEDIA_ANALYSIS_CACHE_BUDGET_ENV] = "10";
  const result = enforceMediaAnalysisCacheBudget({ runningJobs: [] });
  assert.equal(result.bytes_before, 17);
  assert.equal(result.bytes_after, 10);
  assert.equal(result.evicted[0].relative_path, "derivatives/proxy/old/proxy.mp4");
  assert.equal(result.artifacts[0].manifest_linked, true);
}));

test("running jobs and active stage leases protect derivatives", () => fixture(() => {
  const runningFingerprint = "b".repeat(64);
  const leasedFingerprint = "c".repeat(64);
  const runningStageFingerprint = "f".repeat(64);
  for (const [fingerprint, stageName] of [[runningFingerprint, "proxy"], [leasedFingerprint, "thumbnail"]] as const) {
    const record = stage(stageName, `derivatives/${stageName}/key/file.bin`, "2026-01-01T00:00:00.000Z");
    addArtifact(fingerprint, record.artifact_path!, 10);
    writeManifest(manifest(fingerprint, { [stageName]: record }));
  }
  const leaseDir = path.join(mediaAnalysisContentDir(leasedFingerprint), "leases");
  fs.mkdirSync(leaseDir, { recursive: true });
  fs.writeFileSync(path.join(leaseDir, "pipeline.lock"), JSON.stringify({ expires_at: new Date(Date.now() + 60_000).toISOString() }));
  const runningStage = { ...stage("shots", "derivatives/shots/key/shots.json", "2026-01-01T00:00:00.000Z"), status: "running" as const };
  addArtifact(runningStageFingerprint, runningStage.artifact_path!, 10);
  writeManifest(manifest(runningStageFingerprint, { shots: runningStage }));
  process.env[MEDIA_ANALYSIS_CACHE_BUDGET_ENV] = "0";
  const result = enforceMediaAnalysisCacheBudget({ runningJobs: [job(runningFingerprint, "running")] });
  assert.equal(result.bytes_evicted, 0);
  assert.equal(result.protected_derivative_bytes, 30);
  assert.equal(result.budget_satisfied, false);
}));

test("eviction preserves originals and annotations and atomically exposes stale stage state", () => fixture((root) => {
  const fingerprint = "d".repeat(64);
  addProject(root, "one", fingerprint, "asset-one");
  const proxy = stage("proxy", "derivatives/proxy/key/proxy.mp4", "2026-01-01T00:00:00.000Z");
  const dependant = stage("preview", "derivatives/preview/key/preview.mp4", "2026-01-02T00:00:00.000Z", { proxy: proxy.cache_key });
  addArtifact(fingerprint, proxy.artifact_path!, 10);
  addArtifact(fingerprint, dependant.artifact_path!, 10);
  writeManifest(manifest(fingerprint, { proxy, preview: dependant }));
  process.env[MEDIA_ANALYSIS_CACHE_BUDGET_ENV] = "10";
  const result = enforceMediaAnalysisCacheBudget({ runningJobs: [], now: Date.parse("2026-02-01T00:00:00.000Z") });
  assert.deepEqual(result.evicted.map((entry) => entry.stage), ["proxy"]);
  assert.equal(fs.existsSync(path.join(root, "one", "media", "source.mp4")), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "one", "instruments", "media-index", "annotations.json"), "utf8")).annotations[0].annotation_id, "keep");
  const updated = JSON.parse(fs.readFileSync(path.join(mediaAnalysisContentDir(fingerprint), "manifest.json"), "utf8")) as AnalysisManifest;
  assert.equal(updated.stage_records.proxy.status, "stale");
  assert.equal(updated.stage_records.proxy.artifact_path, null);
  assert.equal(updated.stage_records.proxy.stale_reason, "cache_budget_evicted");
  assert.equal(updated.stage_records.preview.status, "stale");
  assert.equal(updated.derivatives.proxy, undefined);
  const asset = { asset_id: "asset-one", project_id: "one", relative_path: "source.mp4", kind: "video" as const, size_bytes: 8, mtime_ms: 1, fingerprint_sha256: fingerprint, current_job_id: null, updated_at: "" };
  assert.equal(assetAnalysisState(asset, null, updated), "stale");
}));

test("binding state distinguishes not started and partial manifests", () => fixture(() => {
  const asset = { asset_id: "asset", project_id: "one", relative_path: "source.mp4", kind: "video" as const, size_bytes: 8, mtime_ms: 1, fingerprint_sha256: null, current_job_id: null, updated_at: "" };
  assert.equal(assetAnalysisState(asset, null, null), "not_started");
  const fingerprint = "e".repeat(64);
  const partialAsset = { ...asset, fingerprint_sha256: fingerprint };
  const value = manifest(fingerprint, { proxy: { ...stage("proxy", "derivatives/proxy/key/proxy.mp4", "2026-01-01T00:00:00.000Z"), status: "partial" } });
  assert.equal(assetAnalysisState(partialAsset, null, value), "partial");
}));
