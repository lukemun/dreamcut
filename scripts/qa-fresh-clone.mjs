#!/usr/bin/env node
/**
 * QA a release candidate as a new user gets it: clone the public repository into a throwaway folder,
 * run the README's install steps and start DreamCut from that clone. It uses its own app data and exports
 * folders, so none of your projects, My Style, sign-in, Library choice or running editors are seen, and it
 * listens on its own free port beside `pnpm editor` (3123) and `pnpm dev` (3129).
 *
 *   pnpm qa                    clone main from GitHub, install, bootstrap and open it
 *   pnpm qa --ref <branch>     another pushed branch or tag
 *   pnpm qa --fresh-tools      also start without the programs and models already set up on this computer
 *   pnpm qa --no-open          print the sign-in link instead of opening the browser
 *   pnpm qa --clean            delete every earlier QA folder and stop
 *
 * Only what is pushed is tested: uncommitted and unpushed work is not in the clone. Ctrl+C stops the
 * editor; the folder stays until `pnpm qa --clean`. The script prints the command that connects an agent
 * to this copy.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'https://github.com/lukemun/dreamcut.git';
const QA_ROOT = path.join(os.tmpdir(), 'dreamcut-qa');
const USAGE = 'Usage: pnpm qa [--ref <branch>] [--fresh-tools] [--no-open] [--clean]';

const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const known = new Set(['--ref', '--fresh-tools', '--no-open', '--clean', '--help']);
const unknown = args.filter((arg, i) => arg.startsWith('-') ? !known.has(arg) : args[i - 1] !== '--ref');
if (args.includes('--help')) { console.log(USAGE); process.exit(0); }
if (unknown.length) { console.error(`Unknown option ${unknown[0]}.\n${USAGE}`); process.exit(2); }

if (args.includes('--clean')) {
  fs.rmSync(QA_ROOT, { recursive: true, force: true });
  console.log(`Removed ${QA_ROOT}.`);
  process.exit(0);
}

const ref = option('--ref') ?? 'main';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(QA_ROOT, stamp);
const app = path.join(dir, 'DreamCut');

// A new user's shell has none of the overrides this checkout's tooling sets (projects, profile, editor URL).
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(DREAMCUT|TIMELINE|OPENEDIT|OPENSEQUENCE)_/.test(key)));
Object.assign(env, { DREAMCUT_APP_DATA_DIR: path.join(dir, 'app-data'), DREAMCUT_EXPORTS_DIR: path.join(dir, 'exports') });
if (args.includes('--fresh-tools')) Object.assign(env, { DREAMCUT_TOOLS_DIR: path.join(dir, 'tools'), HF_HOME: path.join(dir, 'huggingface') });

function step(title, command, commandArgs, cwd = app) {
  console.log(`\n[qa] ${title}: ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`\n[qa] Stopped: "${title}" failed. A new user would stop here too. The clone is in ${app}.`);
    process.exit(result.status ?? 1);
  }
}

fs.mkdirSync(dir, { recursive: true });
step('Clone', 'git', ['clone', '--depth', '1', '--branch', ref, REPO, app], dir);
const commit = spawnSync('git', ['log', '-1', '--format=%h %cd %s', '--date=short'], { cwd: app, encoding: 'utf8' }).stdout.trim();
console.log(`[qa] Testing ${ref} at ${commit}`);
step('Install', 'pnpm', ['install']);
step('Bootstrap', 'pnpm', ['bootstrap']);

const cli = path.join(app, 'bin', 'dreamcut.mjs');
const envPrefix = Object.entries(env).filter(([key]) => /^(DREAMCUT_APP_DATA_DIR|DREAMCUT_EXPORTS_DIR|DREAMCUT_TOOLS_DIR|HF_HOME)$/.test(key))
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ');
console.log(`\n[qa] Folder: ${dir}`);
console.log(`[qa] Connect an agent to this copy:\n  claude mcp add dreamcut-qa -- env ${envPrefix} node ${JSON.stringify(cli)} mcp`);
console.log('[qa] Starting DreamCut the way a new user does (the first start compiles it, a minute or two)…\n');

const editor = spawn(process.execPath, [cli, 'open', ...(args.includes('--no-open') ? ['--no-open'] : [])], { cwd: app, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => editor.kill(signal));
editor.on('exit', code => {
  console.log(`\n[qa] DreamCut stopped. The QA folder stays in ${dir} until \`pnpm qa --clean\`.`);
  process.exit(code ?? 0);
});
