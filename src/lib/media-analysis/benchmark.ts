import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeJsonFileAtomic } from "../local-store/atomic-json";
import {
  claimNextJob,
  enqueueAssets,
  readManifest,
  reconcileAssetBindings,
} from "../local-store/media-analysis";
import { mediaAnalysisContentDir, projectMediaDir, projectsRoot } from "../local-store/paths";
import { calculateTimingRollup } from "./timing";
import { defaultFfmpegConcurrency, processAnalysisJob, sha256File, warmMediaToolIdentities, workerOwner } from "./worker";
import type { TimingRollup } from "./schema";

export type CapacityBenchmarkRow = {
  label: "serial" | "default" | "higher";
  ffmpeg_capacity: number;
  configured_capacities: { ffmpeg: number };
  cold_cache: true;
  wall_ms: number;
  timing: TimingRollup;
  artifact_hashes: Record<string, string>;
  derived_bytes: number;
  attempt_trace: Array<{
    stage: string;
    resource: string;
    dependency_stages: string[];
    queued_at: string;
    started_at: string;
    finished_at: string;
    queue_wait_ms: number;
    active_wall_ms: number;
    cache_disposition: string;
  }>;
};

export type CapacityBenchmarkReport = {
  schema_version: 1;
  project_id: string;
  asset_id: string;
  relative_path: string;
  source_sha256: string;
  generated_at: string;
  rows: CapacityBenchmarkRow[];
  deterministic_artifacts: boolean;
  artifact_mismatches: string[];
  selected_default_ffmpeg_capacity: number;
  recommended_ffmpeg_capacity_for_fixture: number;
  recommendation_reason: string;
  report_path: string;
};

async function artifactHashes(contentDir: string): Promise<Record<string, string>> {
  const root = path.join(contentDir, "derivatives");
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(item);
      else if (entry.isFile()) files.push(item);
    }
  };
  if (fs.existsSync(root)) visit(root);
  const rows = await Promise.all(files.sort().map(async (file) => [path.relative(root, file), await sha256File(file)] as const));
  return Object.fromEntries(rows);
}

function compareHashes(rows: CapacityBenchmarkRow[]): string[] {
  const names = new Set(rows.flatMap((row) => Object.keys(row.artifact_hashes)));
  return [...names].filter((name) => new Set(rows.map((row) => row.artifact_hashes[name] ?? "missing")).size > 1).sort();
}

export async function runCapacityBenchmark(projectId: string, assetId?: string): Promise<CapacityBenchmarkReport> {
  const originalRoot = projectsRoot();
  const originalEnv = process.env.TIMELINE_PROJECTS_DIR;
  const bindings = reconcileAssetBindings(projectId);
  const asset = assetId ? bindings.assets.find((candidate) => candidate.asset_id === assetId) : bindings.assets[0];
  if (!asset) throw new Error(assetId ? `Asset not found: ${assetId}` : `Project ${projectId} has no media to benchmark`);
  const sourcePath = path.join(projectMediaDir(projectId), asset.relative_path);
  const sourceSha = await sha256File(sourcePath);
  const defaultCapacity = defaultFfmpegConcurrency();
  const settings: Array<{ label: CapacityBenchmarkRow["label"]; capacity: number }> = [
    { label: "serial", capacity: 1 },
    { label: "default", capacity: defaultCapacity },
    { label: "higher", capacity: Math.max(4, defaultCapacity + 1) },
  ];
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "media-analysis-benchmark-"));
  const rows: CapacityBenchmarkRow[] = [];
  try {
    await warmMediaToolIdentities();
    for (const setting of settings) {
      const root = path.join(temporaryRoot, setting.label);
      const fixtureProject = "fixture";
      const copiedSource = path.join(root, fixtureProject, "media", asset.relative_path);
      fs.mkdirSync(path.dirname(copiedSource), { recursive: true });
      fs.copyFileSync(sourcePath, copiedSource);
      process.env.TIMELINE_PROJECTS_DIR = root;
      const fixtureAsset = reconcileAssetBindings(fixtureProject).assets[0];
      enqueueAssets(fixtureProject, [fixtureAsset.asset_id]);
      const owner = `${workerOwner()}:benchmark:${setting.label}`;
      const claimed = claimNextJob(owner);
      if (!claimed) throw new Error(`Could not claim ${setting.label} benchmark job`);
      const started = process.hrtime.bigint();
      const completed = await processAnalysisJob(claimed, owner, { ffmpegConcurrency: setting.capacity });
      const wallMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      if (completed.status !== "completed" || !completed.fingerprint_sha256) {
        throw new Error(`${setting.label} benchmark failed: ${completed.error ?? completed.status}`);
      }
      const manifest = readManifest(completed.fingerprint_sha256);
      if (!manifest) throw new Error(`${setting.label} benchmark did not publish a manifest`);
      const attempts = manifest.attempts.filter((attempt) => attempt.job_id === completed.job_id && attempt.job_attempt_number === completed.attempt_number);
      rows.push({
        label: setting.label,
        ffmpeg_capacity: setting.capacity,
        configured_capacities: { ffmpeg: setting.capacity },
        cold_cache: true,
        wall_ms: wallMs,
        timing: calculateTimingRollup(attempts),
        artifact_hashes: await artifactHashes(mediaAnalysisContentDir(completed.fingerprint_sha256)),
        derived_bytes: Object.values(manifest.stage_records).reduce((sum, record) => sum + record.output_bytes, 0),
        attempt_trace: attempts.map((attempt) => ({
          stage: attempt.stage,
          resource: attempt.resource,
          dependency_stages: attempt.dependency_stages,
          queued_at: attempt.queued_at,
          started_at: attempt.started_at,
          finished_at: attempt.finished_at,
          queue_wait_ms: attempt.queue_wait_ms,
          active_wall_ms: attempt.active_wall_ms,
          cache_disposition: attempt.cache_disposition,
        })),
      });
    }
  } finally {
    if (originalEnv === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = originalEnv;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  const serialWall = rows.find((row) => row.label === "serial")!.wall_ms;
  for (const row of rows) {
    const effectiveParallelism = row.timing.effective_parallelism ?? 1;
    row.timing = {
      ...row.timing,
      serial_baseline_wall_ms: serialWall,
      parallel_speedup: serialWall / row.wall_ms,
      parallel_efficiency: (serialWall / row.wall_ms) / effectiveParallelism,
    };
  }
  const mismatches = compareHashes(rows);
  const serialRow = rows.find((row) => row.label === "serial")!;
  const serialPeakRss = serialRow.timing.peak_rss_bytes ?? 0;
  const memoryLimit = serialPeakRss > 0 ? serialPeakRss * 1.25 : Number.POSITIVE_INFINITY;
  const eligible = mismatches.length === 0
    ? rows.filter((row) => (row.timing.peak_rss_bytes ?? 0) <= memoryLimit)
    : [serialRow];
  const recommended = [...eligible].sort((a, b) => a.wall_ms - b.wall_ms)[0] ?? serialRow;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(originalRoot, ".cache", "media-analysis", "benchmarks", `${stamp}-${projectId}-${asset.asset_id}.json`);
  const report: CapacityBenchmarkReport = {
    schema_version: 1,
    project_id: projectId,
    asset_id: asset.asset_id,
    relative_path: asset.relative_path,
    source_sha256: sourceSha,
    generated_at: new Date().toISOString(),
    rows,
    deterministic_artifacts: mismatches.length === 0,
    artifact_mismatches: mismatches,
    selected_default_ffmpeg_capacity: defaultCapacity,
    recommended_ffmpeg_capacity_for_fixture: recommended.wall_ms < serialRow.wall_ms ? recommended.ffmpeg_capacity : 1,
    recommendation_reason: mismatches.length > 0
      ? "Serial retained because derivative hashes differed across capacities."
      : recommended.wall_ms < serialRow.wall_ms
        ? `Fixture recommendation: capacity ${recommended.ffmpeg_capacity} had the shortest wall time without exceeding 125% of serial peak RSS.`
        : "Serial retained because bounded concurrency did not improve wall time within the memory guard.",
    report_path: reportPath,
  };
  writeJsonFileAtomic(reportPath, report, (value) => {
    if (!value || typeof value !== "object" || (value as { schema_version?: unknown }).schema_version !== 1) throw new Error("Invalid benchmark report");
  });
  return report;
}
