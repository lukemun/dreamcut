import { createHash } from "node:crypto";

import type { AnalysisManifest, CacheDisposition, StageCacheIdentity, StageRecord, StageToolIdentity } from "./schema";

export const MEDIA_ANALYSIS_STAGE_SCHEMA_VERSION = 2;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createStageCacheIdentity(input: {
  stage: string;
  fingerprint: string;
  tool: StageToolIdentity;
  parameters?: Record<string, unknown>;
  dependencyCacheKeys?: Record<string, string>;
  schemaVersion?: number;
}): StageCacheIdentity {
  const schemaVersion = input.schemaVersion ?? MEDIA_ANALYSIS_STAGE_SCHEMA_VERSION;
  const parameters = canonicalize(input.parameters ?? {}) as Record<string, unknown>;
  const dependencyCacheKeys = canonicalize(input.dependencyCacheKeys ?? {}) as Record<string, string>;
  const payload = {
    stage: input.stage,
    fingerprint_sha256: input.fingerprint,
    schema_version: schemaVersion,
    tool: input.tool,
    parameters,
    dependency_cache_keys: dependencyCacheKeys,
  };
  return {
    stage: input.stage,
    cache_key: createHash("sha256").update(stableJson(payload)).digest("hex"),
    schema_version: schemaVersion,
    tool: input.tool,
    parameters,
    dependency_cache_keys: dependencyCacheKeys,
  };
}

export function stageArtifactRelativePath(identity: StageCacheIdentity, filename: string): string {
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return `derivatives/${identity.stage}/${identity.cache_key}/${safeFilename}`;
}

function transitiveDependants(manifest: AnalysisManifest, stage: string): Set<string> {
  const result = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [candidate, record] of Object.entries(manifest.stage_records)) {
      if (candidate === stage || result.has(candidate)) continue;
      const dependencies = Object.keys(record.dependency_cache_keys);
      if (dependencies.includes(stage) || dependencies.some((dependency) => result.has(dependency))) {
        result.add(candidate);
        changed = true;
      }
    }
  }
  return result;
}

export function invalidateStageAndDependants(manifest: AnalysisManifest, stage: string, reason: string): string[] {
  const stages = [stage, ...transitiveDependants(manifest, stage)];
  const now = new Date().toISOString();
  for (const name of stages) {
    const current = manifest.stage_records[name];
    if (!current) continue;
    const stale: StageRecord = { ...current, status: "stale", stale_reason: reason, updated_at: now };
    manifest.stage_records[name] = stale;
    manifest.stages[name] = "stale";
    manifest.stage_history.push(stale);
  }
  return stages;
}

export function prepareStageRecord(manifest: AnalysisManifest, identity: StageCacheIdentity): {
  record: StageRecord;
  cacheCompatible: boolean;
  invalidated: string[];
} {
  const existing = manifest.stage_records[identity.stage];
  if (existing?.cache_key === identity.cache_key) {
    return { record: existing, cacheCompatible: existing.status === "completed", invalidated: [] };
  }
  const invalidated = existing
    ? invalidateStageAndDependants(manifest, identity.stage, `cache_key_changed:${existing.cache_key}->${identity.cache_key}`)
    : [];
  const record: StageRecord = {
    ...identity,
    status: "pending",
    artifact_path: null,
    artifact_sha256: null,
    output_bytes: 0,
    updated_at: new Date().toISOString(),
    stale_reason: null,
  };
  manifest.stage_records[identity.stage] = record;
  manifest.stages[identity.stage] = "pending";
  return { record, cacheCompatible: false, invalidated };
}

export function cacheDispositionForPrepared(record: StageRecord, cacheCompatible: boolean): CacheDisposition {
  if (cacheCompatible) return "hit";
  return record.status === "running" || record.status === "partial" ? "resumed" : "miss";
}
