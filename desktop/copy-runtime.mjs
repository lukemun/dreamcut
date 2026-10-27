import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
// Keep APFS clone efficiency; other hosts use ordinary independent copies.
export async function copyRuntime(source, destination, { contents = false } = {}) {
  if (process.platform === 'darwin') execFileSync('/bin/cp', ['-cR', contents ? source + '/.' : source, destination]);
  else await fs.cp(source, destination, { recursive: true, verbatimSymlinks: true });
}
