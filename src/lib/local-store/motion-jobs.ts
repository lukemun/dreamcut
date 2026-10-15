import fs from "node:fs";
import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { isSafeMotionSubjectId } from "./motion-audit";
import { projectDir } from "./paths";

/**
 * Durable state for a composition render, so a render that outlives one tool call can be
 * polled. One job per composition; a new start replaces a finished one. The editor's value
 * changes add a key (the values), so several copies of one graphic render side by side.
 */

export type MotionJob = {
  schema_version: 1;
  composition_id: string;
  state: "rendering" | "ready" | "failed";
  started_at: string;
  finished_at: string | null;
  result: Record<string, unknown> | null;
  warnings: string[];
  error: string | null;
  /** Process that owns a rendering job; a job whose owner is gone is reported as interrupted. */
  owner_pid: number;
  /** The values key of an editor value change; absent for the composition's agent job. */
  key?: string;
};

const JOB_KEY = /^[a-f0-9]{16}$/;

function jobPath(projectId: string, compositionId: string, key?: string): string {
  if (!isSafeMotionSubjectId(compositionId)) throw new Error(`Invalid composition id: ${compositionId}`);
  if (key !== undefined && !JOB_KEY.test(key)) throw new Error(`Invalid motion job key: ${key}`);
  return path.join(projectDir(projectId), "preprocess", "motion-jobs", key ? `${compositionId}.${key}.json` : `${compositionId}.json`);
}

function validateJob(value: unknown): asserts value is MotionJob {
  const job = value as MotionJob;
  if (!job || job.schema_version !== 1 || !["rendering", "ready", "failed"].includes(job.state)
    || typeof job.composition_id !== "string" || typeof job.started_at !== "string") {
    throw new Error("Invalid motion job");
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readMotionJob(projectId: string, compositionId: string, key?: string): MotionJob | null {
  const job = readJsonFile<unknown>(jobPath(projectId, compositionId, key), null);
  try {
    validateJob(job);
  } catch {
    return null;
  }
  if (job.state === "rendering" && !processAlive(job.owner_pid)) {
    return { ...job, state: "failed", error: "The render was interrupted. Prepare it again." };
  }
  return job;
}

export function writeMotionJob(projectId: string, job: MotionJob): void {
  const target = jobPath(projectId, job.composition_id, job.key);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeJsonFileAtomic(target, job, validateJob);
}

/** Start or reuse a job; settle it when the work finishes. Returns the job and its completion. */
export function startMotionJob(
  projectId: string,
  compositionId: string,
  work: () => Promise<{ result: Record<string, unknown>; warnings: string[] }>,
  now: () => Date = () => new Date(),
  key?: string,
): { job: MotionJob; done: Promise<MotionJob> } {
  const existing = readMotionJob(projectId, compositionId, key);
  if (existing?.state === "rendering") throw Object.assign(new Error("This motion graphic is already rendering"), { status: 409, job: existing });
  const job: MotionJob = {
    schema_version: 1,
    composition_id: compositionId,
    state: "rendering",
    started_at: now().toISOString(),
    finished_at: null,
    result: null,
    warnings: [],
    error: null,
    owner_pid: process.pid,
    ...(key ? { key } : {}),
  };
  writeMotionJob(projectId, job);
  const done = work().then(
    ({ result, warnings }) => ({ ...job, state: "ready" as const, finished_at: now().toISOString(), result, warnings }),
    (error: unknown) => ({ ...job, state: "failed" as const, finished_at: now().toISOString(), error: error instanceof Error ? error.message : String(error) }),
  ).then((settled) => {
    writeMotionJob(projectId, settled);
    return settled;
  });
  return { job, done };
}
