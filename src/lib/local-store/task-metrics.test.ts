import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finishTaskRun, recordTaskAction, recordTaskPhase, startTaskRun, summarizeTaskMetrics } from "./task-metrics";

test("task metrics persist phases and comparable summaries", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "task-metrics-"));
  process.env.EDITOR_TASK_METRICS_DIR = directory;
  try {
    const run = startTaskRun({ taskName: "build effect", effectId: "hand-open", startedAt: "2026-07-16T00:00:00.000Z" });
    const phase = recordTaskPhase(run.run_id, {
      operation: "track geometry",
      startedAt: "2026-07-16T00:00:01.000Z",
      finishedAt: "2026-07-16T00:00:03.500Z",
      inputScale: { frames: 39 },
      execution: { kind: "deterministic", engine: "ffmpeg", engine_version: "7.1", device: "cpu", concurrency: 4 },
    });
    const action = recordTaskAction(run.run_id, {
      operation: "inspect contact frames",
      category: "inspect",
      startedAt: "2026-07-16T00:00:03.500Z",
      finishedAt: "2026-07-16T00:00:04.000Z",
      outputScale: { frames: 12 },
    });
    finishTaskRun(run.run_id, { status: "completed", finishedAt: "2026-07-16T00:00:05.000Z", correctionIterations: 1 });
    assert.equal(phase.elapsed_ms, 2500);
    assert.deepEqual(phase.execution, { kind: "deterministic", engine: "ffmpeg", engine_version: "7.1", device: "cpu", concurrency: 4 });
    assert.equal(action.record_type, "action");
    assert.equal(action.elapsed_ms, 500);
    assert.deepEqual(summarizeTaskMetrics("hand-open"), [{
      task_name: "build effect",
      effect_id: "hand-open",
      runs: 1,
      latest_ms: 5000,
      fastest_ms: 5000,
      median_ms: 5000,
    }]);
  } finally {
    delete process.env.EDITOR_TASK_METRICS_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
