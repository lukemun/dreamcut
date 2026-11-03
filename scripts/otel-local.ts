import fs from "node:fs";
import { spawn } from "node:child_process";
import { localOtelDirectory, localCollectorCommand } from "../src/lib/observability/local-otel";

const args = process.argv.slice(2);
if (args.some(a => a !== "--validate")) throw new Error("Usage: pnpm otel:local [--validate]");
const directory = localOtelDirectory();
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const { binary, config } = localCollectorCommand();
const child = spawn(binary, [...(args.includes("--validate") ? ["validate"] : []), "--config", config], {
  stdio: "inherit", env: { ...process.env, DREAMCUT_OTEL_DIR: directory },
});
if (!args.includes("--validate")) console.log(`Local OTel logs: ${directory}\nListening on 127.0.0.1:4318; stop with Ctrl-C.`);
child.on("error", () => { console.error("Collector unavailable. Install OpenTelemetry Collector Contrib or set DREAMCUT_OTELCOL_EXECUTABLE; see docs/observability.md."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
