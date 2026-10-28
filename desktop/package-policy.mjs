import fs from 'node:fs/promises';
import path from 'node:path';
const roots = new Set(['node_modules', 'src', 'public', '.next-desktop', 'scripts', 'mcp', 'workers', 'prebuilt']);
// DreamCut's own source never ships: the editor, jobs, MCP server, GPU worker and renderer ship compiled
// (.next-desktop, workers/, mcp/server.mjs and friends, prebuilt/). From src/, scripts/ and mcp/ only data
// (fonts, catalogs, schemas, Python helpers) and these plain helpers the runtime starts by path remain.
const CODE = /\.(?:[cm]?[jt]sx?)$/;
const RUNTIME_HELPERS = new Set(['scripts/run-sam2-cutout.mjs', 'scripts/setup-matting.mjs', 'scripts/setup-voice.mjs', 'scripts/setup-features.mjs', 'scripts/feature-tools.mjs', 'scripts/setup-speech.mjs', 'scripts/doctor.mjs', 'scripts/matting/environment.mjs',
  'mcp/editor-runtime.mjs', 'mcp/projects-root.mjs', 'mcp/runtime-updates.mjs', 'mcp/install-updates.mjs', 'mcp/worker-crash-watchdog.mjs']);
const COMPILED_MCP = /^mcp\/(?:server|harness-mcp|harness-session|harness-adapters|tool-schema-portability|shared-[\w-]+)\.mjs$/;
/** Whether a packaged file is DreamCut source the package must not carry. */
export function shipsSource(relative) {
  const file = path.normalize(relative).split(path.sep).join('/');
  // Next's generated route types and build-trace lists name every source file; the server reads neither.
  if (/^\.next-desktop\/(?:types\/|.*\.nft\.json$)/.test(file)) return true;
  if (!/^(?:src|scripts|mcp)\//.test(file) || !CODE.test(file)) return false;
  return !RUNTIME_HELPERS.has(file) && !COMPILED_MCP.test(file);
}
export function packageInput(relative) {
  const normalized = path.normalize(relative);
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error('Dependency escaped build root');
  const parts = normalized.split(path.sep);
  if (parts.some(part => part === '.env' || part.startsWith('.env.') || part === 'private' || part === 'cache' || part === '.cache')) return false;
  // Agent instructions an npx-installed agent reads through capability_catalog (skills and the docs they link).
  if (parts[0] === 'docs' && ['effects', 'standards'].includes(parts[1])) return true;
  if (parts[0] === '.agents' && parts[1] === 'skills') return true;
  if (parts.length === 1 && parts[0] === 'AGENTS.md') return true;
  // The shared sound and visual catalogs' lists ship; their media comes from DreamCut Cloud on first use.
  if (normalized === path.join('catalogs', 'sfx', 'catalog.json') || normalized === path.join('catalogs', 'visual', 'catalog.json')) return true;
  return roots.has(parts[0]) && !shipsSource(normalized);
}
export function relativePackageLink(sourceRoot, sourceFile, target) {
  const resolved = path.resolve(path.dirname(sourceFile), target);
  if (!resolved.startsWith(sourceRoot + path.sep)) throw new Error('Dependency symlink escaped build root');
  // Normalize absolute development links into relocatable package links.
  return path.relative(path.dirname(sourceFile), resolved);
}

/** DreamCut source files in a staged package (outside node_modules); a release must find none. */
export async function shippedSource(dir) {
  const found = [];
  const walk = async relative => {
    for (const entry of await fs.readdir(path.join(dir, relative), { withFileTypes: true }).catch(() => [])) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') await walk(child); }
      else if (entry.isFile() && shipsSource(child)) found.push(child);
    }
  };
  await walk('');
  return found;
}
