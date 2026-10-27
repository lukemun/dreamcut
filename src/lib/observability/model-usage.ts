import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { normalizeModelEvent } from "./model-event";
import { localOtelDirectory } from "./local-otel";

const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
function attributes(value: unknown) {
  return Object.fromEntries(array(value).map(v => {
    const kv = object(v), val = object(kv.value);
    return [String(kv.key), val.stringValue ?? val.intValue ?? val.doubleValue ?? val.boolValue];
  }));
}
function count(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export type ModelUsageRow = {
  day: string; provider: string; runtime: string; conversation: string; model: string; events: number; responses: number; usage_responses: number;
  input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_output_tokens: number;
  missing_usage: number; missing_cache: number; missing_reasoning: number; tool_calls: number; tool_failures: number; errors: number;
};

/** Read only OTLP log response-completion events. Never add metric histograms or trace
 * copies to log counts. Identical timestamped events are delivery replays, not new usage.
 */
export function createModelUsageReader(filters: { conversation?: string; model?: string; provider?: string; since?: string } = {}) {
  if (filters.since && !Number.isFinite(Date.parse(filters.since))) throw new Error("Invalid --since date");
  const groups = new Map<string, ModelUsageRow>();
  const seen = new Set<string>();
  let duplicates = 0, invalidLines = 0, invalidUsage = 0, missingTimestamps = 0, observedTimestamps=0, unmeteredCompletions=0;
  return {
    consume(line: string) {
      let payload: unknown;
      try { payload = JSON.parse(line); } catch { invalidLines++; return; }
      const resources = object(payload).resourceLogs;
      if (!Array.isArray(resources)) { invalidLines++; return; }
      for (const resource of resources) {
        for (const scope of array(object(resource).scopeLogs)) {
          for (const raw of array(object(scope).logRecords)) {
            const record = object(raw), attrs = attributes(record.attributes);
            const event = normalizeModelEvent(attrs, record.eventName);
            if (!event) continue;
            const { conversation, model, provider, runtime } = event;
            if (filters.provider && provider !== filters.provider) continue;
            if (filters.conversation && conversation !== filters.conversation || filters.model && model !== filters.model) continue;
            const eventStamp=record.timeUnixNano;
            const useObserved=!(typeof eventStamp==="string"&&/^\d+$/.test(eventStamp)&&eventStamp!=="0");
            const stamp = useObserved?record.observedTimeUnixNano:eventStamp;
            let timestamp: Date | undefined;
            if (typeof stamp === "string" && /^\d+$/.test(stamp) && stamp !== "0") {
              const ms = Number(BigInt(stamp) / BigInt(1_000_000));
              if (Number.isFinite(ms) && ms > 0 && ms <= 8.64e15) timestamp = new Date(ms);
            }
            if (filters.since && (!timestamp || timestamp.getTime() < Date.parse(filters.since))) continue;
            if (!timestamp) missingTimestamps++;
            else if(useObserved)observedTimestamps++;
            if (timestamp) {
              const stable = JSON.stringify([provider, runtime, record.eventName, stamp, record.traceId, record.spanId, Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b))]);
              const key = createHash("sha256").update(stable).digest("hex");
              if (seen.has(key)) { duplicates++; continue; }
              seen.add(key);
            }
            const day = timestamp?.toISOString().slice(0, 10) ?? "unknown";
            const key = JSON.stringify([day, provider, runtime, conversation, model]);
            const row = groups.get(key) ?? { day, provider, runtime, conversation, model, events: 0, responses: 0, usage_responses: 0,
              input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0,
              missing_usage: 0, missing_cache: 0, missing_reasoning: 0, tool_calls: 0, tool_failures: 0, errors: 0 };
            row.events++;
            if(event.unmeteredCompletion)unmeteredCompletions++;
            if (event.error) row.errors++;
            if (event.tool) {
              row.tool_calls++;
              if (attrs.success === false || attrs.success === "false") row.tool_failures++;
            }
            if (event.response) {
              row.responses++;
              const input = count(event.input), output = count(event.output);
              const cached = count(event.cached), reasoning = count(event.reasoning);
              const invalid = input !== null && cached !== null && cached > input || output !== null && reasoning !== null && reasoning > output;
              if (invalid) { invalidUsage++; row.missing_usage++; }
              else if (input === null || output === null) row.missing_usage++;
              else {
                row.usage_responses++; row.input_tokens += input; row.output_tokens += output;
                row.cached_input_tokens += cached ?? 0; row.reasoning_output_tokens += reasoning ?? 0;
                if (cached === null) row.missing_cache++;
                if (reasoning === null) row.missing_reasoning++;
              }
            }
            groups.set(key, row);
          }
        }
      }
    },
    report() {
      const rows = [...groups.values()].sort((a, b) => JSON.stringify([a.day, a.provider, a.runtime, a.conversation, a.model]).localeCompare(JSON.stringify([b.day, b.provider, b.runtime, b.conversation, b.model])));
      const sum = (key: keyof ModelUsageRow) => rows.reduce((total, row) => total + Number(row[key]), 0);
      return { rows, known_tokens: { input: sum("input_tokens"), cached_input_subset: sum("cached_input_tokens"), output: sum("output_tokens"), reasoning_output_subset: sum("reasoning_output_tokens"), total: sum("input_tokens") + sum("output_tokens") },
        coverage: { observed_responses: sum("responses"), responses_with_usage: sum("usage_responses"), missing_usage: sum("missing_usage"), missing_cache: sum("missing_cache"), missing_reasoning: sum("missing_reasoning"), duplicates, invalid_lines: invalidLines, invalid_usage: invalidUsage, missing_timestamps: missingTimestamps, collector_observed_timestamps:observedTimestamps, unmetered_completion_signals:unmeteredCompletions },
        limitations: ["Observed supported OTLP log events only; unavailable/dropped events cannot be counted. Totals are not an API bill.",
          "Cache and reasoning are subsets. Missing counts remain coverage gaps, not measured zeros.",
          "Codex unmetered completion signals may accompany a separate usage event; they are not a denominator of distinct responses. Native checkpoints provide reconciliation.",
          "Collector observed timestamps are receipt time when event time is absent, not exact request time.",
          "Response completion is not task success or human approval. Project/proposal attribution is not yet connected.",
          "Files rotate; this report covers retained data only. Timestamp-identical delivery replays are deduplicated, not guaranteed exactly-once accounting."] };
    },
  };
}

export async function readModelUsage(filters: { conversation?: string; model?: string; provider?: string; since?: string } = {}, directory = localOtelDirectory()) {
  const reader = createModelUsageReader(filters);
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).filter(n => /^logs(?:-\d{4}-\d{2}-\d{2}T[\d.-]+)?\.jsonl$/.test(n)).sort() : [];
  for (const name of names) {
    const input = fs.createReadStream(path.join(directory, name), { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) if (line.trim()) reader.consume(line);
  }
  return { ...reader.report(), files_read: names.length };
}
