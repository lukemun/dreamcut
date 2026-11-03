import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import test from "node:test";

test("video search is bounded, read-only and preserves timed evidence and pagination", { timeout: 10000 }, async t => {
  const requests = [];
  const result = { videos: [{ source_sha256: "a".repeat(64), matching_frames: [{ time_seconds: 9.95, description: "Cat beside sofa" }], projects: [{ id: "fixture" }] }], total: 4, next_offset: 2, coverage: "Sampled frames; between-frame content unknown" };
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/api/agent/") && /tool-events|product-signals/.test(req.url)) { req.resume(); return res.end("{}"); }
    if (req.method === "POST") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      requests.push({ method: req.method, url: req.url, body: JSON.parse(raw) });
      return res.end(JSON.stringify({ state: "ready_in_library", library_url: "/p/fixture/library?presentation=fixture", timeline_changed: false }));
    }
    requests.push({ method: req.method, url: req.url });
    res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, ["mcp/server.mjs"], { env: { ...process.env, DREAMCUT_TOOL_PROFILE: "full", DREAMCUT_TOOL_FAMILIES: "", TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` }, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", line => { const value = JSON.parse(line); pending.get(value.id)?.(value.result); });
  let id = 0;
  const call = (args, name = "video_search") => { const requestId = ++id; const response = new Promise(resolve => pending.set(requestId, resolve)); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: args } }) + "\n"); return response; };
  const found = await call({ query: "cats ending", project_id: "fixture.v2", offset: 1, limit: 1 });
  assert.ok(!found.isError);
  assert.deepEqual(JSON.parse(found.content[0].text), result);
  await call({ query: "cat" });
  for (const invalid of [{ query: "cat", project_id: "../outside" }, ...[".", "..", "a/b", "x".repeat(129)].map(project_id => ({query:"cat", project_id})), { query: "cat", limit: 101 }, { query: "cat", offset: -1 }, { query: "x".repeat(501) }]) {
    const failure = await call(invalid);
    assert.equal(failure.isError, true);
    assert.equal(failure.structuredContent.code, "INVALID_VIDEO_SEARCH");
    assert.equal(failure.structuredContent.state_changed, false);
  }
  // Unknown fields are rejected by the shared argument check, which names them, before the handler runs.
  const unknown = await call({ query: "cat", analyze: true });
  assert.equal(unknown.structuredContent.code, "INVALID_ARGUMENTS");
  assert.match(unknown.structuredContent.message, /analyze is not an accepted field/);
  assert.equal(unknown.structuredContent.state_changed, false);
  assert.deepEqual(requests, [{ method: "GET", url: "/api/video-search?q=cats+ending&project_id=fixture.v2&offset=1&limit=1" }, { method: "GET", url: "/api/video-search?q=cat&limit=8" }]);
  const selection = { title: "Cats found for you", items: [{ project_id: "fixture", asset_id: "source", source_sha256: "a".repeat(64), time_seconds: 9.95 }] };
  const shown = await call({ project_id: "fixture", ...selection }, "library_present");
  assert.equal(JSON.parse(shown.content[0].text).timeline_changed, false);
  assert.deepEqual(requests.at(-1), { method: "POST", url: "/api/projects/fixture/library-presentation", body: selection });
  const refused = await call({ project_id: "../outside", ...selection }, "library_present");
  assert.equal(refused.isError, true); assert.equal(refused.structuredContent.state_changed, false);
  assert.equal(requests.length, 3);
});
