/**
 * Summarise a V8 `.cpuprofile` (Node `--cpu-prof`, `node:inspector` or Chrome DevTools `Profiler.stop`)
 * into the functions that cost the most time, by self time (the function's own code) and total time
 * (the function and everything it called). Recursion counts once per sample in total time.
 *
 * Positions are V8's (0-based line and column in the loaded script). A `resolve` callback may map them
 * to original sources (source maps) or describe a minified position (a code excerpt).
 */

export type CpuProfileCallFrame = {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
  scriptId?: string | number;
};

export type CpuProfileNode = {
  id: number;
  callFrame: CpuProfileCallFrame;
  hitCount?: number;
  children?: number[];
  parent?: number;
};

export type CpuProfile = {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
};

/** Where a frame's code lives once mapped: a source file and 1-based line, plus an optional note. */
export type ResolvedFrame = { name?: string; file: string; line: number; column?: number; note?: string };
export type FrameResolver = (frame: CpuProfileCallFrame) => ResolvedFrame | null;

export type FunctionCost = {
  name: string;
  /** Repository-relative or package path with a 1-based line, e.g. `src/lib/timeline/shapes.ts:120`. */
  location: string;
  selfMs: number;
  totalMs: number;
  selfPercent: number;
  totalPercent: number;
  note?: string;
};

export type CpuProfileSummary = {
  durationMs: number;
  sampledMs: number;
  samples: number;
  /** Time V8 spent outside JavaScript: idle, garbage collection, native program work. */
  categories: { idleMs: number; gcMs: number; programMs: number };
  /** Busy JavaScript time: sampled time less idle. Percentages are of this. */
  busyMs: number;
  bySelf: FunctionCost[];
  byTotal: FunctionCost[];
  /** Self time grouped by source file or package. */
  byFile: Array<{ location: string; selfMs: number; selfPercent: number }>;
};

const SPECIAL = new Set(["(root)", "(program)", "(idle)", "(garbage collector)"]);

/** A readable location: repository-relative for this checkout, `pkg/path` inside node_modules. */
export function shortLocation(url: string, root?: string): string {
  let location = url;
  if (location.startsWith("file://")) {
    try { location = decodeURIComponent(new URL(location).pathname); } catch { /* keep as is */ }
  }
  const modules = location.lastIndexOf("/node_modules/");
  if (modules >= 0) {
    const rest = location.slice(modules + "/node_modules/".length);
    // pnpm stores packages under .pnpm/<name>@<version>/node_modules/<name>/...
    return rest.startsWith(".pnpm/") ? shortLocation(rest.slice(rest.indexOf("/") + 1)) : rest;
  }
  if (root && location.startsWith(root.endsWith("/") ? root : `${root}/`)) return location.slice(root.length + (root.endsWith("/") ? 0 : 1));
  try {
    const parsed = new URL(location);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.pathname.replace(/^\/_next\/static\//, "");
  } catch { /* not a URL */ }
  return location || "(native)";
}

function fileOf(location: string) {
  return location.replace(/(:\d+){1,2}$/, "");
}

/** Per-sample weights in microseconds: each sample owns the interval up to the next one. */
function sampleWeights(profile: CpuProfile): number[] {
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const weights = new Array<number>(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const next = deltas[i + 1];
    weights[i] = next !== undefined ? Math.max(0, next) : 0;
  }
  if (samples.length) {
    const known = weights.slice(0, -1);
    const mean = known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : 0;
    weights[samples.length - 1] = mean;
  }
  return weights;
}

export function summarizeCpuProfile(profile: CpuProfile, options: {
  top?: number;
  root?: string;
  resolve?: FrameResolver;
  /** Leave matching functions (a profiling harness's own frames) out of the rankings; their time still counts. */
  hide?: (cost: { name: string; location: string }) => boolean;
} = {}): CpuProfileSummary {
  const top = options.top ?? 25;
  const byId = new Map<number, CpuProfileNode>();
  for (const node of profile.nodes) byId.set(node.id, node);
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    if (node.parent !== undefined) parent.set(node.id, node.parent);
    for (const child of node.children ?? []) parent.set(child, node.id);
  }

  // One stable key per function (name + location), resolved once per call frame.
  const keyOfNode = new Map<number, string>();
  const info = new Map<string, { name: string; location: string; note?: string }>();
  const resolvedCache = new Map<string, ResolvedFrame | null>();
  for (const node of profile.nodes) {
    const frame = node.callFrame;
    const name = frame.functionName || "(anonymous)";
    if (SPECIAL.has(name) && !frame.url) { keyOfNode.set(node.id, name); info.set(name, { name, location: "" }); continue; }
    const frameKey = `${frame.url}\0${frame.lineNumber}\0${frame.columnNumber}`;
    let resolved = resolvedCache.get(frameKey);
    if (resolved === undefined) {
      resolved = options.resolve?.(frame) ?? null;
      resolvedCache.set(frameKey, resolved);
    }
    const location = resolved
      ? `${shortLocation(resolved.file, options.root)}:${resolved.line}${resolved.column ? `:${resolved.column}` : ""}`
      : frame.url ? `${shortLocation(frame.url, options.root)}:${frame.lineNumber + 1}` : "(native)";
    const label = resolved?.name || name;
    const key = `${label}\0${location}`;
    keyOfNode.set(node.id, key);
    if (!info.has(key)) info.set(key, { name: label, location, note: resolved?.note });
  }

  const self = new Map<string, number>();
  const total = new Map<string, number>();
  const weights = sampleWeights(profile);
  const samples = profile.samples ?? [];
  let sampled = 0;
  const seen = new Set<string>();
  for (let i = 0; i < samples.length; i++) {
    const weight = weights[i];
    sampled += weight;
    const leaf = samples[i];
    const leafKey = keyOfNode.get(leaf);
    if (!leafKey) continue;
    self.set(leafKey, (self.get(leafKey) ?? 0) + weight);
    seen.clear();
    for (let id: number | undefined = leaf; id !== undefined; id = parent.get(id)) {
      const key = keyOfNode.get(id);
      if (!key || key === "(root)" || seen.has(key)) continue;
      seen.add(key);
      total.set(key, (total.get(key) ?? 0) + weight);
    }
  }

  const ms = (us: number) => Math.round(us / 10) / 100;
  const idle = self.get("(idle)") ?? 0;
  const gc = self.get("(garbage collector)") ?? 0;
  const program = self.get("(program)") ?? 0;
  const busy = Math.max(1, sampled - idle);
  const percent = (us: number) => Math.round((us / busy) * 1000) / 10;
  const cost = (key: string): FunctionCost => {
    const entry = info.get(key)!;
    return { name: entry.name, location: entry.location, selfMs: ms(self.get(key) ?? 0), totalMs: ms(total.get(key) ?? 0), selfPercent: percent(self.get(key) ?? 0), totalPercent: percent(total.get(key) ?? 0), ...(entry.note ? { note: entry.note } : {}) };
  };
  const functions = [...info.keys()].filter((key) => !SPECIAL.has(key) && !options.hide?.(info.get(key)!));
  const files = new Map<string, number>();
  for (const key of functions) {
    const location = info.get(key)!.location;
    const file = location ? fileOf(location) : "(native)";
    files.set(file, (files.get(file) ?? 0) + (self.get(key) ?? 0));
  }
  return {
    durationMs: ms(profile.endTime - profile.startTime),
    sampledMs: ms(sampled),
    samples: samples.length,
    categories: { idleMs: ms(idle), gcMs: ms(gc), programMs: ms(program) },
    busyMs: ms(Math.max(0, sampled - idle)),
    bySelf: functions.filter((key) => (self.get(key) ?? 0) > 0).sort((a, b) => (self.get(b) ?? 0) - (self.get(a) ?? 0)).slice(0, top).map(cost),
    byTotal: functions.filter((key) => (total.get(key) ?? 0) > 0).sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0)).slice(0, top).map(cost),
    byFile: [...files].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, top).map(([location, value]) => ({ location, selfMs: ms(value), selfPercent: percent(value) })),
  };
}

function pad(value: string, width: number) {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/** Plain-text tables for a terminal. */
export function formatCpuProfileSummary(summary: CpuProfileSummary, options: { title?: string; top?: number } = {}): string {
  const top = options.top ?? 15;
  const lines: string[] = [];
  if (options.title) lines.push(options.title);
  lines.push(`  sampled ${summary.sampledMs} ms (${summary.samples} samples): busy ${summary.busyMs} ms, idle ${summary.categories.idleMs} ms, GC ${summary.categories.gcMs} ms, native ${summary.categories.programMs} ms`);
  const row = (cost: FunctionCost, lead: number, lagging: number, leadPercent: number) =>
    `  ${pad(`${lead.toFixed(1)} ms`, 11)} ${pad(`${leadPercent.toFixed(1)}%`, 7)} ${pad(`${lagging.toFixed(1)} ms`, 11)} ${pad(cost.name, 34)} ${cost.location}${cost.note ? `  ${cost.note}` : ""}`;
  lines.push("  By self time       (self, %, total, function, where)");
  for (const cost of summary.bySelf.slice(0, top)) lines.push(row(cost, cost.selfMs, cost.totalMs, cost.selfPercent));
  lines.push("  By total time      (total, %, self, function, where)");
  for (const cost of summary.byTotal.slice(0, top)) lines.push(row(cost, cost.totalMs, cost.selfMs, cost.totalPercent));
  lines.push("  Self time by file");
  for (const file of summary.byFile.slice(0, Math.min(top, 10))) lines.push(`  ${pad(`${file.selfMs.toFixed(1)} ms`, 11)} ${pad(`${file.selfPercent.toFixed(1)}%`, 7)} ${file.location}`);
  return lines.join("\n");
}

/**
 * For minified browser chunks without source maps: describe each frame by a short excerpt of the
 * served code at its position, which keeps property names and strings a reader can search for.
 * `readScript` returns a script's text by URL (fetched once each), or null when unavailable.
 */
export async function scriptExcerptResolver(profile: CpuProfile, readScript: (url: string) => Promise<string | null>, width = 48): Promise<FrameResolver> {
  const urls = [...new Set(profile.nodes.map((node) => node.callFrame.url).filter((url) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url) && url.endsWith(".js")))];
  const scripts = new Map<string, string[] | null>();
  await Promise.all(urls.map(async (url) => {
    try { scripts.set(url, (await readScript(url))?.split("\n") ?? null); } catch { scripts.set(url, null); }
  }));
  return (frame) => {
    const lines = scripts.get(frame.url);
    const line = lines?.[frame.lineNumber];
    if (line === undefined) return null;
    const excerpt = line.slice(frame.columnNumber, frame.columnNumber + width).replace(/\s+/g, " ");
    return { file: frame.url, line: frame.lineNumber + 1, column: frame.columnNumber + 1, note: `«${excerpt}»` };
  };
}

/**
 * The call stacks that lead to functions named `name` (exact, or a substring when no function has that
 * exact name), heaviest first, with the time sampled in each: how a costly leaf is reached.
 */
export function stacksTo(profile: CpuProfile, name: string, options: { top?: number; depth?: number; root?: string; hide?: (location: string) => boolean } = {}): Array<{ ms: number; stack: string[] }> {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    if (node.parent !== undefined) parent.set(node.id, node.parent);
    for (const child of node.children ?? []) parent.set(child, node.id);
  }
  const exact = profile.nodes.some((node) => node.callFrame.functionName === name);
  const matches = (node: CpuProfileNode) => exact ? node.callFrame.functionName === name : node.callFrame.functionName.includes(name);
  const describe = (node: CpuProfileNode) => {
    const frame = node.callFrame;
    return `${frame.functionName || "(anonymous)"} ${frame.url ? `${shortLocation(frame.url, options.root)}:${frame.lineNumber + 1}` : "(native)"}`;
  };
  const weights = sampleWeights(profile);
  const stacks = new Map<string, { ms: number; stack: string[] }>();
  (profile.samples ?? []).forEach((leaf, index) => {
    // The outermost matching frame on this sample's stack, so recursion is one stack.
    let hit: number | undefined;
    for (let id: number | undefined = leaf; id !== undefined; id = parent.get(id)) if (matches(byId.get(id)!)) hit = id;
    if (hit === undefined) return;
    const stack: string[] = [];
    for (let id: number | undefined = hit; id !== undefined && stack.length < (options.depth ?? 12); id = parent.get(id)) {
      const node = byId.get(id)!;
      if (node.callFrame.functionName === "(root)") break;
      const text = describe(node);
      if (!options.hide?.(text)) stack.push(text);
    }
    const key = stack.join("\n");
    const entry = stacks.get(key) ?? { ms: 0, stack };
    entry.ms += weights[index] / 1000;
    stacks.set(key, entry);
  });
  return [...stacks.values()].sort((a, b) => b.ms - a.ms).slice(0, options.top ?? 5).map((entry) => ({ ms: Math.round(entry.ms * 100) / 100, stack: entry.stack }));
}
