#!/usr/bin/env node
/**
 * Install voice enhancement ("Enhance voice", proposal `use_voice_enhancement`): a Python 3.11 virtual
 * environment with the pinned DeepFilterNet packages (scripts/audio-enhance-requirements.txt) and the
 * DeepFilterNet3 model, about 400 MB in all.
 *
 *   pnpm setup:voice              a source checkout
 *   npx dreamcut setup-voice      an installed DreamCut
 *   node scripts/setup-voice.mjs --check   report only; installs nothing
 *
 * Uses uv when available (it fetches Python 3.11 itself), else Python 3.11. Safe to rerun: a working
 * environment is kept. One whose launcher cannot start (its folder was renamed or moved, so its
 * `deepFilter` points at a Python that no longer exists) is rebuilt in the current DreamCut location.
 * The editor finds the environment through voiceEnhancerExecutableCandidates (src/lib/local-store/audio-effects.ts),
 * whose paths these must match.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VENV = 'voice-enhancement-py311';

/** The current install location, then those made under earlier product names (OpenEdit, OpenSequence). */
export function voiceVenvDirs(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'darwin') return ['DreamCut', 'OpenEdit', 'OpenSequence'].map(name => path.join(home, 'Library', 'Caches', name, VENV));
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    return ['DreamCut', 'OpenEdit', 'OpenSequence'].map(name => path.join(local, name, 'Cache', VENV));
  }
  const cache = env.XDG_CACHE_HOME ?? path.join(home, '.cache');
  return ['dreamcut', 'open-edit', 'opensequence'].map(name => path.join(cache, name, VENV));
}

/** Where deepFilter keeps the downloaded DeepFilterNet3 model (its own cache, not DreamCut's). */
export function voiceModelCheckpoint(platform = process.platform, env = process.env, home = os.homedir()) {
  const model = ['DeepFilterNet3', 'checkpoints', 'model_120.ckpt.best'];
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'DeepFilterNet', ...model);
  if (platform === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'DeepFilterNet', ...model);
  return path.join(env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'DeepFilterNet', ...model);
}

const deepFilterIn = directory => path.join(directory, ...(process.platform === 'win32' ? ['Scripts', 'deepFilter.exe'] : ['bin', 'deepFilter']));
const pythonIn = directory => path.join(directory, ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
const run = (command, args) => spawnSync(command, args, { stdio: 'inherit' }).status === 0;
const quiet = (command, args) => spawnSync(command, args, { stdio: 'ignore' }).status === 0;
const works = directory => fs.existsSync(deepFilterIn(directory)) && quiet(deepFilterIn(directory), ['--help']);

/** Half a second of 48 kHz mono silence as a 16-bit WAV, for fetching the model without FFmpeg. */
function silentWav(file) {
  const samples = 24000;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48000, 24); header.writeUInt32LE(96000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples * 2, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.alloc(samples * 2)]));
}

function main() {
  class SetupError extends Error {}
  const fail = message => { throw new SetupError(message); };
  const checkOnly = process.argv.includes('--check');
  try {
    const [current, ...legacy] = voiceVenvDirs();
    let ready = [current, ...legacy].find(works);
    const stale = [current, ...legacy].find(directory => directory !== ready && fs.existsSync(deepFilterIn(directory)));
    if (checkOnly) {
      if (ready && fs.existsSync(voiceModelCheckpoint())) console.log(`Voice enhancement is ready in ${ready}.`);
      else if (ready) console.log(`Voice enhancement is installed in ${ready}; its model downloads on first use (\`npx dreamcut setup-voice\` fetches it now).`);
      else console.log(stale
        ? `Voice enhancement in ${stale} cannot start (its folder was moved or renamed). Run \`npx dreamcut setup-voice\` (source checkout: \`pnpm setup:voice\`) to reinstall it.`
        : 'Voice enhancement is not installed. Run `npx dreamcut setup-voice` (source checkout: `pnpm setup:voice`) to add it (about 400 MB).');
      process.exit(ready ? 0 : 1);
    }
    if (!ready) {
      if (stale) console.log(`The voice enhancement install in ${stale} cannot start; reinstalling it in ${current}.`);
      fs.mkdirSync(path.dirname(current), { recursive: true });
      const free = fs.statfsSync(path.dirname(current));
      if (free.bavail * free.bsize < 2 * 1024 ** 3) fail(`it needs about 2 GB free while installing in ${current}.`);
      const requirements = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audio-enhance-requirements.txt');
      console.log(`Installing voice enhancement in ${current} (about 400 MB)…`);
      if (quiet('uv', ['--version'])) {
        if (!run('uv', ['venv', '--clear', current, '--python', '3.11'])) fail('uv could not create the Python 3.11 environment.');
        if (!run('uv', ['pip', 'install', '--python', pythonIn(current), '-r', requirements])) fail('the DeepFilterNet packages could not be installed.');
      } else {
        const python = process.platform === 'win32' ? ['py', ['-3.11']] : ['python3.11', []];
        if (!quiet(python[0], [...python[1], '--version'])) {
          fail(process.platform === 'win32'
            ? 'it needs uv (winget install astral-sh.uv) or Python 3.11 (winget install Python.Python.3.11).'
            : 'it needs uv (brew install uv) or Python 3.11 (brew install python@3.11).');
        }
        if (!run(python[0], [...python[1], '-m', 'venv', '--clear', current])) fail('Python could not create the environment.');
        if (!run(pythonIn(current), ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements])) fail('the DeepFilterNet packages could not be installed.');
      }
      if (!works(current)) fail('DeepFilterNet installed without a working deepFilter command.');
      ready = current;
    }
    if (!fs.existsSync(voiceModelCheckpoint())) {
      // deepFilter downloads its model on first use; enhancing a moment of silence now keeps the first "Enhance voice" offline.
      console.log('Downloading the DeepFilterNet3 model…');
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-voice-model-'));
      try {
        silentWav(path.join(scratch, 'silence.wav'));
        quiet(deepFilterIn(ready), ['--model-base-dir', 'DeepFilterNet3', '--log-level', 'error', '--output-dir', scratch, path.join(scratch, 'silence.wav')]);
      } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
      if (!fs.existsSync(voiceModelCheckpoint())) fail('the DeepFilterNet3 model could not be downloaded; check the network connection and run this again.');
    }
    console.log(`Voice enhancement is ready in ${ready}.`);
  } catch (error) {
    console.error(`DreamCut could not set up voice enhancement: ${error instanceof SetupError ? error.message : error.stack ?? error}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
