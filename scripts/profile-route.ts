/**
 * Profile one editor server path in-process under the V8 CPU profiler and print its hottest functions.
 *
 * Profiling the live HTTP server mixes every tab's polling into one profile, so this imports the
 * route's own handler (or the library function behind it) and calls it directly, as the stable server
 * would: the first call is profiled as `cold` (module caches empty, code not yet optimized), the
 * remaining calls together as `warm`. Each call is also timed (wall and CPU) on its own.
 *
 * Reads a copy-on-write clone of the project by default (`cp -cpR`; other projects are linked so
 * referenced media resolves), so a route that refreshes caches or pending cards never writes the
 * creator's project. `--in-place` reads the real project instead.
 *
 *   pnpm profile:route <scenario> <projectId> [--proposal <id>] [--option <id>] [--runs 5]
 *     [--top 15] [--interval-us 200] [--in-place] [--if-none-match] [--json-out <file>]
 *
 * `--if-none-match` sends each warm GET the previous call's ETag, as the editor does, to time the 304 path.
 *
 * Scenarios: timeline, revision, library-presentation, proposals, proposals-details,
 * proposal-preview (needs --proposal), batch-preview (the editor's preview of selected cards together: every
 * pending card's first option, or --proposal <id,id,...>; cards that do not preview, alone or with the cards before them, are skipped and
 * named), spatial (the working cut, or the card's preview with --proposal),
 * agent-chat-load (the chat panel's read-only load: agent status, then saved history and each agent's models; never connects).
 *
 * Profiles (open in Chrome DevTools → Performance) and a receipt go to private/perf/route-profiles/.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { findSourceMap } from "node:module";
import inspector from "node:inspector/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { formatCpuProfileSummary, summarizeCpuProfile, type CpuProfile, type FrameResolver } from "@/lib/instruments/cpu-profile-summary";
import { projectsRoot } from "@/lib/local-store/paths";

process.setSourceMapsEnabled(true);

const SCENARIOS = ["timeline", "revision", "library-presentation", "proposals", "proposals-details", "proposal-preview", "batch-preview", "spatial", "memory", "agent-chat-load"] as const;
type Scenario = typeof SCENARIOS[number];

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const name = arg.slice(2);
    if (name === "in-place" || name === "if-none-match" || name === "list-previewable") flags[name] = true;
    else flags[name] = argv[++i] ?? "";
  }
  return { positional, flags };
}

const usage = `Usage: pnpm profile:route <${SCENARIOS.join("|")}> <projectId> [--proposal <id>] [--option <id>] [--runs 5] [--top 15] [--interval-us 200] [--in-place] [--if-none-match] [--json-out <file>]`;
const { positional, flags } = parseArgs(process.argv.slice(2));
const [scenario, projectId] = positional as [Scenario, string];
if (!SCENARIOS.includes(scenario) || !projectId || !/^[A-Za-z0-9._-]+$/.test(projectId) || positional.length > 2) {
  console.error(usage);
  process.exit(1);
}
const proposalId = typeof flags.proposal === "string" ? flags.proposal : undefined;
const optionId = typeof flags.option === "string" ? flags.option : undefined;
const runs = Number(flags.runs ?? 5);
const top = Number(flags.top ?? 15);
const intervalUs = Number(flags["interval-us"] ?? 200);
if (!Number.isInteger(runs) || runs < 1 || runs > 50 || !Number.isInteger(top) || top < 1 || !Number.isInteger(intervalUs) || intervalUs < 50) {
  console.error(usage);
  process.exit(1);
}
if (scenario === "proposal-preview" && !proposalId) {
  console.error("proposal-preview needs --proposal <id>");
  process.exit(1);
}

const root = process.cwd();
const sourceRoot = projectsRoot();
if (!fs.existsSync(path.join(sourceRoot, projectId, "timeline.json"))) {
  console.error(`No project ${projectId} under ${sourceRoot}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const listPreviewable = flags["list-previewable"] === true;
const outDir = path.join(root, "private/perf/route-profiles", `${stamp}-${scenario}-${projectId}`);
if (!listPreviewable) fs.mkdirSync(outDir, { recursive: true });

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

/** A copy-on-write clone of the project beside links to every other project. */
function cloneProjects(): string {
  const cloneRoot = path.join(root, "private/perf/clones", `${stamp}-${process.pid}`);
  fs.mkdirSync(cloneRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot)) {
    if (entry === projectId) continue;
    fs.symlinkSync(path.join(sourceRoot, entry), path.join(cloneRoot, entry));
  }
  // -c clones on APFS (instant, no extra bytes); -p keeps mtimes so nothing looks changed and re-prepares.
  execFileSync("cp", process.platform === "darwin" ? ["-cpR", path.join(sourceRoot, projectId), cloneRoot] : ["-pR", "--reflink=auto", path.join(sourceRoot, projectId), cloneRoot]);
  return cloneRoot;
}

sweepStaleClones(path.join(root, "private/perf/clones"));
const inPlace = flags["in-place"] === true;
const conditional = flags["if-none-match"] === true;
const cloneRoot = inPlace ? null : cloneProjects();
if (cloneRoot) process.env.TIMELINE_PROJECTS_DIR = cloneRoot;
// Preparation a read starts can still be writing into the clone; a later run's sweep removes what remains.
const removeClone = () => { if (cloneRoot) try { fs.rmSync(cloneRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* swept later */ } };

const routeFile = (relative: string) => pathToFileURL(path.join(root, "src/app/api/projects/[projectId]", relative)).href;
type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

/** Build the call for the scenario. Imports happen here, after TIMELINE_PROJECTS_DIR points at the clone. */
async function prepare(): Promise<{ label: string; skipped?: Array<{ proposal_id: string; error: string }>; call: () => Promise<{ status: number; bytes: number; serverTiming?: string; error?: string }> }> {
  const base = "http://127.0.0.1:3123";
  const route = async (relative: string, url: string, params: Record<string, string>) => {
    const module = await import(routeFile(relative)) as { GET: Handler };
    let etag: string | null = null;
    return {
      label: `GET ${url}${conditional ? " (If-None-Match)" : ""}`,
      call: async () => {
        // The editor's browser asks for compressed bodies; compression is part of the route's cost.
        const headers: Record<string, string> = { "accept-encoding": "gzip, deflate, br", ...(conditional && etag ? { "if-none-match": etag } : {}) };
        const response = await module.GET(new Request(base + url, { headers }), { params: Promise.resolve(params) });
        etag = response.headers.get("etag") ?? etag;
        const body = await response.arrayBuffer();
        // A failed call is still timed, but its message is reported so a 4xx/5xx is never mistaken for a result.
        const error = response.status >= 400 ? (() => { try { return String(JSON.parse(Buffer.from(body).toString("utf8")).error ?? ""); } catch { return ""; } })() : undefined;
        return { status: response.status, bytes: body.byteLength, serverTiming: response.headers.get("server-timing") ?? undefined, ...(error !== undefined ? { error } : {}) };
      },
    };
  };
  const project = { projectId };
  switch (scenario) {
    case "timeline": return route("timeline/route.ts", `/api/projects/${projectId}/timeline`, project);
    case "revision": return route("revision/route.ts", `/api/projects/${projectId}/revision`, project);
    case "library-presentation": return route("library-presentation/route.ts", `/api/projects/${projectId}/library-presentation`, project);
    case "proposals": return route("timeline/proposals/route.ts", `/api/projects/${projectId}/timeline/proposals`, project);
    case "proposals-details": return route("timeline/proposals/route.ts", `/api/projects/${projectId}/timeline/proposals?include=pending_details`, project);
    // The editing-memory page's history poll (EditingMemory.tsx), first page of chapters.
    case "memory": return route("memory/route.ts", `/api/projects/${projectId}/memory?view=page&section=history&chapters_limit=50`, project);
    case "proposal-preview": return route("timeline/proposals/[proposalId]/preview/route.ts", `/api/projects/${projectId}/timeline/proposals/${proposalId}/preview${optionId ? `?option=${encodeURIComponent(optionId)}` : ""}`, { projectId, proposalId: proposalId! });
    case "batch-preview": {
      // The editor's selected-edits preview: one option per card, the first unless --option names another.
      const { listProposals, readProposal } = await import("@/lib/local-store/proposals");
      const pending = proposalId ? proposalId.split(",") : listProposals(projectId, { status: "pending" }).map((record) => record.proposal_id);
      const selectionOf = (id: string) => {
        const options = readProposal(projectId, id).proposal.options;
        const option = options.find((candidate) => candidate.id === optionId) ?? options[0];
        return { proposal_id: id, option_id: option.id };
      };
      const module = await import(routeFile("timeline/proposals/batch/preview/route.ts")) as { POST: Handler };
      const url = `/api/projects/${projectId}/timeline/proposals/batch/preview`;
      const post = async (selections: Array<{ proposal_id: string; option_id: string }>) => {
        const response = await module.POST(new Request(base + url, { method: "POST", headers: { "content-type": "application/json", "accept-encoding": "gzip, deflate, br" }, body: JSON.stringify({ selections }) }), { params: Promise.resolve(project) });
        const body = await response.arrayBuffer();
        const error = response.status >= 400 ? (() => { try { return String(JSON.parse(Buffer.from(body).toString("utf8")).error ?? ""); } catch { return ""; } })() : undefined;
        return { status: response.status, bytes: body.byteLength, serverTiming: response.headers.get("server-timing") ?? undefined, ...(error !== undefined ? { error } : {}) };
      };
      if (listPreviewable) {
        // The child side of the check below: grow the selection one card at a time, keeping a card only
        // when the selection still previews with it, as a creator ticking cards in the editor would.
        const previewable: string[] = [], skipped: Array<{ proposal_id: string; error: string }> = [];
        for (const id of pending) {
          const result = await post([...previewable, id].map(selectionOf)).catch((error: Error) => ({ status: 500, error: error.message }));
          if (result.error === undefined) { previewable.push(id); continue; }
          const alone = previewable.length ? await post([selectionOf(id)]).catch((error: Error) => ({ status: 500, error: error.message })) : result;
          skipped.push({ proposal_id: id, error: alone.error === undefined ? `previews alone but not with the cards before it — ${result.error || `status ${result.status}`}` : alone.error || `status ${alone.status}` });
        }
        console.log(JSON.stringify({ previewable, skipped }));
        removeClone();
        process.exit(0);
      }
      // A card whose preview fails (an unprepared motion graphic, a stale card, visuals that overlap another
      // card's) would fail the whole batch. Find them in a child process so this one's caches stay cold.
      const childArgs = ["scripts/profile-route.ts", "batch-preview", projectId, "--list-previewable", ...(proposalId ? ["--proposal", proposalId] : []), ...(optionId ? ["--option", optionId] : [])];
      const check = JSON.parse(execFileSync(path.join(root, "node_modules/.bin/tsx"), childArgs, { cwd: root, encoding: "utf8", env: { ...process.env, TIMELINE_PROJECTS_DIR: sourceRoot } }).trim().split("\n").at(-1)!) as { previewable: string[]; skipped: Array<{ proposal_id: string; error: string }> };
      for (const entry of check.skipped) console.log(`skipped ${entry.proposal_id}: ${entry.error}`);
      const selections = check.previewable.map(selectionOf);
      if (!selections.length) throw new Error(`No pending proposal in ${projectId} previews on its own; pass --proposal <id,id,...>`);
      return {
        label: `POST ${url} (${selections.length} selected${check.skipped.length ? `, ${check.skipped.length} skipped` : ""})`,
        skipped: check.skipped,
        call: () => post(selections),
      };
    }
    case "agent-chat-load": {
      // What useDesktopChat sends on mount, minus the auto-connect (it opens an agent session and takes
      // the project's chat lease). Model listing starts Claude Code for initialization only: no turn, no credits.
      const status = await import(pathToFileURL(path.join(root, "src/app/api/agent-chat/status/route.ts")).href) as { GET: (request: Request) => Promise<Response> };
      const chat = await import(routeFile("agent-chat/route.ts")) as { POST: Handler };
      const origin = "http://127.0.0.1:3123", url = `/api/projects/${projectId}/agent-chat`;
      const post = async (body: Record<string, unknown>) => {
        const response = await chat.POST(new Request(origin + url, { method: "POST", headers: { "content-type": "application/json", host: "127.0.0.1:3123", origin }, body: JSON.stringify(body) }), { params: Promise.resolve(project) });
        return { response, text: await response.text() };
      };
      return {
        label: `GET /api/agent-chat/status, then POST ${url} history + models ×3`,
        call: async () => {
          const head = await status.GET(new Request(origin + "/api/agent-chat/status", { headers: { host: "127.0.0.1:3123" } }));
          const providers = (await head.json() as { providers?: Array<{ provider: string; available: boolean }> }).providers ?? [];
          const results = await Promise.all([post({ action: "history" }), ...providers.filter((item) => item.available).map((item) => post({ action: "models", provider: item.provider }))]);
          const failed = results.find((result) => result.response.status >= 400);
          return { status: failed?.response.status ?? head.status, bytes: results.reduce((sum, result) => sum + result.text.length, 0), ...(failed ? { error: failed.text.slice(0, 200) } : {}) };
        },
      };
    }
    case "spatial": {
      const { assessProjectSpatial } = await import("@/lib/local-store/spatial-assessment");
      const { readMetadata, readTimeline } = await import("@/lib/local-store/store");
      let input: { timeline: ReturnType<typeof readTimeline>; laneOrder?: string[]; output?: Parameters<typeof assessProjectSpatial>[3] };
      if (proposalId) {
        // Derive the card's preview once, outside the measurement; only the assessment is profiled.
        const { readProposal } = await import("@/lib/local-store/proposals");
        const { previewEditorAgentProposal } = await import("@/lib/agent/timeline-editor-agent-apply");
        const preview = previewEditorAgentProposal(readProposal(projectId, proposalId).proposal, optionId);
        input = { timeline: preview.timeline, laneOrder: preview.laneOrderKeys, output: preview.outputFormat };
      } else {
        // Without an output override the assessment reads the project's own format, as the routes do.
        input = { timeline: readTimeline(projectId), laneOrder: readMetadata(projectId).lane_order_keys };
      }
      return {
        label: `assessProjectSpatial(${projectId}${proposalId ? `, preview of ${proposalId}` : ""})`,
        call: async () => {
          const result = assessProjectSpatial(projectId, input.timeline, input.laneOrder, input.output);
          return { status: 200, bytes: Buffer.byteLength(JSON.stringify(result)) };
        },
      };
    }
  }
}

/** Map tsx-compiled positions back to the TypeScript source; leave other frames as V8 reports them. */
const resolveFrame: FrameResolver = (frame) => {
  if (!frame.url || frame.url.startsWith("node:")) return null;
  let map;
  try { map = findSourceMap(frame.url) ?? (frame.url.startsWith("file://") ? findSourceMap(new URL(frame.url).pathname) : undefined); } catch { return null; }
  if (!map) return null;
  const entry = map.findEntry(frame.lineNumber, frame.columnNumber) as { originalSource?: string; originalLine?: number; name?: string };
  if (!entry?.originalSource || entry.originalLine === undefined) return null;
  return { file: entry.originalSource, line: entry.originalLine + 1, ...(entry.name && !frame.functionName ? { name: entry.name } : {}) };
};

function withSourcePositions(profile: CpuProfile): CpuProfile {
  return {
    ...profile,
    nodes: profile.nodes.map((node) => {
      const resolved = resolveFrame(node.callFrame);
      if (!resolved) return node;
      const url = resolved.file.startsWith("file://") ? resolved.file : pathToFileURL(resolved.file).href;
      return { ...node, callFrame: { ...node.callFrame, ...(resolved.name ? { functionName: resolved.name } : {}), url, lineNumber: resolved.line - 1, columnNumber: Math.max(0, (resolved.column ?? 1) - 1) } };
    }),
  };
}

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)] : null;
};
const round = (value: number) => Math.round(value * 10) / 10;

async function main() {
  const { label, skipped, call } = await prepare();
  const session = new inspector.Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: intervalUs });

  const timings: Array<{ run: number; wallMs: number; cpuMs: number; status: number; bytes: number; serverTiming?: string; error?: string; heapDeltaMb: number }> = [];
  const timed = async (run: number) => {
    const heap = process.memoryUsage().heapUsed;
    const cpu = process.cpuUsage();
    const began = performance.now();
    const result = await call();
    const wallMs = performance.now() - began;
    const used = process.cpuUsage(cpu);
    timings.push({ run, wallMs: round(wallMs), cpuMs: round((used.user + used.system) / 1000), ...result, heapDeltaMb: round((process.memoryUsage().heapUsed - heap) / 1e6) });
  };

  await session.post("Profiler.start");
  await timed(0);
  const { profile: cold } = await session.post("Profiler.stop") as { profile: CpuProfile };
  let warm: CpuProfile | null = null;
  if (runs > 1) {
    await session.post("Profiler.start");
    for (let run = 1; run < runs; run++) await timed(run);
    warm = (await session.post("Profiler.stop") as { profile: CpuProfile }).profile;
  }
  session.disconnect();

  // Saved with original TypeScript positions, so a later summary or DevTools needs no source maps.
  fs.writeFileSync(path.join(outDir, "cold.cpuprofile"), JSON.stringify(withSourcePositions(cold)));
  if (warm) fs.writeFileSync(path.join(outDir, "warm.cpuprofile"), JSON.stringify(withSourcePositions(warm)));
  const hide = (cost: { location: string }) => cost.location.startsWith("scripts/profile-route.ts");
  const coldSummary = summarizeCpuProfile(cold, { top: 40, root, resolve: resolveFrame, hide });
  const warmSummary = warm ? summarizeCpuProfile(warm, { top: 40, root, resolve: resolveFrame, hide }) : null;
  const warmRuns = timings.slice(1);
  const receipt = {
    schema: 1,
    scenario,
    project: projectId,
    proposal: proposalId ?? null,
    option: optionId ?? null,
    label,
    ...(skipped?.length ? { skipped } : {}),
    started: stamp,
    machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, load: os.loadavg().map(round), node: process.version },
    isolation: cloneRoot ? "copy-on-write clone" : "in place",
    samplingIntervalUs: intervalUs,
    cold: timings[0],
    warm: warmRuns.length ? {
      runs: warmRuns.length,
      wallP50Ms: quantile(warmRuns.map((t) => t.wallMs), 0.5),
      wallP95Ms: quantile(warmRuns.map((t) => t.wallMs), 0.95),
      wallMaxMs: Math.max(...warmRuns.map((t) => t.wallMs)),
      cpuP50Ms: quantile(warmRuns.map((t) => t.cpuMs), 0.5),
      statuses: [...new Set(warmRuns.map((t) => t.status))],
    } : null,
    timings,
    profiles: { cold: path.join(outDir, "cold.cpuprofile"), warm: warm ? path.join(outDir, "warm.cpuprofile") : null },
    summaries: { cold: coldSummary, warm: warmSummary },
  };
  fs.writeFileSync(path.join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  if (typeof flags["json-out"] === "string") fs.writeFileSync(path.resolve(String(flags["json-out"])), JSON.stringify(receipt));

  console.log(`${label}  (${receipt.isolation}; load ${receipt.machine.load.join(" ")})`);
  const first = timings[0];
  console.log(`cold: ${first.wallMs} ms wall, ${first.cpuMs} ms CPU, ${first.status}, ${first.bytes} B${first.serverTiming ? `, server-timing ${first.serverTiming}` : ""}`);
  if (first.error !== undefined) console.log(`cold call failed: ${first.error || "(no message)"}`);
  if (receipt.warm) console.log(`warm ×${receipt.warm.runs}: p50 ${receipt.warm.wallP50Ms} ms, p95 ${receipt.warm.wallP95Ms} ms, max ${receipt.warm.wallMaxMs} ms wall; CPU p50 ${receipt.warm.cpuP50Ms} ms; status ${receipt.warm.statuses.join("/")}`);
  console.log("");
  console.log(formatCpuProfileSummary(coldSummary, { title: "Cold call", top }));
  if (warmSummary) {
    console.log("");
    console.log(formatCpuProfileSummary(warmSummary, { title: `Warm calls (${warmRuns.length} together)`, top }));
  }
  console.log("");
  console.log(`Profiles and receipt: ${path.relative(root, outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(removeClone);
