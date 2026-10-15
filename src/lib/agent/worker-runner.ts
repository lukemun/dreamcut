import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import {createWorkerUsageAudit} from "../observability/worker-usage";
import { codexOtelArgs } from "../observability/codex-otel";
import { readEnv } from "@/lib/env-name";

export type WorkerRequest = {
  prompt: string;
  cwd: string;
  schema: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
  access: "read-only" | "workspace-write";
};
export interface WorkerAdapter {
  id: string;
  access: readonly WorkerRequest["access"][];
  run(request: WorkerRequest): Promise<unknown>;
}

/** Adapters return data, never permission to commit it. Workflows validate before adoption. */
export async function runWorker<T>(request: Omit<WorkerRequest, "schema">, schema: z.ZodType<T>, adapter: WorkerAdapter = codexWorker): Promise<T> {
  if (!adapter.access.includes(request.access)) throw new Error(`${adapter.id} cannot enforce ${request.access} access`);
  if (request.signal?.aborted) throw new Error("Worker cancelled");
  return schema.parse(await adapter.run({ ...request, schema: z.toJSONSchema(schema) }));
}

export async function runWorkerProcess(command: string, args: string[], request: WorkerRequest, stdin: string, runtime?: "codex"|"claude"): Promise<string> {
  const audit=runtime&&readEnv("ACTIVITY_CAPTURE")==="1"?createWorkerUsageAudit(runtime):undefined;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: request.cwd, shell: false, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* Process already exited. */ }
    };
    const abort = () => stop("Worker cancelled");
    const timer = setTimeout(() => stop("Worker timed out; retry is available"), request.timeoutMs);
    request.signal?.addEventListener("abort", abort, { once: true });
    if (request.signal?.aborted) abort();
    const cleanup = () => { clearTimeout(timer); request.signal?.removeEventListener("abort", abort); };
    child.stdout.on("data", chunk => {
      output += String(chunk);
      try{audit?.chunk(String(chunk));}catch{stop("Worker usage could not be saved; capture is incomplete");}
      if (output.length > 16_000_000) stop("Worker output exceeded 16 MB");
    });
    child.stderr.on("data", chunk => { errors = (errors + String(chunk)).slice(-2000); });
    child.on("error", error => { cleanup(); reject(new Error(`Worker executable unavailable: ${error.message}. Check installation and sign-in, then retry.`)); });
    child.on("close", code => {
      cleanup();
      try{audit?.finish(failure||code!==0?"failed":"completed",code);}catch{failure??=new Error("Worker usage could not be finalized; capture is incomplete");}
      if (failure) reject(failure);
      else if (code !== 0) {
        let detail = errors;
        try {
          const parsed = JSON.parse(output);
          if (parsed.is_error && typeof parsed.result === "string") detail = parsed.result;
        } catch { /* Preserve stderr for non-JSON worker failures. */ }
        reject(new Error(`Worker failed (${code}): ${detail}`));
      }
      else resolve(output);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

/** Codex structured output rejects JSON Schema's URI format. Keep URL checking
 * in the original Zod result validator, while sending a compatible wire schema. */
export function codexOutputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(schema);
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    if (node.format === "uri") delete node.format;
    Object.values(node).forEach(visit);
  };
  visit(copy);
  return copy;
}

export const codexWorker: WorkerAdapter = {
  id: "codex", access: ["read-only", "workspace-write"],
  async run(request) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-worker-"));
    const schemaPath = path.join(temp, "schema.json");
    const outputPath = path.join(temp, "result.json");
    fs.writeFileSync(schemaPath, JSON.stringify(codexOutputSchema(request.schema)));
    try {
      await runWorkerProcess(readEnv("CODEX_EXECUTABLE") ?? "codex", [
        "exec", ...codexOtelArgs(), "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--sandbox", request.access,
        "--json", "--color", "never", "--output-schema", schemaPath, "--output-last-message", outputPath, "-",
      ], request, request.prompt, "codex");
      if (fs.statSync(outputPath).size > 16_000_000) throw new Error("Worker result exceeded 16 MB");
      return JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } finally {
      for (const file of [schemaPath, outputPath]) if (fs.existsSync(file)) fs.unlinkSync(file);
      fs.rmdirSync(temp);
    }
  },
};

/** Local Claude Code prompt authoring with tools disabled; no workspace access. */
export const claudePromptWorker: WorkerAdapter = {
  id: "claude", access: ["read-only"],
  async run(request) {
    const output = await runWorkerProcess(readEnv("CLAUDE_EXECUTABLE") ?? "claude", [
      "--print", "--output-format", "json", "--json-schema", JSON.stringify(request.schema),
      "--tools", "", "--strict-mcp-config", "--permission-mode", "dontAsk", "--no-session-persistence",
    ], request, request.prompt, "claude");
    const parsed = JSON.parse(output);
    if (parsed.is_error) throw new Error(typeof parsed.result === "string" ? parsed.result : "Claude prompt writer failed");
    const structured = parsed.structured_output ?? parsed.structuredOutput;
    return structured ?? (typeof parsed.result === "string" ? JSON.parse(parsed.result) : parsed);
  },
};

/** Explicitly configured trusted adapter executable: JSON request on stdin, JSON result on stdout.
 * The adapter must enforce the declared sandbox; configuration is server-owned, never uploaded data. */
export function configuredWorker(): WorkerAdapter {
  const executable = readEnv("WORKER_EXECUTABLE");
  if (!executable) return codexWorker;
  return {
    id: "external", access: ["read-only", "workspace-write"],
    async run(request) {
      const { signal: _signal, ...payload } = request;
      return JSON.parse(await runWorkerProcess(executable, [], request, JSON.stringify({ protocol: "openedit-worker-v1", ...payload })));
    },
  };
}
