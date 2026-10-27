#!/usr/bin/env node
/**
 * Install everything an installed DreamCut's features use, about 4 GB in all:
 *
 *   tools     FFmpeg, whisper.cpp, uv, Python with NumPy (conda-forge, through a pinned micromamba)
 *   aligner   Montreal Forced Aligner (word timing for captions and take joins)
 *   speech    the checksum-pinned Whisper models and MFA's English models (scripts/setup-speech.mjs)
 *   voice     DeepFilterNet for "Enhance voice" (scripts/setup-voice.mjs)
 *   tracing   SAM 2.1 for cutouts and surface tracking (scripts/setup-matting.mjs)
 *
 *   npx dreamcut setup     run it now, in this terminal
 *   (automatic)            an installed DreamCut starts it in the background on `dreamcut mcp` / `dreamcut`
 *                          whenever a step is missing (startFeatureSetup); DREAMCUT_FEATURE_SETUP=0 turns that off
 *
 * Steps that finished are kept; a failed step does not stop the others and is retried on a later start.
 * Progress is in setup-state.json beside the tools (scripts/feature-tools.mjs), which `dreamcut doctor` reads.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { ENVIRONMENTS, MICROMAMBA, featureToolEnv, featureToolPaths, micromambaUrl } from './feature-tools.mjs';
import { CHECKPOINT as TRACING_CHECKPOINT, MARKER as TRACING_MARKER } from './matting/environment.mjs';
import { MFA_MODELS, WHISPER_MODELS, mfaHfModelDir, mfaModelPath, whisperModelPath } from './setup-speech.mjs';
import { voiceModelCheckpoint, voiceVenvDirs } from './setup-voice.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STEPS = ['tools', 'aligner', 'speech', 'voice', 'tracing'];
/** Raise when a step's meaning changes, so installs made by older steps run again. */
const STEPS_VERSION = 1;
const RETRY_AFTER_MS = 10 * 60 * 1000;

const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
// Only a real pid: process.kill(0) would signal this whole process group.
const alive = pid => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

export function readSetupState(paths = featureToolPaths()) {
  const state = readJson(paths.state);
  return state?.version === STEPS_VERSION ? state : { version: STEPS_VERSION, steps: {} };
}
export const setupRunning = state => Number.isInteger(state.pid) && alive(state.pid);

/** The subject-tracing folder: TIMELINE_MATTING_DIR (app data in an installed DreamCut), else the checkout's .matting. */
const tracingDir = env => path.resolve(path.join(here, '..'), env.TIMELINE_MATTING_DIR ?? '.matting');
/** A POSIX launcher whose `#!` interpreter is gone (its folder was renamed) cannot start. */
const launcherStarts = file => {
  if (!fs.existsSync(file)) return false;
  if (process.platform === 'win32') return true;
  const line = fs.readFileSync(file, 'latin1').slice(0, 4096).split('\n', 1)[0];
  const target = line.startsWith('#!') ? line.slice(2).trim().split(/\s+/, 1)[0] : '';
  return !target.startsWith('/') || target === '/bin/sh' || fs.existsSync(target);
};
const environmentReady = (paths, name, program) => JSON.stringify(readJson(path.join(paths.environment(name), 'dreamcut-environment.json'))?.packages) === JSON.stringify(ENVIRONMENTS[name])
  && fs.existsSync(program);

/** Which steps' results are on disk, from file checks only (cheap enough for every start). */
export function featurePresence(env = process.env) {
  const paths = featureToolPaths(process.platform, env);
  const deepFilter = directory => path.join(directory, ...(process.platform === 'win32' ? ['Scripts', 'deepFilter.exe'] : ['bin', 'deepFilter']));
  return {
    tools: environmentReady(paths, 'tools', paths.program('ffmpeg')),
    aligner: environmentReady(paths, 'mfa', paths.mfaBin),
    speech: WHISPER_MODELS.every(model => fs.existsSync(whisperModelPath(model))) && MFA_MODELS.every(model => fs.existsSync(mfaModelPath(model)))
      && fs.existsSync(mfaHfModelDir(env)),
    voice: voiceVenvDirs().some(directory => launcherStarts(deepFilter(directory))) && fs.existsSync(voiceModelCheckpoint()),
    tracing: fs.existsSync(path.join(tracingDir(env), TRACING_CHECKPOINT.file)) && fs.existsSync(path.join(tracingDir(env), TRACING_MARKER)),
  };
}
export const setupComplete = (presence = featurePresence()) => STEPS.every(step => presence[step]);

/**
 * Start the background setup when something is missing and it is not already running (or did not fail in
 * the last few minutes). Returns whether it started. `env` is the environment the runtime runs with.
 */
export function startFeatureSetup({ env = process.env, now = Date.now() } = {}) {
  if (env.DREAMCUT_FEATURE_SETUP === '0') return false;
  const paths = featureToolPaths(process.platform, env);
  const state = readSetupState(paths);
  if (setupRunning(state) || setupComplete(featurePresence(env))) return false;
  if (state.finished_at && now - Date.parse(state.finished_at) < RETRY_AFTER_MS) return false;
  fs.mkdirSync(paths.dir, { recursive: true });
  const log = fs.openSync(path.join(paths.dir, 'setup.log'), 'a');
  try {
    spawn(process.execPath, [fileURLToPath(import.meta.url), '--background'], { detached: true, stdio: ['ignore', log, log], env, windowsHide: true }).unref();
  } finally { fs.closeSync(log); }
  return true;
}

const sha256 = file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
const quiet = (command, args, env) => spawnSync(command, args, { stdio: 'ignore', env, windowsHide: true }).status === 0;
const run = (command, args, env) => spawnSync(command, args, { stdio: 'inherit', env, windowsHide: true }).status === 0;

async function main() {
  const paths = featureToolPaths();
  const env = { ...process.env, ...featureToolEnv(process.env), MAMBA_ROOT_PREFIX: path.join(paths.dir, 'mamba') };
  fs.mkdirSync(paths.dir, { recursive: true });
  const state = readSetupState(paths);
  if (setupRunning(state) && state.pid !== process.pid) {
    console.log(`DreamCut is already setting up its features (process ${state.pid}).`);
    process.exit(0);
  }
  const save = () => fs.writeFileSync(paths.state, JSON.stringify(state, null, 2));
  Object.assign(state, { pid: process.pid, started_at: new Date().toISOString(), finished_at: undefined });
  save();
  process.on('exit', () => { state.pid = undefined; state.finished_at = new Date().toISOString(); save(); });

  const presence = featurePresence(env);
  const free = fs.statfsSync(paths.dir);
  const missing = STEPS.filter(step => !presence[step]);
  if (missing.length && free.bavail * free.bsize < 8 * 1024 ** 3) {
    console.error(`DreamCut needs about 8 GB free in ${paths.dir} to set up ${missing.join(', ')}; it will try again later.`);
    process.exit(1);
  }

  const micromamba = async () => {
    const asset = MICROMAMBA.assets[`${process.platform}-${process.arch}`];
    if (!asset) throw new Error(`there is no micromamba build for ${process.platform}-${process.arch}.`);
    if (fs.existsSync(paths.micromamba) && await sha256(paths.micromamba) === asset.sha256) return;
    const partial = `${paths.micromamba}.download-${process.pid}`;
    try {
      const response = await fetch(micromambaUrl(asset));
      if (!response.ok || !response.body) throw new Error(`the micromamba download failed (${response.status}).`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
      if (await sha256(partial) !== asset.sha256) throw new Error('the micromamba download did not match its checksum.');
      fs.chmodSync(partial, 0o755);
      fs.renameSync(partial, paths.micromamba);
    } finally { fs.rmSync(partial, { force: true }); }
  };
  /** Create (or rebuild, when its package list changed) one conda environment, then check it runs. */
  const environment = async (name, verify) => {
    await micromamba();
    const prefix = paths.environment(name);
    const marker = path.join(prefix, 'dreamcut-environment.json');
    if (JSON.stringify(readJson(marker)?.packages) === JSON.stringify(ENVIRONMENTS[name]) && verify()) return;
    console.log(`Installing ${ENVIRONMENTS[name].join(', ')}…`);
    fs.rmSync(prefix, { recursive: true, force: true });
    if (!run(paths.micromamba, ['create', '--yes', '--prefix', prefix, '--channel', 'conda-forge', '--override-channels', ...ENVIRONMENTS[name]], env)) {
      throw new Error(`micromamba could not install the ${name} environment.`);
    }
    if (!verify()) throw new Error(`the ${name} environment installed but does not run.`);
    // The downloaded packages are only needed while installing (several hundred MB).
    run(paths.micromamba, ['clean', '--all', '--yes'], env);
    fs.writeFileSync(marker, JSON.stringify({ packages: ENVIRONMENTS[name], installed_at: new Date().toISOString() }, null, 2));
  };
  const helper = (script, args = []) => () => {
    if (!run(process.execPath, [path.join(here, script), ...args], env)) throw new Error(`${script} did not finish.`);
  };
  const steps = {
    // Checked by full path: PATH puts the system's own programs first.
    tools: () => environment('tools', () => quiet(paths.program('ffmpeg'), ['-version'], env) && quiet(paths.program('ffprobe'), ['-version'], env)
      && quiet(paths.program('whisper-cli'), ['--help'], env) && quiet(paths.program('uv'), ['--version'], env)
      && quiet(paths.program('python'), ['-c', 'import numpy'], env)),
    aligner: () => environment('mfa', () => quiet(paths.mfaBin, ['version'], env)),
    speech: helper('setup-speech.mjs'),
    voice: helper('setup-voice.mjs'),
    // The same pid file and log as MCP cutout_setup, so each sees the other's install and they never overlap.
    tracing: () => {
      const dir = tracingDir(env), pidFile = path.join(dir, 'setup.pid');
      fs.mkdirSync(dir, { recursive: true });
      if (alive(Number(readJson(pidFile)))) throw new Error('subject tracing is already being installed (cutout_setup); it is checked again on a later start.');
      const log = fs.openSync(path.join(dir, 'setup.log'), 'w');
      try {
        const result = spawnSync(process.execPath, [path.join(here, 'setup-matting.mjs'), '--dir', dir, '--pid-file', pidFile], { stdio: ['ignore', log, log], env, windowsHide: true });
        if (result.status !== 0) throw new Error(`setup-matting.mjs did not finish; see ${path.join(dir, 'setup.log')}.`);
      } finally { fs.closeSync(log); }
    },
  };
  let failed = 0;
  for (const step of STEPS) {
    if (presence[step]) {
      state.steps[step] = { state: 'done', finished_at: state.steps[step]?.finished_at ?? new Date().toISOString() };
      continue;
    }
    state.steps[step] = { state: 'running', started_at: new Date().toISOString() };
    save();
    console.log(`\n== ${step}`);
    try {
      await steps[step]();
      state.steps[step] = { state: 'done', finished_at: new Date().toISOString() };
    } catch (error) {
      failed += 1;
      state.steps[step] = { state: 'failed', error: error.message, finished_at: new Date().toISOString() };
      console.error(`DreamCut could not set up ${step}: ${error.message}`);
    }
    save();
  }
  console.log(failed ? `\n${failed} step(s) failed; DreamCut tries again on a later start (or run \`npx dreamcut setup\`).` : '\nEvery DreamCut feature is set up.');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
