#!/usr/bin/env node
/**
 * Install the local subject-tracing (SAM 2.1) environment that cutout templates need: a Python virtual
 * environment with pinned packages (scripts/matting/environment.mjs) and the checksum-verified model
 * checkpoint, about 1 GB in all. Surface tracking uses the same environment (OpenCV).
 *
 *   pnpm setup:matting                      a source checkout: into .matting
 *   node scripts/setup-matting.mjs --dir D  anywhere else (TIMELINE_MATTING_DIR then points at D)
 *
 * Uses uv when available (it fetches a suitable Python itself), else Python 3.10 or newer. Safe to rerun:
 * a verified checkpoint is kept and the environment is only rebuilt when it cannot import its packages.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CHECKPOINT, MARKER, PACKAGES } from './matting/environment.mjs';


const flag = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const dir = path.resolve(flag('--dir') ?? process.env.TIMELINE_MATTING_DIR ?? '.matting');
const venv = path.join(dir, 'venv');
const python = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = (command, args) => spawnSync(command, args, { stdio: 'inherit' }).status === 0;
const quiet = (command, args) => spawnSync(command, args, { stdio: 'ignore' }).status === 0;
class SetupError extends Error {}
const fail = message => { throw new SetupError(message); };
// The MCP tool (cutout_setup) passes a pid file it reads as "installing"; it is removed however this ends.
const pidFile = flag('--pid-file');
if (pidFile) { fs.writeFileSync(pidFile, String(process.pid)); process.on('exit', () => fs.rmSync(pidFile, { force: true })); }
process.on('uncaughtException', error => {
  console.error(`DreamCut could not set up subject tracing: ${error instanceof SetupError ? error.message : error.stack ?? error}`);
  process.exit(1);
});

fs.mkdirSync(dir, { recursive: true });
const free = fs.statfsSync(dir);
if (free.bavail * free.bsize < 3 * 1024 ** 3) fail(`it needs about 3 GB free while installing in ${dir}.`);

const ready = () => fs.existsSync(python) && quiet(python, ['-c', 'import torch, sam2, numpy, PIL, scipy, cv2']);
// An environment made by an earlier package list only needs the packages it lacks.
if (!ready() && fs.existsSync(python) && quiet(python, ['-c', 'import torch, sam2'])) {
  console.log('Updating the subject-tracing environment…');
  if (quiet('uv', ['--version'])) run('uv', ['pip', 'install', '--python', python, ...PACKAGES]);
  else run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', ...PACKAGES]);
}
if (!ready()) {
  console.log(`Installing the subject-tracing environment in ${venv} (about 800 MB)…`);
  fs.rmSync(venv, { recursive: true, force: true });
  if (quiet('uv', ['--version'])) {
    if (!run('uv', ['venv', '--python', '3.13', venv]) || !run('uv', ['pip', 'install', '--python', python, ...PACKAGES])) fail('uv could not install the packages.');
  } else {
    const candidates = process.platform === 'win32' ? [['py', ['-3']]] : [['python3.13', []], ['python3.12', []], ['python3.11', []], ['python3.10', []], ['python3', []]];
    const found = candidates.find(([command, args]) => quiet(command, [...args, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)']));
    if (!found) fail('it needs Python 3.10 or newer, or uv (brew install uv).');
    if (!run(found[0], [...found[1], '-m', 'venv', venv])) fail('Python could not create the environment.');
    if (!run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', ...PACKAGES])) fail('pip could not install the packages.');
  }
  if (!ready()) fail('the installed packages do not import.');
}

const checkpoint = path.join(dir, CHECKPOINT.file);
const sha256 = file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
if (!fs.existsSync(checkpoint) || await sha256(checkpoint) !== CHECKPOINT.sha256) {
  console.log(`Downloading the SAM 2.1 model (${Math.round(CHECKPOINT.bytes / 1024 ** 2)} MB)…`);
  const partial = `${checkpoint}.download-${process.pid}`;
  try {
    const response = await fetch(CHECKPOINT.url);
    if (!response.ok || !response.body) fail(`the model download failed (${response.status}).`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
    if (await sha256(partial) !== CHECKPOINT.sha256) fail('the model download did not match its checksum; nothing was installed.');
    fs.renameSync(partial, checkpoint);
  } finally { fs.rmSync(partial, { force: true }); }
}
fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ packages: PACKAGES, checkpoint: CHECKPOINT.sha256, installed_at: new Date().toISOString() }, null, 2));
console.log(`Subject tracing is ready in ${dir}.`);
