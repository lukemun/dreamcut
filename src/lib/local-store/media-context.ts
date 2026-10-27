import fs from "node:fs";
import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { mediaAnalysisContentDir, mediaContextIndexPath } from "./paths";
import { readManifest } from "./media-analysis";
import type {
  MediaContextDatasetHistory,
  MediaContextDatasetRevision,
  MediaContextIndex,
  SourceMediaContext,
} from "../media-analysis/schema";
import { stableJson } from "../media-analysis/stage-cache";

const FINGERPRINT_RE = /^[a-f0-9]{64}$/;
const CONTEXT_ID_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

export function sourceMediaContextId(fingerprint: string): string {
  if (!FINGERPRINT_RE.test(fingerprint)) throw new Error(`Invalid source fingerprint: ${fingerprint}`);
  return `sha256:${fingerprint}`;
}

function emptyIndex(fingerprint: string): MediaContextIndex {
  return {
    schema_version: 1,
    context_id: sourceMediaContextId(fingerprint),
    source_fingerprint_sha256: fingerprint,
    datasets: {},
    updated_at: new Date(0).toISOString(),
  };
}

function assertRange(range: [number, number], label: string): void {
  if (!Array.isArray(range) || range.length !== 2
    || !range.every((value) => typeof value === "number" && Number.isFinite(value))
    || range[0] < 0 || range[1] < range[0]) {
    throw new Error(`Invalid ${label} range`);
  }
}

function validateDatasetRevision(value: MediaContextDatasetRevision, fingerprint: string): void {
  if (!CONTEXT_ID_RE.test(value.dataset_id)) throw new Error(`Invalid media-context dataset id: ${value.dataset_id}`);
  if (!CONTEXT_ID_RE.test(value.revision_id)) throw new Error(`Invalid media-context revision id: ${value.revision_id}`);
  if (!value.kind.trim()) throw new Error("Media-context dataset kind is required");
  if (value.evidence_level !== "L1" && value.evidence_level !== "L2") {
    throw new Error("Shared source context accepts only L1 extraction or L2 per-source derivation");
  }
  if (value.coverage.timebase !== "source_seconds") throw new Error("Media-context coverage must use source_seconds");
  if (value.coverage.observation_kind === 'discrete_frames') {
    const times = value.coverage.observed_times_seconds;
    if (!Array.isArray(times) || times.some((t, i) => !Number.isFinite(t) || t < 0 || (i > 0 && t <= times[i - 1]!))) throw new Error('Invalid examined-frame times');
    if (value.coverage.status === 'complete') throw new Error('Discrete observations cannot certify continuous coverage');
    if (value.coverage.ranges.length !== times.length || times.some((t, i) => value.coverage.ranges[i]?.[0] !== t || value.coverage.ranges[i]?.[1] !== t)) throw new Error('Examined-frame ranges must match observation times');
  }
  for (const range of value.coverage.ranges) assertRange(range, "coverage");
  for (const range of value.coverage.gaps) assertRange(range, "coverage gap");
  if (!value.producer.name.trim() || !value.producer.version.trim() || !value.producer.recipe_version.trim()) {
    throw new Error("Media-context producer identity is incomplete");
  }
  if (value.artifact) {
    if (path.isAbsolute(value.artifact.relative_path) || value.artifact.relative_path.split(/[\\/]/).includes("..")) {
      throw new Error("Media-context artifact path must remain inside its source context");
    }
    if (!SHA256_RE.test(value.artifact.sha256)) throw new Error("Invalid media-context artifact checksum");
    const root = path.resolve(mediaAnalysisContentDir(fingerprint));
    const resolved = path.resolve(root, value.artifact.relative_path);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Media-context artifact escapes its source context");
  }
}

function validateIndex(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid media-context index");
  const index = value as MediaContextIndex;
  if (index.schema_version !== 1 || !FINGERPRINT_RE.test(index.source_fingerprint_sha256)
    || index.context_id !== sourceMediaContextId(index.source_fingerprint_sha256)
    || !index.datasets || typeof index.datasets !== "object" || Array.isArray(index.datasets)) {
    throw new Error("Invalid media-context index");
  }
  for (const [datasetId, history] of Object.entries(index.datasets)) {
    if (datasetId !== history.revisions[0]?.dataset_id || !history.revisions.some((revision) => revision.revision_id === history.active_revision_id)) {
      throw new Error(`Invalid media-context history: ${datasetId}`);
    }
    const revisions = new Set<string>();
    for (const revision of history.revisions) {
      validateDatasetRevision(revision, index.source_fingerprint_sha256);
      if (revision.dataset_id !== datasetId || revisions.has(revision.revision_id)) throw new Error(`Invalid media-context revision history: ${datasetId}`);
      revisions.add(revision.revision_id);
    }
  }
}

export function readMediaContextIndex(fingerprint: string): MediaContextIndex {
  const fallback = emptyIndex(fingerprint);
  const index = readJsonFile<MediaContextIndex>(mediaContextIndexPath(fingerprint), fallback);
  validateIndex(index);
  return index;
}

export function publishMediaContextDataset(
  fingerprint: string,
  revision: MediaContextDatasetRevision,
): MediaContextIndex {
  sourceMediaContextId(fingerprint);
  validateDatasetRevision(revision, fingerprint);
  const current = readMediaContextIndex(fingerprint);
  const history = current.datasets[revision.dataset_id];
  const duplicate = history?.revisions.find((item) => item.revision_id === revision.revision_id);
  if (duplicate) {
    if (stableJson(duplicate) !== stableJson(revision)) throw new Error(`Media-context revision is immutable: ${revision.revision_id}`);
    return current;
  }
  if (history && revision.supersedes_revision_id !== history.active_revision_id) {
    throw new Error(`Media-context revision must supersede active revision ${history.active_revision_id}`);
  }
  if (!history && revision.supersedes_revision_id !== null) throw new Error("First media-context revision cannot supersede another revision");
  const nextHistory: MediaContextDatasetHistory = {
    active_revision_id: revision.revision_id,
    revisions: [...(history?.revisions ?? []), revision],
  };
  const next: MediaContextIndex = {
    ...current,
    datasets: { ...current.datasets, [revision.dataset_id]: nextHistory },
    updated_at: revision.created_at,
  };
  fs.mkdirSync(mediaAnalysisContentDir(fingerprint), { recursive: true });
  writeJsonFileAtomic(mediaContextIndexPath(fingerprint), next, validateIndex);
  return next;
}

export function readSourceMediaContext(fingerprint: string): SourceMediaContext | null {
  const manifest = readManifest(fingerprint);
  const hasIndex = fs.existsSync(mediaContextIndexPath(fingerprint));
  if (!manifest && !hasIndex) return null;
  const index = readMediaContextIndex(fingerprint);
  const derivatives = Object.entries(manifest?.stage_records ?? {})
    .filter(([, record]) => record.artifact_path != null)
    .map(([stage, record]) => ({
      stage,
      status: record.status,
      relative_path: record.artifact_path,
      artifact_sha256: record.artifact_sha256,
      cache_key: record.cache_key,
      producer: record.tool,
      parameters: record.parameters,
    }))
    .sort((a, b) => a.stage.localeCompare(b.stage));
  return {
    schema_version: 1,
    context_id: index.context_id,
    source_fingerprint_sha256: fingerprint,
    source_size_bytes: manifest?.source_size_bytes ?? null,
    probe: manifest?.probe ?? null,
    derivatives,
    datasets: Object.entries(index.datasets).sort(([a], [b]) => a.localeCompare(b)).map(([, history]) => history),
    updated_at: [manifest?.updated_at, index.updated_at].filter((value): value is string => Boolean(value)).sort().at(-1)!,
  };
}

export function summarizeSourceMediaContext(context: SourceMediaContext): Record<string, unknown> {
  return {
    schema_version: context.schema_version,
    context_id: context.context_id,
    source_fingerprint_sha256: context.source_fingerprint_sha256,
    source_size_bytes: context.source_size_bytes,
    probe: context.probe,
    derivatives: context.derivatives.map(({ stage, status, cache_key, producer }) => ({ stage, status, cache_key, producer })),
    datasets: context.datasets.map((history) => {
      const active = history.revisions.find((revision) => revision.revision_id === history.active_revision_id)!;
      return {
        dataset_id: active.dataset_id,
        active_revision_id: active.revision_id,
        kind: active.kind,
        evidence_level: active.evidence_level,
        status: active.coverage.status,
        coverage: active.coverage,
        coordinate_space: active.coordinate_space,
        producer: active.producer,
        summary: active.summary,
        artifact_available: active.artifact != null,
      };
    }),
    updated_at: context.updated_at,
  };
}
