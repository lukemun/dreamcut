import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisManifest, TimingRollup } from "./schema";
import { cacheDispositionForPrepared, createStageCacheIdentity, prepareStageRecord, stableJson } from "./stage-cache";

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

function manifest(): AnalysisManifest {
  return {
    schema_version: 2, fingerprint_sha256: "a".repeat(64), source_size_bytes: 1,
    probe: null, derivatives: {}, stages: {}, stage_records: {}, stage_history: [], attempts: [],
    timing: EMPTY_TIMING, detector: { status: "unavailable", reason: null }, updated_at: new Date(0).toISOString(),
  };
}

test("stage keys are canonical and include tool, parameters, schema, source, and dependencies", () => {
  const base = { stage: "proxy", fingerprint: "a".repeat(64), tool: { name: "ffmpeg", version: "7.1" } };
  const first = createStageCacheIdentity({ ...base, parameters: { crf: 28, scale: 1280 } });
  const reordered = createStageCacheIdentity({ ...base, parameters: { scale: 1280, crf: 28 } });
  const changed = createStageCacheIdentity({ ...base, parameters: { scale: 1280, crf: 27 } });
  assert.equal(first.cache_key, reordered.cache_key);
  assert.notEqual(first.cache_key, changed.cache_key);
  assert.equal(stableJson({ b: 1, a: 2 }), stableJson({ a: 2, b: 1 }));
});

test("a changed stage key marks only it and transitive dependants stale", () => {
  const value = manifest();
  const probe = createStageCacheIdentity({ stage: "probe", fingerprint: value.fingerprint_sha256, tool: { name: "ffprobe", version: "1" } });
  const proxy = createStageCacheIdentity({ stage: "proxy", fingerprint: value.fingerprint_sha256, tool: { name: "ffmpeg", version: "1" }, dependencyCacheKeys: { probe: probe.cache_key } });
  const unrelated = createStageCacheIdentity({ stage: "audio", fingerprint: value.fingerprint_sha256, tool: { name: "ffmpeg", version: "1" } });
  for (const identity of [probe, proxy, unrelated]) {
    prepareStageRecord(value, identity);
    value.stage_records[identity.stage] = { ...value.stage_records[identity.stage], status: "completed" };
    value.stages[identity.stage] = "completed";
  }
  const nextProbe = createStageCacheIdentity({ stage: "probe", fingerprint: value.fingerprint_sha256, tool: { name: "ffprobe", version: "2" } });
  const result = prepareStageRecord(value, nextProbe);
  assert.deepEqual(new Set(result.invalidated), new Set(["probe", "proxy"]));
  assert.equal(value.stage_records.proxy.status, "stale");
  assert.equal(value.stage_records.audio.status, "completed");
  assert.equal(value.stage_records.probe.status, "pending");
});

test("an abandoned running stage is resumed while a completed compatible stage is a hit", () => {
  const value = manifest();
  const identity = createStageCacheIdentity({ stage: "proxy", fingerprint: value.fingerprint_sha256, tool: { name: "ffmpeg", version: "1" } });
  const first = prepareStageRecord(value, identity);
  value.stage_records.proxy = { ...first.record, status: "running" };
  const resumed = prepareStageRecord(value, identity);
  assert.equal(cacheDispositionForPrepared(resumed.record, resumed.cacheCompatible), "resumed");
  value.stage_records.proxy = { ...resumed.record, status: "completed" };
  const hit = prepareStageRecord(value, identity);
  assert.equal(cacheDispositionForPrepared(hit.record, hit.cacheCompatible), "hit");
});
