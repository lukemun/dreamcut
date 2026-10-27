import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "tool-availability-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const {
  AGENT_WORKSPACE_ONLY_MCP_TOOLS,
  AGENT_WORKSPACE_REVOKED_FILENAME,
  HUMAN_ONLY_AGENT_MCP_TOOLS,
  agentToolAvailability,
  agentWorkspaceState,
  assertAgentMcpToolAllowed,
  isAgentMcpToolAllowed,
} = await import("./proposal-gate.mjs");

function seed(projectId, metadata, markers = []) {
  fs.mkdirSync(path.join(root, projectId), { recursive: true });
  fs.writeFileSync(path.join(root, projectId, "metadata.json"), JSON.stringify(metadata));
  for (const marker of markers) fs.writeFileSync(path.join(root, projectId, marker), "{}");
}

seed("live", { agent_workspace: true });
seed("handed", { agent_workspace: true }, [".assembly-handoff.json"]);
seed("edited", {}, [AGENT_WORKSPACE_REVOKED_FILENAME]);
seed("ordinary", {});
fs.mkdirSync(path.join(root, "broken"));
fs.writeFileSync(path.join(root, "broken", "metadata.json"), "{not json");

const cases = [
  ["live", "live", null],
  ["handed", "handed_off", "WORKSPACE_HANDED_OFF"],
  ["edited", "human_edited", "WORKSPACE_HUMAN_EDITED"],
  ["ordinary", "ordinary", "NOT_AGENT_WORKSPACE"],
  ["broken", "missing", "PROJECT_UNREADABLE"],
  ["absent", "missing", "PROJECT_UNREADABLE"],
  ["../live", "invalid_id", "PROJECT_REQUIRED"],
  [undefined, "invalid_id", "PROJECT_REQUIRED"],
];

test("each workspace state has a distinct reason an agent can relay", () => {
  for (const [projectId, state, code] of cases) {
    assert.equal(agentWorkspaceState(projectId), state, String(projectId));
    const availability = agentToolAvailability("elements_batch", projectId);
    assert.equal(availability.enabled, code === null, String(projectId));
    assert.equal(availability.reason_code, code, String(projectId));
    if (code) {
      assert.equal(availability.use_instead, "proposal_create");
      assert.match(availability.reason, /\S/);
    }
  }
});

test("a handoff marker outranks stale grant metadata", () => {
  assert.equal(agentToolAvailability("element_trim", "handed").reason_code, "WORKSPACE_HANDED_OFF");
});

test("availability and enforcement agree for every gated tool and state", () => {
  const tools = [...AGENT_WORKSPACE_ONLY_MCP_TOOLS, ...HUMAN_ONLY_AGENT_MCP_TOOLS, "proposal_create", "timeline_get"];
  for (const [projectId] of cases) {
    for (const tool of tools) {
      const { enabled } = agentToolAvailability(tool, projectId);
      assert.equal(isAgentMcpToolAllowed(tool, { project_id: projectId }), enabled, `${tool} on ${projectId}`);
      if (enabled) assert.doesNotThrow(() => assertAgentMcpToolAllowed(tool, { project_id: projectId }));
      else assert.throws(() => assertAgentMcpToolAllowed(tool, { project_id: projectId }));
    }
  }
});

test("refusals are typed: nothing changed and the recovery names the allowed route", () => {
  try {
    assertAgentMcpToolAllowed("element_delete", { project_id: "edited" });
    assert.fail("expected a refusal");
  } catch (error) {
    assert.equal(error.toolError.code, "PROPOSAL_GATED");
    assert.equal(error.toolError.reason_code, "WORKSPACE_HUMAN_EDITED");
    assert.equal(error.toolError.state_changed, false);
    assert.equal(error.toolError.retryable, false);
    assert.equal(error.toolError.recovery.tool, "proposal_create");
    assert.match(error.message, /proposal-gated outside an agent_workspace project/);
  }
  try {
    assertAgentMcpToolAllowed("proposal_approve", { project_id: "live" });
    assert.fail("expected a refusal");
  } catch (error) {
    assert.equal(error.toolError.code, "NOT_AUTHORIZED");
    assert.equal(error.toolError.reason_code, "HUMAN_ONLY");
    assert.equal(error.toolError.state_changed, false);
  }
});

/** One process per call; every request line is newline-terminated, as a real client sends it. */
function serve(params) {
  const input = [
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "availability-test", version: "1" } } },
    { jsonrpc: "2.0", id: 1, method: "tools/call", params },
  ].map(message => JSON.stringify(message).concat("\n")).join("");
  const result = spawnSync(process.execPath, ["mcp/server.mjs"], {
    cwd: new URL("..", import.meta.url), input, encoding: "utf8",
    // An unreachable editor keeps the test hermetic: none of these calls may need HTTP.
    env: { ...process.env, TIMELINE_PROJECTS_DIR: root, TIMELINE_EDITOR_BASE_URL: "http://127.0.0.1:9" },
  });
  assert.equal(result.status, 0, result.stderr);
  const reply = result.stdout.trim().split("\n").map(line => JSON.parse(line)).find(message => message.id === 1);
  assert.ok(reply, `no reply for ${params.name}: ${result.stdout.slice(-400)}`);
  return reply;
}

test("the served catalog reports availability, and the served refusal matches it", () => {
  const report = serve({ name: "capability_catalog", arguments: { action: "availability", project_id: "handed", tools: ["element_trim", "proposal_create"] } });
  const refusal = serve({ name: "element_trim", arguments: { project_id: "handed", element_id: "x", trim_start: 0 } });
  const invalid = serve({ name: "capability_catalog", arguments: { action: "availability", project_id: "handed", tools: ["no_such_tool"] } });
  const body = JSON.parse(report.result.content[0].text);
  assert.equal(body.direct_writes_enabled, false);
  assert.deepEqual(body.tools.map(tool => [tool.tool, tool.enabled, tool.reason_code]),
    [["element_trim", false, "WORKSPACE_HANDED_OFF"], ["proposal_create", true, null]]);

  assert.equal(refusal.result.isError, true);
  assert.equal(refusal.result.structuredContent.code, "PROPOSAL_GATED");
  assert.equal(refusal.result.structuredContent.reason_code, "WORKSPACE_HANDED_OFF");
  assert.equal(refusal.result.structuredContent.state_changed, false);

  assert.equal(invalid.result.isError, true);
  assert.equal(invalid.result.structuredContent.code, "INVALID_CATALOG_QUERY");
});
