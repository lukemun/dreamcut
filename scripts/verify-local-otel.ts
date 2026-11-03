import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readCodexUsage } from "../src/lib/observability/codex-usage";
import { codexOtelArgs } from "../src/lib/observability/codex-otel";
import { readEnv } from "../src/lib/env-name";

async function main() {
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-otel-proof-"));
const listener = net.createServer();
listener.listen(0, "127.0.0.1"); await once(listener, "listening");
const port = (listener.address() as net.AddressInfo).port;
await new Promise<void>(resolve => listener.close(() => resolve()));
const config = path.join(root, "collector.yaml");
fs.writeFileSync(config, fs.readFileSync("scripts/otel/collector.yaml", "utf8").replace("127.0.0.1:4318", `127.0.0.1:${port}`).replace("  telemetry:\n", "  telemetry:\n    metrics:\n      level: none\n"));
const endpoint = `http://127.0.0.1:${port}/v1/logs`;
const executable = readEnv("OTELCOL_EXECUTABLE") || "otelcol-contrib";
let child: ChildProcess | undefined;
let native: ChildProcess | undefined;
let server: http.Server | undefined;
let diagnostic = "";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) { if (await check()) return; if (child?.exitCode != null) throw new Error(`Collector exited: ${diagnostic}`); await delay(100); }
  throw new Error(`Collector verification timed out: ${diagnostic}`);
}
async function start() {
  child = spawn(executable, ["--config", config], { env: { ...process.env, DREAMCUT_OTEL_DIR: root }, stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", error => { diagnostic = error.message; });
  child.stderr?.on("data", data => { diagnostic = (diagnostic + String(data)).slice(-3000); });
  await waitFor(async () => { try { await fetch(endpoint); return true; } catch { return false; } });
}
async function stop() {
  if (child && child.exitCode === null) { const done = once(child, "exit"); child.kill("SIGTERM"); await done; }
}
try {
  await start();
  const marker = "PRIVATE-FIXTURE-CONTENT";
  const fields = { "event.name": "codex.sse_event", "event.kind": "response.completed", "conversation.id": "synthetic", model: "fixture-model", input_token_count: "100", output_token_count: "20", cached_token_count: "80", reasoning_token_count: "5", prompt: marker, output: marker, arguments: marker, "user.email": marker };
  const payload = { resourceLogs: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "codex_cli_rs" } }, { key: "user.email", value: { stringValue: marker } }] }, scopeLogs: [{ logRecords: [{ timeUnixNano: "1780000000000000000", body: { stringValue: marker }, attributes: Object.entries(fields).map(([key, value]) => ({ key, value: { stringValue: value } })) }] }] }] };
  for (let i = 0; i < 2; i++) assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })).status, 200);
  await waitFor(async () => (await readCodexUsage({}, root)).coverage.duplicates === 1);
  assert.ok(!fs.readFileSync(path.join(root, "logs.jsonl"), "utf8").includes(marker));
  await stop(); await start(); // rotation-backed files must survive restarts
  assert.equal((await readCodexUsage({}, root)).known_tokens.total, 120);

  // A different runner uses standard GenAI events through the same receiver.
  const standard = structuredClone(payload);
  const record = standard.resourceLogs[0].scopeLogs[0].logRecords[0];
  Object.assign(record, { eventName: "gen_ai.client.inference.operation.details" });
  record.attributes = Object.entries({ "gen_ai.provider.name": "fixture-local", "gen_ai.request.model": "local-model", "gen_ai.conversation.id": "synthetic", "gen_ai.usage.input_tokens": "40", "gen_ai.usage.output_tokens": "6", "gen_ai.input.messages": marker, "error.type": marker }).map(([key, value]) => ({ key, value: { stringValue: value } }));
  assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(standard) })).status, 200);
  await waitFor(async () => (await readCodexUsage({ provider: "fixture-local" }, root)).known_tokens.total === 46);
  assert.ok(!fs.readFileSync(path.join(root, "logs.jsonl"), "utf8").includes(marker));
  assert.equal((await readCodexUsage({ provider: "fixture-local" }, root)).rows[0].errors, 1);

  if (process.argv.includes("--codex-native")) {
    // No real model calls: the installed Codex talks to this synthetic Responses API only.
    server = http.createServer(async (req, res) => {
      for await (const _chunk of req) { /* Do not retain request content. */ }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const message = { id: "msg_fixture", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "OK", annotations: [] }] };
      const events = [
        { type: "response.created", response: { id: "resp_fixture", object: "response", status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index: 0, item: { ...message, status: "in_progress", content: [] } },
        { type: "response.output_text.delta", item_id: message.id, output_index: 0, content_index: 0, delta: "OK" },
        { type: "response.output_item.done", output_index: 0, item: message },
        { type: "response.completed", response: { id: "resp_fixture", object: "response", status: "completed", output: [message], usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120, input_tokens_details: { cached_tokens: 80 }, output_tokens_details: { reasoning_tokens: 5 } } } },
      ];
      for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const apiPort = (server.address() as net.AddressInfo).port;
    const args = ["exec", ...codexOtelArgs(endpoint), "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only",
      "-c", 'model="fixture-model"', "-c", 'model_provider="fixture"', "-c", `model_providers.fixture={name="Fixture",base_url="http://127.0.0.1:${apiPort}/v1",wire_api="responses",requires_openai_auth=false}`, "Reply OK without tools."];
    native = spawn(readEnv("CODEX_EXECUTABLE") || "codex", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; native.stderr?.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-4000); });
    native.stdout?.resume();
    const timer = setTimeout(() => native?.kill("SIGKILL"), 25000);
    const [code] = await once(native, "exit"); clearTimeout(timer);
    assert.equal(code, 0, stderr);
    await waitFor(async () => (await readCodexUsage({}, root)).rows.some(r => r.conversation !== "synthetic" && r.usage_responses > 0));
    const rows = (await readCodexUsage({}, root)).rows.filter(r => r.conversation !== "synthetic");
    assert.equal(rows.reduce((n, r) => n + r.input_tokens, 0), 100);
    assert.equal(rows.reduce((n, r) => n + r.output_tokens, 0), 20);
  }
  console.log(JSON.stringify({ collector: "passed", redaction: "passed", replay: "passed", restart_retention: "passed", native_codex: process.argv.includes("--codex-native") ? "passed (synthetic local model)" : "not run" }));
} finally {
  if (native?.exitCode === null) native.kill("SIGKILL");
  if (server) { server.closeAllConnections(); server.close(); }
  await stop(); fs.rmSync(root, { recursive: true, force: true });
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
