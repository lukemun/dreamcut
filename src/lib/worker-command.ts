import fs from "node:fs";
import path from "node:path";

// Starts a TypeScript background job. A packaged runtime ships it compiled as workers/<name>.mjs
// (desktop/build-workers.mjs) and runs that; a checkout runs the source through tsx.
// mcp/worker-command.mjs is the plain-Node twin.

/** `entry` is the job's source path from the app root, e.g. "scripts/prepare-media.ts". */
export function workerCommand(entry: string, args: readonly string[] = [], root = process.cwd()): { command: string; args: string[] } {
  const compiled = compiledWorker(entry, root);
  return compiled
    ? { command: process.execPath, args: [compiled, ...args] }
    : { command: process.execPath, args: ["--import", "tsx", path.join(root, entry), ...args] };
}

/** The compiled workers/<name>.mjs a packaged runtime runs for `entry`, or null in a checkout. */
export function compiledWorker(entry: string, root = process.cwd()): string | null {
  const compiled = path.join(root, "workers", `${path.basename(entry).replace(/\.[cm]?tsx?$/, "")}.mjs`);
  return fs.existsSync(compiled) ? compiled : null;
}

/**
 * The files whose bytes are a job's implementation, for fingerprinting what produced a result: the compiled
 * worker when the runtime ships one (it bundles `sources`), else the job's source and `sources`.
 */
export function workerImplementationFiles(entry: string, sources: readonly string[] = [], root = process.cwd()): string[] {
  const compiled = compiledWorker(entry, root);
  return compiled ? [compiled] : [entry, ...sources].map(file => path.join(root, file));
}
