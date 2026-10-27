import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeJsonFileAtomic } from "./atomic-json";
import { profileDir } from "./profile-dir";
import { EXPORT_PACKET_SCHEMA, evidenceUploadsAllowed, exportSharingEnabled, installId, sendEditingEvidence } from "./export-sharing";
import { readEnv } from "@/lib/env-name";
import { toolEventSchema } from "../observability/tool-events";
import { productSignalSchema, productSignalsDir } from "../observability/product-signals";

// Profile-level usage evidence: per-day MCP tool totals and product signals, uploaded under the same
// sharing setting and endpoint as editing records. Only completed (UTC) days are sent; day files are
// never edited, so a day's packets are fixed once built. Tool totals carry no arguments, projects or
// results; product signals are already fixed-schema, upload-eligible records.
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const MAX_DAY_BYTES = 64 * 1024 * 1024;
const MAX_PACKET_BYTES = 1024 * 1024;
const MAX_SENDS = 2; // shares the account's hourly packet limit with editing records
const RETRY_MS = 15 * 60 * 1000;
const PROFILE_PROJECT = "_profile";
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type State = { version: 1; sent: Record<string, string>; failures: number; retry_at: number };
type Packet = { key: string; hash: string; body: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function statePath() { return path.join(profileDir(), "cloud-usage", "state.json"); }
function readState(): State {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(), "utf8")) as State;
    if (state.version === 1 && state.sent && Number.isFinite(state.retry_at)) return state;
  } catch { /* missing or unreadable: start over; the cloud deduplicates packets */ }
  return { version: 1, sent: {}, failures: 0, retry_at: 0 };
}

function completedDays(dir: string, today: string) {
  try {
    return fs.readdirSync(dir).flatMap(name => {
      const day = DAY_FILE.exec(name)?.[1];
      return day && day < today ? [{ day, file: path.join(dir, name) }] : [];
    }).sort((a, b) => a.day.localeCompare(b.day));
  } catch { return []; }
}
function lines(file: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > MAX_DAY_BYTES) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
}

/** One day's dispatches as per-tool totals, deduplicated by call id. */
export function toolUsageDay(file: string) {
  const seen = new Set<string>();
  const rows = new Map<string, { tool: string; calls: number; failures: number; duration_ms: number; reused: number; failed_jobs: number; error_codes: Record<string, number> }>();
  for (const line of lines(file)) {
    const parsed = (() => { try { return toolEventSchema.safeParse(JSON.parse(line)); } catch { return null; } })();
    if (!parsed?.success || seen.has(parsed.data.call_id)) continue;
    const event = parsed.data;
    seen.add(event.call_id);
    const row = rows.get(event.tool) ?? { tool: event.tool, calls: 0, failures: 0, duration_ms: 0, reused: 0, failed_jobs: 0, error_codes: {} };
    row.calls++; row.failures += Number(!event.success); row.duration_ms += Math.round(event.duration_ms);
    row.reused += Number(event.reused === true); row.failed_jobs += Number(event.job_state === "failed");
    if (event.error_code) row.error_codes[event.error_code] = (row.error_codes[event.error_code] ?? 0) + 1;
    rows.set(event.tool, row);
  }
  return [...rows.values()].sort((a, b) => a.tool.localeCompare(b.tool));
}
function productSignalsDay(file: string) {
  return lines(file).flatMap(line => {
    try { const parsed = productSignalSchema.safeParse(JSON.parse(line)); return parsed.success ? [parsed.data] : []; }
    catch { return []; }
  });
}

/** Packets for one day, split so each stays under the packet budget. */
function dayPackets(kind: "tool_usage" | "product_signals", day: string, items: unknown[]): Packet[] {
  const parts: unknown[][] = [[]];
  let bytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item));
    if (size > MAX_PACKET_BYTES / 2) continue;
    if (bytes + size > MAX_PACKET_BYTES / 2 && parts.at(-1)!.length) { parts.push([]); bytes = 0; }
    parts.at(-1)!.push(item); bytes += size;
  }
  return parts.filter(part => part.length).map((part, index) => {
    const digest = hash(JSON.stringify(part));
    const body = JSON.stringify({ schema: EXPORT_PACKET_SCHEMA, packet_type: "product_usage", install_id: installId(), project_id: PROFILE_PROJECT,
      job_id: `usage-${kind.replace("_", "-")}-${day}-${index}-${digest.slice(0, 16)}`,
      app_version: readEnv("APP_VERSION") ?? process.env.npm_package_version ?? null,
      evidence: { schema: "dreamcut.product-usage.v1", kind, day, part: index, items: part } });
    return { key: `${kind}/${day}/${index}`, hash: digest, body };
  });
}

/** Upload a few pending completed days. Local files are never changed; only state.json is written. */
export async function syncUsageEvidence(fetcher?: Fetcher, now = Date.now()) {
  const result = { sent: 0, errors: [] as string[] };
  if (!evidenceUploadsAllowed() || !exportSharingEnabled()) return result;
  const state = readState();
  if (state.retry_at > now) return result;
  const today = new Date(now).toISOString().slice(0, 10);
  const sources = [
    ...completedDays(path.join(profileDir(), "tool-events"), today).map(({ day, file }) => ({ kind: "tool_usage" as const, day, read: () => toolUsageDay(file) })),
    ...completedDays(productSignalsDir(), today).map(({ day, file }) => ({ kind: "product_signals" as const, day, read: () => productSignalsDay(file) })),
  ];
  for (const source of sources) {
    if (result.sent >= MAX_SENDS) break;
    if (state.sent[`${source.kind}/${source.day}/done`]) continue;
    let packets: Packet[];
    try { packets = dayPackets(source.kind, source.day, source.read()); }
    catch { result.errors.push(`unreadable ${source.kind} day ${source.day}; retained locally.`); continue; }
    for (const packet of packets) {
      if (state.sent[packet.key] === packet.hash) continue;
      if (result.sent >= MAX_SENDS || !exportSharingEnabled()) { writeJsonFileAtomic(statePath(), state); return result; }
      try {
        const response = await sendEditingEvidence(packet.body, fetcher);
        if (!response) { writeJsonFileAtomic(statePath(), state); return result; }
        if (!response.ok) throw new Error(`Cloud ingestion HTTP ${response.status}`);
        state.sent[packet.key] = packet.hash; state.failures = 0; state.retry_at = 0;
        result.sent++;
      } catch (error) {
        state.failures++;
        state.retry_at = now + Math.min(24 * 60 * 60 * 1000, RETRY_MS * 2 ** Math.min(state.failures - 1, 7));
        writeJsonFileAtomic(statePath(), state);
        result.errors.push(error instanceof Error ? error.message : "Usage upload failed");
        return result;
      }
    }
    state.sent[`${source.kind}/${source.day}/done`] = "1";
  }
  writeJsonFileAtomic(statePath(), state);
  return result;
}
