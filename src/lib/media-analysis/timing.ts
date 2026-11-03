import type { StageAttempt, TimingRollup } from "./schema";

type Interval = { start: number; end: number };

const activeWall = (attempt: StageAttempt) => attempt.active_wall_ms ?? attempt.wall_ms;
const disposition = (attempt: StageAttempt) => attempt.cache_disposition ?? (attempt.cache_hit ? "hit" : "miss");
const isActive = (attempt: StageAttempt) => (disposition(attempt) === "miss" || disposition(attempt) === "resumed") && activeWall(attempt) > 0;

function intervalStats(intervals: Interval[], elapsed: number): { union: number; max: number; average: number } {
  const valid = intervals.filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end >= interval.start);
  const events = valid.flatMap((interval) => [
    { at: interval.start, delta: 1 },
    { at: interval.end, delta: -1 },
  ]).sort((a, b) => a.at - b.at || a.delta - b.delta);
  let active = 0;
  let max = 0;
  let union = 0;
  let previous: number | null = null;
  for (const event of events) {
    if (previous !== null && active > 0) union += Math.max(0, event.at - previous);
    active += event.delta;
    max = Math.max(max, active);
    previous = event.at;
  }
  const summed = valid.reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
  return { union, max, average: elapsed > 0 ? summed / elapsed : 0 };
}

function emptyRollup(): TimingRollup {
  return {
    elapsed_wall_ms: 0, summed_stage_wall_ms: 0, total_queue_wait_ms: 0,
    critical_path_ms: 0, critical_path_stages: [], observed_parallelism: 0, effective_parallelism: null,
    max_concurrency: 0, average_concurrency: 0, cache_hits: 0, cache_misses: 0,
    cache_resumes: 0, cache_skips: 0, cache_time_avoided_ms: 0, active_union_ms: 0,
    worker_busy_ms: 0, worker_idle_ms: 0, dependency_wait_ms: 0,
    io_throughput_bytes_per_second: null, derived_bytes: 0, peak_rss_bytes: null,
    serial_baseline_wall_ms: null, parallel_speedup: null, parallel_efficiency: null,
    time_by_stage_ms: {}, by_resource: {},
  };
}

export function calculateTimingRollup(
  attempts: StageAttempt[],
  options: {
    serialBaselineWallMs?: number | null;
    effectiveParallelism?: number | null;
    cacheReferenceAttempts?: StageAttempt[];
  } = {},
): TimingRollup {
  if (attempts.length === 0) return emptyRollup();

  const queued = attempts.map((attempt) => Date.parse(attempt.queued_at)).filter(Number.isFinite);
  const finished = attempts.map((attempt) => Date.parse(attempt.finished_at)).filter(Number.isFinite);
  const elapsed = queued.length && finished.length ? Math.max(0, Math.max(...finished) - Math.min(...queued)) : 0;
  const activeAttempts = attempts.filter(isActive);
  const intervals = activeAttempts.map((attempt) => ({ start: Date.parse(attempt.started_at), end: Date.parse(attempt.finished_at) }));
  const totals = intervalStats(intervals, elapsed);
  const summed = activeAttempts.reduce((sum, attempt) => sum + activeWall(attempt), 0);

  const missesByStage = new Map<string, number[]>();
  for (const attempt of options.cacheReferenceAttempts ?? attempts) {
    if (disposition(attempt) !== "miss" && disposition(attempt) !== "resumed") continue;
    const values = missesByStage.get(attempt.stage) ?? [];
    values.push(activeWall(attempt));
    missesByStage.set(attempt.stage, values);
  }
  const cacheTimeAvoided = attempts.reduce((sum, attempt) => {
    if (disposition(attempt) !== "hit") return sum;
    const samples = missesByStage.get(attempt.stage) ?? [];
    if (samples.length === 0) return sum;
    return sum + samples.reduce((total, sample) => total + sample, 0) / samples.length;
  }, 0);

  const attemptByStage = new Map<string, StageAttempt>();
  for (const attempt of attempts) attemptByStage.set(attempt.stage, attempt);
  const memo = new Map<string, { duration: number; path: string[] }>();
  let dependencyWaitMs = 0;
  const visit = (stage: string, visiting = new Set<string>()): { duration: number; path: string[] } => {
    const cached = memo.get(stage);
    if (cached) return cached;
    const attempt = attemptByStage.get(stage);
    if (!attempt || visiting.has(stage)) return { duration: 0, path: [] };
    const nextVisiting = new Set(visiting).add(stage);
    const dependencyResults = attempt.dependency_stages.map((dependency) => visit(dependency, nextVisiting));
    const longestDependency = dependencyResults.sort((a, b) => b.duration - a.duration)[0] ?? { duration: 0, path: [] };
    const dependencyFinishedAt = Math.max(0, ...attempt.dependency_stages.map((dependency) => {
      const item = attemptByStage.get(dependency);
      return item ? Date.parse(item.finished_at) : 0;
    }));
    const queuedAt = Date.parse(attempt.queued_at);
    const startedAt = Date.parse(attempt.started_at);
    const dependencyWait = dependencyFinishedAt > queuedAt ? Math.max(0, Math.min(startedAt, dependencyFinishedAt) - queuedAt) : 0;
    dependencyWaitMs += dependencyWait;
    const resourceWait = Math.max(0, attempt.queue_wait_ms - dependencyWait);
    const result = {
      duration: longestDependency.duration + resourceWait + activeWall(attempt),
      path: [...longestDependency.path, stage],
    };
    memo.set(stage, result);
    return result;
  };
  const critical = [...attemptByStage.keys()].map((stage) => visit(stage)).sort((a, b) => b.duration - a.duration)[0]
    ?? { duration: 0, path: [] };

  const byResource: TimingRollup["by_resource"] = {};
  for (const resource of new Set(activeAttempts.map((attempt) => attempt.resource))) {
    const resourceAttempts = activeAttempts.filter((attempt) => attempt.resource === resource);
    const resourceIntervals = resourceAttempts.map((attempt) => ({ start: Date.parse(attempt.started_at), end: Date.parse(attempt.finished_at) }));
    const stats = intervalStats(resourceIntervals, elapsed);
    byResource[resource] = {
      wall_ms: resourceAttempts.reduce((sum, attempt) => sum + activeWall(attempt), 0),
      max_concurrency: stats.max,
      average_concurrency: stats.average,
    };
  }

  const timeByStage: Record<string, number> = {};
  for (const attempt of activeAttempts) timeByStage[attempt.stage] = (timeByStage[attempt.stage] ?? 0) + activeWall(attempt);
  const bytesRead = activeAttempts.reduce((sum, attempt) => sum + (attempt.bytes_read ?? attempt.input_bytes ?? 0), 0);
  const serialBaseline = options.serialBaselineWallMs ?? null;
  const speedup = serialBaseline != null && elapsed > 0 ? serialBaseline / elapsed : null;
  const effectiveParallelism = options.effectiveParallelism ?? (totals.max > 0 ? totals.max : null);

  return {
    elapsed_wall_ms: elapsed,
    summed_stage_wall_ms: summed,
    total_queue_wait_ms: attempts.reduce((sum, attempt) => sum + attempt.queue_wait_ms, 0),
    critical_path_ms: critical.duration,
    critical_path_stages: critical.path,
    observed_parallelism: elapsed > 0 ? summed / elapsed : 0,
    effective_parallelism: effectiveParallelism,
    max_concurrency: totals.max,
    average_concurrency: totals.average,
    cache_hits: attempts.filter((attempt) => disposition(attempt) === "hit").length,
    cache_misses: attempts.filter((attempt) => disposition(attempt) === "miss").length,
    cache_resumes: attempts.filter((attempt) => disposition(attempt) === "resumed").length,
    cache_skips: attempts.filter((attempt) => disposition(attempt) === "skipped").length,
    cache_time_avoided_ms: cacheTimeAvoided,
    active_union_ms: totals.union,
    worker_busy_ms: totals.union,
    worker_idle_ms: Math.max(0, elapsed - totals.union),
    dependency_wait_ms: dependencyWaitMs,
    io_throughput_bytes_per_second: summed > 0 ? bytesRead / (summed / 1_000) : null,
    derived_bytes: activeAttempts.reduce((sum, attempt) => sum + (attempt.derived_bytes ?? attempt.bytes_written ?? 0), 0),
    peak_rss_bytes: Math.max(0, ...activeAttempts.map((attempt) => attempt.peak_rss_bytes ?? 0)) || null,
    serial_baseline_wall_ms: serialBaseline,
    parallel_speedup: speedup,
    parallel_efficiency: speedup != null && effectiveParallelism != null && effectiveParallelism > 0 ? speedup / effectiveParallelism : null,
    time_by_stage_ms: timeByStage,
    by_resource: byResource,
  };
}
