import test from "node:test";
import assert from "node:assert/strict";
import { createCodexUsageReader } from "../observability/codex-usage";
import { codexOtelArgs } from "../observability/codex-otel";

function line(fields: Record<string, unknown>, stamp = "1780000000000000000") {
  return JSON.stringify({ resourceLogs: [{ scopeLogs: [{ logRecords: [{ timeUnixNano: stamp,
    attributes: Object.entries({ "event.name": "codex.sse_event", "event.kind": "response.completed", "conversation.id": "fixture", model: "fixture-model", ...fields }).map(([key, value]) => ({ key, value: { stringValue: String(value) } })) }] }] }] });
}
test("native token counts deduplicate replays without adding cache/reasoning twice", () => {
  const reader = createCodexUsageReader();
  const event = line({ input_token_count: 100, output_token_count: 20, cached_token_count: 80, reasoning_token_count: 5 });
  reader.consume(event); reader.consume(event);
  reader.consume(line({ input_token_count: 10, output_token_count: 2 }, "1780000001000000000"));
  const report = reader.report();
  assert.deepEqual(report.known_tokens, { input: 110, output: 22, cached_input_subset: 80, reasoning_output_subset: 5, total: 132 });
  assert.equal(report.coverage.duplicates, 1);
  assert.equal(report.coverage.missing_cache, 1);
  assert.equal(report.rows[0].responses, 2);
});
test("missing usage, malformed records and tool errors stay visible", () => {
  const reader = createCodexUsageReader();
  reader.consume(line({})); reader.consume("{");
  reader.consume(line({ "event.name": "codex.tool_result", success: false }, "1780000002000000000"));
  reader.consume(line({ input_token_count: 1, output_token_count: 2, cached_token_count: 10 }, "1780000003000000000"));
  const report = reader.report();
  assert.equal(report.coverage.missing_usage, 1);
  assert.equal(report.coverage.unmetered_completion_signals,1);
  assert.equal(report.coverage.invalid_usage, 1);
  assert.equal(report.coverage.invalid_lines, 1);
  assert.equal(report.rows[0].tool_failures, 1);
  assert.equal(report.known_tokens.total, 0);
});
test("filters use per-event model/conversation/time; totals do not mix identities", () => {
  const reader = createCodexUsageReader({ model: "fixture-model", conversation: "fixture", since: "2026-01-01" });
  reader.consume(line({ input_token_count: 10, output_token_count: 2 }));
  reader.consume(line({ model: "another", input_token_count: 20, output_token_count: 2 }));
  reader.consume(line({ input_token_count: 30, output_token_count: 2 }, "1000000000"));
  assert.equal(reader.report().known_tokens.total, 12);
  assert.throws(() => createCodexUsageReader({ since: "invalid" }));
});
test("native telemetry is opt-in and constrained to a local log receiver", () => {
  assert.deepEqual(codexOtelArgs(""), []);
  const args = codexOtelArgs("http://127.0.0.1:4318/v1/logs");
  assert.ok(args.includes("otel.log_user_prompt=false"));
  assert.ok(args.includes('otel.metrics_exporter="none"'));
  for (const endpoint of ["https://example.com/v1/logs", "http://127.0.0.1:4318/v1/traces", "http://key@localhost:4318/v1/logs"]) assert.throws(() => codexOtelArgs(endpoint));
});

test("standard GenAI events separate providers, preserve missing usage and ignore unrelated logs", () => {
  const reader = createCodexUsageReader();
  const standard = (provider: string, extra: Record<string, unknown> = {}) => {
    const payload = JSON.parse(line({ "event.name": "gen_ai.client.inference.operation.details", "gen_ai.provider.name": provider,
      "gen_ai.request.model": "shared-name", "gen_ai.usage.input_tokens": 30, "gen_ai.usage.output_tokens": 5, ...extra }));
    const record = payload.resourceLogs[0].scopeLogs[0].logRecords[0];
    record.eventName = "gen_ai.client.inference.operation.details";
    record.attributes = record.attributes.filter((a: {key: string}) => a.key !== "event.name");
    return JSON.stringify(payload);
  };
  reader.consume(standard("local"));
  reader.consume(standard("api"));
  reader.consume(standard("failed", { "gen_ai.usage.input_tokens": "unknown", "error.type": "timeout" }));
  reader.consume(line({ "event.name": "unrelated", input_token_count: 999, output_token_count: 999 }));
  const report = reader.report();
  assert.equal(report.known_tokens.total, 70);
  assert.equal(report.rows.length, 3);
  assert.equal(report.coverage.missing_usage, 1);
  assert.equal(report.rows.find(r => r.provider === "failed")?.errors, 1);
  const filtered = createCodexUsageReader({ provider: "local" });
  filtered.consume(standard("local")); filtered.consume(standard("api"));
  assert.equal(filtered.report().known_tokens.total, 35);
});

 test("native instrumentation event names do not hide Codex's semantic event attribute", () => {
  const payload = JSON.parse(line({ input_token_count: 10, output_token_count: 2 }));
  payload.resourceLogs[0].scopeLogs[0].logRecords[0].eventName = "event source.rs:123";
  const reader = createCodexUsageReader(); reader.consume(JSON.stringify(payload));
  assert.equal(reader.report().known_tokens.total, 12);
});


test('collector receipt timestamps preserve filtering and separate unmetered completion signals',()=>{
 const reader=createCodexUsageReader({since:'2026-01-01'});
 for(const fields of [{},{input_token_count:100,output_token_count:20}]){
  const value=JSON.parse(line(fields));const record=value.resourceLogs[0].scopeLogs[0].logRecords[0];
  record.observedTimeUnixNano=record.timeUnixNano;delete record.timeUnixNano;reader.consume(JSON.stringify(value));
 }
 const report=reader.report();assert.equal(report.known_tokens.total,120);
 assert.equal(report.coverage.observed_responses,1);assert.equal(report.coverage.unmetered_completion_signals,1);
 assert.equal(report.coverage.missing_usage,0);assert.equal(report.coverage.collector_observed_timestamps,2);
});
