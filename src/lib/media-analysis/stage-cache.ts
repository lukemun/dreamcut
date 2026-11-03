import { createHash } from "node:crypto";

import type { AnalysisManifest, CacheDisposition, StageCacheIdentity, StageRecord, StageToolIdentity } from "./schema";

export const MEDIA_ANALYSIS_STAGE_SCHEMA_VERSION = 2;

/**
 * Sorted key orders, found by walking each object's own key sequence. Objects of one kind (timeline
 * elements, their props) share a few sequences, so the collation sort runs once per sequence, not once
 * per object. Bounded: one-off sequences (records keyed by ids) are dropped when it grows too large.
 */
type KeyOrderNode = { next: Map<string, KeyOrderNode>; sorted?: string[]; quoted?: string[] | null };
let keyOrders: KeyOrderNode = { next: new Map() };
let keyOrderNodes = 0;
const MAX_KEY_ORDER_NODES = 50_000;

function keyOrderNode(keys: string[]): KeyOrderNode {
  if (keyOrderNodes > MAX_KEY_ORDER_NODES) { keyOrders = { next: new Map() }; keyOrderNodes = 0; }
  let node = keyOrders;
  for (const key of keys) {
    let child = node.next.get(key);
    if (!child) { child = { next: new Map() }; node.next.set(key, child); keyOrderNodes++; }
    node = child;
  }
  node.sorted ??= [...keys].sort((a, b) => a.localeCompare(b));
  return node;
}
const sortedKeys = (keys: string[]) => keyOrderNode(keys).sorted!;

/** An array index key is enumerated before other keys whatever the insertion order. */
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;
/**
 * The sorted keys of a sequence written as JSON property prefixes (`"key":`), or null when the sorted copy
 * would not enumerate in sorted order (array index keys) or serialises specially (`__proto__`, `toJSON`).
 */
function quotedSortedKeys(keys: string[]): string[] | null {
  const node = keyOrderNode(keys);
  if (node.quoted === undefined) {
    node.quoted = node.sorted!.some(key => key === "__proto__" || key === "toJSON" || (ARRAY_INDEX.test(key) && Number(key) < 4294967295))
      ? null : node.sorted!.map(key => `${JSON.stringify(key)}:`);
  }
  return node.quoted;
}

/** A copy with every object's keys in sorted order (the same object Object.fromEntries of sorted entries builds). */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const out: Record<string, unknown> = {};
    for (const key of keys.length > 1 ? sortedKeys(keys) : keys) {
      const item = canonicalize(record[key]);
      // Assignment would set the prototype; Object.fromEntries makes an own property.
      if (key === "__proto__") Object.defineProperty(out, key, { value: item, enumerable: true, writable: true, configurable: true });
      else out[key] = item;
    }
    return out;
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

class NotDirect extends Error {}
/**
 * Writes the JSON text of canonicalize(value) to `emit` in whole tokens, without building the sorted copy.
 * Throws NotDirect for inputs whose sorted copy serialises differently from its sorted keys (array index
 * keys, `__proto__`, `toJSON`) or that JSON cannot write (bigint), so the caller can take the copy path.
 * Returns false where JSON.stringify would write nothing (undefined, functions, symbols).
 */
function writeDirect(value: unknown, emit: (text: string) => void): boolean {
  switch (typeof value) {
    case "string": emit(JSON.stringify(value)); return true;
    case "number": emit(Number.isFinite(value) ? String(value) : "null"); return true;
    case "boolean": emit(value ? "true" : "false"); return true;
    case "undefined": case "function": case "symbol": return false;
    case "bigint": throw new NotDirect();
  }
  if (value === null) { emit("null"); return true; }
  if (Array.isArray(value)) {
    emit("[");
    for (let i = 0; i < value.length; i++) {
      if (i) emit(",");
      if (!writeDirect(value[i], emit)) emit("null");
    }
    emit("]");
    return true;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const quoted = keys.length ? quotedSortedKeys(keys) : [];
  if (!quoted) throw new NotDirect();
  const order = keys.length ? sortedKeys(keys) : keys;
  emit("{");
  let first = true;
  for (let i = 0; i < order.length; i++) {
    const item = record[order[i]!];
    const kind = typeof item;
    if (kind === "undefined" || kind === "function" || kind === "symbol") continue;
    if (!first) emit(",");
    emit(quoted[i]!);
    writeDirect(item, emit);
    first = false;
  }
  emit("}");
  return true;
}

/**
 * sha256 hex of stableJson(value), streamed: for plain data the sorted text goes to the hash in chunks and is
 * never held whole (a 15 MB timeline costs about two thirds of building the copy and its string). Chunks hold
 * whole JSON tokens, which JSON.stringify keeps free of lone surrogates, so their UTF-8 is the whole text's.
 */
export function stableJsonSha256(value: unknown): string {
  if (value !== null && typeof value === "object") {
    const hash = createHash("sha256");
    let buffer = "";
    try {
      writeDirect(value, (text) => {
        buffer += text;
        if (buffer.length > 16_384) { hash.update(buffer); buffer = ""; }
      });
      return hash.update(buffer).digest("hex");
    } catch (error) { if (!(error instanceof NotDirect)) throw error; }
  }
  return createHash("sha256").update(stableJson(value)).digest("hex");
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
