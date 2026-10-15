import fs from 'node:fs/promises';
import path from 'node:path';

// Files the packaged Electron shell needs: every desktop module reachable from its entry points
// through relative imports (static, dynamic or require). Computed, so a new module imported by
// the shell is packaged without editing a list. The worker crash guards ship the mcp/ copies,
// which the desktop shims re-export.
// The app, its preload, and the two scripts it launches as separate processes.
export const SHELL_ENTRIES = ['main.mjs', 'preload.cjs', 'service.mjs', 'worker-crash-watchdog.mjs'];
export const FROM_MCP = new Set(['worker-crash-guard.mjs', 'worker-crash-watchdog.mjs', 'runtime-updates.mjs']);
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]\.\/([\w.-]+\.(?:mjs|cjs|js))['"]/gm;

export async function shellFiles(desktopDir, entries = SHELL_ENTRIES) {
  const seen = new Set(), queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await fs.readFile(path.join(desktopDir, file), 'utf8');
    for (const match of text.matchAll(RELATIVE_IMPORT)) if (!seen.has(match[1])) queue.push(match[1]);
  }
  return [...seen].sort();
}
