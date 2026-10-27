import test from "node:test";
import assert from "node:assert/strict";
import { sessionTimeline, sessionTimelineText } from "./session-timeline";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 27, 2, 0, seconds)).toISOString();
const claude = [
  { type: "user", timestamp: at(0), message: { content: "<system-reminder>side note</system-reminder>Open the project." } },
  { type: "user", timestamp: at(5), message: { content: [{ type: "text", text: "Could we apply the speed effect now?" }] } },
  { type: "assistant", timestamp: at(10), message: { content: [{ type: "thinking", thinking: "private" }, { type: "text", text: "Building the card." },
    { type: "tool_use", id: "a", name: "mcp__timeline-editor__proposal_create", input: { proposal: { summary: "x".repeat(500) } } }] } },
  { type: "user", timestamp: at(11), message: { content: [{ type: "tool_result", tool_use_id: "a", is_error: true, content: "Overlapping authored visuals" }] } },
  { type: "assistant", timestamp: at(41), message: { content: [{ type: "tool_use", id: "b", name: "mcp__timeline-editor__proposal_create", input: { token: "secret-value" } }] } },
  { type: "user", timestamp: at(42), message: { content: [{ type: "tool_result", tool_use_id: "b", content: "{\"proposal_id\":\"p1\"}" }] } },
  { type: "attachment", timestamp: at(50), attachment: { type: "queued_command", prompt: [{ type: "text", text: "<system-reminder>note</system-reminder>" }, { type: "text", text: "Wrong again." }] } },
  { type: "user", timestamp: at(60), isCompactSummary: true, message: { content: "This session is being continued…" } },
].map(record => JSON.stringify(record));

test("a Claude session reads as messages, calls, failures and compose time from a chosen message", () => {
  const timeline = sessionTimeline(["not json", ...claude], { runtime: "claude", from: "speed effect" });
  assert.deepEqual(timeline.entries.map(entry => entry.kind), ["user", "assistant", "call", "result", "call", "result", "queued", "compaction"]);
  const [first, second] = timeline.entries.filter(entry => entry.kind === "call");
  assert.equal(first.tool, "proposal_create");
  assert.equal(first.compose_seconds, 5, "measured from the person's message, not the agent's own prose");
  assert.equal(second.compose_seconds, 30);
  assert.ok(first.input_chars! > 500, "payload size is measured from the record, not the redacted copy");
  assert.deepEqual(timeline.summary.tools.proposal_create, { calls: 2, failures: 1, input_chars: first.input_chars! + second.input_chars!, compose_seconds: 35 });
  assert.equal(timeline.summary.user_messages, 2);
  assert.equal(timeline.summary.compactions, 1);
  assert.equal(timeline.entries.find(entry => entry.kind === "queued")?.text, "Wrong again.");
  const text = sessionTimelineText(timeline);
  for (const hidden of ["private", "secret-value", "side note"]) assert.ok(!text.includes(hidden), hidden);
  assert.match(text, /FAILED proposal_create: Overlapping/);
});

test("a missing start message is an error, not an empty timeline", () => {
  assert.throws(() => sessionTimeline(claude, { runtime: "claude", from: "no such words" }), /No message from the person/);
});

test("Codex messages and calls use the same timeline", () => {
  const codex = [
    { type: "response_item", timestamp: at(0), payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Retro this." }] } },
    { type: "response_item", timestamp: at(4), payload: { type: "function_call", name: "exec_command", call_id: "c", arguments: "{\"cmd\":\"ls\"}" } },
    { type: "response_item", timestamp: at(5), payload: { type: "function_call_output", call_id: "c", output: "ok" } },
  ].map(record => JSON.stringify(record));
  const timeline = sessionTimeline(codex, { runtime: "codex" });
  assert.deepEqual(timeline.entries.map(entry => [entry.kind, entry.tool ?? null]), [["user", null], ["call", "exec_command"], ["result", "exec_command"]]);
  assert.equal(timeline.summary.tools.exec_command.compose_seconds, 4);
});
