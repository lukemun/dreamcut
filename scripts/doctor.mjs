#!/usr/bin/env node
/**
 * Check every program and model the editor and its agent tools use on this computer, and name the command
 * that installs each missing one. Installs nothing.
 *
 *   pnpm setup:check        a source checkout (with its Node and Chrome checks)
 *
 * Exits 1 only when FFmpeg or Chrome (export) is missing; the rest are per-feature.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDITOR_ROOT, isPackagedRuntime, runtimeEnvDefaults } from '../mcp/editor-runtime.mjs';
import { featureToolPaths } from './feature-tools.mjs';
import { CHECKPOINT } from './matting/environment.mjs';
import { STEPS, readSetupState, setupRunning } from './setup-features.mjs';
import { MFA_HF_MODEL, MFA_HINT, MFA_MODELS, WHISPER_CLI_HINT, WHISPER_MODELS, hasMfa, hasWhisperCli, mfaHfModelDir, mfaModelPath, whisperModelPath } from './setup-speech.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const quiet = (command, args) => spawnSync(command, args, { stdio: 'ignore' }).status === 0;
// The tools an installed DreamCut set up come first on PATH, as they do for the editor.
Object.assign(process.env, runtimeEnvDefaults());
const env = process.env;
const installed = isPackagedRuntime();
// An installed DreamCut installs these itself (`dreamcut setup`); a source checkout uses the system's.
const SETUP = 'node bin/dreamcut.mjs setup';
const brewOr = (mac, windows, other) => installed ? SETUP : process.platform === 'darwin' ? mac : process.platform === 'win32' ? windows : other;

/** [feature, ok, fix] rows; `required` rows fail the check. */
export async function checks() {
  const rows = [];
  const add = (feature, ok, fix, required = false) => rows.push({ feature, ok, fix, required });

  const ffmpeg = quiet('ffmpeg', ['-version']) && quiet('ffprobe', ['-version']);
  add('FFmpeg and ffprobe (import, preview, audio, export)', ffmpeg,
    brewOr('brew install ffmpeg', 'winget install Gyan.FFmpeg', 'install ffmpeg with your package manager'), true);

  let chrome = false;
  try {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    await browser.close();
    chrome = true;
  } catch {}
  add('Google Chrome (export, frame checks)', chrome, 'install Google Chrome from https://www.google.com/chrome/', true);

  const speech = installed ? SETUP : 'pnpm setup:speech';
  add('whisper-cli (captions: transcription)', hasWhisperCli(), installed ? SETUP : WHISPER_CLI_HINT);
  for (const model of WHISPER_MODELS) add(`Whisper model ${model.file} (captions)`, fs.existsSync(whisperModelPath(model)), speech);
  const mfa = hasMfa();
  add('Montreal Forced Aligner (captions: word timing)', mfa, installed ? SETUP : MFA_HINT);
  // Its models download through mfa itself, so they are only worth listing once it is installed.
  if (mfa) for (const model of MFA_MODELS) add(`MFA ${model[0]} model ${model[1]} (captions)`, fs.existsSync(mfaModelPath(model)), speech);
  if (mfa) add(`MFA alignment model ${MFA_HF_MODEL} (captions)`, fs.existsSync(mfaHfModelDir()), speech);

  add('Python 3 with NumPy (speech clean-up)', quiet(env.DREAMCUT_PYTHON || 'python3', ['-c', 'import numpy']),
    brewOr('brew install python numpy', 'winget install Python.Python.3.12, then py -m pip install numpy', 'install python3 and python3-numpy'));

  const voice = spawnSync(process.execPath, [path.join(here, 'setup-voice.mjs'), '--check'], { encoding: 'utf8' });
  add('Voice enhancement, DeepFilterNet (Enhance voice)', voice.status === 0, installed ? SETUP : voice.stdout.trim() || 'pnpm setup:voice');

  const matting = path.resolve(EDITOR_ROOT, env.TIMELINE_MATTING_DIR ?? '.matting');
  const mattingPython = path.join(matting, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  add('Subject tracing, SAM 2.1 (cutouts, surface tracking)',
    fs.existsSync(path.join(matting, CHECKPOINT.file)) && quiet(mattingPython, ['-c', 'import sam2, cv2']),
    installed ? SETUP : 'pnpm setup:matting (about 1 GB)');
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await checks();
  const state = readSetupState(featureToolPaths());
  if (setupRunning(state)) {
    const step = STEPS.find(name => state.steps?.[name]?.state === 'running');
    console.log(`DreamCut is setting up its features in the background${step ? ` (now: ${step})` : ''}; what is missing below arrives as it finishes.\n`);
  }
  for (const name of STEPS) if (state.steps?.[name]?.state === 'failed') console.log(`! Setup step "${name}" failed: ${state.steps[name].error}`);
  for (const row of rows) console.log(`${row.ok ? '✓' : row.required ? '✗' : '–'} ${row.feature}${row.ok ? '' : `\n    ${row.fix}`}`);
  const missing = rows.filter(row => !row.ok);
  console.log(missing.length ? `\n${missing.length} missing; the features named above need them.` : '\nEverything DreamCut uses is installed.');
  process.exit(rows.some(row => row.required && !row.ok) ? 1 : 0);
}
