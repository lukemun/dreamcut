import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import test from "node:test";
import { editorAgentTools } from "./capability-catalog.mjs";

test("editor_context_get reads the open project through one read-only route", { timeout: 10000 }, async t => {
  const requests = [];
  const context = { status: "current", open_project: { project_id: "city-walk", title: "City walk", route: "editor", updated_at: "2026-10-12T12:00:00.000Z", age_seconds: 12 }, other_open_windows: [], open_tabs: [{ project_id: "city-walk", title: "City walk" }], fresh_minutes: 30 };
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* drain */ }
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/api/agent/")) return res.end("{}");
    requests.push([req.method, req.url]);
    res.end(JSON.stringify(context));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  // The editing profile exposes it without a family load: the agent needs it before it knows a project.
  const child = spawn(process.execPath, ["mcp/server.mjs", "--profile=editing"], {
    env: { ...process.env, TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", line => { const value = JSON.parse(line); pending.get(value.id)?.(value); });
  const send = (id, method, params) => {
    const response = new Promise(resolve => pending.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return response;
  };
  const tool = (await send(1, "tools/list", {})).result.tools.find(candidate => candidate.name === "editor_context_get");
  assert.ok(tool, "editor_context_get is listed in the editing profile");
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["project_id"]);
  assert.match(tool.description, /project_shown/);
  assert.match(tool.description, /ask which project/);

  const result = await send(2, "tools/call", { name: "editor_context_get", arguments: {} });
  assert.ok(!result.result.isError);
  assert.equal(JSON.parse(result.result.content[0].text).open_project.project_id, "city-walk");
  const shown = await send(3, "tools/call", { name: "editor_context_get", arguments: { project_id: "nyc meet/neo" } });
  assert.ok(!shown.result.isError);
  const rejected = await send(4, "tools/call", { name: "editor_context_get", arguments: { project: "x" } });
  assert.ok(rejected.result.isError, "unknown arguments are rejected");
  assert.deepEqual(requests, [["GET", "/api/editor-context"], ["GET", "/api/editor-context?project_id=nyc%20meet%2Fneo"]]);
});

test("the in-editor agent, already bound to its project, does not get editor_context_get", () => {
  assert.equal(editorAgentTools().has("editor_context_get"), false);
  assert.equal(editorAgentTools().has("timeline_get"), true);
});
