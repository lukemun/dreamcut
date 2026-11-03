#!/usr/bin/env node
/**
 * Install what captions and `speech_prepare` need beyond FFmpeg: the checksum-verified Whisper models
 * (transcription, and long-recording chunking in alignment) and, when Montreal Forced Aligner is installed,
 * its English models (word timing). About 500 MB. The two programs themselves, whisper-cli and mfa, come
 * from the system's package managers; this names the command for each one that is missing.
 *
 *   pnpm setup:speech             a source checkout
 *
 * The paths and environment overrides match scripts/transcribe.ts, scripts/align.ts and preparation-jobs.ts.
 * Safe to rerun: verified models are kept.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const whisperDir = () => path.join(os.homedir(), '.cache', 'whisper-models');
export const WHISPER_MODELS = [
  { env: 'WHISPER_MODEL', file: 'ggml-small.bin', bytes: 487601967,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' },
  { env: 'WHISPER_VAD_MODEL', file: 'ggml-silero-v6.2.0.bin', bytes: 885098,
    url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
    sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987' },
];
export const whisperModelPath = model => process.env[model.env] ?? path.join(whisperDir(), model.file);

export const mfaBin = () => process.env.MFA_BIN ?? 'mfa';
export const mfaRoot = () => process.env.MFA_ROOT_DIR ?? path.join(os.homedir(), '.local', 'share', 'mfa-data');
/** The MFA models align.ts and oov.ts name, as [kind, name, file under pretrained_models]. */
export const MFA_MODELS = [
  ['acoustic', 'english_mfa', path.join('acoustic', 'english_mfa.zip')],
  ['dictionary', 'english_us_mfa', path.join('dictionary', 'english_us_mfa.dict')],
  ['g2p', 'english_us_arpa', path.join('g2p', 'english_us_arpa.zip')],
];
/**
 * The Hugging Face snapshot MFA's align_one_hf / align_hf load. speech_prepare aligns with HF_HUB_OFFLINE=1,
 * so it must be in the Hugging Face cache beforehand.
 */
export const MFA_HF_MODEL = 'MontrealCorpusTools/english_mfa';
export const mfaHfModelDir = (env = process.env) => path.join(env.HF_HUB_CACHE
  ?? path.join(env.HF_HOME ?? path.join(os.homedir(), '.cache', 'huggingface'), 'hub'), `models--${MFA_HF_MODEL.replace('/', '--')}`);
/** The Python inside MFA's environment, beside its mfa command. */
const mfaPython = () => process.platform === 'win32'
  ? path.join(path.dirname(path.dirname(mfaBin())), 'python.exe')
  : path.join(path.dirname(mfaBin()), 'python');

export const mfaModelPath = ([kind, , file]) => kind === 'dictionary' && process.env.MFA_DICTIONARY_PATH
  ? process.env.MFA_DICTIONARY_PATH
  : path.join(mfaRoot(), 'pretrained_models', file);

const quiet = (command, args) => spawnSync(command, args, { stdio: 'ignore' }).status === 0;
export const hasWhisperCli = () => quiet('whisper-cli', ['--help']);
export const hasMfa = () => quiet(mfaBin(), ['version']);
export const WHISPER_CLI_HINT = process.platform === 'darwin' ? 'brew install whisper-cpp'
  : process.platform === 'win32' ? 'download a whisper.cpp release from https://github.com/ggml-org/whisper.cpp/releases and put whisper-cli on PATH'
    : 'build whisper.cpp (https://github.com/ggml-org/whisper.cpp) and put whisper-cli on PATH';
export const MFA_HINT = 'install Montreal Forced Aligner 3.x with conda (conda create -n mfa -c conda-forge montreal-forced-aligner), put its mfa on PATH or set MFA_BIN, then run setup-speech again';

const sha256 = file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});

async function main() {
  class SetupError extends Error {}
  const fail = message => { throw new SetupError(message); };
  try {
    for (const model of WHISPER_MODELS) {
      const target = whisperModelPath(model);
      if (fs.existsSync(target) && (process.env[model.env] || await sha256(target) === model.sha256)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      console.log(`Downloading ${model.file} (${Math.max(1, Math.round(model.bytes / 1024 ** 2))} MB)…`);
      const partial = `${target}.download-${process.pid}`;
      try {
        const response = await fetch(model.url);
        if (!response.ok || !response.body) fail(`the ${model.file} download failed (${response.status}).`);
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
        if (await sha256(partial) !== model.sha256) fail(`the ${model.file} download did not match its checksum; nothing was installed.`);
        fs.renameSync(partial, target);
      } finally { fs.rmSync(partial, { force: true }); }
    }
    console.log(`✓ Whisper models are in ${path.dirname(whisperModelPath(WHISPER_MODELS[0]))}`);

    const missing = [];
    if (hasWhisperCli()) console.log('✓ whisper-cli is available');
    else missing.push(`whisper-cli (transcription): ${WHISPER_CLI_HINT}`);
    if (hasMfa()) {
      for (const model of MFA_MODELS.filter(model => !fs.existsSync(mfaModelPath(model)))) {
        console.log(`Downloading the MFA ${model[0]} model ${model[1]}…`);
        if (spawnSync(mfaBin(), ['model', 'download', model[0], model[1]], { stdio: 'inherit', env: { ...process.env, MFA_ROOT_DIR: mfaRoot() } }).status !== 0
          || !fs.existsSync(mfaModelPath(model))) fail(`MFA could not download its ${model[0]} model ${model[1]}.`);
      }
      if (!fs.existsSync(mfaHfModelDir())) {
        console.log(`Downloading the MFA alignment model ${MFA_HF_MODEL}…`);
        const script = `from huggingface_hub import snapshot_download; snapshot_download(repo_id=${JSON.stringify(MFA_HF_MODEL)})`;
        if (spawnSync(mfaPython(), ['-c', script], { stdio: 'inherit' }).status !== 0 || !fs.existsSync(mfaHfModelDir())) {
          fail(`MFA could not download its alignment model ${MFA_HF_MODEL}.`);
        }
      }
      console.log(`✓ Montreal Forced Aligner and its English models are in ${mfaRoot()}`);
    } else missing.push(`mfa (word timing for captions): ${MFA_HINT}`);
    if (missing.length) {
      console.log(`\nStill needed:\n${missing.map(item => `  - ${item}`).join('\n')}`);
      process.exit(1);
    }
    console.log('Speech tools are ready.');
  } catch (error) {
    console.error(`DreamCut could not set up the speech tools: ${error instanceof SetupError ? error.message : error.stack ?? error}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
