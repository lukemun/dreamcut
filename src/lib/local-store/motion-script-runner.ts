import path from "node:path";

import { spawnBackgroundWorker as spawn } from "./background-worker";

const MAX_OUTPUT_CHARACTERS = 24_000;
const RESULT_PREFIX = "DREAMCUT_RESULT ";

export type MotionScriptResult<T> = { result: T; warnings: string[] };

/**
 * Run a motion CLI (`hyperframes-overlay` or `sound-synth`) in a background worker and
 * parse its `DREAMCUT_RESULT` line. Keeps long renders off the request event loop.
 */
export function runMotionScript<T>(script: "hyperframes-overlay" | "sound-synth", args: string[]): Promise<MotionScriptResult<T>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", path.resolve(`scripts/${script}.ts`), ...args], {
      cwd: process.cwd(),
      env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-MAX_OUTPUT_CHARACTERS);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        // The CLI throws with the validation message; surface the last error and the detail lines under it
        // (a failed HyperFrames check names its cause there), not a stack.
        const lines = output.split("\n").map((line) => line.trim());
        const start = lines.map((line) => line.startsWith("Error: ")).lastIndexOf(true);
        const message = start < 0 ? undefined : [lines[start].slice(7), ...lines.slice(start + 1)
          .filter((line) => line && !/^at\s/.test(line) && !/^Node\.js v\d/.test(line))].join("\n").slice(0, 2000);
        reject(new Error(message || output.trim() || `${script} exited with code ${code ?? "unknown"}`));
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
