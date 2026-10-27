/**
 * Summarise a Chrome DevTools trace (`Tracing.start` / Performance panel JSON) into what makes the
 * editor feel slow: long main-thread tasks and what ran inside them, frames presented, dropped and
 * late, and where the renderer, compositor and GPU process spent their time per frame.
 *
 * Works from whichever categories the trace recorded. Frame states need `benchmark` or
 * `graphics.pipeline` (PipelineReporter); frame intervals need `disabled-by-default-devtools.timeline.frame`
 * (DrawFrame); GPU work needs `gpu`, `viz` or `disabled-by-default-gpu.service`. A missing category
 * leaves its section empty and says so in `coverage`.
 */

export type TraceEvent = {
  name: string;
  cat?: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  id?: string | number;
  id2?: { local?: string; global?: string };
  args?: Record<string, any>;
};

export type TraceFile = TraceEvent[] | { traceEvents: TraceEvent[]; metadata?: Record<string, unknown> };

type Slice = { name: string; ts: number; dur: number; self: number; depth: number; args?: Record<string, any>; children: Slice[] };

export type ThreadCost = { thread: string; process: string; busyMs: number; topBySelf: Array<{ name: string; selfMs: number }> };

export type LongTask = { startMs: number; durationMs: number; inside: Array<{ name: string; selfMs: number }> };

export type TraceSummary = {
  durationMs: number;
  coverage: string[];
  mainThread: { thread: string; busyMs: number; busyPercent: number; topBySelf: Array<{ name: string; selfMs: number }>; functions: Array<{ name: string; selfMs: number }> } | null;
  longTasks: { count: number; totalMs: number; blockingMs: number; longest: LongTask[] };
  frames: {
    /** PipelineReporter outcomes for the page's compositor, when recorded. */
    presented: number | null;
    dropped: number | null;
    partial: number | null;
    /** Intervals between the page's DrawFrame events. */
    drawn: number;
    intervalP50Ms: number | null;
    intervalP95Ms: number | null;
    intervalMaxMs: number | null;
    /** Intervals longer than 1.5 frame budgets of the median interval (at least 1.5 × 16.7 ms). */
    longFrames: number;
    longFrameMs: number[];
  };
  gpu: { busyMs: number; perFrameMs: number | null; threads: ThreadCost[] };
  threads: ThreadCost[];
};

const LONG_TASK_MS = 50;

function events(trace: TraceFile): TraceEvent[] {
  return Array.isArray(trace) ? trace : trace.traceEvents ?? [];
}

/** Rebuild nested slices per thread from complete (X) and begin/end (B/E) events. */
function slicesByThread(all: TraceEvent[]): Map<string, Slice[]> {
  const raw = new Map<string, Array<{ name: string; ts: number; dur: number; args?: Record<string, any> }>>();
  const open = new Map<string, TraceEvent[]>();
  const push = (key: string, slice: { name: string; ts: number; dur: number; args?: Record<string, any> }) => {
    let list = raw.get(key);
    if (!list) raw.set(key, list = []);
    list.push(slice);
  };
  for (const event of all) {
    const key = `${event.pid}:${event.tid}`;
    if (event.ph === "X" && typeof event.dur === "number") push(key, { name: event.name, ts: event.ts, dur: event.dur, args: event.args });
    else if (event.ph === "B") {
      let stack = open.get(key);
      if (!stack) open.set(key, stack = []);
      stack.push(event);
    } else if (event.ph === "E") {
      const begin = open.get(key)?.pop();
      if (begin) push(key, { name: begin.name, ts: begin.ts, dur: Math.max(0, event.ts - begin.ts), args: { ...begin.args, ...event.args } });
    }
  }
  const result = new Map<string, Slice[]>();
  for (const [key, list] of raw) {
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const roots: Slice[] = [];
    const stack: Slice[] = [];
    for (const item of list) {
      while (stack.length && stack.at(-1)!.ts + stack.at(-1)!.dur <= item.ts) stack.pop();
      const slice: Slice = { ...item, self: item.dur, depth: stack.length, children: [] };
      const parent = stack.at(-1);
      if (parent && item.ts + item.dur <= parent.ts + parent.dur + 1) {
        parent.children.push(slice);
        parent.self -= item.dur;
      } else if (parent) {
        // Overlapping but not nested (clock skew): treat as a sibling root.
        slice.depth = 0;
        roots.push(slice);
        stack.length = 0;
      } else roots.push(slice);
      stack.push(slice);
    }
    result.set(key, roots);
  }
  return result;
}

function walk(slices: Slice[], visit: (slice: Slice) => void) {
  const stack = [...slices];
  while (stack.length) {
    const slice = stack.pop()!;
    visit(slice);
    for (const child of slice.children) stack.push(child);
  }
}

/** Name for an event, with the JS function for FunctionCall-like events. */
function label(slice: Slice): string {
  const data = slice.args?.data;
  if ((slice.name === "FunctionCall" || slice.name === "EvaluateScript" || slice.name === "v8.callFunction") && data) {
    const fn = data.functionName || "(anonymous)";
    const where = typeof data.url === "string" && data.url ? ` ${shortUrl(data.url)}:${(data.lineNumber ?? 0) + 1}` : "";
    return `${slice.name} ${fn}${where}`;
  }
  if (slice.name === "TimerFire" || slice.name === "FireAnimationFrame" || slice.name === "EventDispatch") {
    const type = data?.type ? ` ${data.type}` : "";
    return `${slice.name}${type}`;
  }
  return slice.name;
}

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/_next\/static\//, "");
  } catch { return url; }
}

const round = (us: number) => Math.round(us / 10) / 100;

function selfByName(slices: Slice[], options: { functionsOnly?: boolean } = {}) {
  const totals = new Map<string, number>();
  walk(slices, (slice) => {
    if (options.functionsOnly && !slice.name.startsWith("FunctionCall") && slice.name !== "EvaluateScript" && slice.name !== "v8.callFunction") return;
    const key = options.functionsOnly ? label(slice) : slice.name;
    // For function attribution use inclusive time; nested FunctionCalls are rare at top level.
    const value = options.functionsOnly ? slice.dur : slice.self;
    totals.set(key, (totals.get(key) ?? 0) + value);
  });
  return [...totals].sort((a, b) => b[1] - a[1]);
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))];
}

export function summarizeDevtoolsTrace(trace: TraceFile, options: { top?: number; longTasks?: number } = {}): TraceSummary {
  const top = options.top ?? 12;
  const all = events(trace).filter((event) => event && typeof event.ts === "number");
  const threadNames = new Map<string, string>();
  const processNames = new Map<number, string>();
  for (const event of all) {
    if (event.ph !== "M") continue;
    if (event.name === "thread_name") threadNames.set(`${event.pid}:${event.tid}`, String(event.args?.name ?? ""));
    if (event.name === "process_name") processNames.set(event.pid, String(event.args?.name ?? ""));
  }
  const timed = all.filter((event) => event.ph !== "M" && event.ts > 0);
  // A loop, not Math.min(...): a trace can hold millions of events.
  let start = Infinity, end = -Infinity;
  for (const event of timed) {
    if (event.ts < start) start = event.ts;
    if (event.ts + (event.dur ?? 0) > end) end = event.ts + (event.dur ?? 0);
  }
  const durationUs = timed.length ? end - start : 0;
  const coverage: string[] = [];
  const categories = new Set(timed.flatMap((event) => (event.cat ?? "").split(",")));

  const slices = slicesByThread(timed);
  const threadCost = (key: string): ThreadCost => {
    const roots = slices.get(key) ?? [];
    const [pid] = key.split(":");
    return {
      thread: threadNames.get(key) ?? key,
      process: processNames.get(Number(pid)) ?? `pid ${pid}`,
      busyMs: round(roots.reduce((sum, slice) => sum + slice.dur, 0)),
      topBySelf: selfByName(roots).slice(0, top).map(([name, self]) => ({ name, selfMs: round(self) })),
    };
  };

  // The page's main thread: the busiest CrRendererMain.
  const mains = [...slices.keys()].filter((key) => threadNames.get(key) === "CrRendererMain");
  const busy = (key: string) => (slices.get(key) ?? []).reduce((sum, slice) => sum + slice.dur, 0);
  const mainKey = mains.sort((a, b) => busy(b) - busy(a))[0];
  const mainPid = mainKey ? Number(mainKey.split(":")[0]) : null;
  let mainThread: TraceSummary["mainThread"] = null;
  const longest: LongTask[] = [];
  let longCount = 0, longTotal = 0, blocking = 0;
  if (mainKey) {
    const roots = slices.get(mainKey)!;
    const cost = threadCost(mainKey);
    mainThread = {
      thread: cost.thread,
      busyMs: cost.busyMs,
      busyPercent: durationUs ? Math.round((busy(mainKey) / durationUs) * 1000) / 10 : 0,
      topBySelf: cost.topBySelf,
      functions: selfByName(roots, { functionsOnly: true }).slice(0, top).map(([name, self]) => ({ name, selfMs: round(self) })),
    };
    const tasks = roots.filter((slice) => slice.dur >= LONG_TASK_MS * 1000);
    longCount = tasks.length;
    for (const task of tasks) { longTotal += task.dur; blocking += task.dur - LONG_TASK_MS * 1000; }
    for (const task of [...tasks].sort((a, b) => b.dur - a.dur).slice(0, options.longTasks ?? 8)) {
      const inside = new Map<string, number>();
      walk(task.children, (slice) => inside.set(label(slice), (inside.get(label(slice)) ?? 0) + slice.self));
      longest.push({
        startMs: round(task.ts - start),
        durationMs: round(task.dur),
        inside: [...inside].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, self]) => ({ name, selfMs: round(self) })),
      });
    }
  } else coverage.push("No CrRendererMain thread: main-thread and long-task sections are empty.");

  // Frames: PipelineReporter states for the page's renderer, else every process.
  const reporters = timed.filter((event) => event.name === "PipelineReporter" && (event.ph === "b" || event.ph === "X") && event.args?.chrome_frame_reporter);
  const pageReporters = mainPid !== null && reporters.some((event) => event.pid === mainPid) ? reporters.filter((event) => event.pid === mainPid) : reporters;
  const states = new Map<string, number>();
  for (const event of pageReporters) {
    const state = String(event.args!.chrome_frame_reporter.state ?? "");
    states.set(state, (states.get(state) ?? 0) + 1);
  }
  if (!reporters.length) coverage.push("No PipelineReporter events: record `benchmark` or `graphics.pipeline` for presented/dropped counts.");
  const draws = timed.filter((event) => event.name === "DrawFrame" && (mainPid === null || event.pid === mainPid)).map((event) => event.ts).sort((a, b) => a - b);
  if (!draws.length) coverage.push("No DrawFrame events: record `disabled-by-default-devtools.timeline.frame` for frame intervals.");
  const intervals = draws.slice(1).map((ts, index) => (ts - draws[index]) / 1000);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const median = quantile(sortedIntervals, 0.5);
  const budget = Math.max(16.7, median ?? 16.7) * 1.5;
  const long = intervals.filter((value) => value > budget);

  // GPU process: every thread's top-level work.
  const gpuKeys = [...slices.keys()].filter((key) => /gpu/i.test(processNames.get(Number(key.split(":")[0])) ?? ""));
  if (!gpuKeys.length) coverage.push(categories.has("gpu") || categories.has("viz") || categories.has("disabled-by-default-gpu.service")
    ? "GPU categories were recorded but no GPU process thread had events." : "No GPU process events: record `gpu`, `viz` or `disabled-by-default-gpu.service`.");
  const gpuThreads = gpuKeys.map(threadCost).filter((cost) => cost.busyMs > 0).sort((a, b) => b.busyMs - a.busyMs);
  const gpuBusy = gpuThreads.reduce((sum, cost) => sum + cost.busyMs, 0);
  const frameCount = states.size ? (states.get("STATE_PRESENTED_ALL") ?? 0) + (states.get("STATE_PRESENTED_PARTIAL") ?? 0) : draws.length;

  const threads = [...slices.keys()].map(threadCost).filter((cost) => cost.busyMs > 0).sort((a, b) => b.busyMs - a.busyMs).slice(0, top);
  return {
    durationMs: round(durationUs),
    coverage,
    mainThread,
    longTasks: { count: longCount, totalMs: round(longTotal), blockingMs: round(blocking), longest },
    frames: {
      presented: states.size ? (states.get("STATE_PRESENTED_ALL") ?? 0) : null,
      dropped: states.size ? (states.get("STATE_DROPPED") ?? 0) : null,
      partial: states.size ? (states.get("STATE_PRESENTED_PARTIAL") ?? 0) : null,
      drawn: draws.length,
      intervalP50Ms: median === null ? null : Math.round(median * 10) / 10,
      intervalP95Ms: quantile(sortedIntervals, 0.95) === null ? null : Math.round(quantile(sortedIntervals, 0.95)! * 10) / 10,
      intervalMaxMs: sortedIntervals.length ? Math.round(sortedIntervals.at(-1)! * 10) / 10 : null,
      longFrames: long.length,
      longFrameMs: [...long].sort((a, b) => b - a).slice(0, 10).map((value) => Math.round(value * 10) / 10),
    },
    gpu: { busyMs: Math.round(gpuBusy * 100) / 100, perFrameMs: frameCount ? Math.round((gpuBusy / frameCount) * 100) / 100 : null, threads: gpuThreads.slice(0, 6) },
    threads,
  };
}

export function formatDevtoolsTraceSummary(summary: TraceSummary, options: { title?: string } = {}): string {
  const lines: string[] = [];
  if (options.title) lines.push(options.title);
  lines.push(`  trace ${summary.durationMs} ms`);
  for (const note of summary.coverage) lines.push(`  note: ${note}`);
  if (summary.mainThread) {
    const main = summary.mainThread;
    lines.push(`  Main thread busy ${main.busyMs} ms (${main.busyPercent}%); long tasks ${summary.longTasks.count}, ${summary.longTasks.totalMs} ms, blocking ${summary.longTasks.blockingMs} ms`);
    for (const task of summary.longTasks.longest) lines.push(`    long task at ${task.startMs} ms: ${task.durationMs} ms — ${task.inside.map((item) => `${item.name} ${item.selfMs} ms`).join("; ")}`);
    lines.push("  Main thread self time by event");
    for (const item of main.topBySelf) lines.push(`    ${item.selfMs.toFixed(1).padStart(9)} ms  ${item.name}`);
    if (main.functions.length) {
      lines.push("  Script entry points (inclusive)");
      for (const item of main.functions) lines.push(`    ${item.selfMs.toFixed(1).padStart(9)} ms  ${item.name}`);
    }
  }
  const frames = summary.frames;
  lines.push(`  Frames: presented ${frames.presented ?? "n/a"}, dropped ${frames.dropped ?? "n/a"}, partial ${frames.partial ?? "n/a"}; drawn ${frames.drawn}, interval p50 ${frames.intervalP50Ms ?? "n/a"} ms, p95 ${frames.intervalP95Ms ?? "n/a"} ms, max ${frames.intervalMaxMs ?? "n/a"} ms; long frames ${frames.longFrames}${frames.longFrameMs.length ? ` (${frames.longFrameMs.join(", ")} ms)` : ""}`);
  lines.push(`  GPU process busy ${summary.gpu.busyMs} ms${summary.gpu.perFrameMs !== null ? `, ${summary.gpu.perFrameMs} ms per frame` : ""}`);
  for (const thread of summary.gpu.threads) lines.push(`    ${thread.thread}: ${thread.busyMs} ms — ${thread.topBySelf.slice(0, 4).map((item) => `${item.name} ${item.selfMs}`).join("; ")}`);
  lines.push("  Busiest threads");
  for (const thread of summary.threads.slice(0, 8)) lines.push(`    ${thread.busyMs.toFixed(1).padStart(9)} ms  ${thread.process} / ${thread.thread} — ${thread.topBySelf.slice(0, 3).map((item) => `${item.name} ${item.selfMs}`).join("; ")}`);
  return lines.join("\n");
}
