import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const obj = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);
const MAX_TEXT = 12000;
/** Local diagnostic content only. Never passed to remote telemetry. */
/** Credentials only: keys, tokens, passwords and URL credentials. Shared with training data. */
export function redactCredentials(value: string) {
  return value.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[private-key omitted]")
    .replace(/\b(?:sk-[\w-]+|gh[pousr]_[\w]+|Bearer\s+[\w.\-+/=]+)/gi, "[credential omitted]")
    .replace(/\b((?:[\w-]*(?:token|password|secret|api[_-]?key|authorization)[\w-]*)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, "$1[redacted]")
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[credentials]@");
}
export function redactActivity(value: string) {
  return value.replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/g, "[image-data omitted]")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[private-key omitted]")
    .replace(/\b(?:sk-[\w-]+|gh[pousr]_[\w]+|Bearer\s+[\w.\-+/=]+)/gi, "[credential omitted]")
    .replace(/\b((?:[\w-]*(?:token|password|secret|api[_-]?key|authorization)[\w-]*)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, "$1[redacted]")
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[credentials]@")
    .slice(0, MAX_TEXT);
}
export type Activity = {
  id: string; timestamp: string; runtime: string; kind: "call" | "result" | "coverage" | "usage" | "context";
  call_id: string; tool?: string; input?: string; output?: string; image_payloads?: number;
  boundary?: "mcp" | "outside-tool-contract"; hints?: string[];
  model?: string; usage?: { total: Record<string, number>; last: Record<string, number> };
  source_offset: number; truncated?: boolean; error?: boolean;
};
function content(value: unknown): { text: string; images: number } {
  if (typeof value === "string") return { text: value, images: 0 };
  let text = "", images = 0;
  if (Array.isArray(value)) for (const raw of value) {
    const item = obj(raw);
    if (["image", "input_image", "image_url"].includes(item.type)) images++;
    else if (typeof item.text === "string") text += item.text + "\n";
    else if (item.type === "tool_result") { const nested = content(item.content); text += nested.text; images += nested.images; }
  }
  return { text, images };
}
/** Hints describe text in an observed outer call, never proof nested code ran. */
function hints(tool: string, input: string) {
  const all = tool + " " + input;
  return [
    [/apply_patch|\b(?:Write|Edit|MultiEdit)\b/, "file-change request"],
    [/exec_command|\bBash\b|\b(?:python3?|ffmpeg|node|tsx)\b/, "shell/script request"],
    [/sam2|cutout|segmentation/i, "segmentation/cutout reference"],
    [/view_image|contact.sheet|input_image/i, "image inspection reference"],
    [/\.agents\/skills|SKILL\.md/, "skill reference"],
    [/tools\.[\w_]+\(/, "nested tool code; execution unverified"],
  ].filter(([pattern]) => (pattern as RegExp).test(all)).map(([, label]) => String(label));
}
export function normalizeActivity(record: unknown, runtime: "codex" | "claude", source: string, offset: number): Activity[] {
  const r = obj(record), p = runtime === "codex" ? obj(r.payload) : obj(r.message);
  const base = { timestamp: String(r.timestamp ?? "unknown"), runtime, source_offset: offset };
  const result: Activity[] = [];
  const addCall = (call: Record<string, any>, index: number) => {
    const raw = call.arguments ?? call.input ?? {};
    const input = typeof raw === "string" ? raw : JSON.stringify(raw);
    const tool = [call.namespace, call.name].filter(Boolean).join(".");
    result.push({ ...base, id: hash(`${source}:${offset}:${index}`), kind: "call", call_id: String(call.call_id ?? call.id ?? "unknown"), tool,
      input: redactActivity(input), truncated: input.length > MAX_TEXT,
      boundary: /(?:^|[._])mcp(?:__|[._])/.test(tool) ? "mcp" : "outside-tool-contract", hints: hints(tool, input) });
  };
  const addResult = (call: Record<string, any>, index: number) => {
    const c = content(call.output ?? call.content);
    result.push({ ...base, id: hash(`${source}:${offset}:${index}`), kind: "result", call_id: String(call.call_id ?? call.tool_use_id ?? "unknown"),
      output: redactActivity(c.text), image_payloads: c.images, truncated: c.text.length > MAX_TEXT, error: call.is_error === true });
  };
  if (runtime === "codex" && r.type === "turn_context" && typeof p.model === "string") {
    result.push({...base,id:hash(`${source}:${offset}:context`),kind:"context",call_id:"",model:p.model});
  }
  if (runtime === "codex" && r.type === "event_msg" && p.type === "token_count" && p.info) {
    const pick=(value:unknown)=>Object.fromEntries(Object.entries(obj(value)).filter(([key,n])=>
      ["input_tokens","cached_input_tokens","cache_write_input_tokens","output_tokens","reasoning_output_tokens","total_tokens"].includes(key)&&Number.isSafeInteger(n)&&n>=0));
    const total=pick(p.info.total_token_usage),last=pick(p.info.last_token_usage);
    if([total,last].every(v=>v.input_tokens!=null&&v.output_tokens!=null))
      result.push({...base,id:hash(`${source}:${offset}:usage`),kind:"usage",call_id:"",usage:{total,last}});
    else result.push({...base,id:hash(`${source}:${offset}:usage-invalid`),kind:"coverage",call_id:"",error:true,output:"Invalid native usage checkpoint"});
  }
  if (runtime === "codex" && r.type === "response_item") {
    if (["function_call", "custom_tool_call"].includes(p.type)) addCall(p, 0);
    if (["function_call_output", "custom_tool_call_output"].includes(p.type)) addResult(p, 0);
  }
  if (runtime === "claude" && ["assistant", "user"].includes(r.type) && Array.isArray(p.content)) {
    p.content.forEach((c: unknown, i: number) => {
      const call = obj(c);
      if (call.type === "tool_use") addCall(call, i);
      if (call.type === "tool_result") addResult(call, i);
    });
  }
  return result;
}

type Cursor = { offset: number; skipLine: boolean; runtime: "codex" | "claude"; source: string; gaps: number; legacy_gaps?: number };
type State = { version: 1; workspace: string; since: string; cursors: Record<string, Cursor> };
function atomic(file: string, value: string) {
  fs.writeFileSync(file + ".tmp", value, { mode: 0o600 });
  fs.renameSync(file + ".tmp", file);
}
function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(root, entry.name)) : entry.isFile() && entry.name.endsWith(".jsonl") ? [path.join(root, entry.name)] : []);
}
export function activityMarkdown(events: Activity[], source: string) {
  const calls = events.filter(e => e.kind === "call"), results = new Map(events.filter(e => e.kind === "result").map(e => [e.call_id, e]));
  const outside = calls.filter(e => e.boundary === "outside-tool-contract");
  const lines = ["# Agent activity — capability discovery", "", `Source: ${source}`, "",
    `${calls.length} observed calls; ${outside.length} outside the named MCP boundary; ${events.reduce((n,e) => n + (e.image_payloads ?? 0),0)} image payloads returned to the runtime.`, "",
    "Outside-boundary calls are review candidates, not proven missing app features. They include coding, inspection and wrappers around supported tools. Nested code is a requested action, not proof it executed. Results do not establish edit quality or approval.", "",
    "Coverage: session tool records only; no hidden reasoning, user/assistant prose, raw images. Numeric native usage records are retained separately from tool interpretation. No exact provider-request reconstruction, process tracing, or automatic project attribution. Missing results may be active/interrupted work or capture gaps. File-change requests are not verified filesystem diffs.", "",
    "## Capability candidates — review required", "",
    "These groups are inferred from requested tool names/code. Check the result and existing app tools before deciding anything must be built.", "",
    "| Requested activity | Calls | First source byte |", "| --- | --- | --- |"];
  const candidates = new Map<string, { count: number; offset: number }>();
  for (const call of outside) for (const label of call.hints?.length ? call.hints : ["Other external tool or wrapper"]) {
    const previous = candidates.get(label);
    candidates.set(label, { count: (previous?.count ?? 0) + 1, offset: previous?.offset ?? call.source_offset });
  }
  for (const [label, entry] of candidates) lines.push(`| ${label} | ${entry.count} | ${entry.offset} |`);
  lines.push("", "## Calls to review", "");
  for (const call of calls) {
    const res = results.get(call.call_id);
    lines.push(`### ${call.timestamp} · ${call.tool}`, "", `Boundary: ${call.boundary}. Source byte: ${call.source_offset}. Call: ${call.call_id}.`,
      `Hints (text-based): ${call.hints?.join(", ") || "none"}. Result: ${res ? res.error ? "reported error" : "observed; inspect output" : "not observed"}.`, "",
      "~~~~text", (call.input ?? "").replace(/~~~~/g,"[fence]"), "~~~~", "");
    if (res) lines.push(`Images returned: ${res.image_payloads ?? 0}. Truncated: ${Boolean(call.truncated || res.truncated)}.`, "", "~~~~text", (res.output ?? "").replace(/~~~~/g,"[fence]"), "~~~~", "");
  }
  return lines.join("\n");
}

/** Incremental, repository-scoped importer. No source files or editorial state are mutated. */
export function createActivityMonitor(options: { workspace: string; directory: string; since?: string; home?: string; rebuild?: boolean }) {
  const workspace = fs.realpathSync(options.workspace), home = options.home ?? os.homedir();
  const directory = path.join(options.directory, hash(workspace));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const statePath = path.join(directory, "state.json");
  const state: State = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { version: 1, workspace, since: options.since ?? new Date().toISOString(), cursors: {} };
  if (state.version !== 1 || state.workspace !== workspace || !Number.isFinite(Date.parse(state.since))) throw new Error("Invalid activity state");
  if (options.since && options.since !== state.since) throw new Error("Capture start is already fixed; use a separate output directory for a different historical scope");
  const lock = path.join(directory, "capture.lock");
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") alive = true; }
    if (alive) throw new Error("Activity capture already running for this workspace");
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  const close = () => { try { if (fs.readFileSync(lock, "utf8") === String(process.pid)) fs.unlinkSync(lock); } catch {} };
  process.once("exit", close);
  if(options.rebuild){
    const backup=path.join(directory,`recovery-${Date.now()}`);fs.mkdirSync(backup,{mode:0o700});
    if(fs.existsSync(statePath))fs.copyFileSync(statePath,path.join(backup,"state.json"));
    for(const cursor of Object.values(state.cursors)){
      const events=path.join(directory,hash(cursor.source),"events.jsonl");
      if(fs.existsSync(events))fs.renameSync(events,path.join(backup,`${hash(cursor.source)}.jsonl`));
      cursor.legacy_gaps=(cursor.legacy_gaps??0)+cursor.gaps;cursor.gaps=0;cursor.offset=0;cursor.skipLine=false;
    }
    atomic(statePath,JSON.stringify(state,null,2));
  }
  const rejected = new Set<string>();
  function tick() {
    const codexRoot = process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "sessions") : path.join(home, ".codex", "sessions");
    const claudeRoot = path.join(home, ".claude", "projects", workspace.replace(/[^a-zA-Z0-9]/g, "-"));
    for (const [runtime, root] of [["codex", codexRoot], ["claude", claudeRoot]] as const) {
      for (const source of walk(root)) {
        if (rejected.has(source) || state.cursors[source]) continue;
        if (fs.statSync(source).mtimeMs < Date.parse(state.since)) continue;
        // Codex's first session_meta contains cwd. Claude scope is its workspace directory.
        if (runtime === "codex") {
          const fd = fs.openSync(source, "r"), buf = Buffer.alloc(65536);
          let size: number;
          try { size = fs.readSync(fd, buf, 0, buf.length, 0); } finally { fs.closeSync(fd); }
          const head = buf.subarray(0, size).toString("utf8").split("\n")[0];
          try { if (JSON.parse(head).payload?.cwd !== workspace) { rejected.add(source); continue; } }
          catch { continue; }
        }
        state.cursors[source] = { source, runtime, offset: 0, skipLine: false, gaps: 0 };
      }
    }
    let imported = 0;
    const sessions: { runtime: string; source: string; report: string; bytes_read: number; pending_bytes: number; gaps: number }[] = [];
    for (const cursor of Object.values(state.cursors)) {
      const id = hash(cursor.source), dir = path.join(directory, id);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const eventsPath = path.join(dir, "events.jsonl");
      if (!fs.existsSync(cursor.source)) { cursor.gaps++; continue; }
      const size = fs.statSync(cursor.source).size;
      if (size < cursor.offset) { cursor.gaps++; continue; }
      if (size > cursor.offset) {
        const fd = fs.openSync(cursor.source, "r"), chunks:Buffer[]=[];
        let length=0;
        try {
          do {
            const buf=Buffer.alloc(Math.min(16*1024*1024,size-cursor.offset-length));
            const count=fs.readSync(fd,buf,0,buf.length,cursor.offset+length);
            if(!count)break;
            const chunk=buf.subarray(0,count);chunks.push(chunk);length+=count;
            if(chunk.includes(10))break;
          }while(cursor.offset+length<size);
        }finally{fs.closeSync(fd);}
        const data=Buffer.concat(chunks);let start=0;
        const added: Activity[] = [];
        for (let end = data.indexOf(10); end >= 0; end = data.indexOf(10, start)) {
          if (cursor.skipLine) cursor.skipLine = false;
          else {
            try {
              const record = JSON.parse(data.subarray(start, end).toString("utf8"));
              if (Date.parse(record.timestamp) >= Date.parse(state.since)) added.push(...normalizeActivity(record, cursor.runtime, cursor.source, cursor.offset + start));
            } catch { cursor.gaps++; }
          }
          start = end + 1;
        }

        const bytes = added.map(e => JSON.stringify(e)).join("\n") + (added.length ? "\n" : "");
        const existingSize = fs.existsSync(eventsPath) ? fs.statSync(eventsPath).size : 0;
        if (added.length) {
          if (existingSize) {
            const tail = fs.openSync(eventsPath, "r"), byte = Buffer.alloc(1);
            try { fs.readSync(tail, byte, 0, 1, existingSize - 1); } finally { fs.closeSync(tail); }
            if (byte[0] !== 10) { fs.appendFileSync(eventsPath, "\n"); cursor.gaps++; }
          }
          const output=fs.openSync(eventsPath,"a",0o600);
          try{fs.writeFileSync(output,bytes);fs.fsyncSync(output);}finally{fs.closeSync(output);}
        }
        cursor.offset += start;
        imported += added.length;
        // Stable source-offset IDs make retries after a crash idempotent in the projection.
        const unique = new Map<string, Activity>();
        if (fs.existsSync(eventsPath)) for (const line of fs.readFileSync(eventsPath, "utf8").split("\n")) {
          try { const e = JSON.parse(line) as Activity; unique.set(e.id, e); } catch { if (line.trim()) cursor.gaps++; }
        }
        atomic(path.join(dir, "report.md"), activityMarkdown([...unique.values()], cursor.source));
      }
      sessions.push({ runtime: cursor.runtime, source: cursor.source, report: path.join(dir, "report.md"), bytes_read: cursor.offset, pending_bytes: Math.max(0, size - cursor.offset), gaps: cursor.gaps });
    }
    atomic(statePath, JSON.stringify(state, null, 2));
    atomic(path.join(directory, "index.json"), JSON.stringify({ version: 1, workspace, since: state.since, updated_at: new Date().toISOString(), imported, sessions }, null, 2));
    atomic(path.join(directory, "README.md"), [
      "# DreamCut agent activity", "", `Updated: ${new Date().toISOString()}. Capture from: ${state.since}.`, "",
      "Local session tool records for this repository. Commands/results are redacted and bounded; no remote export. Original session files are unchanged.", "",
      "## Capability discovery", "",
      "Open a session report and review calls outside the named MCP boundary. Separate product-development work from editing work; a script may wrap an existing app capability. Only promote a missing capability after checking the existing tool inventory and the observed result.", "",
      "| Runtime | Report | Pending source bytes | Capture gaps |", "| --- | --- | --- | --- |",
      ...sessions.map(s => `| ${s.runtime} | [${path.basename(s.source)}](<${s.report}>) | ${s.pending_bytes} | ${s.gaps} |`), "",
      "Pending bytes include an incomplete final line while a session is active. Gaps include malformed records and unavailable/truncated sources. Historical budget losses can be recovered with --rebuild while native sources remain. File changes are observed requests, not verified diffs; image payloads mean delivery to the runtime, not proof of model understanding.", "",
      "No automatic task/project/proposal joins yet. Use model-usage for token totals; native usage and OTel are distinct evidence streams, never additive. No event-storage cap or automatic expiry; local storage grows until explicitly cleaned. Oversized complete records are read across chunks, not skipped. Append failures leave the cursor retryable. Derived reports add storage. Delete this capture directory after stopping the watcher to remove saved diagnostics; native runtime sessions are separate.", ""
    ].join("\n"));
    return { directory, imported, sessions: sessions.length, pending_bytes: sessions.reduce((n,s) => n + s.pending_bytes,0) };
  }
  return { tick, directory, close };
}
