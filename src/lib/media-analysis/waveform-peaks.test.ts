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
