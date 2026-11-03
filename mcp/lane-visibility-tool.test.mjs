import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

test("muted_lanes_set sets sound and picture lane sets independently through one route", { timeout: 10000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lane-visibility-tool-"));
  fs.mkdirSync(path.join(root, "workspace"), { recursive: true });
  fs.writeFileSync(path.join(root, "workspace", "metadata.json"), JSON.stringify({ delivery_target: "web", agent_workspace: true }));
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/api/agent/") && /tool-events|product-signals/.test(req.url)) return res.end("{}");
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ method: req.method, path: req.url, body });
    res.end(JSON.stringify({ muted_lane_keys: body?.muted_lane_keys ?? [], hidden_lane_keys: body?.hidden_lane_keys ?? [], history: null }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, ["mcp/server.mjs"], {
    env: { ...process.env, TIMELINE_PROJECTS_DIR: root, TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", line => {
    const value = JSON.parse(line);
    pending.get(value.id)?.(value);
  });
  const send = (id, method, params) => {
    const response = new Promise(resolve => pending.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return response;
  };
  const listed = await send(1, "tools/list", {});
  const tool = listed.result.tools.find(candidate => candidate.name === "muted_lanes_set");
  assert.ok(tool, "muted_lanes_set is listed");
  assert.deepEqual(tool.inputSchema.required, ["project_id"]);
  assert.match(tool.inputSchema.properties.hidden_lane_keys.description, /pictures/);
  assert.match(tool.description, /still plays its sound unless it is also muted/);

  const call = (id, args) => send(id, "tools/call", { name: "muted_lanes_set", arguments: { project_id: "workspace", ...args } });
  assert.ok(!(await call(2, { hidden_lane_keys: ["visual_1"] })).result.isError);
  assert.ok(!(await call(3, { muted_lane_keys: ["music_0"] })).result.isError);
  const empty = await call(4, {});
  assert.ok(empty.result?.isError || empty.error, "a call with neither set is rejected");
  assert.deepEqual(requests.filter(r => r.method === "PATCH").map(r => [r.path, r.body]), [
    ["/api/projects/workspace/timeline/muted-lanes", { hidden_lane_keys: ["visual_1"] }],
    ["/api/projects/workspace/timeline/muted-lanes", { muted_lane_keys: ["music_0"] }],
  ]);
});
