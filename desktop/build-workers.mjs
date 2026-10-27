#!/usr/bin/env node
/**
 * Compile the editor's TypeScript background jobs (workerEntries) into minified workers/<name>.mjs files, so a
 * packaged runtime starts them without tsx or source. node_modules stay external and shared with the service.
 * src/lib/worker-command.ts (and mcp/worker-command.mjs) start the compiled file when it exists.
 *
 *   node desktop/build-workers.mjs [--root <app dir>] [--out <dir>]
 *
 * desktop/build.mjs runs this in the isolated build source after `next build`. The default output is
 * .desktop-build/workers, never the checkout's own workers/ folder: a compiled job there would shadow edits
 * to its source under `pnpm dev`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { workerEntries } from './worker-dependencies.mjs';

/** workers/<name>.mjs for a job's source path; names are unique across workerEntries. */
export const compiledWorkerName = entry => `${path.basename(entry).replace(/\.[cm]?tsx?$/, '')}.mjs`;

export async function buildWorkers(root, out, entries = workerEntries, { sourceMaps = false } = {}) {
  const names = entries.map(compiledWorkerName);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) throw new Error(`Two background jobs compile to workers/${duplicate}.`);
  await fs.rm(out, { recursive: true, force: true });
  const result = await build({
    absWorkingDir: root, entryPoints: Object.fromEntries(entries.map(entry => [compiledWorkerName(entry).slice(0, -4), entry])),
    // Shared code sits beside the entries, at the folder depth the source modules expect for relative paths.
    outdir: out, outExtension: { '.js': '.mjs' }, bundle: true, splitting: true, chunkNames: 'shared-[name]-[hash]',
    packages: 'external', platform: 'node', format: 'esm', target: 'node22', minify: true, legalComments: 'none',
    // Bundled CommonJS helpers expect require/__filename/__dirname; ESM output has none of them.
    banner: { js: "import{createRequire as __dcRequire}from'node:module';import{fileURLToPath as __dcPath}from'node:url';const require=__dcRequire(import.meta.url),__filename=__dcPath(import.meta.url),__dirname=__dcPath(new URL('.',import.meta.url));" },
    sourcemap: sourceMaps ? 'linked' : false, metafile: true, logLevel: 'warning',
  });
  await fs.writeFile(path.join(out, 'manifest.json'), `${JSON.stringify({ entries: Object.fromEntries(entries.map(entry => [entry, compiledWorkerName(entry)])) }, null, 2)}\n`);
  return { out, workers: names, bytes: Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const flag = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const root = path.resolve(flag('--root') ?? repository);
  const result = await buildWorkers(root, path.resolve(flag('--out') ?? path.join(repository, '.desktop-build', 'workers')));
  console.log(`Compiled ${result.workers.length} background jobs (${(result.bytes / 1024 ** 2).toFixed(1)} MiB) into ${path.relative(process.cwd(), result.out) || '.'}.`);
}
