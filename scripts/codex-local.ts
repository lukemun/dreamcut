import { spawn } from "node:child_process";
import { codexOtelArgs } from "../src/lib/observability/codex-otel";
import { readEnv } from "../src/lib/env-name";

const child = spawn(readEnv("CODEX_EXECUTABLE") || "codex", [
  ...codexOtelArgs(readEnv("CODEX_OTEL_ENDPOINT") || "http://127.0.0.1:4318/v1/logs"), ...process.argv.slice(2),
], { stdio: "inherit" });
child.on("error", () => { console.error("Codex executable unavailable."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
