import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { agentHost } from "./editor-runtime.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-setup-handoff-"));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("after setup hands off, the launcher's progress tool says the tools are live and how to see them", () => {
  const input = [
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "handoff-test", version: "1" } } },
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "dreamcut_setup_status", arguments: {} } },
  ].map(message => JSON.stringify(message).concat("\n")).join("");
  const result = spawnSync(process.execPath, ["mcp/server.mjs"], {
    cwd: REPO, input, encoding: "utf8",
    env: { ...process.env, TIMELINE_PROJECTS_DIR: root, TIMELINE_EDITOR_BASE_URL: "http://127.0.0.1:9" },
  });
  assert.equal(result.status, 0, result.stderr);
  const replies = result.stdout.trim().split("\n").map(line => JSON.parse(line));
  const status = replies.find(message => message.id === 1);
  assert.equal(status.error, undefined);
  assert.notEqual(status.result.isError, true);
  assert.match(status.result.content[0].text, /finished setting up; \d+ DreamCut tools are live/);
  assert.match(status.result.content[0].text, /start a new chat or session/);
});

test("dreamcut --help prints usage and an unknown option is refused, neither starting the editor", () => {
  const env = { ...process.env, TIMELINE_PROJECTS_DIR: root };
  for (const argv of [["--help"], ["-h"], ["help"], ["mcp", "--help"]]) {
    const result = spawnSync(process.execPath, ["bin/dreamcut.mjs", ...argv], { cwd: REPO, encoding: "utf8", env, timeout: 10_000 });
    assert.equal(result.status, 0, `${argv.join(" ")}: ${result.stderr}`);
    assert.match(result.stdout, /^Usage:/);
    assert.doesNotMatch(result.stderr, /Starting DreamCut/);
  }
  const bogus = spawnSync(process.execPath, ["bin/dreamcut.mjs", "--bogus"], { cwd: REPO, encoding: "utf8", env, timeout: 10_000 });
  assert.equal(bogus.status, 2);
  assert.match(bogus.stderr, /Unknown option --bogus/);
  assert.doesNotMatch(bogus.stderr, /Starting DreamCut/);
});

test("Claude Code and Codex sessions are recognised, so the editor stays in their built-in browser", () => {
  assert.equal(agentHost({ CLAUDECODE: "1" }), "Claude");
  assert.equal(agentHost({ CODEX_THREAD_ID: "t" }), "Codex");
  assert.equal(agentHost({ CODEX_SANDBOX: "seatbelt" }), "Codex");
  assert.equal(agentHost({}), null);
});
