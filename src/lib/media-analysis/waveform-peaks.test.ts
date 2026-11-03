import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractWaveformPeaksFromPcmWav,
  WAVEFORM_PEAK_RECIPE_ID,
} from "./waveform-peaks";

function wavBuffer(samples: number[]): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16_000, 24);
  buffer.writeUInt32LE(32_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

test("extracts deterministic max-amplitude peaks from mono PCM", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "waveform-peaks-"));
  const filePath = path.join(directory, "tone.wav");
  try {
    fs.writeFileSync(filePath, wavBuffer([0, 16_384, -32_768, 8_192]));
    const artifact = extractWaveformPeaksFromPcmWav(filePath, 2);
    assert.equal(artifact.recipe_id, WAVEFORM_PEAK_RECIPE_ID);
    assert.deepEqual(artifact.peaks, [0.5, 1]);
    assert.equal(artifact.source_duration_seconds, 4 / 16_000);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("includes the tail when source frames do not divide evenly into peak bins", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "waveform-peaks-tail-"));
  const filePath = path.join(directory, "tone.wav");
  try {
    fs.writeFileSync(filePath, wavBuffer([0, 0, 0, 0, 32_767]));
    const artifact = extractWaveformPeaksFromPcmWav(filePath, 2);
    assert.equal(artifact.peaks.length, 2);
    assert.ok(artifact.peaks[1] > 0.99);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("PCM16 fast path matches proportional peak bins, extremes and non-divisible tails", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "waveform-peaks-parity-"));
  const filePath = path.join(directory, "fixture.wav");
  try {
    let seed = 19;
    for (const length of [1, 7, 1999, 2001, 8193]) {
      const samples = Array.from({ length }, (_, index) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return index === length - 1 ? -32768 : (seed >> 16) >> (index % 8);
      });
      fs.writeFileSync(filePath, wavBuffer(samples));
      for (const target of [1, 3, 2000, length + 1]) {
        const count = Math.min(target, length);
        const expected = Array.from({ length: count }, (_, index) => {
          const values = samples.slice(Math.floor(index * length / count), Math.floor((index + 1) * length / count));
          return Number((Math.max(...values.map(value => Math.abs(value / 32768)))).toFixed(4));
        });
        assert.deepEqual(extractWaveformPeaksFromPcmWav(filePath, target).peaks, expected);
      }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("interleaved PCM preserves first-channel selection", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "waveform-peaks-stereo-"));
  const filePath = path.join(directory, "stereo.wav");
  try {
    const wav = wavBuffer([8192, -32768, -16384, 32767, 0, -32768]);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt32LE(64000, 28);
    fs.writeFileSync(filePath, wav);
    const result = extractWaveformPeaksFromPcmWav(filePath, 3);
    assert.deepEqual(result.peaks, [0.25, 0.5, 0]);
    assert.equal(result.source_duration_seconds, 3 / 16000);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("unaligned PCM buffer uses portable reads without copying or dropping the tail", (context) => {
  const wav = wavBuffer([0, 16384, -32768, 8192, 32767]);
  const storage = Buffer.alloc(wav.length + 1);
  wav.copy(storage, 1);
  const unaligned = storage.subarray(1);
  assert.equal(unaligned.byteOffset % 2, 1);
  context.mock.method(fs, "readFileSync", () => unaligned);
  assert.deepEqual(extractWaveformPeaksFromPcmWav("synthetic.wav", 3).peaks, [0, 1, 1]);
});
