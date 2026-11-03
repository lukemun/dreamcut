import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";

test("storyboard_draft carries visuals over a shot to the draft route and storyboard_get returns them", { timeout: 10000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-tools-"));
  fs.mkdirSync(path.join(root, "talk"), { recursive: true });
  fs.writeFileSync(path.join(root, "talk", "metadata.json"), JSON.stringify({ delivery_target: "web" }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let saved = null;
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/api/agent/") && /tool-events|product-signals/.test(req.url)) return res.end("{}");
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ method: req.method, path: req.url, body });
    if (req.method === "POST") saved = body;
    // A stand-in for the route: echo the stored draft back the way storyboard_get reads it.
    res.end(JSON.stringify({ revision: saved ? 1 : 0, beats: saved?.beats ?? [] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, ["mcp/server.mjs"], {
    env: { ...process.env, TIMELINE_PROJECTS_DIR: root, TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` },
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
  const listed = await send(1, "tools/list", {});
  const draft = listed.result.tools.find(tool => tool.name === "storyboard_draft");
  const get = listed.result.tools.find(tool => tool.name === "storyboard_get");
  assert.ok(draft && get, "both storyboard tools are listed");
  const visuals = draft.inputSchema.properties.beats.items.properties.shots.items.properties.visuals;
  assert.deepEqual(visuals.items.required, ["source", "at", "duration", "label"]);
  for (const field of ["source", "at", "duration", "start", "label", "note"]) assert.ok(visuals.items.properties[field].description, `${field} is described`);
  assert.match(visuals.description, /never as separate shots/);
  assert.match(draft.description, /speech/);
  assert.match(get.description, /visuals/);

  const beats = [{ name: "Point one", shots: [{ source: "sources/talk.mp4", start: 0, end: 8, label: "Why it matters",
    visuals: [{ source: "sources/pricing.png", at: 1.5, duration: 3, label: "Pricing page", note: "zoom into the price" }] }] }];
  const call = await send(2, "tools/call", { name: "storyboard_draft", arguments: { project_id: "talk", revision: 0, beats } });
  assert.ok(!call.result.isError, JSON.stringify(call.result));
  const read = await send(3, "tools/call", { name: "storyboard_get", arguments: { project_id: "talk" } });
  assert.ok(!read.result.isError);
  assert.deepEqual(JSON.parse(read.result.content[0].text).beats, beats);
  assert.deepEqual(requests.map(r => [r.method, r.path]), [["POST", "/api/projects/talk/storyboard/draft"], ["GET", "/api/projects/talk/storyboard/draft"]]);
  assert.deepEqual(requests[0].body, { revision: 0, beats });
});
