import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { productSignalsDir, readProductSignals, recordProductSignal, summarizeProductSignals } from "./product-signals";
// @ts-expect-error -- plain ESM builders shared with the MCP server.
import { argumentsRejectedSignal, catalogSearchSignal, generationDraftedSignal, proposalStagedSignal, selectionReadSignal, toolRefusedSignal } from "../../../mcp/product-signals.mjs";

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

test("agent-turn events keep ids and enums only: selection digests, generation model without the prompt, refusal codes", () => withProfile(() => {
  const selection = selectionReadSignal(context, "editor_context_get", { selection: { items: [
    { id: "template:LOOK-PROOF", group: "templates", kind: "Template", label: "Proof", agent_text: "Read its brief" },
    { id: "media:sources/my private take 3.mov", group: "media", kind: "Video", label: "my private take 3", agent_text: "Project video" },
    { id: "media:catalog:image:sky", group: "media", kind: "Photo", label: "Sky", agent_text: "Library photo" },
  ] } });
  recordProductSignal(selection);
  recordProductSignal(selectionReadSignal(context, "timeline_get", { library_selection: { items: [] } }));
  assert.equal(selectionReadSignal(context, "proposal_list", { selection: { items: [] } }), undefined);
  recordProductSignal(generationDraftedSignal(context, { kind: "video", prompt: "a guy walking, secret brief" }, { model: { id: "seedance-2.5" }, price: 1268 }));
  recordProductSignal(generationDraftedSignal(context, { draft_id: "d1", approval: "yes do it" }, { kind: "video", model: "seedance-2.5" }));
  recordProductSignal(toolRefusedSignal(context, "elements_batch", { code: "NOT_AUTHORIZED", retryable: false, recovery: { action: "stop" } }));
  assert.equal(toolRefusedSignal(context, "media_import", { code: "BUSY", retryable: true }), undefined, "transient failures are not refusals");
  assert.equal(toolRefusedSignal(context, "proposal_create", { code: "INVALID_INPUT", retryable: false }), undefined, "argument rejections have their own record");
  const rejected = argumentsRejectedSignal(context, { tool: "video_search", layer: "server_schema", schema: { type: "object", additionalProperties: false, properties: { query: { type: "string" } } },
    args: { query: "cat", analyze: true }, message: "Invalid arguments for video_search", errorCode: "INVALID_ARGUMENTS" });
  recordProductSignal(rejected);
  const stored = fs.readFileSync(path.join(productSignalsDir(), fs.readdirSync(productSignalsDir())[0]), "utf8");
  assert.doesNotMatch(stored, /secret brief|my private take|Proof"|1268|yes do it/, "prompts, labels, file names, prices and approvals are never recorded");
  assert.match(stored, /"id":"template:LOOK-PROOF"/);
  assert.match(stored, /"id":"media:#[a-f0-9]{12}"/);
  assert.match(stored, /"id":"media:catalog:image:sky"/);
  const summary = summarizeProductSignals(readProductSignals());
  assert.deepEqual([summary.selection_reads, summary.generation_drafts, summary.refusals], [2, 1, 1]);
  assert.deepEqual(summary.selected_kinds, [{ key: "Template", n: 1 }, { key: "Video", n: 1 }, { key: "Photo", n: 1 }]);
  assert.deepEqual(summary.generation_models, [{ key: "video:seedance-2.5", n: 2 }]);
  assert.deepEqual(summary.refusal_codes, [{ key: "elements_batch:NOT_AUTHORIZED", n: 1 }]);
  assert.deepEqual(summary.rejection_codes, [{ key: "video_search:INVALID_ARGUMENTS", n: 1 }]);
  assert.equal(summary.invalid_records, 0);
}));
