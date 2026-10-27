import fs from "node:fs";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { localCollectorCommand, localOtelDirectory } from "./local-otel";
import { codexOtelArgs } from "./codex-otel";
import { readEnv } from "@/lib/env-name";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const alive = (child: ChildProcess) => child.pid && child.exitCode === null && child.signalCode === null;

async function stop(child?: ChildProcess) {
  if (!child || !alive(child)) return;
  child.kill("SIGTERM");
  for (let i = 0; i < 50 && alive(child); i++) await delay(100);
  if (alive(child)) child.kill("SIGKILL");
}

async function portAvailable(port: number) {
  return new Promise<boolean>(resolve => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

/** Own only the collector spawned here. An explicit endpoint belongs to its operator. */
export async function runServerWithOtel(command: string, args: string[], settings = { ...localCollectorCommand(), port: 4318 }) {
  const endpoint = `http://127.0.0.1:${settings.port}/v1/logs`;
  let collector: ChildProcess | undefined;
  let server: ChildProcess | undefined;
  let stopping = false;
  let signalCode = 0;
  const onSignal = (signal: NodeJS.Signals) => {
    stopping = true;
    signalCode = signal === "SIGINT" ? 130 : 143;
    // Let Next stop first so the collector can accept final worker events.
    void stop(server);
  };
  const interrupt = () => onSignal("SIGINT"), terminate = () => onSignal("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const env = { ...process.env };
  try {
    if (readEnv("CODEX_OTEL_ENDPOINT", env)) {
      codexOtelArgs(readEnv("CODEX_OTEL_ENDPOINT", env));
      console.log("Using the explicitly configured local OTel receiver; its lifecycle is external.");
    } else if (readEnv("OTEL_AUTOSTART", env) === "1") {
      try {
        if (!await portAvailable(settings.port)) throw new Error(`Port ${settings.port} is already in use; set an explicit receiver endpoint to use an existing collector.`);
        const directory = localOtelDirectory();
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const { binary, config } = settings;
        collector = spawn(binary, ["--config", config], { stdio: "inherit", env: { ...env, DREAMCUT_OTEL_DIR: directory } });
        let failure: Error | undefined;
        collector.on("error", error => { failure = error; });
        let ready = false;
        for (let i = 0; i < 50 && !stopping; i++) {
          await delay(100);
          if (failure) throw failure;
          if (!alive(collector)) throw new Error("Collector exited during startup.");
          try {
            const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"resourceLogs":[]}', signal: AbortSignal.timeout(200) });
            if (response.ok && alive(collector)) { ready = true; break; }
          } catch { /* Retry until the receiver binds. */ }
        }
        if (!ready) throw new Error("Collector did not become ready.");
        env.DREAMCUT_CODEX_OTEL_ENDPOINT = endpoint;
        console.log(`Local model monitoring started. Logs: ${directory}`);
        collector.once("exit", () => {
          if (!stopping) console.warn("Local collector stopped; new model usage may be lost. Restart the server to restore collection.");
        });
      } catch (error) {
        await stop(collector);
        console.warn(`Local model monitoring unavailable; editor will continue: ${error instanceof Error ? error.message : String(error)}`);
        // Prevent Next's later .env loading from enabling an unverified destination.
        env.DREAMCUT_CODEX_OTEL_ENDPOINT = "";
      }
    }
    if (stopping) return signalCode;
    server = spawn(command, args, { stdio: "inherit", env });
    return await new Promise<number>((resolve, reject) => {
      server!.once("error", reject);
      server!.once("exit", (code, signal) => resolve(signalCode || code || (signal ? 1 : 0)));
    });
  } finally {
    stopping = true;
    await stop(server);
    await stop(collector);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
