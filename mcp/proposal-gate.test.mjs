import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  AGENT_WORKSPACE_ONLY_MCP_TOOLS,
  assertAgentMcpToolAllowed,
  BLOCKED_AGENT_MCP_TOOLS,
  HUMAN_ONLY_AGENT_MCP_TOOLS,
  isAgentMcpToolAllowed,
} from "./proposal-gate.mjs";

test("agent MCP allows proposal creation and blocks direct timeline mutation", () => {
  assert.equal(isAgentMcpToolAllowed("proposal_create"), true);
  assert.equal(isAgentMcpToolAllowed("proposal_preview"), true);
  assert.equal(isAgentMcpToolAllowed("elements_batch"), false);
  assert.equal(isAgentMcpToolAllowed("element_props_patch"), false);
  assert.throws(
    () => assertAgentMcpToolAllowed("elements_batch"),
    /Use proposal_create/,
  );
});

test("agent MCP cannot approve or reject its own proposal", () => {
  assert.equal(BLOCKED_AGENT_MCP_TOOLS.has("proposal_approve"), true);
  assert.equal(BLOCKED_AGENT_MCP_TOOLS.has("proposal_reject"), true);
});

test("published MCP catalog exposes proposal review and bounded assembly creation, and never the human-only tools", () => {
  const result = spawnSync(process.execPath, ["mcp/server.mjs", "--catalog"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const catalog = JSON.parse(result.stdout);
  const names = new Set(catalog.tools.map((tool) => tool.name));

  assert.equal(names.has("timeline_get"), true);
  assert.equal(names.has("assembly_create"), true);
  assert.equal(names.has("assembly_get"), true);
  assert.equal(names.has("assembly_handoff"), true);
  assert.equal(names.has("media_import"), true);
  assert.equal(names.has("proposal_create"), true);
  assert.equal(names.has("proposal_reveal_sequence"), true);
  assert.equal(names.has("proposal_work_record"), true);
  assert.equal(names.has("proposal_preview"), true);
  assert.equal(names.has("audition_create"), true);
  assert.equal(names.has("run_instrument"), true);
  for (const humanOnlyName of HUMAN_ONLY_AGENT_MCP_TOOLS) {
    assert.equal(names.has(humanOnlyName), false, `${humanOnlyName} must stay out of the agent catalog`);
  }
  // The workspace-only mutation tools ARE published (tools/list has no project to gate on),
  // each carrying the rule the per-call assert enforces.
  const byName = new Map(catalog.tools.map((tool) => [tool.name, tool]));
  for (const workspaceOnlyName of AGENT_WORKSPACE_ONLY_MCP_TOOLS) {
    const tool = byName.get(workspaceOnlyName);
    assert.ok(tool, `${workspaceOnlyName} must be published so a granted project can be assembled`);
    assert.match(tool.description, /agent_workspace project/);
  }
  assert.equal(BLOCKED_AGENT_MCP_TOOLS.size, AGENT_WORKSPACE_ONLY_MCP_TOOLS.size + HUMAN_ONLY_AGENT_MCP_TOOLS.size);
});

test("calling a hidden direct tool fails closed before reaching the editor API", () => {
  const input = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "proposal-gate-test", version: "1" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "elements_batch",
        arguments: { project_id: "not-contacted", operations: [] },
      },
    },
  ].map((message) => JSON.stringify(message)).join("\n");

  const result = spawnSync(process.execPath, ["mcp/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    input,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const blocked = responses.find((message) => message.id === 2);
  assert.equal(blocked.result.isError, true);
  assert.match(blocked.result.content[0].text, /proposal-gated/);
});
