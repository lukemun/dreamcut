import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { copyRuntime } from './copy-runtime.mjs';
import { desktopBuildEnvironment } from './build-environment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Desktop builds target macOS and Windows.');
const source = path.join(root, '.desktop-build', 'source');
// Production compilation must not scan the creator's workspace or load .env.local.
// APFS clones preserve disk space on macOS; Windows installs its own dependencies.
await fs.rm(source, { recursive: true, force: true });
await fs.mkdir(source, { recursive: true });
// desktop/ is traced by desktop/package.mjs (claude-session.mjs and the service closure).
for (const name of ['src', 'public', 'scripts', 'mcp', 'desktop', 'docs', '.agents',
  'node_modules', 'package.json', 'pnpm-lock.yaml',
  'next.config.ts', 'next-env.d.ts', 'postcss.config.mjs', 'tsconfig.json']) {
  // Windows dependency junctions must be created inside the isolated build root.
  if (name === 'node_modules' && process.platform === 'win32') continue;
  await copyRuntime(path.join(root, name), path.join(source, name));
}
if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm install --frozen-lockfile'], {cwd:source, stdio:'inherit'});
const configPath = path.join(source, 'tsconfig.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
config.include = ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next-desktop/types/**/*.ts'];
await fs.writeFile(configPath, JSON.stringify(config, null, 2));
const env = desktopBuildEnvironment(process.env);
console.log('Building desktop service from isolated application sources.');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
  cwd: source, env, stdio: 'inherit',
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
