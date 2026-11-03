/**
 * Recurring local performance check: profile the slow server paths and benchmark preview playback on a
 * few fixed real projects, compare against saved baselines, and report regressions with the functions
 * that cost the most. Runs on this machine (by hand or on a local schedule), never in CI.
 *
 *   pnpm perf:check [--only <workload>] [--no-browser] [--no-routes] [--update-baseline]
 *
 * Workloads are the creator's own projects, so they live in private/perf/perf-check.json (never
 * committed); the first run writes a template there. Baselines are machine-specific and live in
 * private/perf/baselines.json; the first run of each metric becomes its baseline, and
 * `--update-baseline` replaces them after an accepted change. Reports go to private/perf/checks/.
 *
 * Every read is of a copy-on-write clone. Browser runs use a private stable server (the newest
 * existing build, never a new one) on a free port, so the creator's editor on 3123 is untouched.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fingerprintReviewBuild } from "@/lib/instruments/review-build-cache";
import { projectsRoot } from "@/lib/local-store/paths";

import { freePort, freshSlot, latestSlot, slotFingerprint, startServer, waitForServer } from "./stable-editor";

type RouteScenario = "timeline" | "revision" | "library-presentation" | "proposals" | "proposals-details" | "proposal-preview" | "batch-preview" | "spatial" | "memory" | "agent-chat-load";
type Workload = {
  name: string;
  project: string;
  proposal?: string;
  option?: string;
  /** A scenario, optionally followed by profile:route flags, e.g. "timeline --if-none-match" (the polled 304 path). */
  routes: Array<RouteScenario | `${RouteScenario} ${string}`>;
  playback?: boolean;
};
type Config = {
  workloads: Workload[];
  routeRuns: number;
  playback: { coldRuns: number; warmRuns: number; limitSeconds: number; traceSeconds: number; engine: "standard" | "rust"; mode: "gpu" | "selective" };
  /** A metric regresses when it exceeds baseline × ratio and by at least minMs. */
  tolerance: { ratio: number; minMs: number };
};
type Metric = { value: number; unit: "ms" | "count"; top: Array<{ name: string; location: string; ms: number }> };
type Baselines = { machine: string; metrics: Record<string, Metric & { recorded: string }> };

const root = process.cwd();
const perfDir = path.join(root, "private/perf");
const configPath = path.join(perfDir, "perf-check.json");
const baselinePath = path.join(perfDir, "baselines.json");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const noBrowser = args.includes("--no-browser");
const noRoutes = args.includes("--no-routes");
const updateBaseline = args.includes("--update-baseline");

const TEMPLATE: Config = {
  workloads: [
    { name: "large-captions", project: "<project with a long word-timed caption rail>", routes: ["timeline", "proposals-details", "revision", "library-presentation", "spatial"], playback: true },
    { name: "heavy-pieces", project: "<project with many drawn or motion pieces>", routes: ["timeline", "proposals-details", "spatial"], playback: true },
    { name: "heavy-card", project: "<project with a large pending card>", proposal: "<pending proposal id>", routes: ["proposal-preview"], playback: false },
    // A card built from blocks (option.blocks) compiles again on every preview; this watches that cost.
    { name: "block-card", project: "<project with a pending block-built card>", proposal: "<pending proposal id>", routes: ["proposal-preview"], playback: false },
  ],
  routeRuns: 5,
  playback: { coldRuns: 2, warmRuns: 5, limitSeconds: 20, traceSeconds: 5, engine: "standard", mode: "gpu" },
  tolerance: { ratio: 1.3, minMs: 25 },
};

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as T; } catch { return null; }
}

/** Run a step to completion, or stop it after `timeoutMs` so one hung step cannot stall the check. */
function run(command: string, commandArgs: string[], env: NodeJS.ProcessEnv, timeoutMs = 15 * 60_000): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 10_000).unref(); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr: timedOut ? `${stderr}\nStopped after ${Math.round(timeoutMs / 60_000)} min` : stderr, timedOut }); });
  });
}

const tsx = path.join(root, "node_modules/.bin/tsx");
const topOf = (summary: any, count = 5) => (summary?.bySelf ?? []).slice(0, count).map((cost: any) => ({ name: cost.name, location: cost.location, ms: cost.selfMs }));

async function routeMetrics(workload: Workload, config: Config, metrics: Record<string, Metric>, notes: string[]) {
  for (const entry of workload.routes) {
    const [scenario, ...extra] = entry.split(/\s+/);
    const out = path.join(os.tmpdir(), `dreamcut-perf-${process.pid}-${workload.name}-${entry.replace(/[^a-z0-9-]+/gi, "_")}.json`);
    const flags = [...(workload.proposal && (scenario === "proposal-preview" || scenario === "spatial") ? ["--proposal", workload.proposal] : []), ...(workload.option ? ["--option", workload.option] : []), ...extra];
    process.stdout.write(`  ${workload.name} ${entry} … `);
    const result = await run(tsx, ["scripts/profile-route.ts", scenario, workload.project, ...flags, "--runs", String(config.routeRuns), "--json-out", out], process.env);
    const receipt = readJson<any>(out);
    fs.rmSync(out, { force: true });
    if (result.code !== 0 || !receipt) {
      console.log("failed");
      notes.push(`${workload.name} ${entry}: profiler failed — ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ")}`);
      continue;
    }
    for (const skipped of receipt.skipped ?? []) notes.push(`${workload.name} ${entry}: skipped ${skipped.proposal_id}: ${skipped.error}`);
    if (receipt.cold.error !== undefined) notes.push(`${workload.name} ${entry}: route answered ${receipt.cold.status}: ${receipt.cold.error}`);
    // CPU time, not wall time: it swings far less when other sessions load the machine.
    const key = `${workload.name}/${entry.replace(/\s+--/g, "+")}`;
    metrics[`${key}/cold_cpu_ms`] = { value: receipt.cold.cpuMs, unit: "ms", top: topOf(receipt.summaries.cold) };
    // Wall time too for the cold call: child processes it waits on (ffprobe) are not this process's CPU.
    metrics[`${key}/cold_wall_ms`] = { value: receipt.cold.wallMs, unit: "ms", top: topOf(receipt.summaries.cold) };
    if (receipt.warm) metrics[`${key}/warm_cpu_p50_ms`] = { value: receipt.warm.cpuP50Ms, unit: "ms", top: topOf(receipt.summaries.warm) };
    console.log(`cold ${receipt.cold.wallMs} ms (${receipt.cold.cpuMs} CPU), warm p50 ${receipt.warm?.wallP50Ms ?? "n/a"} ms`);
  }
}

/**
 * Remove clone folders under private/perf/clones left by earlier runs. Preparation jobs a read starts
 * (still previews) can outlive the run and recreate a few files after its clone is removed.
 * rmSync removes links without following them, so linked projects are never touched.
 */
function sweepStaleClones(clonesDir: string, olderThanMs = 30 * 60_000) {
  if (!fs.existsSync(clonesDir)) return;
  for (const entry of fs.readdirSync(clonesDir)) {
    const target = path.join(clonesDir, entry);
    try { if (Date.now() - fs.lstatSync(target).mtimeMs > olderThanMs) fs.rmSync(target, { recursive: true, force: true }); } catch { /* another run owns it */ }
  }
}

/** Clone the browser workloads' projects (copy-on-write) beside links to every other project. */
function cloneProjects(projects: string[]): string {
  const source = projectsRoot();
  const cloneRoot = path.join(perfDir, "clones", `check-${Date.now()}-${process.pid}`);
  fs.mkdirSync(cloneRoot, { recursive: true });
  for (const entry of fs.readdirSync(source)) if (!projects.includes(entry)) fs.symlinkSync(path.join(source, entry), path.join(cloneRoot, entry));
  for (const project of projects) execFileSync("cp", process.platform === "darwin" ? ["-cpR", path.join(source, project), cloneRoot] : ["-pR", "--reflink=auto", path.join(source, project), cloneRoot]);
  return cloneRoot;
}

async function playbackMetrics(workloads: Workload[], config: Config, metrics: Record<string, Metric>, notes: string[]) {
  const slot = freshSlot(root, fingerprintReviewBuild(root)) ?? latestSlot(root);
  if (!slot) { notes.push("Browser checks skipped: no stable editor build exists yet (start `pnpm editor` once)."); return; }
  if (slotFingerprint(root, slot) !== fingerprintReviewBuild(root)) notes.push("Browser checks ran on the newest stable build, which predates the current editor code.");
  const cloneRoot = cloneProjects(workloads.map((workload) => workload.project));
  const port = await freePort();
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = cloneRoot;
  const server = startServer(root, slot, port, "stable", `perf-${port}`, "ignore");
  if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
  try {
    await waitForServer(port);
    for (const workload of workloads) {
      process.stdout.write(`  ${workload.name} playback … `);
      const env = {
        ...process.env,
        TIMELINE_PROJECTS_DIR: cloneRoot,
        TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${port}`,
        DREAMCUT_BENCHMARK_RUNS: String(config.playback.coldRuns),
        DREAMCUT_BENCHMARK_WARM_RUNS: String(config.playback.warmRuns),
        DREAMCUT_BENCHMARK_PLAYBACK_LIMIT_SECONDS: String(config.playback.limitSeconds),
      };
      const reportOf = (output: string) => readJson<any>(output.trim().split("\n").filter((line) => line.endsWith(".json")).at(-1) ?? "");
      // The renderer fallback a failed run's page showed, if any.
      const fallbackOf = (report: any) => {
        const failed = report?.runs?.find((entry: any) => entry.error);
        return (typeof failed?.body === "string" ? failed.body.match(/Graphics card preview unavailable[^\n]*/)?.[0] : undefined)
          ?? (/fell back/.test(failed?.error ?? "") ? failed.error : undefined);
      };
      // On a loaded machine the GPU worker can miss its 30 s start limit and the player falls back to the
      // Browser renderer; that run measures nothing, so a pass that fell back runs once more.
      const bench = async (label: string, passEnv: NodeJS.ProcessEnv) => {
        let pass = await run(tsx, ["scripts/benchmark-preview-playback.ts", workload.project, config.playback.engine, config.playback.mode], passEnv);
        let report = reportOf(pass.stdout);
        const fallback = pass.code !== 0 ? fallbackOf(report) : undefined;
        if (fallback) {
          notes.push(`${workload.name} ${label}: GPU preview fell back (${fallback}); ran the pass again`);
          pass = await run(tsx, ["scripts/benchmark-preview-playback.ts", workload.project, config.playback.engine, config.playback.mode], passEnv);
          report = reportOf(pass.stdout);
        }
        return { pass, report };
      };
      // Timing pass without instrumentation, then one profiled pass: profiling perturbs the timings.
      const { pass: timing, report: timingReport } = await bench("timing pass", env);
      if (timing.code !== 0 || !timingReport?.summary) {
        console.log("failed");
        // Name the phase, and a renderer fallback the page showed: a timeout alone hides the cause.
        const failedRun = timingReport?.runs?.find((entry: any) => entry.error) ?? timingReport?.runs?.[0];
        const fallback = fallbackOf(timingReport);
        notes.push(`${workload.name} playback failed${failedRun?.phase ? ` in ${failedRun.phase}` : ""}${timing.timedOut ? " (timed out)" : ""}: ${fallback ?? timingReport?.error ?? timing.stderr.trim().split("\n").slice(-2).join(" ")}`);
        continue;
      }
      // Profiled passes after the timing pass: playback (startup CPU, a trace of the first seconds) and a
      // warm seek (its CPU and trace) run apart, since a playback trace leaves the page too slow to seek.
      const { pass: playbackPass, report: playbackReport } = await bench("playback profile", {
        ...env, DREAMCUT_BENCHMARK_RUNS: "1", DREAMCUT_BENCHMARK_WARM_RUNS: "0", DREAMCUT_BENCHMARK_CPU_PROFILE: "1", DREAMCUT_BENCHMARK_PLAYBACK_TRACE_SECONDS: String(config.playback.traceSeconds),
      });
      const { pass: seekPass, report: seekReport } = await bench("seek profile", {
        ...env, DREAMCUT_BENCHMARK_RUNS: "1", DREAMCUT_BENCHMARK_WARM_RUNS: "2", DREAMCUT_BENCHMARK_CPU_SEEK_INDEX: "1", DREAMCUT_BENCHMARK_CPU_PROFILE: "1", DREAMCUT_BENCHMARK_SEEK_TRACE: "1",
      });
      const playbackRun = playbackReport?.runs?.[0];
      const seekRun = seekReport?.runs?.[0];
      for (const [label, pass, report, entry] of [["playback profile", playbackPass, playbackReport, playbackRun], ["seek profile", seekPass, seekReport, seekRun]] as const) {
        if (pass.code !== 0 || !entry) notes.push(`${workload.name} ${label}: pass failed${pass.timedOut ? " (timed out)" : ""}${entry?.phase ? ` in ${entry.phase}` : ""}${entry?.pageCrashed ? " (page crashed)" : ""}: ${fallbackOf(report) ?? entry?.error ?? report?.error ?? pass.stderr.trim().split("\n").slice(-2).join(" ")}`);
      }
      const profiled = { startupCpuSummary: playbackRun?.startupCpuSummary, playbackTraceSummary: playbackRun?.playbackTraceSummary, seekCpuSummary: seekRun?.seekCpuSummary };
      const key = `${workload.name}/playback`;
      const summary = timingReport.summary;
      const startupTop = topOf(profiled?.startupCpuSummary);
      const seekTop = topOf(profiled?.seekCpuSummary);
      const trace = profiled?.playbackTraceSummary;
      const traceTop = (trace?.mainThread?.functions ?? []).slice(0, 5).map((item: any) => ({ name: item.name, location: "", ms: item.selfMs }));
      const firstRun = timingReport.runs[0] ?? {};
      if (summary.coldPlayP95 !== null) metrics[`${key}/cold_first_motion_ms`] = { value: Math.round(summary.coldPlayP95), unit: "ms", top: startupTop };
      if (summary.warmSeekP95 !== null) metrics[`${key}/warm_seek_p95_ms`] = { value: Math.round(summary.warmSeekP95), unit: "ms", top: seekTop };
      if (summary.warmPlayP95 !== null) metrics[`${key}/warm_play_p95_ms`] = { value: Math.round(summary.warmPlayP95), unit: "ms", top: startupTop };
      metrics[`${key}/playback_stalls`] = { value: (firstRun.playbackStallsMs ?? []).length, unit: "count", top: traceTop };
      if (firstRun.gpuProcessing) metrics[`${key}/gpu_frame_p95_ms`] = { value: Math.round(firstRun.gpuProcessing.p95Ms * 10) / 10, unit: "ms", top: traceTop };
      if (trace) {
        metrics[`${key}/trace_blocking_ms`] = { value: trace.longTasks.blockingMs, unit: "ms", top: traceTop };
        if (trace.frames.dropped !== null) metrics[`${key}/trace_dropped_frames`] = { value: trace.frames.dropped, unit: "count", top: traceTop };
        metrics[`${key}/trace_long_frames`] = { value: trace.frames.longFrames, unit: "count", top: traceTop };
        if (trace.gpu.perFrameMs !== null) metrics[`${key}/trace_gpu_process_per_frame_ms`] = { value: trace.gpu.perFrameMs, unit: "ms", top: (trace.gpu.threads ?? []).flatMap((thread: any) => thread.topBySelf.slice(0, 2).map((item: any) => ({ name: item.name, location: thread.thread, ms: item.selfMs }))).slice(0, 5) };
      }
      console.log(`first motion p95 ${Math.round(summary.coldPlayP95)} ms, warm seek p95 ${Math.round(summary.warmSeekP95 ?? NaN)} ms, stalls ${(firstRun.playbackStallsMs ?? []).length}`);
    }
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => { server.once("exit", resolve); setTimeout(resolve, 10_000); });
    fs.rmSync(cloneRoot, { recursive: true, force: true });
  }
}

function compare(metrics: Record<string, Metric>, baselines: Baselines, tolerance: Config["tolerance"]) {
  const regressions: string[] = [], improvements: string[] = [], fresh: string[] = [];
  for (const [key, metric] of Object.entries(metrics)) {
    const base = baselines.metrics[key];
    if (!base) { fresh.push(key); continue; }
    // Counts (stalls, dropped frames) regress by any increase beyond the ratio and at least 2.
    const floor = metric.unit === "count" ? 2 : tolerance.minMs;
    if (metric.value > base.value * tolerance.ratio && metric.value - base.value >= floor) {
      const before = new Map(base.top.map((item) => [`${item.name}|${item.location}`, item.ms]));
      const grew = metric.top.map((item) => ({ ...item, delta: item.ms - (before.get(`${item.name}|${item.location}`) ?? 0) })).sort((a, b) => b.delta - a.delta);
      regressions.push(`${key}: ${base.value} → ${metric.value} ${metric.unit}\n${grew.map((item) => `      ${item.ms.toFixed(1)} ms (${item.delta >= 0 ? "+" : ""}${item.delta.toFixed(1)})  ${item.name}  ${item.location}`).join("\n")}`);
    } else if (metric.value * tolerance.ratio < base.value && base.value - metric.value >= floor) improvements.push(`${key}: ${base.value} → ${metric.value} ${metric.unit}`);
  }
  return { regressions, improvements, fresh };
}

async function main() {
  fs.mkdirSync(perfDir, { recursive: true });
  sweepStaleClones(path.join(perfDir, "clones"));
  const config = readJson<Config>(configPath);
  if (!config) {
    fs.writeFileSync(configPath, `${JSON.stringify(TEMPLATE, null, 2)}\n`);
    console.log(`Wrote a template to ${path.relative(root, configPath)}; name real projects in it and run again.`);
    process.exitCode = 2;
    return;
  }
  const workloads = config.workloads.filter((workload) => !only || workload.name === only);
  if (!workloads.length) throw new Error(only ? `No workload named ${only}` : "No workloads configured");
  const load = os.loadavg();
  const notes: string[] = [];
  if (load[0] > os.cpus().length * 0.5) notes.push(`Machine load ${load[0].toFixed(1)} on ${os.cpus().length} cores: timings may be inflated; rerun when it settles before trusting a regression.`);
  const started = new Date().toISOString();
  const metrics: Record<string, Metric> = {};
  console.log(`Performance check ${started} (load ${load.map((value) => value.toFixed(1)).join(" ")})`);
  if (!noRoutes) {
    console.log("Server paths (CPU profiler, in process, on clones):");
    for (const workload of workloads) await routeMetrics(workload, config, metrics, notes);
  }
  const browserWorkloads = workloads.filter((workload) => workload.playback);
  if (!noBrowser && browserWorkloads.length) {
    console.log("Preview playback (headless Chrome, private stable server, on clones):");
    await playbackMetrics(browserWorkloads, config, metrics, notes);
  }

  const machine = `${os.cpus()[0]?.model} ×${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB`;
  const baselines = readJson<Baselines>(baselinePath) ?? { machine, metrics: {} };
  if (baselines.machine !== machine) notes.push(`Baselines were recorded on ${baselines.machine}; this machine is ${machine}.`);
  const result = compare(metrics, baselines, config.tolerance);
  for (const [key, metric] of Object.entries(metrics)) {
    if (updateBaseline || !baselines.metrics[key]) baselines.metrics[key] = { ...metric, recorded: started };
  }
  baselines.machine = machine;
  fs.writeFileSync(baselinePath, `${JSON.stringify(baselines, null, 2)}\n`);

  const report = { schema: 1, started, finished: new Date().toISOString(), machine, load, workloads, metrics, ...result, notes, baselineUpdated: updateBaseline };
  const checksDir = path.join(perfDir, "checks");
  fs.mkdirSync(checksDir, { recursive: true });
  const reportPath = path.join(checksDir, `${started.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("");
  if (result.regressions.length) {
    console.log(`Regressions (${result.regressions.length}), with the top functions now and their change since baseline:`);
    for (const line of result.regressions) console.log(`  ${line}`);
  } else console.log("No regressions against the baselines.");
  if (result.improvements.length) { console.log("Improvements:"); for (const line of result.improvements) console.log(`  ${line}`); }
  if (result.fresh.length) console.log(`New baselines recorded: ${result.fresh.length} metric${result.fresh.length === 1 ? "" : "s"}.`);
  console.log("Top costs now:");
  for (const [key, metric] of Object.entries(metrics)) {
    const first = metric.top[0];
    console.log(`  ${key}: ${metric.value} ${metric.unit}${first ? ` — ${first.name} ${first.location} ${first.ms} ms` : ""}`);
  }
  for (const note of notes) console.log(`note: ${note}`);
  console.log(`Report: ${path.relative(root, reportPath)}`);
  if (result.regressions.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
