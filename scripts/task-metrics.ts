import {
  finishTaskRun,
  recordTaskAction,
  recordTaskPhase,
  startTaskRun,
  summarizeTaskMetrics,
} from "../src/lib/local-store/task-metrics";

const argv = process.argv.slice(2);
const command = argv.shift();
const value = (name: string) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const required = (name: string) => value(name) || (() => { throw new Error(`Missing --${name}`); })();
const executionIdentity = () => {
  const kind = value("execution-kind");
  const engine = value("engine");
  const hasExecutionFlag = [kind, engine, value("engine-version"), value("model-id"), value("model-version"), value("device"), value("concurrency")].some(Boolean);
  if (!hasExecutionFlag) return undefined;
  if (!kind || !["deterministic", "model", "human", "hybrid"].includes(kind)) {
    throw new Error("--execution-kind must be deterministic, model, human, or hybrid when execution identity is supplied");
  }
  if (!engine) throw new Error("--engine is required when execution identity is supplied");
  const concurrency = value("concurrency") ? Number(value("concurrency")) : undefined;
  if (concurrency !== undefined && (!Number.isFinite(concurrency) || concurrency < 1)) throw new Error("--concurrency must be a positive number");
  return {
    kind: kind as "deterministic" | "model" | "human" | "hybrid",
    engine,
    engine_version: value("engine-version"),
    model_id: value("model-id"),
    model_version: value("model-version"),
    device: value("device"),
    concurrency,
  };
};

if (command === "start") {
  console.log(JSON.stringify(startTaskRun({
    taskName: required("task"),
    effectId: value("effect"),
    projectId: value("project"),
    recipeId: value("recipe"),
    startedAt: value("started-at"),
  }), null, 2));
} else if (command === "phase") {
  console.log(JSON.stringify(recordTaskPhase(required("run"), {
    operation: required("operation"),
    startedAt: required("started-at"),
    finishedAt: value("finished-at"),
    status: value("status") === "failed" ? "failed" : "completed",
    cacheHit: value("cache-hit") === "true" ? true : value("cache-hit") === "false" ? false : undefined,
    execution: executionIdentity(),
    note: value("note"),
  }), null, 2));
} else if (command === "action") {
  const category = required("category");
  if (!["inspect", "preprocess", "transform", "edit", "verify", "retro"].includes(category)) {
    throw new Error("--category must be inspect, preprocess, transform, edit, verify, or retro");
  }
  const outcome = value("outcome") || "completed";
  if (!["completed", "failed", "skipped"].includes(outcome)) throw new Error("Invalid --outcome");
  console.log(JSON.stringify(recordTaskAction(required("run"), {
    operation: required("operation"),
    category: category as Parameters<typeof recordTaskAction>[1]["category"],
    startedAt: required("started-at"),
    finishedAt: value("finished-at"),
    outcome: outcome as Parameters<typeof recordTaskAction>[1]["outcome"],
    cacheHit: value("cache-hit") === "true" ? true : value("cache-hit") === "false" ? false : undefined,
    execution: executionIdentity(),
    note: value("note"),
  }), null, 2));
} else if (command === "finish") {
  const status = value("status");
  if (status !== "completed" && status !== "failed" && status !== "cancelled") throw new Error("--status must be completed, failed, or cancelled");
  console.log(JSON.stringify(finishTaskRun(required("run"), {
    status,
    finishedAt: value("finished-at"),
    correctionIterations: value("corrections") ? Number(value("corrections")) : undefined,
    note: value("note"),
  }), null, 2));
} else if (command === "summary") {
  console.table(summarizeTaskMetrics(value("effect")));
} else {
  throw new Error("Usage: task-metrics <start|action|phase|finish|summary> [options]");
}
