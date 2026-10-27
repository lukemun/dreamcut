import fs from 'node:fs';
import path from 'node:path';

// Plain-Node twin of src/lib/worker-command.ts: a packaged runtime runs the compiled workers/<name>.mjs
// (desktop/build-workers.mjs); a checkout runs the TypeScript source through tsx.

/** `entry` is the job's source path from the app root, e.g. 'scripts/qc.ts'. */
export function workerCommand(entry, args = [], root = process.cwd()) {
  const compiled = path.join(root, 'workers', `${path.basename(entry).replace(/\.[cm]?tsx?$/, '')}.mjs`);
  return fs.existsSync(compiled)
    ? { command: process.execPath, args: [compiled, ...args] }
    : { command: process.execPath, args: ['--import', 'tsx', path.join(root, entry), ...args] };
}
