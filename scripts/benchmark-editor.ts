/**
 * One orchestration surface for the editor's existing real-workload probes.
 *
 * Default: project/storage health + muted first-load/seek/play probe.
 * Expensive preprocessing and renders are explicit flags.
 *
 * Usage:
 *   pnpm benchmark-editor <projectId> [--base http://127.0.0.1:3124]
 *     [--at 57] [--runs 5] [--label local] [--skip-preview]
 *     [--preprocess] [--asset <assetId>]
 *     [--working-render] [--scale 0.25] [--full-render]
 *     [--concurrency 2]
 */

import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildProjectHealthReport } from "@/lib/local-store/project-health";
import { projectDir, projectsRoot, projectTimelinePath } from "@/lib/local-store/paths";

type StepReceipt = {
  name: string;
  command: string[];
  started_at: string;
  elapsed_ms: number;
  status: "completed" | "failed";
  exit_code: number | null;
  evidence_path?: string;
  summary?: unknown;
};

type BenchmarkReceipt = {
  schema_version: 1;
  project_id: string;
  label: string;
  started_at: string;
  finished_at?: string;
  status: "running" | "completed" | "failed";
  git_head: string | null;
  timeline_sha256: string;
  base_url: string;
  machine: {
    platform: string;
    release: string;
    arch: string;
    cpus: number;
    memory_bytes: number;
    cpu_model: string | null;
  };
  project_health: ReturnType<typeof buildProjectHealthReport>;
  steps: StepReceipt[];
  telemetry_note: string;
};

function value(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function latestFile(directory: string, predicate: (name: string) => boolean, sinceMs: number): string | undefined {
  if (!fs.existsSync(directory)) return undefined;
  return fs.readdirSync(directory)
    .filter(predicate)
    .map((name) => {
      const file = path.join(directory, name);
      return { file, mtimeMs: fs.statSync(file).mtimeMs };
    })
    .filter((candidate) => candidate.mtimeMs >= sinceMs - 1_000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file;
}

function readJson(file: string | undefined): unknown {
  if (!file) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function safeGitHead(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const projectId = process.argv[2];
if (!projectId || projectId.startsWith("--")) {
  throw new Error(
    "Usage: pnpm benchmark-editor <projectId> [--base http://127.0.0.1:3124] "
    + "[--at 57] [--runs 5] [--skip-preview] [--preprocess] [--working-render] [--full-render]",
  );
}

const baseUrl = value("base", "http://127.0.0.1:3124").replace(/\/$/, "");
const parsedBase = new URL(baseUrl);
if (!["localhost", "127.0.0.1"].includes(parsedBase.hostname)) {
  throw new Error("--base must point to the local timeline editor");
}
const port = parsedBase.port || (parsedBase.protocol === "https:" ? "443" : "80");
const targetSeconds = value("at", "57");
const runs = value("runs", "5");
const label = value("label", "local").replace(/[^a-z0-9_-]/gi, "-");
const concurrency = value("concurrency", "2");
const renderScale = value("scale", "0.25");
const assetId = value("asset", "");
const startedAt = new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, "-");
const outputDir = path.join(projectDir(projectId), "preprocess", "editor-performance");
const outputPath = path.join(outputDir, `${stamp}-${label}.json`);
fs.mkdirSync(outputDir, { recursive: true });

const receipt: BenchmarkReceipt = {
  schema_version: 1,
  project_id: projectId,
  label,
  started_at: startedAt,
  status: "running",
  git_head: safeGitHead(),
  timeline_sha256: sha256(projectTimelinePath(projectId)),
  base_url: baseUrl,
  machine: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory_bytes: os.totalmem(),
    cpu_model: os.cpus()[0]?.model ?? null,
  },
  project_health: buildProjectHealthReport(projectId),
  steps: [],
  telemetry_note:
    "For CPU/GPU/media-engine/thermal evidence, run powermetrics separately with the privileges appropriate "
    + "to this machine; this orchestrator never prompts for sudo.",
};

function persist() {
  const temporary = `${outputPath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporary, outputPath);
}

function runStep(
  name: string,
  command: string[],
  evidence: (startedMs: number) => { path?: string; summary?: unknown } = () => ({}),
) {
  const started = Date.now();
  console.log(`\n[benchmark] ${name}`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  const found = evidence(started);
  const step: StepReceipt = {
    name,
    command,
    started_at: new Date(started).toISOString(),
    elapsed_ms: Date.now() - started,
    status: result.status === 0 ? "completed" : "failed",
    exit_code: result.status,
    ...(found.path ? { evidence_path: found.path } : {}),
    ...(found.summary !== undefined ? { summary: found.summary } : {}),
  };
  receipt.steps.push(step);
  if (step.status === "failed") {
    receipt.status = "failed";
    receipt.finished_at = new Date().toISOString();
    persist();
    throw new Error(`${name} failed; partial receipt: ${outputPath}`);
  }
  persist();
}

persist();

if (!has("skip-preview")) {
  const preflight = spawnSync(
    "curl",
    ["--fail", "--silent", "--show-error", "--max-time", "2", `${baseUrl}/`],
    { stdio: "ignore" },
  );
  if (preflight.status !== 0) {
    receipt.status = "failed";
    receipt.finished_at = new Date().toISOString();
    persist();
    throw new Error(`Timeline editor is not reachable at ${baseUrl}; start stable review before benchmarking`);
  }

  const previewDir = path.join(projectDir(projectId), "preprocess", "preview-first-load");
  runStep(
    "muted preview first-load",
    [
      "pnpm",
      "verify-preview-first-load",
      projectId,
      "--at",
      targetSeconds,
      "--runs",
      runs,
      "--port",
      port,
      "--label",
      `benchmark-${label}`,
    ],
    (started) => {
      const evidencePath = latestFile(
        previewDir,
        (name) => name.endsWith(".json") && name.includes(`benchmark-${label}`),
        started,
      );
      const body = readJson(evidencePath) as { summary?: unknown } | undefined;
      return { path: evidencePath, summary: body?.summary };
    },
  );
}

if (has("preprocess")) {
  const benchmarkDir = path.join(projectsRoot(), ".cache", "media-analysis", "benchmarks");
  runStep(
    "media preprocessing capacity",
    ["pnpm", "preprocess", "benchmark", projectId, ...(assetId ? [assetId] : [])],
    (started) => {
      const evidencePath = latestFile(
        benchmarkDir,
        (name) => name.endsWith(".json") && name.includes(`-${projectId}-`),
        started,
      );
      const body = readJson(evidencePath) as { recommended_ffmpeg_capacity_for_fixture?: unknown } | undefined;
      return {
        path: evidencePath,
        summary: body
          ? { recommended_ffmpeg_capacity_for_fixture: body.recommended_ffmpeg_capacity_for_fixture }
          : undefined,
      };
    },
  );
}

if (has("working-render")) {
  runStep("working render", [
    "pnpm",
    "render",
    projectId,
    "--base",
    baseUrl,
    "--scale",
    renderScale,
    "--concurrency",
    concurrency,
    "--image-format",
    "jpeg",
  ]);
}

if (has("full-render")) {
  runStep("full-resolution render", [
    "pnpm",
    "render",
    projectId,
    "--base",
    baseUrl,
    "--concurrency",
    concurrency,
    "--image-format",
    "png",
  ]);
}

receipt.status = "completed";
receipt.finished_at = new Date().toISOString();
receipt.project_health = buildProjectHealthReport(projectId);
persist();
console.log(`\nBenchmark complete: ${outputPath}`);
