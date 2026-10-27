import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import test from "node:test";

test("feedback MCP tools publish capture/coverage and use the evidence API without timeline writes", async t => {
  const catalog = JSON.parse(spawnSync(process.execPath, ["mcp/server.mjs", "--catalog"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout);
  const tools = new Map(catalog.tools.map(tool => [tool.name, tool]));
  for (const name of ["editing_feedback_record", "editing_feedback_check", "editing_feedback_disposition"]) assert.ok(tools.has(name));
  assert.ok(tools.get("elements_batch").inputSchema.properties.responds_to_feedback_ids);
  assert.ok(tools.get("editing_feedback_record").inputSchema.required.includes("provenance"));
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (!/\/api\/agent\/(tool-events|product-signals)$/.test(req.url)) requests.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ event_id: "feedback:fixture", unaccounted_feedback_ids: [] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, ["mcp/server.mjs"], {
    env: { ...process.env, TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` }, stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", line => {
    const response = JSON.parse(line);
    pending.get(response.id)?.(response);
  });
  async function call(id, name, args) {
    const result = new Promise(resolve => pending.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n");
    const response = await result;
    assert.equal(response.result.isError, undefined);
  }
  await call(1, "editing_feedback_record", { project_id: "fixture", session_id: "s", turn_id: "t", direction: "Keep the pause", provenance: "user_words" });
  await call(2, "editing_feedback_check", { project_id: "fixture" });
  await call(3, "editing_feedback_disposition", { project_id: "fixture", feedback_id: "feedback:fixture", session_id: "s", turn_id: "end", disposition: "deferred", reason: "Awaiting choice" });
  assert.deepEqual(requests.map(r => [r.method, r.path]), [
    ["POST", "/api/projects/fixture/memory/feedback"], ["GET", "/api/projects/fixture/memory/feedback"], ["POST", "/api/projects/fixture/memory/feedback"],
  ]);
  assert.equal(requests[0].body.direction, "Keep the pause");
  assert.equal(requests[2].body.action, "disposition");
});
