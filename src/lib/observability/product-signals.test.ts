import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { productSignalsDir, readProductSignals, recordProductSignal, summarizeProductSignals } from "./product-signals";
// @ts-expect-error -- plain ESM builders shared with the MCP server.
import { argumentsRejectedSignal, catalogSearchSignal, proposalStagedSignal } from "../../../mcp/product-signals.mjs";

const context = { sessionId: "2fecdf32-9991-40d3-a255-6653202afd51", client: "dreamcut-harness", projectId: "nyc-meet" };

function withProfile(run: () => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "product-signals-")), previous = process.env.DREAMCUT_PROFILE_DIR;
  process.env.DREAMCUT_PROFILE_DIR = dir;
  try { run(); } finally {
    if (previous === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("signals record searches, invented fields and untunable changes without argument values", () => withProfile(() => {
  recordProductSignal(catalogSearchSignal(context, { action: "search", query: "make a 3d spinning logo" }, { entries: [], total: 0 }));
  recordProductSignal(catalogSearchSignal(context, { action: "search", query: "reverse clip" }, { entries: [{ id: "feature:props.playback_reverse", kind: "feature" }], total: 1 }));
  const schema = { type: "object", additionalProperties: false, properties: { proposal: { type: "object", additionalProperties: false, properties: { summary: { type: "string" } } } } };
  const rejected = argumentsRejectedSignal(context, { tool: "proposal_create", layer: "harness_schema", schema,
    args: { proposal: { summary: "secret creative brief", keyframes: { reverse: true } } },
    message: "data/proposal must NOT have additional properties, data/proposal must have required property 'options'" });
  recordProductSignal(rejected);
  recordProductSignal(proposalStagedSignal(context, "proposal_create", { proposal: { options: [{ operations: [{ element_id: "x", props: { playback_reverse: true, mask_inset: [0, .1, 0, .1] }, rationale: "the creator's words" }],
    review_controls: [{ operation_index: 0, target: "props", field: "mask_inset_left" }], review_controls_origin: "server",
    control_gaps: [{ operation_index: 0, target: "props", field: "playback_reverse", value_kind: "boolean" }] }] } }));
  const stored = fs.readFileSync(path.join(productSignalsDir(), fs.readdirSync(productSignalsDir())[0]), "utf8");
  assert.doesNotMatch(stored, /secret creative brief|the creator's words/, "argument values and rationale are never recorded");
  const summary = summarizeProductSignals(readProductSignals());
  assert.deepEqual([summary.searches, summary.missed_searches], [2, 1]);
  assert.deepEqual(summary.missed_queries, [{ key: "make a 3d spinning logo", n: 1 }]);
  assert.deepEqual(summary.invented_fields, [{ key: "proposal_create:keyframes", n: 1 }]);
  assert.deepEqual(summary.missing_fields, [{ key: "proposal_create:proposal.options", n: 1 }]);
  assert.deepEqual(summary.control_gaps, [{ key: "props.playback_reverse", n: 1 }]);
}));

test("the schema refuses extra fields and replaces absolute local paths", () => withProfile(() => {
  const search = catalogSearchSignal(context, { action: "search", query: "import /Users/someone/Movies/take 3.mov" }, { entries: [], total: 0 });
  assert.throws(() => recordProductSignal({ ...search, arguments: { anything: true } }));
  recordProductSignal(search);
  assert.equal(readProductSignals().signals[0]!.event === "catalog_search" && (readProductSignals().signals[0] as { query: string }).query, "import <local path> 3.mov");
}));
