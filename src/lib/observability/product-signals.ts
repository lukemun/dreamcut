import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { profileDir } from "../local-store/editing-memory";

// The only upload-eligible record class. Every event is built from this schema and nothing
// else; see docs/architecture/desktop-data-layout.md for what each event answers and why.
const RETENTION_DAYS = 90;
const RETENTION_BYTES = 50 * 1024 * 1024;
const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
// Absolute local paths carry the account name; they are replaced, never stored.
const ABSOLUTE_PATH = /(?:\/Users\/|\/home\/|\/private\/|\/var\/folders\/|[A-Za-z]:\\\\?Users\\\\?)[^\s"',;)]*/g;

const text = (max: number) => z.string().max(max).transform(value => value.replace(ABSOLUTE_PATH, "<local path>"));
const envelope = {
  schema_version: z.literal(1),
  signal_id: z.string().uuid(),
  at: z.string().datetime(),
  session_id: z.string().uuid(),
  client: z.enum(["dreamcut-harness", "mcp-direct"]),
  project_id: z.string().max(128).optional(),
};

const catalogSearch = z.object({ ...envelope,
  event: z.literal("catalog_search"),
  query: text(200),
  result_count: z.number().int().min(0),
  top: z.array(z.object({ id: z.string().max(200), kind: z.string().max(40) }).strict()).max(5),
  miss: z.boolean(),
}).strict();

const argumentsRejected = z.object({ ...envelope,
  event: z.literal("arguments_rejected"),
  tool: z.string().regex(/^[a-z][a-z0-9_]{0,100}$/),
  layer: z.enum(["harness_schema", "server_schema", "application"]),
  unknown_fields: z.array(z.object({ path: text(300), field: text(128), suggested: z.array(z.string().max(128)).max(8) }).strict()).max(16),
  missing_fields: z.array(text(300)).max(16),
  message: text(600),
}).strict();

const proposalStaged = z.object({ ...envelope,
  event: z.literal("proposal_staged"),
  tool: z.enum(["proposal_create", "proposal_spatial_preflight"]),
  options: z.array(z.object({
    changed_fields: z.array(z.string().max(160)).max(200),
    dials: z.array(z.string().max(160)).max(50),
    dials_origin: z.enum(["agent", "server"]).nullable(),
    control_gaps: z.array(z.object({ field: z.string().max(160), value_kind: z.string().max(20) }).strict()).max(200),
    dropped_dials: z.number().int().min(0),
  }).strict()).max(20),
}).strict();

export const productSignalSchema = z.discriminatedUnion("event", [catalogSearch, argumentsRejected, proposalStaged]);
export type ProductSignal = z.infer<typeof productSignalSchema>;

export function productSignalsDir() { return path.join(profileDir(), "product-signals"); }

/** Drop the oldest whole days beyond the retention window or byte budget; never edit a day file. */
function prune(dir: string) {
  const days = fs.readdirSync(dir).filter(name => DAY_FILE.test(name)).sort().reverse();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  let bytes = 0;
  for (const [index, name] of days.entries()) {
    bytes += fs.statSync(path.join(dir, name)).size;
    if (index > 0 && (name.slice(0, 10) < cutoff || bytes > RETENTION_BYTES)) fs.rmSync(path.join(dir, name));
  }
}

export function recordProductSignal(raw: unknown) {
  const signal = productSignalSchema.parse(raw);
  const dir = productSignalsDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${signal.at.slice(0, 10)}.jsonl`);
  const fresh = !fs.existsSync(file);
  fs.appendFileSync(file, JSON.stringify(signal) + "\n", { mode: 0o600 });
  if (fresh) prune(dir);
  return { recorded: true };
}

export function readProductSignals(dir = productSignalsDir()) {
  const signals: ProductSignal[] = [];
  let invalid = 0;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => DAY_FILE.test(name)).sort() : []) {
    for (const line of fs.readFileSync(path.join(dir, name), "utf8").split("\n").filter(Boolean)) {
      try { signals.push(productSignalSchema.parse(JSON.parse(line))); } catch { invalid++; }
    }
  }
  return { signals, invalid };
}

/** Counts that point at what to build: missed searches, invented fields, untunable changes. */
export function summarizeProductSignals({ signals, invalid }: ReturnType<typeof readProductSignals>) {
  const count = (keys: string[]) => [...keys.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n }));
  type Of<E extends ProductSignal["event"]> = Extract<ProductSignal, { event: E }>;
  const searches = signals.filter((signal): signal is Of<"catalog_search"> => signal.event === "catalog_search");
  const rejected = signals.filter((signal): signal is Of<"arguments_rejected"> => signal.event === "arguments_rejected");
  const staged = signals.filter((signal): signal is Of<"proposal_staged"> => signal.event === "proposal_staged" && signal.tool === "proposal_create");
  return {
    searches: searches.length,
    missed_searches: searches.filter(signal => signal.miss).length,
    missed_queries: count(searches.filter(signal => signal.miss).map(signal => signal.query.toLowerCase())).slice(0, 50),
    rejections: rejected.length,
    invented_fields: count(rejected.flatMap(signal => signal.unknown_fields.map(field => `${signal.tool}:${field.field}`))).slice(0, 50),
    missing_fields: count(rejected.flatMap(signal => signal.missing_fields.map(field => `${signal.tool}:${field}`))).slice(0, 50),
    proposals: staged.length,
    control_gaps: count(staged.flatMap(signal => signal.options.flatMap(option => option.control_gaps.map(gap => gap.field)))).slice(0, 50),
    invalid_records: invalid,
  };
}
