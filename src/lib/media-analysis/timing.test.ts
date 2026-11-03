import assert from "node:assert/strict";
import test from "node:test";

import type { StageAttempt } from "./schema";
import { calculateTimingRollup } from "./timing";

function attempt(stage: string, startMs: number, endMs: number, dependencies: string[] = [], status: StageAttempt["status"] = "completed", cacheHit = false, queuedMs = startMs): StageAttempt {
  return {
    attempt_id: stage, job_id: "job", job_attempt_number: 1, stage, resource: "ffmpeg",
    dependency_stages: dependencies, status, outcome: status, cache_hit: cacheHit,
    cache_disposition: cacheHit ? "hit" : "miss",
    queued_at: new Date(queuedMs).toISOString(),
    started_at: new Date(startMs).toISOString(), finished_at: new Date(endMs).toISOString(),
    queue_wait_ms: startMs - queuedMs,
    wall_ms: endMs - startMs, active_wall_ms: endMs - startMs,
    cpu_user_ms: 1, cpu_system_ms: 1, input_bytes: 100, bytes_read: 100,
    bytes_written: 10, derived_bytes: 10, source_seconds: 1, frames_processed: null,
    chunks_processed: 1, peak_rss_bytes: 1_000, worker_id: "test",
    tool: { name: "fixture", version: "1" }, warnings: [],
    throughput_bytes_per_second: 100, throughput_source_realtime: 10, error: null,
  };
}

test("timing rollup measures overlap and DAG critical path", () => {
  const rollup = calculateTimingRollup([
    attempt("probe", 0, 100),
    attempt("proxy", 100, 300, ["probe"]),
    attempt("waveform", 100, 200, ["probe"]),
  ]);
  assert.equal(rollup.elapsed_wall_ms, 300);
  assert.equal(rollup.summed_stage_wall_ms, 400);
  assert.equal(rollup.critical_path_ms, 300);
  assert.equal(rollup.max_concurrency, 2);
  assert.equal(rollup.by_resource.ffmpeg.max_concurrency, 2);
  assert.ok(Math.abs(rollup.observed_parallelism - 4 / 3) < 0.001);
});

test("bounded pool rollup excludes queue wait from active concurrency and wall time", () => {
  const rollup = calculateTimingRollup([
    attempt("branch_a", 100, 200, [], "completed", false, 100),
    attempt("branch_b", 100, 200, [], "completed", false, 100),
    attempt("branch_c", 200, 300, [], "completed", false, 100),
  ]);
  assert.equal(rollup.max_concurrency, 2);
  assert.equal(rollup.by_resource.ffmpeg.max_concurrency, 2);
  assert.equal(rollup.elapsed_wall_ms, 200);
  assert.equal(rollup.summed_stage_wall_ms, 300);
  assert.equal(rollup.total_queue_wait_ms, 100);
  assert.equal(rollup.average_concurrency, 1.5);
  assert.equal(rollup.critical_path_ms, 200);
  assert.deepEqual(rollup.critical_path_stages, ["branch_c"]);
});

test("timing rollup retains failed, cancelled, and cache-hit attempts", () => {
  const attempts = [
    attempt("cached", 0, 1, [], "completed", true),
    attempt("failed", 1, 21, ["cached"], "failed"),
    attempt("cancelled", 21, 31, ["failed"], "cancelled"),
  ];
  const rollup = calculateTimingRollup(attempts);
  assert.equal(attempts.length, 3);
  assert.equal(rollup.summed_stage_wall_ms, 30);
  assert.equal(rollup.cache_hits, 1);
  assert.equal(rollup.cache_misses, 2);
  assert.equal(rollup.critical_path_ms, 31);
});

test("cache hits do not inflate active work and paired baselines report speedup", () => {
  const miss = attempt("proxy", 0, 100);
  const hit = attempt("proxy_cached", 100, 110, [], "completed", true);
  const rollup = calculateTimingRollup([miss, hit], { serialBaselineWallMs: 200, effectiveParallelism: 2 });
  assert.equal(rollup.summed_stage_wall_ms, 100);
  assert.equal(rollup.cache_hits, 1);
  assert.equal(rollup.parallel_speedup, 200 / 110);
  assert.equal(rollup.parallel_efficiency, (200 / 110) / 2);
  assert.equal(rollup.derived_bytes, 10);
  assert.equal(rollup.peak_rss_bytes, 1_000);
});
