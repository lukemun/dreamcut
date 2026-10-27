import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MFA_MODELS, WHISPER_MODELS, mfaModelPath, whisperModelPath } from './setup-speech.mjs';

test('the speech installer writes the models where transcribe, align and speech_prepare read them', () => {
  const saved = { ...process.env };
  try {
    for (const name of ['WHISPER_MODEL', 'WHISPER_VAD_MODEL', 'MFA_ROOT_DIR', 'MFA_DICTIONARY_PATH']) delete process.env[name];
    assert.deepEqual(WHISPER_MODELS.map(whisperModelPath), ['ggml-small.bin', 'ggml-silero-v6.2.0.bin'].map(file => path.join(os.homedir(), '.cache', 'whisper-models', file)));
    assert.ok(WHISPER_MODELS.every(model => /^[0-9a-f]{64}$/.test(model.sha256) && model.url.startsWith('https://huggingface.co/')), 'downloads are checksum-pinned');
    const dictionary = MFA_MODELS.find(([kind]) => kind === 'dictionary');
    assert.equal(mfaModelPath(dictionary), path.join(os.homedir(), '.local', 'share', 'mfa-data', 'pretrained_models', 'dictionary', 'english_us_mfa.dict'));
    process.env.WHISPER_MODEL = '/models/custom.bin';
    process.env.MFA_DICTIONARY_PATH = '/mfa/custom.dict';
    assert.equal(whisperModelPath(WHISPER_MODELS[0]), '/models/custom.bin');
    assert.equal(mfaModelPath(dictionary), '/mfa/custom.dict');
  } finally {
    process.env = saved;
  }
});
