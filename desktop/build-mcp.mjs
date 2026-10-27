import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

// Compiles the MCP server and the harness entries the desktop editing session loads into minified files,
// written over the readable ones in an isolated build source (never a checkout). Outputs stay in mcp/, so
// `new URL('../docs/…', import.meta.url)` data reads and EDITOR_ROOT resolve as before. Shared modules become
// mcp/shared-*.mjs beside them (same folder depth, for the same reason), so a process that loads two
// entries still has one copy of each module.
export const mcpEntries = ['mcp/server.mjs', 'mcp/harness-mcp.mjs', 'mcp/harness-session.mjs', 'mcp/harness-adapters.mjs', 'mcp/tool-schema-portability.mjs'];

export async function buildMcp(root, entries = mcpEntries, { sourceMaps = false } = {}) {
  const staging = path.join(root, '.mcp-build');
  await fs.rm(staging, { recursive: true, force: true });
  const result = await build({
    absWorkingDir: root, entryPoints: entries, outdir: staging, outbase: 'mcp', outExtension: { '.js': '.mjs' }, bundle: true, splitting: true,
    chunkNames: 'shared-[name]-[hash]', packages: 'external', platform: 'node', format: 'esm', target: 'node22',
    minify: true, legalComments: 'none', sourcemap: sourceMaps ? 'linked' : false, metafile: true, logLevel: 'warning',
  });
  await fs.cp(staging, path.join(root, 'mcp'), { recursive: true });
  await fs.rm(staging, { recursive: true, force: true });
  return { entries: entries.length, bytes: Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0) };
}
