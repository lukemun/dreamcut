import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import test from "node:test";

test("waveform tool prepares without placement and reports partial failures", { timeout: 10000 }, async t => {
  const requests = [];
  const source = "/api/projects/fixture/media/sources/sound.wav";
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/api/agent/") && /tool-events|product-signals/.test(req.url)) return res.end("{}");
    requests.push({ path: req.url, body });
    res.end(JSON.stringify({
      items: [{ source_url: source, source_duration_seconds: 1, peaks: [0, .5, 1] }],
      errors: body.sources.includes("bad") ? [{ source_url: "bad", error: "Source is not local" }] : [],
    }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const child = spawn(process.execPath, ["mcp/server.mjs"], {
    env: { ...process.env, TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", line => {
    const value = JSON.parse(line);
    pending.get(value.id)?.(value.result);
  });
  function call(id, sources) {
    const response = new Promise(resolve => pending.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: {
      name: "audio_waveform_prepare", arguments: { project_id: "fixture", sources },
    } }) + "\n");
    return response;
  }
  const success = await call(1, [source]);
  assert.ok(!success.isError);
  const summary = JSON.parse(success.content[0].text);
  assert.deepEqual(summary.items, [{ source_url: source, source_duration_seconds: 1, peak_count: 3 }]);
  const failure = await call(2, [source, "bad"]);
  assert.equal(failure.isError, true);
  const error = failure.structuredContent;
  assert.equal(error.code, "WAVEFORM_PREPARATION_FAILED");
  assert.equal(error.state_changed, true);
  assert.equal(error.items.length, 1);
  assert.equal(error.errors[0].source_url, "bad");
  assert.equal(error.recovery.action, "inspect_source_errors");
  assert.deepEqual(requests, [
    { path: "/api/projects/fixture/timeline/peaks/prepare", body: { sources: [source] } },
    { path: "/api/projects/fixture/timeline/peaks/prepare", body: { sources: [source, "bad"] } },
  ]);
});
