import path from "node:path";

import { spawnBackgroundWorker as spawn } from "./background-worker";
import { workerCommand } from "@/lib/worker-command";

const MAX_OUTPUT_CHARACTERS = 24_000;
const RESULT_PREFIX = "DREAMCUT_RESULT ";

export type MotionScriptResult<T> = { result: T; warnings: string[] };

/**
 * Run a motion CLI (`hyperframes-overlay` or `sound-synth`) in a background worker and
 * parse its `DREAMCUT_RESULT` line. Keeps long renders off the request event loop.
 */
export function runMotionScript<T>(script: "hyperframes-overlay" | "sound-synth", args: string[], options: { signal?: AbortSignal } = {}): Promise<MotionScriptResult<T>> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("Stopped")); return; }
    const job = workerCommand(`scripts/${script}.ts`, args);
    const child = spawn(job.command, job.args, {
      cwd: process.cwd(),
      env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group, so stopping it also ends the browsers it launched.
      ...(options.signal ? { detached: true } : {}),
    });
    const stop = () => { try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } };
    options.signal?.addEventListener("abort", stop, { once: true });
    child.once("close", () => options.signal?.removeEventListener("abort", stop));
    let output = "";
    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-MAX_OUTPUT_CHARACTERS);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(motionScriptFailure(output) || output.trim() || `${script} exited with code ${code ?? "unknown"}`));
        return;
      }
      const line = output.split("\n").reverse().find((entry) => entry.startsWith(RESULT_PREFIX));
      if (!line) {
        reject(new Error(`${script} returned no result`));
        return;
      }
      resolve({
        result: JSON.parse(line.slice(RESULT_PREFIX.length)) as T,
        warnings: output.split("\n").filter((entry) => entry.startsWith("Warning: ")).map((entry) => entry.slice(9)),
      });
    });
  });
}

/**
 * The CLI throws with the validation message; surface the last error and the detail lines under it
 * (a failed HyperFrames check names its cause there), not a stack. Node colours stack lines on a
 * terminal, so colour codes are removed before stack lines are recognised.
 */
export function motionScriptFailure(output: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const lines = output.replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((line) => line.trim());
  const start = lines.map((line) => line.startsWith("Error: ")).lastIndexOf(true);
  return start < 0 ? undefined : [lines[start].slice(7), ...lines.slice(start + 1)
    .filter((line) => line && !/^at\s/.test(line) && !/^Node\.js v\d/.test(line))].join("\n").slice(0, 2000);
}
