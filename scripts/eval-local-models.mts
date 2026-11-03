import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { editingEvalCases, editingEvalPacket, gradeEditingProposal, EDITING_EVAL_VERSION } from "../src/lib/agent/editing-eval";
// @ts-expect-error -- untyped harness module
import { serveLocalModel, installedLocalModels } from "../mcp/local-model-suite.mjs";
// @ts-expect-error -- untyped harness module
import { createLlamaAdapter } from "../mcp/harness-llama.mjs";

/**
 * Local-model bake-off: serves each installed model in turn with identical settings, runs the
 * synthetic audio proposal suite (repeated trials, offline grader) and the Citadella linked-spacing
 * tool-loop case from a real past session (structural grader). Records stay under private/.
 * It never approves, exports or touches the working projects.
 */
const RUNNER_VERSION = 1;
const PROMPT_VERSION = 1;
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const index = args.indexOf(`--${name}`); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const models: string[] = option("models", installedLocalModels().join(",")).split(",").filter(Boolean);
const trials = Number(option("trials", "3"));
const temperature = Number(option("temperature", "0.6"));
const thinking = args.includes("--thinking");
const citadella = !args.includes("--skip-citadella");
const audioSuite = !args.includes("--skip-audio");
const citadellaMaxOutput = Number(option("citadella-max-output", "4096"));
const context = Number(option("context", "32768"));
const audioMaxOutput = Number(option("audio-max-output", "2048"));
if (![32768, 65536].includes(context)) throw new Error("--context must be 32768 or 65536");
const citadellaCase = path.resolve(option("citadella-case", "private/evals/citadella-setup-v1/case.json"));
if (!models.length) throw new Error("No installed local models. Run the model download first.");
if (!Number.isSafeInteger(trials) || trials < 1 || trials > 10) throw new Error("--trials must be 1–10");

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
fs.mkdirSync(path.join(root, "private", "local-model-evals"), { recursive: true, mode: 0o700 });
const output = fs.mkdtempSync(path.join(root, "private", "local-model-evals", `${new Date().toISOString().slice(0, 10)}-`));
const write = (file: string, value: unknown) => fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const runtime = spawnSync("llama-server", ["--version"], { encoding: "utf8" });
const summary: any = {
  runner_version: RUNNER_VERSION, prompt_version: PROMPT_VERSION, started_at: new Date().toISOString(),
  app_revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  runtime: `${runtime.stdout}${runtime.stderr}`.trim().split("\n").filter(line => /version|built/.test(line)).join("; "),
  settings: { context, parallel: 1, thinking, audio: audioSuite ? { suite: EDITING_EVAL_VERSION, trials, temperature, max_output: audioMaxOutput } : null, citadella: citadella ? { trials: 1, temperature: 0, max_output: citadellaMaxOutput } : null },
  code_fingerprints: Object.fromEntries(["scripts/eval-local-models.mts", "scripts/lib/local-tool-trial.mjs", "mcp/harness-llama.mjs", "src/lib/agent/editing-eval.ts", "scripts/eval-citadella.ts", "scripts/lib/grade-linked-spacing.ts"].map(file => [file, sha(fs.readFileSync(file))])),
  models: [] as any[],
};
write("summary.json", summary);

const SYSTEM = "You are DreamCut's editing operator. Return only one JSON object: the schema-2 proposal body described by output_contract. No prose, no markdown fences.";

async function audioTrial(endpoint: string, alias: string, caseId: string, trial: number) {
  const packet = editingEvalPacket(caseId);
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  const adapter = createLlamaAdapter({ endpoint, model: alias, maxOutput: audioMaxOutput, contextLimit: 32768, temperature, thinking, timeoutMs: 180000, responseFormat: { type: "json_object" },
    onEvent: (event: any) => { if (event.kind === "model_response" && event.usage) { usage.prompt_tokens += event.usage.prompt_tokens ?? 0; usage.completion_tokens += event.usage.completion_tokens ?? 0; } } });
  const started = Date.now();
  let raw = "", parsed: unknown, error: string | null = null;
  try {
    const message = await adapter.chat({ messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(packet) }] });
    raw = message.content ?? "";
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  const grade = error ? { pass: false, checks: {}, error } : gradeEditingProposal(caseId, parsed);
  return { case_id: caseId, trial, pass: grade.pass, checks: grade.checks, error: grade.error, elapsed_ms: Date.now() - started, usage, output_sha256: sha(raw) };
}

function citadellaTrial(endpoint: string, alias: string): Promise<any> {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn("pnpm", ["exec", "tsx", "scripts/eval-citadella.ts", citadellaCase, "run"], {
      env: { ...process.env, EVAL_RUNTIME: "local", EVAL_MODEL: alias, EVAL_MODEL_ENDPOINT: endpoint, EVAL_TEMPERATURE: "0", EVAL_THINKING: thinking ? "1" : "0", EVAL_MAX_OUTPUT: String(citadellaMaxOutput) }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on("close", () => {
      const last = stdout.trim().split("\n").reverse().map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.runDir);
      const runDir = last?.runDir;
      const read = (file: string) => { try { return JSON.parse(fs.readFileSync(path.join(runDir, file), "utf8")); } catch { return null; } };
      const manifest = runDir ? read("manifest.json") : null;
      const grading = runDir ? read("grading.json") : null;
      const tools = runDir ? read("tool-calls.json") ?? [] : [];
      resolve({ run_dir: runDir ? path.relative(root, runDir) : null, status: manifest?.status ?? "failed", pass: Boolean(grading?.pass), error: manifest?.error ?? (runDir ? null : stderr.slice(-800)),
        reached: { read_timeline: tools.some((t: any) => t.name === "timeline_get" && !t.error), preflight_ok: tools.some((t: any) => t.name === "proposal_spatial_preflight" && !t.error), proposal_created: manifest?.status === "proposal-created" },
        tool_calls: tools.length, tool_errors: tools.filter((t: any) => t.error).length,
        grading: grading ? { pass: grading.pass, spacing_changes_later_reveals: grading.spacing_changes_later_reveals, values: grading.results?.map((r: any) => ({ value: r.value, pass: r.pass, error: r.error, failed: r.checks ? Object.entries(r.checks).filter(([, ok]) => !ok).map(([k]) => k) : undefined })) } : null,
        fixture_timeline_unchanged: manifest?.fixture_timeline_unchanged ?? null, elapsed_ms: Date.now() - started, usage: manifest?.token_usage ?? null });
    });
  });
}

async function main() {
for (const name of models) {
  const record: any = { name, status: "starting" };
  summary.models.push(record);
  let server: any;
  try {
    server = await serveLocalModel(name, { context, logFile: path.join(output, `${name}-server.log`) });
    Object.assign(record, { alias: server.alias, files: server.files.map((f: any) => ({ filename: f.filename, bytes: f.bytes, sha256: f.sha256 })), warmup_ms: server.warmup_ms, status: "running" });
    write("summary.json", summary);
    const audio = [];
    if (audioSuite) for (const { id } of editingEvalCases()) for (let trial = 1; trial <= trials; trial++) {
      const result = await audioTrial(server.endpoint, server.alias, id, trial);
      audio.push(result);
      console.log(JSON.stringify({ model: name, suite: "audio", case: id, trial, pass: result.pass, elapsed_ms: result.elapsed_ms, error: result.error }));
    }
    const byCase = Object.fromEntries(editingEvalCases().map(({ id }) => { const runs = audio.filter(r => r.case_id === id); return [id, { passes: runs.filter(r => r.pass).length, trials: runs.length }]; }));
    if (audioSuite) record.audio = { trials: audio, pass_rate: audio.filter(r => r.pass).length / audio.length,
      cases_always_pass: Object.values(byCase).filter((c: any) => c.passes === c.trials).length, by_case: byCase,
      median_ms: [...audio].map(r => r.elapsed_ms).sort((a, b) => a - b)[Math.floor(audio.length / 2)],
      completion_tokens: audio.reduce((sum, r) => sum + r.usage.completion_tokens, 0) };
    write("summary.json", summary);
    if (citadella) {
      record.citadella = await citadellaTrial(server.endpoint, server.alias);
      console.log(JSON.stringify({ model: name, suite: "citadella", status: record.citadella.status, pass: record.citadella.pass, reached: record.citadella.reached, error: record.citadella.error }));
    }
    record.status = "completed";
  } catch (error) { record.status = "blocked"; record.error = error instanceof Error ? error.message : String(error); console.log(JSON.stringify({ model: name, status: "blocked", error: record.error })); }
  finally { await server?.stop(); write("summary.json", summary); }
}
summary.finished_at = new Date().toISOString();
write("summary.json", summary);
console.log(JSON.stringify({ output: path.relative(root, output), scoreboard: summary.models.map((m: any) => ({ model: m.name, status: m.status, audio_pass_rate: m.audio?.pass_rate, audio_cases_always_pass: m.audio?.cases_always_pass, audio_median_ms: m.audio?.median_ms, citadella: m.citadella ? { status: m.citadella.status, pass: m.citadella.pass, reached: m.citadella.reached } : null })) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
