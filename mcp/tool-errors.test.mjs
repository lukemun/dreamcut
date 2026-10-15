import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { describeValidationIssue, issueFieldNotes, trimValidatorPatterns, unknownFieldHints } from "./argument-errors.mjs";
import { instrumentArgs, instrumentResult } from "./instrument-args.mjs";
import { capText, httpFailure, redactLocalText, scriptFailure, toolFailure } from "./tool-runtime.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UUID_REGEX = "/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/";

test("F6: element validation failures name each field instead of 'Invalid request body'", () => {
  const error = httpFailure("POST", "/api/projects/p/timeline/elements", 400, { error: "Invalid request body", issues: [
    { code: "invalid_format", format: "regex", pattern: "/^[a-z0-9_:-]+$/", path: ["lane_key"], message: "Invalid string: must match pattern /^[a-z0-9_:-]+$/" },
    { code: "invalid_format", format: "uuid", pattern: UUID_REGEX, path: ["beat_id"], message: "Invalid UUID" },
  ] });
  assert.match(error.message, /lane_key: Invalid string: must match the expected format/);
  assert.match(error.message, /beat_id: must be a UUID/);
  assert.doesNotMatch(error.message, /\[0-9a-fA-F\]|\^\[a-z0-9/);
  assert.equal(error.toolError.code, "INVALID_INPUT");
  assert.equal(error.toolError.retryable, false);
  assert.deepEqual(error.toolError.issues, ["lane_key: Invalid string: must match the expected format", "beat_id: must be a UUID"]);
});

test("F7: proposal props.keyframes points at the write vocabulary, and regex bodies are trimmed", () => {
  const schema = JSON.parse(fs.readFileSync(new URL("./proposal-schema.json", import.meta.url), "utf8"));
  const wrapped = { type: "object", additionalProperties: false, properties: { project_id: { type: "string" }, proposal: schema } };
  const hints = unknownFieldHints(wrapped, { project_id: "p", proposal: { options: [{ operations: [{ props: { keyframes: { playback_rate: [] } } }] }] } });
  assert.equal(hints.length, 1);
  assert.match(hints[0], /^proposal\.options\[0\]\.operations\[0\]\.props\.keyframes is not an accepted field; closest accepted: playback_speed_steps, playback_reverse/);
  // A thrown ZodError's message (the proposal route) is the issue list as JSON.
  const zodMessage = JSON.stringify([
    { code: "unrecognized_keys", keys: ["keyframes"], path: ["options", 0, "operations", 0, "props"], message: 'Unrecognized key: "keyframes"' },
    { code: "invalid_format", format: "uuid", pattern: UUID_REGEX, path: ["options", 0, "operations", 0, "element_id"], message: "Invalid UUID" },
  ], null, 2);
  const error = httpFailure("POST", "/api/projects/p/timeline/proposals", 400, { error: zodMessage });
  assert.match(error.message, /options\[0\]\.operations\[0\]\.props: unrecognized field\(s\): keyframes/);
  assert.match(error.message, /element_id: must be a UUID/);
  assert.ok(error.message.length < 400, error.message);
  assert.equal(trimValidatorPatterns('data/x must match pattern "^[a-z]+$"'), "data/x must match the expected format");
  assert.equal(describeValidationIssue({ path: [], message: "Required" }), "(request): Required");
  const notes = issueFieldNotes({ type: "object", properties: { proposal: { type: "object", properties: { title: { type: "string", description: "Short review title." } } } } }, [{ path: ["title"], message: "Too long" }]);
  assert.deepEqual(notes, ["proposal.title: Short review title."]);
});

test("F8: script failures carry a typed code and never a stack, absolute path or unbounded stderr", () => {
  const typed = scriptFailure("media_import", { exit_code: 1, stdout: "", stderr: 'Error: Missing media source: /nonexistent.mp4\n{"dreamcut_script_error":{"code":"SOURCE_NOT_FOUND","message":"Missing media source: /nonexistent.mp4","retryable":false,"recovery":{"action":"check_source_path","reason":"Confirm the file exists."}}}' });
  assert.equal(typed.message, "Missing media source: /nonexistent.mp4");
  assert.equal(typed.toolError.code, "SOURCE_NOT_FOUND");
  assert.equal(typed.toolError.recovery.action, "check_source_path");
  const stack = `${REPO}/scripts/import-media.ts:71\n  throw new Error(\`Missing media source: \${sourcePath}\`);\n        ^\n\nError: Missing media source: ${os.homedir()}/Downloads/clip.mp4\n    at <anonymous> (${REPO}/scripts/import-media.ts:71:11)\n    at ModuleJob.run (node:internal/modules/esm/module_job:271:25)\n${"x".repeat(60_000)}\n\nNode.js v22.0.0`;
  const raw = scriptFailure("media_import", { exit_code: 1, stdout: "", stderr: stack }, "Media import failed");
  assert.equal(raw.message, "Media import failed: Missing media source: ~/Downloads/clip.mp4");
  assert.equal(raw.toolError.code, "SCRIPT_FAILED");
  assert.ok(raw.toolError.diagnostic_id);
  const result = toolFailure(raw);
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, new RegExp(REPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, /\n\s+at |node_modules|module_job/);
  assert.ok(text.length < 3000);
  // The projects root follows TIMELINE_PROJECTS_DIR, which CI points at an isolated folder.
  const projectsRoot = path.resolve(REPO, process.env.TIMELINE_PROJECTS_DIR ?? "projects");
  assert.equal(redactLocalText(`${projectsRoot}/demo/timeline.json`), "projects/demo/timeline.json");
  assert.ok(capText("y".repeat(10_000)).length < 2100);
  const untyped = toolFailure(new Error(`boom at ${os.homedir()}/secret/file.txt\n    at x (${REPO}/a.mjs:1:1)`));
  assert.equal(untyped.structuredContent.message, "boom at ~/secret/file.txt");
});

test("F9: run_instrument flags are an allowlist and a non-zero exit is an error result", () => {
  for (const flag of ["--out", "--base", "--proposal-file"]) {
    assert.throws(() => instrumentArgs("frame-state", "p", [flag, "/tmp/x"]), error => error.toolError.code === "INVALID_ARGUMENTS" && error.message.includes(`${flag} is not accepted`));
  }
  assert.throws(() => instrumentArgs("frame-state", "p", ["--out=/tmp/x"]), /--out is not accepted/);
  assert.throws(() => instrumentArgs("qc", "p", ["--rm-rf"]), /not an accepted qc flag; accepted: --json, --estimate-only, --target <value>/);
  assert.throws(() => instrumentArgs("frame-state", "../p", []), /project_id must be/);
  assert.throws(() => instrumentArgs("frame-state", "p", ["--at", "../../x"]), /--at needs a valid value/);
  assert.deepEqual(instrumentArgs("frame-state", "p", ["--at", "1.5,8", "--warm-renderer"]), ["p", "--at", "1.5,8", "--warm-renderer"]);
  assert.deepEqual(instrumentArgs("qc", "p", ["--target=tiktok", "--json"]), ["p", "--target", "tiktok", "--json"]);

  const projectsDir = path.join(REPO, "projects");
  let failure;
  try { instrumentResult("frame-state", "p", { exit_code: 1, stdout: "z".repeat(200_000), stderr: `Error: Nothing to sample: the project has no captions and no --at times.\n    at main (${REPO}/scripts/frame-state.ts:131:9)` }, { root: REPO, projectsDir }); }
  catch (error) { failure = toolFailure(error); }
  assert.equal(failure.isError, true);
  assert.equal(failure.structuredContent.code, "INSTRUMENT_FAILED");
  assert.match(failure.structuredContent.message, /frame-state failed \(exit 1\): Nothing to sample/);
  assert.ok(failure.structuredContent.output_tail.length < 2100);
  assert.doesNotMatch(JSON.stringify(failure), /\n\s+at /);

  try { instrumentResult("qc", "p", { exit_code: 1, stdout: "FAIL caption overlaps safe area", stderr: "" }, { root: REPO, projectsDir }); }
  catch (error) { failure = toolFailure(error); }
  assert.equal(failure.structuredContent.code, "INSTRUMENT_CHECK_FAILED");
  assert.match(failure.structuredContent.output_tail, /caption overlaps/);

  const ok = instrumentResult("frame-state", "p", { exit_code: 0, stdout: `[frame-state] 1.000s [OK] -> a.png\nprojects/p/instruments/frame-state/frame-state.json\n[frame-state] change index: projects/p/instruments/frame-state/frame-state-changes.json`, stderr: "" }, { root: REPO, projectsDir });
  assert.equal(ok.report_path, "frame-state/frame-state.json");
  assert.deepEqual(ok.next, { tool: "timeline_evidence", arguments: { project_id: "p", report: "frame-state/frame-state.json" } });
  assert.deepEqual(instrumentResult("project-health", "p", { exit_code: 0, stdout: '{"ok":true}', stderr: "" }, { root: REPO, projectsDir }).report, { ok: true });
});

test("F10: transient failures are retryable with a code; validation failures are not", () => {
  const busy = httpFailure("POST", "/api/projects/p/analysis/cutout-preparation", 400, { error: "Cutout queue busy; retry shortly" });
  assert.equal(busy.toolError.code, "BUSY");
  assert.equal(busy.toolError.retryable, true);
  assert.equal(httpFailure("GET", "/x", 503, { error: "warming" }).toolError.code, "BUSY");
  assert.equal(httpFailure("GET", "/x", 429, null).toolError.retryable, true);
  assert.equal(httpFailure("GET", "/x", 504, null).toolError.code, "TIMEOUT");
  assert.equal(httpFailure("POST", "/x", 400, { error: "duration must be > 0" }).toolError.retryable, false);
  assert.equal(httpFailure("POST", "/x", 409, { error: "Timeline changed" }).toolError.code, "CONFLICT");
  const typed = { schema_version: 1, code: "PREVIEW_NOT_READY", message: "m", retryable: true };
  assert.equal(httpFailure("POST", "/x", 409, { error: "m", tool_error: typed }).toolError, typed);
  assert.equal(toolFailure(new Error("frame-state timed out after 600s")).structuredContent.code, "TIMEOUT");
  assert.equal(toolFailure(new Error("frame-state timed out after 600s")).structuredContent.retryable, true);
  assert.equal(toolFailure(Object.assign(new TypeError("fetch failed"))).structuredContent.code, "EDITOR_UNAVAILABLE");
  assert.equal(toolFailure(new Error("bad")).structuredContent.retryable, false);
});

test("live server explains rejected arguments and typed editor failures", { timeout: 15000 }, async t => {
  const projects = fs.mkdtempSync(path.join(os.tmpdir(), "tool-errors-"));
  t.after(() => fs.rmSync(projects, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projects, "ws"), { recursive: true });
  fs.writeFileSync(path.join(projects, "ws", "metadata.json"), JSON.stringify({ delivery_target: "web", agent_workspace: true }));
  const requests = [];
  const editor = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/api/agent/") && /tool-events|product-signals/.test(req.url)) return res.end("{}");
    requests.push(req.url);
    if (req.url.endsWith("/timeline/elements")) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid request body", issues: [{ code: "invalid_format", format: "regex", path: ["lane_key"], message: "Invalid string: must match pattern /^[a-z0-9_:-]+$/" }] }));
    }
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Cutout queue busy; retry shortly" }));
  });
  await new Promise(resolve => editor.listen(0, "127.0.0.1", resolve)); t.after(() => editor.close());
  const child = spawn(process.execPath, ["mcp/server.mjs"], { cwd: REPO, env: { ...process.env, TIMELINE_PROJECTS_DIR: projects, TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${editor.address().port}` }, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", line => { const value = JSON.parse(line); pending.get(value.id)?.(value.result); });
  const call = (id, name, args) => { const response = new Promise(resolve => pending.set(id, resolve)); child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })}\n`); return response; };

  const keyframes = await call(1, "proposal_create", { project_id: "ws", proposal: { options: [{ operations: [{ props: { keyframes: {} } }] }] } });
  assert.equal(keyframes.isError, true);
  assert.equal(keyframes.structuredContent.code, "INVALID_ARGUMENTS");
  assert.match(keyframes.structuredContent.message, /props\.keyframes is not an accepted field; closest accepted: playback_speed_steps/);

  const element = await call(2, "element_create", { project_id: "ws", element: { type: "caption_text", lane_key: "Bad Lane" } });
  assert.equal(element.structuredContent.code, "INVALID_INPUT");
  assert.match(element.structuredContent.message, /lane_key: Invalid string: must match the expected format/);

  const busy = await call(3, "cutout_prepare", { project_id: "ws", source_relative_path: "a.mp4" });
  assert.equal(busy.structuredContent.code, "BUSY");
  assert.equal(busy.structuredContent.retryable, true);

  const instrument = await call(4, "run_instrument", { project_id: "ws", instrument: "frame-state", extra_args: ["--out", "/tmp/elsewhere"] });
  assert.equal(instrument.structuredContent.code, "INVALID_ARGUMENTS");
  assert.match(instrument.structuredContent.message, /--out is not accepted/);
  assert.ok(requests.every(url => !url.includes("proposals")), "rejected arguments never reach the editor");
});
