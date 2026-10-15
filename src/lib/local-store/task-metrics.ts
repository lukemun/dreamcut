import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TaskRunStatus = "running" | "completed" | "failed" | "cancelled";

export type TaskExecutionIdentity = {
  kind: "deterministic" | "model" | "human" | "hybrid";
  engine: string;
  engine_version?: string;
  model_id?: string;
  model_version?: string;
  device?: string;
  concurrency?: number;
};

export type TaskRun = {
  schema_version: 1;
  run_id: string;
  task_name: string;
  effect_id?: string;
  project_id?: string;
  recipe_id?: string;
  started_at: string;
  status: TaskRunStatus;
};

export type TaskMetric = TaskRun & {
  record_type: "action" | "phase" | "task_summary";
  operation: string;
  finished_at: string;
  elapsed_ms: number;
  input_scale?: Record<string, number>;
  output_scale?: Record<string, number>;
  cache_hit?: boolean;
  execution?: TaskExecutionIdentity;
  correction_iterations?: number;
  category?: "inspect" | "preprocess" | "transform" | "edit" | "verify" | "retro";
  outcome?: "completed" | "failed" | "skipped";
  note?: string;
};

const root = () => path.resolve(process.env.EDITOR_TASK_METRICS_DIR?.trim() || ".metrics");
const runsDir = () => path.join(root(), "runs");
const registryPath = () => path.join(root(), "operations.jsonl");

function runPath(runId: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(runId)) throw new Error(`Invalid run id: ${runId}`);
  return path.join(runsDir(), `${runId}.json`);
}

function elapsedMs(startedAt: string, finishedAt: string): number {
  const elapsed = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new Error(`Invalid metric interval: ${startedAt} -> ${finishedAt}`);
  }
  return elapsed;
}

function writeRun(run: TaskRun): void {
  fs.mkdirSync(runsDir(), { recursive: true });
  const target = runPath(run.run_id);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(run, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

function appendMetric(metric: TaskMetric): void {
  fs.mkdirSync(root(), { recursive: true });
  fs.appendFileSync(registryPath(), `${JSON.stringify(metric)}\n`);
}

export function startTaskRun(input: {
  taskName: string;
  effectId?: string;
  projectId?: string;
  recipeId?: string;
  startedAt?: string;
}): TaskRun {
  const run: TaskRun = {
    schema_version: 1,
    run_id: randomUUID(),
    task_name: input.taskName,
    effect_id: input.effectId,
    project_id: input.projectId,
    recipe_id: input.recipeId,
    started_at: input.startedAt || new Date().toISOString(),
    status: "running",
  };
  writeRun(run);
  return run;
}

export function readTaskRun(runId: string): TaskRun {
  return JSON.parse(fs.readFileSync(runPath(runId), "utf8")) as TaskRun;
}

export function recordTaskPhase(runId: string, input: {
  operation: string;
  startedAt: string;
  finishedAt?: string;
  status?: Exclude<TaskRunStatus, "cancelled">;
  inputScale?: Record<string, number>;
  outputScale?: Record<string, number>;
  cacheHit?: boolean;
  execution?: TaskExecutionIdentity;
  note?: string;
}): TaskMetric {
  const run = readTaskRun(runId);
  const finishedAt = input.finishedAt || new Date().toISOString();
  const metric: TaskMetric = {
    ...run,
    record_type: "phase",
    operation: input.operation,
    started_at: input.startedAt,
    finished_at: finishedAt,
    elapsed_ms: elapsedMs(input.startedAt, finishedAt),
    status: input.status || "completed",
    input_scale: input.inputScale,
    output_scale: input.outputScale,
    cache_hit: input.cacheHit,
    execution: input.execution,
    note: input.note,
  };
  appendMetric(metric);
  return metric;
}

export function recordTaskAction(runId: string, input: {
  operation: string;
  category: NonNullable<TaskMetric["category"]>;
  startedAt: string;
  finishedAt?: string;
  outcome?: NonNullable<TaskMetric["outcome"]>;
  inputScale?: Record<string, number>;
  outputScale?: Record<string, number>;
  cacheHit?: boolean;
  execution?: TaskExecutionIdentity;
  note?: string;
}): TaskMetric {
  const run = readTaskRun(runId);
  const finishedAt = input.finishedAt || new Date().toISOString();
  const outcome = input.outcome || "completed";
  const metric: TaskMetric = {
    ...run,
    record_type: "action",
    operation: input.operation,
    category: input.category,
    outcome,
    started_at: input.startedAt,
    finished_at: finishedAt,
    elapsed_ms: elapsedMs(input.startedAt, finishedAt),
    status: outcome === "failed" ? "failed" : "completed",
    input_scale: input.inputScale,
    output_scale: input.outputScale,
    cache_hit: input.cacheHit,
    execution: input.execution,
    note: input.note,
  };
  appendMetric(metric);
  return metric;
}

export function finishTaskRun(runId: string, input: {
  status: Exclude<TaskRunStatus, "running">;
  finishedAt?: string;
  correctionIterations?: number;
  note?: string;
}): TaskMetric {
  const run = readTaskRun(runId);
  const finishedAt = input.finishedAt || new Date().toISOString();
  const finishedRun = { ...run, status: input.status };
  writeRun(finishedRun);
  const metric: TaskMetric = {
    ...finishedRun,
    record_type: "task_summary",
    operation: run.task_name,
    finished_at: finishedAt,
    elapsed_ms: elapsedMs(run.started_at, finishedAt),
    correction_iterations: input.correctionIterations,
    note: input.note,
  };
  appendMetric(metric);
  return metric;
}

export async function measureTaskPhase<T>(runId: string, operation: string, work: () => Promise<T>, details: {
  inputScale?: Record<string, number>;
  outputScale?: Record<string, number>;
  cacheHit?: boolean;
  execution?: TaskExecutionIdentity;
} = {}): Promise<T> {
  const startedAt = new Date().toISOString();
  try {
    const result = await work();
    recordTaskPhase(runId, { operation, startedAt, ...details });
    return result;
  } catch (error) {
    recordTaskPhase(runId, { operation, startedAt, status: "failed", ...details, note: String(error) });
    throw error;
  }
}

export function readTaskMetrics(): TaskMetric[] {
  try {
    return fs.readFileSync(registryPath(), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as TaskMetric);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function summarizeTaskMetrics(effectId?: string): Array<{
  task_name: string;
  effect_id?: string;
  runs: number;
  latest_ms: number;
  fastest_ms: number;
  median_ms: number;
}> {
  const groups = new Map<string, TaskMetric[]>();
  for (const row of readTaskMetrics()) {
    if (row.record_type !== "task_summary" || row.status !== "completed") continue;
    if (effectId && row.effect_id !== effectId) continue;
    const key = `${row.effect_id || ""}\u0000${row.task_name}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].map((rows) => {
    const sorted = rows.map((row) => row.elapsed_ms).sort((a, b) => a - b);
    return {
      task_name: rows[0].task_name,
      effect_id: rows[0].effect_id,
      runs: rows.length,
      latest_ms: rows.at(-1)!.elapsed_ms,
      fastest_ms: sorted[0],
      median_ms: sorted[Math.floor(sorted.length / 2)],
    };
  }).sort((a, b) => b.latest_ms - a.latest_ms);
}
