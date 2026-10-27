/**
 * Print the hottest functions, long tasks, frames and GPU time from saved profiling output.
 *
 *   pnpm profile:summary <file>... [--top 15] [--json] [--stacks <function>]
 *
 * Accepts a V8 `.cpuprofile` (Node or Chrome), a DevTools trace (`*.trace.json`, or a Performance panel
 * export), a `profile:route` receipt, or a `benchmark-preview-playback` report (its saved CPU profiles
 * and traces are summarised in turn). `--stacks <function>` prints the heaviest call stacks that reach
 * that function in each CPU profile, for following a costly leaf up to the code that asked for it.
 * Minified chunks served by a running local editor are described
 * by a code excerpt at each position.
 */
import fs from "node:fs";
import path from "node:path";

import { formatCpuProfileSummary, scriptExcerptResolver, stacksTo, summarizeCpuProfile, type CpuProfile } from "@/lib/instruments/cpu-profile-summary";
import { formatDevtoolsTraceSummary, summarizeDevtoolsTrace } from "@/lib/instruments/devtools-trace-summary";

const args = process.argv.slice(2);
const files: string[] = [];
let top = 15, json = false, stacks: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--top") top = Number(args[++i]);
  else if (args[i] === "--json") json = true;
  else if (args[i] === "--stacks") stacks = args[++i];
  else files.push(args[i]);
}
if (!files.length || !Number.isInteger(top) || top < 1) {
  console.error("Usage: pnpm profile:summary <file.cpuprofile|trace.json|receipt.json|benchmark-report.json>... [--top 15] [--json]");
  process.exit(1);
}

const root = process.cwd();
const readScript = (url: string) => fetch(url, { signal: AbortSignal.timeout(5000) }).then((response) => response.ok ? response.text() : null).catch(() => null);
const output: Record<string, unknown> = {};

async function summarizeFile(file: string, title?: string): Promise<void> {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const name = title ?? path.relative(root, file);
  if (Array.isArray(data?.nodes)) {
    const profile = data as CpuProfile;
    // The route profiler's own harness frames wrap every call; leave them out of the rankings.
    const hide = (cost: { location: string }) => cost.location.startsWith("scripts/profile-route.ts");
    const summary = summarizeCpuProfile(profile, { top: Math.max(top, 25), root, resolve: await scriptExcerptResolver(profile, readScript), hide });
    output[name] = summary;
    if (!json) console.log(formatCpuProfileSummary(summary, { title: name, top }));
    if (stacks) {
      const found = stacksTo(profile, stacks, { root, hide: (frame) => frame.includes("scripts/profile-route.ts") });
      output[`${name} stacks to ${stacks}`] = found;
      if (!json) {
        console.log(found.length ? `  Stacks reaching ${stacks}` : `  No samples reach ${stacks}`);
        for (const entry of found) console.log(`    ${entry.ms.toFixed(1)} ms\n${entry.stack.map((frame) => `      ${frame}`).join("\n")}`);
      }
    }
  } else if (Array.isArray(data) || Array.isArray(data?.traceEvents)) {
    const summary = summarizeDevtoolsTrace(data, { top });
    output[name] = summary;
    if (!json) console.log(formatDevtoolsTraceSummary(summary, { title: name }));
  } else if (data?.summaries && data?.scenario) {
    // A profile:route receipt: its summaries are already computed.
    output[name] = { cold: data.cold, warm: data.warm, summaries: data.summaries };
    if (!json) {
      console.log(`${name}: ${data.label}`);
      console.log(`  cold ${data.cold.wallMs} ms; warm p50 ${data.warm?.wallP50Ms ?? "n/a"} ms`);
      console.log(formatCpuProfileSummary(data.summaries.cold, { title: "Cold call", top }));
      if (data.summaries.warm) console.log(formatCpuProfileSummary(data.summaries.warm, { title: "Warm calls", top }));
    }
  } else if (data?.schema === 2 && Array.isArray(data?.runs)) {
    // A benchmark-preview-playback report: summarise each profile and trace it saved.
    if (!json) console.log(`${name}: ${data.project} ${data.mode}; ${JSON.stringify(data.summary ?? {})}`);
    output[name] = { summary: data.summary ?? null };
    for (const run of data.runs) {
      for (const [key, label] of [["startupCpuProfile", "play to first motion CPU"], ["seekCpuProfile", "warm seek CPU"], ["seekTrace", "warm seek trace"], ["playbackTrace", "playback trace"]] as const) {
        const saved = run[key];
        if (typeof saved === "string" && fs.existsSync(saved)) await summarizeFile(saved, `run ${run.run} ${label}`);
      }
    }
  } else {
    throw new Error(`${name}: not a CPU profile, trace, route receipt or playback report`);
  }
}

async function main() {
  for (const file of files) {
    await summarizeFile(path.resolve(file));
    if (!json) console.log("");
  }
  if (json) console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
