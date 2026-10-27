import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workspace-grant-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const {
  AGENT_WORKSPACE_ONLY_MCP_TOOLS,
  HUMAN_ONLY_AGENT_MCP_TOOLS,
  agentWriteLeasePath,
  assertAgentMcpToolAllowed,
  isAgentMcpToolAllowed,
  isAgentWorkspaceProject,
  withAgentWriteLease,
} = await import("./proposal-gate.mjs");

function seedProject(projectId, metadata) {
  fs.mkdirSync(path.join(root, projectId), { recursive: true });
  fs.writeFileSync(
    path.join(root, projectId, "metadata.json"),
    JSON.stringify({ delivery_target: "web", ...metadata }, null, 2),
    "utf8",
  );
}

seedProject("workspace-fixture", { agent_workspace: true });
seedProject("human-fixture", {});
seedProject("revoked-fixture", { agent_workspace: false });

test("mutation tools are allowed inside a live agent_workspace project", () => {
  assert.equal(isAgentWorkspaceProject("workspace-fixture"), true);
  for (const toolName of AGENT_WORKSPACE_ONLY_MCP_TOOLS) {
    assert.equal(
      isAgentMcpToolAllowed(toolName, { project_id: "workspace-fixture" }),
      true,
      `${toolName} must be usable while assembling a granted workspace project`,
    );
    assert.doesNotThrow(() => assertAgentMcpToolAllowed(toolName, { project_id: "workspace-fixture" }));
  }
});

test("the same mutation tools are refused on a normal project", () => {
  for (const projectId of ["human-fixture", "revoked-fixture", "no-such-project", undefined]) {
    for (const toolName of AGENT_WORKSPACE_ONLY_MCP_TOOLS) {
      assert.equal(
        isAgentMcpToolAllowed(toolName, { project_id: projectId }),
        false,
        `${toolName} must fail closed on ${projectId}`,
      );
    }
    assert.throws(
      () => assertAgentMcpToolAllowed("elements_batch", { project_id: projectId }),
      /proposal-gated outside an agent_workspace project/,
    );
  }
});

test("a project id that escapes the projects root is never a workspace", () => {
  assert.equal(isAgentWorkspaceProject("../workspace-fixture"), false);
  assert.equal(isAgentWorkspaceProject(""), false);
  assert.equal(isAgentWorkspaceProject(null), false);
});

test("approve, reject, and history restore are refused in BOTH project kinds", () => {
  for (const toolName of HUMAN_ONLY_AGENT_MCP_TOOLS) {
    for (const projectId of ["workspace-fixture", "human-fixture"]) {
      assert.equal(isAgentMcpToolAllowed(toolName, { project_id: projectId }), false);
      assert.throws(
        () => assertAgentMcpToolAllowed(toolName, { project_id: projectId }),
        /human-only/,
      );
    }
  }
});

test("read, import, and proposal tools stay allowed everywhere", () => {
  for (const toolName of ["assembly_create", "assembly_get", "timeline_get", "media_import", "proposal_create", "proposal_spatial_preflight", "proposal_preview", "audition_create", "run_instrument"]) {
    assert.equal(isAgentMcpToolAllowed(toolName, { project_id: "human-fixture" }), true);
  }
});

test("a granted call runs under a write lease and always releases it", async () => {
  const leasePath = agentWriteLeasePath("workspace-fixture");
  let seen = null;
  const result = await withAgentWriteLease("workspace-fixture", "elements_batch", () => {
    seen = JSON.parse(fs.readFileSync(leasePath, "utf8"));
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(seen.tool, "elements_batch");
  assert.ok(seen.expires_at_ms > Date.now());
  assert.equal(fs.existsSync(leasePath), false);

  await assert.rejects(
    withAgentWriteLease("workspace-fixture", "elements_batch", () => { throw new Error("handler blew up"); }),
    /handler blew up/,
  );
  assert.equal(fs.existsSync(leasePath), false);
});

test("no lease is taken for a project that is not a granted workspace", async () => {
  await withAgentWriteLease("human-fixture", "audition_create", () => {
    assert.equal(fs.existsSync(agentWriteLeasePath("human-fixture")), false);
  });
  // A project that does not exist yet must not be conjured into being by the lease
  // (audition_create decides create-vs-append from the directory's existence).
  await withAgentWriteLease("not-created-yet", "audition_create", () => {});
  assert.equal(fs.existsSync(path.join(root, "not-created-yet")), false);
});

test("a live workspace grant does not reach the served tool call for a human project", () => {
  const input = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "grant-test", version: "1" } },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "element_delete", arguments: { project_id: "human-fixture", element_id: "x" } },
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "proposal_approve", arguments: { project_id: "workspace-fixture", proposal_id: "p", option_id: "o" } },
    },
  ].map((message) => JSON.stringify(message)).join("\n");

  const result = spawnSync(process.execPath, ["mcp/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    input,
    encoding: "utf8",
    env: { ...process.env, TIMELINE_PROJECTS_DIR: root },
  });
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  const mutation = responses.find((message) => message.id === 2);
  assert.equal(mutation.result.isError, true);
  assert.match(mutation.result.content[0].text, /agent_workspace project/);
  const approval = responses.find((message) => message.id === 3);
  assert.equal(approval.result.isError, true);
  assert.match(approval.result.content[0].text, /human-only/);
});

test("handoff marker refuses all direct tools even with stale grant metadata", () => {
  seedProject("handed-off", { agent_workspace: true });
  fs.writeFileSync(path.join(root, "handed-off", ".assembly-handoff.json"), "{}");
  for (const name of AGENT_WORKSPACE_ONLY_MCP_TOOLS) {
    assert.equal(isAgentMcpToolAllowed(name, { project_id: "handed-off" }), false, name);
  }
  assert.equal(isAgentMcpToolAllowed("proposal_create", { project_id: "handed-off" }), true);
  assert.equal(isAgentMcpToolAllowed("assembly_handoff", { project_id: "handed-off" }), true);
});

test("dispatch rechecks a grant closed after tool admission", async () => {
  seedProject("dispatch-race", { agent_workspace: true });
  assertAgentMcpToolAllowed("elements_batch", { project_id: "dispatch-race" });
  fs.writeFileSync(path.join(root, "dispatch-race", ".assembly-handoff.json"), "{}");
  let dispatched = false;
  await assert.rejects(withAgentWriteLease("dispatch-race", "elements_batch", () => { dispatched = true; }), /proposal-gated/);
  assert.equal(dispatched, false);
});
