import fs from "node:fs";
import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { projectDir } from "@/lib/local-store/paths";
import {
  auditionCompileContractSchema,
  auditionCompileJobSchema,
  type AuditionCompileContract,
  type AuditionCompileJob,
} from "@/lib/timeline/audition-compiles";

export function auditionCompileContractPath(projectId: string): string {
  return path.join(projectDir(projectId), "analysis", "audition-compile.json");
}

export function auditionCompileJobsDir(projectId: string): string {
  return path.join(projectDir(projectId), "analysis", "audition-compiles");
}

export function auditionCompileJobPath(projectId: string, jobId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error(`Invalid audition compile job id: ${jobId}`);
  return path.join(auditionCompileJobsDir(projectId), `${jobId}.json`);
}

export function readAuditionCompileContract(projectId: string): AuditionCompileContract | null {
  const file = auditionCompileContractPath(projectId);
  if (!fs.existsSync(file)) return null;
  return auditionCompileContractSchema.parse(readJsonFile<unknown>(file, null));
}

export function readAuditionCompileJob(projectId: string, jobId: string): AuditionCompileJob | null {
  const file = auditionCompileJobPath(projectId, jobId);
  if (!fs.existsSync(file)) return null;
  return auditionCompileJobSchema.parse(readJsonFile<unknown>(file, null));
}

export function writeAuditionCompileJob(projectId: string, job: AuditionCompileJob): void {
  const parsed = auditionCompileJobSchema.parse(job);
  const file = auditionCompileJobPath(projectId, parsed.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonFileAtomic(file, parsed);
}

export function latestAuditionCompileJob(projectId: string): AuditionCompileJob | null {
  const dir = auditionCompileJobsDir(projectId);
  if (!fs.existsSync(dir)) return null;
  const jobs = fs.readdirSync(dir)
    .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
    .map((name) => auditionCompileJobSchema.parse(readJsonFile<unknown>(path.join(dir, name), null)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return jobs[0] ?? null;
}
