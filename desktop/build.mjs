import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { copyRuntime } from './copy-runtime.mjs';
import { desktopBuildEnvironment, releaseTelemetry } from './build-environment.mjs';
import { removeSourceMaps, uploadSourceMaps } from './source-maps.mjs';
import { buildWorkers } from './build-workers.mjs';
import { writeCodeIdentity } from './code-identity.mjs';
import { buildMcp } from './build-mcp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Desktop builds target macOS and Windows.');
// DREAMCUT_BUILD_DIR lets `pnpm editor` build into a spare slot while another serves (scripts/stable-editor.ts).
// It is emptied first, so it must stay inside .desktop-build.
const buildRoot = path.join(root, '.desktop-build');
const source = process.env.DREAMCUT_BUILD_DIR ? path.resolve(root, process.env.DREAMCUT_BUILD_DIR) : path.join(buildRoot, 'source');
if (path.dirname(source) !== buildRoot) throw new Error('DREAMCUT_BUILD_DIR must be a folder directly inside .desktop-build.');
// Production compilation must not scan the creator's workspace or load .env.local.
// APFS clones preserve disk space on macOS; Windows installs its own dependencies.
await fs.rm(source, { recursive: true, force: true });
await fs.mkdir(source, { recursive: true });
// desktop/ is traced by desktop/package.mjs (claude-session.mjs and the service closure).
for (const name of ['src', 'public', 'scripts', 'mcp', 'desktop', 'docs', '.agents',
  'node_modules', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'patches', 'AGENTS.md',
  'next.config.ts', 'next-env.d.ts', 'postcss.config.mjs', 'tsconfig.json']) {
  // Windows dependency junctions must be created inside the isolated build root. Its own pnpm-workspace.yaml
  // keeps that install there instead of pnpm resolving the enclosing checkout as the workspace.
  if (name === 'node_modules' && process.platform === 'win32') continue;
  // Next generates next-env.d.ts on build, so a fresh checkout (it is Git-ignored) has none to copy.
  if (name === 'next-env.d.ts' && !existsSync(path.join(root, name))) continue;
  await copyRuntime(path.join(root, name), path.join(source, name));
}
// Windows runtimes are copied without links (extracting links needs a privilege), and pnpm's default layout finds
// each package's dependencies through links. The hoisted layout is a plain folder tree that survives that copy.
if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm install --frozen-lockfile --config.node-linker=hoisted'], {cwd:source, stdio:'inherit'});
const configPath = path.join(source, 'tsconfig.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
config.include = ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next-desktop/types/**/*.ts'];
await fs.writeFile(configPath, JSON.stringify(config, null, 2));
// Release builds carry DreamCut's public error-report settings (packaging/release-telemetry.json).
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
// With a Sentry upload token the build also makes source maps, uploaded and deleted below (desktop/source-maps.mjs).
// The token stays in this process and the upload step; the compiled app never sees it.
const telemetry = releaseTelemetry();
const uploadToken = process.env.SENTRY_AUTH_TOKEN?.trim();
const dryRun = process.env.DREAMCUT_RELEASE_DRY_RUN === '1';
const sourceMaps = Boolean(uploadToken && telemetry?.sentry_org && telemetry?.sentry_project) && !dryRun;
if (dryRun) console.log(uploadToken ? 'Dry run: SENTRY_AUTH_TOKEN found; source maps will upload on the real release.' : 'Dry run: no SENTRY_AUTH_TOKEN, so the real release would show minified stack traces in Sentry.');
else if (!sourceMaps) console.warn('No SENTRY_AUTH_TOKEN: building without source maps, so Sentry shows minified stack traces for this release.');
const env = desktopBuildEnvironment(process.env, { telemetry, version, sourceMaps });
console.log('Building desktop service from isolated application sources.');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
  cwd: source, env, stdio: 'inherit',
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', async code => {
  if (code !== 0) { process.exitCode = code ?? 1; return; }
  // Background jobs ship compiled, so the packaged runtime starts them without tsx (src/lib/worker-command.ts).
  try {
    const result = await buildWorkers(source, path.join(source, 'workers'), undefined, { sourceMaps });
    console.log(`Compiled ${result.workers.length} background jobs.`);
    // The MCP server ships compiled too; it is rewritten only in this isolated build source.
    const mcp = await buildMcp(source, undefined, { sourceMaps });
    console.log(`Compiled ${mcp.entries} MCP entries.`);
    // The GPU preview worker and the prepared renderer otherwise compile from source while the editor runs.
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-prebuilt-runtime.ts'], { cwd: source, stdio: 'inherit' });
    if (sourceMaps) {
      uploadSourceMaps(source, { token: uploadToken, org: telemetry.sentry_org, project: telemetry.sentry_project, release: `dreamcut@${version}` });
      console.log(`Uploaded source maps for dreamcut@${version} to Sentry.`);
    }
    // Maps never ship, uploaded or not.
    await removeSourceMaps(source);
    // One identity for the built code, used where a checkout fingerprints its source (src/lib/code-identity.ts).
    await writeCodeIdentity(source);
  }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
});
