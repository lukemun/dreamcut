import { promisify } from "node:util";
import { execFile, spawn, type SpawnOptions, type ChildProcess } from "node:child_process";

const runFile = promisify(execFile);

type WorkerOwner = { spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess };
const ownerKey = Symbol.for("dreamcut.desktop.worker-owner");

/** Desktop owns launched workers; CLI/browser-server launches retain their lifecycle. */
export function spawnBackgroundWorker(command: string, args: readonly string[], options: SpawnOptions) {
  const owner = (process as NodeJS.Process & { [key: symbol]: WorkerOwner | undefined })[ownerKey];
  return owner ? owner.spawn(command, args, options) : spawn(command, args, options);
}

const launchesKey = Symbol.for("dreamcut.background.worker-launches");
/** Deduplicate startup and lifetime within one service, before a child can write
 * its disk ownership lock. Absolute queue paths keep distinct workspaces apart. */
export function startBackgroundWorkerOnce(key: string, start: () => ChildProcess): ChildProcess | undefined {
  const host = process as NodeJS.Process & { [key: symbol]: Map<string, ChildProcess | undefined> | undefined };
  const launches = host[launchesKey] ??= new Map();
  if (launches.has(key)) return launches.get(key);
  launches.set(key, undefined);
  try {
    const child = start();
    launches.set(key, child);
    const release = () => { if (launches.get(key) === child) launches.delete(key); };
    child.once("exit", release); child.once("error", release);
    return child;
  } catch (error) { launches.delete(key); throw error; }
}

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
};

/** Text-output commands keep execFile behavior outside the desktop host. */
export async function runBackgroundCommand(command: string, args: string[], options: CommandOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const owner = (process as NodeJS.Process & { [key: symbol]: WorkerOwner | undefined })[ownerKey];
  if (!owner) return runFile(command, args, { ...options, encoding: "utf8" });
  const limit = options.maxBuffer ?? 1024 * 1024;
  const timeout = options.timeout ?? 0;
  if (!Number.isFinite(limit) || limit < 0 || !Number.isFinite(timeout) || timeout < 0) throw new Error("Invalid command limits");
  return new Promise((resolve, reject) => {
    const child = owner.spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", outBytes = 0, errBytes = 0;
    let failure: Error | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = (message: string, code: string) => {
      failure ??= Object.assign(new Error(message), { code, killed: true });
      // The owner kills the private group when this process exits. SIGKILL also
      // bounds commands that ignore SIGTERM; publish no partial success.
      child.kill("SIGKILL");
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (value: string) => {
      outBytes += Buffer.byteLength(value);
      if (outBytes > limit) stop("Command stdout exceeded its output limit", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
      else stdout += value;
    });
    child.stderr?.on("data", (value: string) => {
      errBytes += Buffer.byteLength(value);
      if (errBytes > limit) stop("Command stderr exceeded its output limit", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER");
      else stderr += value;
    });
    child.once("error", error => { failure ??= error; });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (!failure && code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(failure ?? new Error(`${command} failed (${code ?? signal}): ${stderr}`),
        { stdout, stderr, signal, ...(failure ? {} : { code }) }));
    });
    if (timeout) timer = setTimeout(() => stop("Command timed out", "ETIMEDOUT"), timeout);
  });
}
