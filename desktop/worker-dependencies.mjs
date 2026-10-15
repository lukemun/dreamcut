import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { build } from 'esbuild';

export const workerEntries = [
  'scripts/import-media.ts', 'scripts/build-take-audition.ts', 'scripts/frame-state.ts',
  'scripts/qc.ts', 'scripts/preview-readiness.ts', 'scripts/project-health.ts',
  'scripts/prepare-media.ts', 'scripts/process-imports.ts', 'scripts/generate-assets.ts',
  'scripts/prepare-cutouts.ts', 'scripts/prepare-agent-assets.ts', 'mcp/visual-analysis-cli.ts',
  'scripts/hyperframes-overlay.ts', 'scripts/align.ts', 'scripts/transcribe.ts', 'scripts/scratchpad-cutout.ts',
];
// NFT cannot parse our TypeScript workers. Build a disposable, never-executed
// source graph to discover external packages; NFT then traces those packages.
export async function workerPackageImports(root, entries = workerEntries) {
  const result = await build({ absWorkingDir: root, entryPoints: entries, outdir: path.join(root, 'trace-workers'),
    bundle: true, packages: 'external', platform: 'node', format: 'esm', write: false,
    metafile: true, treeShaking: false, logLevel: 'silent' });
  const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`), 'electron']);
  const imports = [...new Set(Object.values(result.metafile.outputs).flatMap(output => output.imports)
    .filter(item => item.external && !builtins.has(item.path)).map(item => item.path))].sort();
  const require = createRequire(path.join(root, 'package.json'));
  for (const name of imports) require.resolve(name); // Fail before staging an unresolved required package.
  return imports;
}
