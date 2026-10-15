import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import test from "node:test";
import { productSignalSchema } from "../src/lib/observability/product-signals.ts";

test("the server emits catalog searches and rejected arguments the editor's signal schema accepts", { timeout: 15000 }, async t => {
  const signals = [];
  let arrived; const twoSignals = new Promise(resolve => { arrived = resolve; });
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/agent/product-signals") { signals.push(JSON.parse(raw)); if (signals.length === 2) arrived(); }
    res.end("{}");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, ["mcp/server.mjs"], { env: { ...process.env, DREAMCUT_TOOL_PROFILE: "full", DREAMCUT_TOOL_FAMILIES: "", TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` }, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", line => { const value = JSON.parse(line); pending.get(value.id)?.(value.result); });
  let id = 0;
  const call = (name, args) => { const requestId = ++id; const response = new Promise(resolve => pending.set(requestId, resolve)); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: args } }) + "\n"); return response; };
  await call("capability_catalog", { action: "search", query: "make a 3d spinning logo" });
  const rejected = await call("video_search", { query: "cat", analyze: true });
  assert.equal(rejected.structuredContent.code, "INVALID_ARGUMENTS");
  await twoSignals;
  // Signals are fire-and-forget, so they may arrive in either order.
  const parsed = signals.map(signal => productSignalSchema.parse(signal));
  const search = parsed.find(signal => signal.event === "catalog_search"), rejection = parsed.find(signal => signal.event === "arguments_rejected");
  assert.deepEqual([search?.event === "catalog_search" && search.miss, search?.client], [true, "mcp-direct"]);
  if (rejection?.event === "arguments_rejected") {
    assert.equal(rejection.layer, "server_schema");
    assert.deepEqual(rejection.unknown_fields.map(field => field.field), ["analyze"]);
  } else assert.fail("no arguments_rejected signal");
});
