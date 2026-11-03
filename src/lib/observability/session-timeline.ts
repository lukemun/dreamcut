import { normalizeActivity, redactActivity } from "./agent-activity";

/**
 * One coding-agent session transcript as a reviewable timeline: what the person asked, what the
 * agent said and called, which calls failed, and how long the agent spent before each call. Read
 * only; used by session retros. Tool calls and results come from `normalizeActivity`, so they carry
 * the same redaction as the activity capture. Thinking is never included.
 */
export type SessionRuntime = "claude" | "codex";
export type TimelineEntry = {
  line: number; timestamp: string;
  kind: "user" | "queued" | "compaction" | "assistant" | "call" | "result";
  text: string; tool?: string; call_id?: string; error?: boolean;
  /** Size of the call's arguments in characters (a pasted payload shows here). */
  input_chars?: number;
  /** Seconds from the previous result or message to this call: the agent's time composing it. */
  compose_seconds?: number;
};
export type ToolTally = { calls: number; failures: number; input_chars: number; compose_seconds: number };
export type SessionTimeline = {
  entries: TimelineEntry[];
  summary: { start?: string; end?: string; minutes?: number; user_messages: number; compactions: number; tools: Record<string, ToolTally> };
};

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const obj = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const textOf = (value: unknown): string => typeof value === "string" ? value
  : Array.isArray(value) ? value.map(item => typeof item === "string" ? item : typeof obj(item).text === "string" ? obj(item).text : "").filter(Boolean).join("\n") : "";
const spoken = (value: unknown) => redactActivity(textOf(value).replace(REMINDER, "").trim());
/** Claude names MCP tools `mcp__<server>__<tool>`; the bare tool name reads better in a timeline. */
const shortTool = (tool: string) => tool.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");
const seconds = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 1000;

function readEntries(record: Record<string, any>, runtime: SessionRuntime, line: number): TimelineEntry[] {
  const timestamp = String(record.timestamp ?? obj(record.attachment).timestamp ?? "");
  const message = obj(record.message);
  if (runtime === "claude") {
    if (record.type === "attachment" && obj(record.attachment).type === "queued_command") {
      const text = spoken(record.attachment.prompt);
      return text ? [{ line, timestamp, kind: "queued", text }] : [];
    }
    if (record.type === "user" && record.isCompactSummary) return [{ line, timestamp, kind: "compaction", text: spoken(message.content) }];
  }
  if (runtime === "codex" && record.type === "response_item" && obj(record.payload).type === "message") {
    const role = record.payload.role, text = spoken(record.payload.content);
    return text && (role === "user" || role === "assistant") ? [{ line, timestamp, kind: role, text }] : [];
  }
  const entries: TimelineEntry[] = [];
  if (runtime === "claude" && (record.type === "user" || record.type === "assistant")) {
    const blocks = Array.isArray(message.content) ? message.content : [{ type: "text", text: message.content }];
    for (const block of blocks.map(obj)) if (block.type === "text") {
      const text = spoken(block.text);
      if (text) entries.push({ line, timestamp, kind: record.type, text });
    }
  }
  for (const activity of normalizeActivity(record, runtime, "session", line)) {
    if (activity.kind === "call") entries.push({ line, timestamp, kind: "call", tool: shortTool(activity.tool ?? ""), call_id: activity.call_id,
      text: activity.input ?? "", input_chars: rawInputChars(record, runtime, activity.call_id) });
    if (activity.kind === "result") entries.push({ line, timestamp, kind: "result", call_id: activity.call_id, error: activity.error, text: activity.output ?? "" });
  }
  return entries;
}

/** The redacted input is capped; the size of what the agent actually sent comes from the record. */
function rawInputChars(record: Record<string, any>, runtime: SessionRuntime, callId: string) {
  if (runtime === "codex") { const p = obj(record.payload); const raw = p.arguments ?? p.input ?? ""; return (typeof raw === "string" ? raw : JSON.stringify(raw)).length; }
  const call = (obj(record.message).content as unknown[]).map(obj).find(block => block.type === "tool_use" && block.id === callId);
  return JSON.stringify(call?.input ?? {}).length;
}

/**
 * Build the timeline from a transcript's JSONL lines. `from` starts it at the first message from
 * the person containing that text (case-insensitive); everything before is left out.
 */
export function sessionTimeline(lines: string[], options: { runtime: SessionRuntime; from?: string }): SessionTimeline {
  const all: TimelineEntry[] = [];
  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    let record: unknown;
    try { record = JSON.parse(raw); } catch { return; }
    all.push(...readEntries(obj(record), options.runtime, index + 1));
  });
  const needle = options.from?.toLowerCase();
  const start = needle ? all.findIndex(entry => (entry.kind === "user" || entry.kind === "queued") && entry.text.toLowerCase().includes(needle)) : 0;
  if (start < 0) throw new Error(`No message from the person contains "${options.from}"`);
  const entries = all.slice(start);
  const toolOf = new Map<string, string>();
  const tools: Record<string, ToolTally> = {};
  let previous: string | undefined;
  for (const entry of entries) {
    if (entry.kind === "call") {
      if (previous && entry.timestamp) entry.compose_seconds = Math.max(0, seconds(previous, entry.timestamp));
      toolOf.set(entry.call_id!, entry.tool!);
      const tally = tools[entry.tool!] ??= { calls: 0, failures: 0, input_chars: 0, compose_seconds: 0 };
      tally.calls++; tally.input_chars += entry.input_chars ?? 0; tally.compose_seconds += entry.compose_seconds ?? 0;
    } else if (entry.timestamp && entry.kind !== "assistant") previous = entry.timestamp;
    if (entry.kind === "result") {
      entry.tool = toolOf.get(entry.call_id!);
      if (entry.error && entry.tool) tools[entry.tool].failures++;
    }
  }
  const stamped = entries.filter(entry => entry.timestamp);
  const first = stamped[0]?.timestamp, last = stamped.at(-1)?.timestamp;
  return { entries, summary: {
    start: first, end: last, minutes: first && last ? Math.round(seconds(first, last) / 6) / 10 : undefined,
    user_messages: entries.filter(entry => entry.kind === "user" || entry.kind === "queued").length,
    compactions: entries.filter(entry => entry.kind === "compaction").length, tools } };
}

/** Plain-text rendering: a per-tool tally, then one line per entry. `preview` caps each line's text. */
export function sessionTimelineText(timeline: SessionTimeline, preview = 240) {
  const { summary } = timeline;
  const clock = (timestamp: string) => timestamp.slice(11, 19);
  const out = [`Session ${summary.start ?? "?"} → ${summary.end ?? "?"} (${summary.minutes ?? "?"} min), ${summary.user_messages} messages from the person, ${summary.compactions} compactions`, "",
    "calls  failed  input chars  compose s  tool"];
  for (const [tool, tally] of Object.entries(summary.tools).sort((a, b) => b[1].compose_seconds - a[1].compose_seconds)) {
    out.push(`${String(tally.calls).padStart(5)}  ${String(tally.failures).padStart(6)}  ${String(tally.input_chars).padStart(11)}  ${tally.compose_seconds.toFixed(0).padStart(9)}  ${tool}`);
  }
  out.push("");
  for (const entry of timeline.entries) {
    const person = entry.kind === "user" || entry.kind === "queued" || entry.kind === "compaction";
    const limit = person ? Math.max(preview, 1500) : preview;
    const text = entry.text.replace(/\s+/g, " ").slice(0, limit);
    const label = entry.kind === "call" ? `CALL ${entry.tool} (${entry.input_chars} ch${entry.compose_seconds === undefined ? "" : `, +${entry.compose_seconds.toFixed(0)} s`})`
      : entry.kind === "result" ? `${entry.error ? "FAILED" : "result"} ${entry.tool ?? ""}`.trim()
      : entry.kind.toUpperCase();
    out.push(`L${entry.line} ${clock(entry.timestamp)} ${label}: ${text}`);
  }
  return out.join("\n");
}
