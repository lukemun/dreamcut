import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { profileDir } from "../local-store/editing-memory";
import { appendDayRecord, dayFilesIn } from "./day-files";

// The only upload-eligible record class. Every event is built from this schema and nothing
// else; see docs/architecture/desktop-data-layout.md for what each event answers and why.
// Day files are bounded by day-files.ts (90 days / 50 MB, oldest whole days first).
// Absolute local paths carry the account name; they are replaced, never stored.
const ABSOLUTE_PATH = /(?:\/Users\/|\/home\/|\/private\/|\/var\/folders\/|[A-Za-z]:\\\\?Users\\\\?)[^\s"',;)]*/g;

const text = (max: number) => z.string().max(max).transform(value => value.replace(ABSOLUTE_PATH, "<local path>"));
const envelope = {
  schema_version: z.literal(1),
  signal_id: z.string().uuid(),
  at: z.string().datetime(),
  session_id: z.string().uuid(),
  client: z.enum(["dreamcut-harness", "mcp-direct", "editor"]),
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
  /** The tool-runtime code the agent received (INVALID_ARGUMENTS before dispatch, INVALID_INPUT from the editor). */
  error_code: z.string().max(100).optional(),
}).strict();

// A typed refusal that is not about argument shape: an authority gate, a stale or unknown id, a
// missing prerequisite. Argument rejections and internal failures have their own records.
const toolRefused = z.object({ ...envelope,
  event: z.literal("tool_refused"),
  tool: z.string().regex(/^[a-z][a-z0-9_]{0,100}$/),
  error_code: z.string().max(100),
  recovery_action: z.string().max(40).optional(),
}).strict();

// What the creator had selected in the editor when the agent read the project, so a retro can
// tell whether a selected look, template or clip was honoured. Ids and kinds only; a project
// file's id is replaced by a digest so no file name is kept.
const selectionRead = z.object({ ...envelope,
  event: z.literal("selection_read"),
  tool: z.enum(["editor_context_get", "timeline_get"]),
  item_count: z.number().int().min(0),
  items: z.array(z.object({ id: z.string().max(200), kind: z.string().max(40) }).strict()).max(50),
}).strict();

// The agent drafted (or, with the creator's approval, submitted) a generation: kind and model,
// never the prompt, references or price.
const generationDrafted = z.object({ ...envelope,
  event: z.literal("generation_drafted"),
  kind: z.enum(["image", "video", "music", "speech"]),
  stage: z.enum(["draft", "approved"]),
  model: z.string().max(80).optional(),
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

// Project files changed without a DreamCut write: an agent or person edited them directly, or
// another process wrote them. Recorded by the editor when it notices the change.
const outsideWrite = z.object({ ...envelope,
  event: z.literal("outside_write"),
  files: z.array(z.enum(["timeline", "metadata", "frame_tags", "auditions", "layout_proposals"])).max(5),
  writer: z.enum(["file_edit", "other_process"]),
}).strict();

// The agent did part of a request without DreamCut's tools (its own script, a shell command, a
// direct file edit) and said what it needed. The agent's words, never the creator's.
const capabilityGap = z.object({ ...envelope,
  event: z.literal("capability_gap"),
  needed: text(500),
  workaround: z.enum(["own_script", "shell_command", "manual_file_edit", "external_app", "gave_up"]),
  programs: z.array(z.string().regex(/^[a-z0-9][a-z0-9+._-]{0,39}$/)).max(8),
  nearest_tools: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,100}$/)).max(5),
  outcome: z.enum(["worked", "partial", "failed"]),
}).strict();

export const productSignalSchema = z.discriminatedUnion("event", [catalogSearch, argumentsRejected, toolRefused, selectionRead, generationDrafted, proposalStaged, outsideWrite, capabilityGap]);
export type ProductSignal = z.infer<typeof productSignalSchema>;

export function productSignalsDir() { return path.join(profileDir(), "product-signals"); }

export function recordProductSignal(raw: unknown) {
  const signal = productSignalSchema.parse(raw);
  appendDayRecord(productSignalsDir(), signal.at.slice(0, 10), signal);
  return { recorded: true };
}

export function readProductSignals(dir = productSignalsDir()) {
  const signals: ProductSignal[] = [];
  let invalid = 0;
  for (const name of dayFilesIn(dir)) {
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
  const outside = signals.filter((signal): signal is Of<"outside_write"> => signal.event === "outside_write");
  const gaps = signals.filter((signal): signal is Of<"capability_gap"> => signal.event === "capability_gap");
  const refused = signals.filter((signal): signal is Of<"tool_refused"> => signal.event === "tool_refused");
  const selections = signals.filter((signal): signal is Of<"selection_read"> => signal.event === "selection_read");
  const generations = signals.filter((signal): signal is Of<"generation_drafted"> => signal.event === "generation_drafted");
  return {
    searches: searches.length,
    missed_searches: searches.filter(signal => signal.miss).length,
    missed_queries: count(searches.filter(signal => signal.miss).map(signal => signal.query.toLowerCase())).slice(0, 50),
    rejections: rejected.length,
    invented_fields: count(rejected.flatMap(signal => signal.unknown_fields.map(field => `${signal.tool}:${field.field}`))).slice(0, 50),
    missing_fields: count(rejected.flatMap(signal => signal.missing_fields.map(field => `${signal.tool}:${field}`))).slice(0, 50),
    proposals: staged.length,
    control_gaps: count(staged.flatMap(signal => signal.options.flatMap(option => option.control_gaps.map(gap => gap.field)))).slice(0, 50),
    outside_writes: count(outside.flatMap(signal => signal.files.map(file => `${signal.writer}:${file}`))).slice(0, 20),
    capability_gaps: gaps.length,
    gap_workarounds: count(gaps.map(signal => signal.workaround)),
    gap_programs: count(gaps.flatMap(signal => signal.programs)).slice(0, 30),
    gap_needs: gaps.slice(-50).map(signal => ({ needed: signal.needed, workaround: signal.workaround, outcome: signal.outcome, nearest_tools: signal.nearest_tools })),
    refusals: refused.length,
    refusal_codes: count(refused.map(signal => `${signal.tool}:${signal.error_code}`)).slice(0, 50),
    rejection_codes: count(rejected.flatMap(signal => signal.error_code ? [`${signal.tool}:${signal.error_code}`] : [])).slice(0, 20),
    selection_reads: selections.length,
    selected_kinds: count(selections.flatMap(signal => signal.items.map(item => item.kind))).slice(0, 30),
    generation_drafts: generations.filter(signal => signal.stage === "draft").length,
    generation_models: count(generations.map(signal => `${signal.kind}:${signal.model ?? "unknown"}`)).slice(0, 30),
    invalid_records: invalid,
  };
}
