import fs from "node:fs";
import { endianness } from "node:os";

const LITTLE_ENDIAN = endianness() === "LE";

import { clampPeakSample } from "@/lib/timeline/peaks";

export const WAVEFORM_PEAK_RECIPE_ID = "mono-pcm16-max-2000-v1";
export const WAVEFORM_PEAK_TARGET_SAMPLES = 2_000;

export type WaveformPeaksArtifact = {
  schema_version: 1;
  recipe_id: typeof WAVEFORM_PEAK_RECIPE_ID;
  peaks: number[];
  source_duration_seconds: number;
};

type PcmWav = {
  channels: number;
  sampleRate: number;
  blockAlign: number;
  bitsPerSample: number;
  data: Buffer;
};

function readPcmWav(buffer: Buffer): PcmWav {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Waveform peaks require a RIFF/WAVE source");
  }

  let offset = 12;
  let format: Omit<PcmWav, "data"> | null = null;
  let data: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = Math.min(start + chunkSize, buffer.length);
    if (chunkId === "fmt " && end - start >= 16) {
      const audioFormat = buffer.readUInt16LE(start);
      if (audioFormat !== 1) throw new Error(`Waveform peaks require PCM WAV; received format ${audioFormat}`);
      format = {
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (chunkId === "data") {
      data = buffer.subarray(start, end);
    }
    offset = start + chunkSize + (chunkSize % 2);
  }

  if (!format || !data || format.channels < 1 || format.sampleRate < 1 || format.blockAlign < 1) {
    throw new Error("Waveform peaks source is missing valid PCM format or data");
  }
  if (format.bitsPerSample !== 16) {
    throw new Error(`Waveform peaks require 16-bit PCM; received ${format.bitsPerSample}-bit`);
  }
  return { ...format, data };
}

export function extractWaveformPeaksFromPcmWav(
  filePath: string,
  targetSamples = WAVEFORM_PEAK_TARGET_SAMPLES,
): WaveformPeaksArtifact {
  const wav = readPcmWav(fs.readFileSync(filePath));
  const frameCount = Math.floor(wav.data.length / wav.blockAlign);
  if (frameCount < 1) throw new Error("Waveform peaks source contains no PCM frames");
  const sampleCount = Math.min(Math.max(1, Math.floor(targetSamples)), frameCount);
  const peaks: number[] = [];
  // The normal preparation output is aligned mono PCM16. Read it without
  // per-sample Buffer dispatch; preserve explicit little-endian reads otherwise.
  const samples = LITTLE_ENDIAN && wav.blockAlign === 2 && wav.data.byteOffset % 2 === 0
    ? new Int16Array(wav.data.buffer, wav.data.byteOffset, frameCount)
    : null;

  for (let index = 0; index < sampleCount; index += 1) {
    // Proportional boundaries cover every source frame even when the source
    // length is not evenly divisible by the requested number of peaks.
    const startFrame = Math.floor((index * frameCount) / sampleCount);
    const endFrame = Math.floor(((index + 1) * frameCount) / sampleCount);
    let max = 0;
    if (samples) {
      for (let frame = startFrame; frame < endFrame; frame += 1) {
        const sample = Math.abs(samples[frame]!);
        if (sample > max) max = sample;
      }
    } else {
      for (let frame = startFrame; frame < endFrame; frame += 1) {
        const sample = Math.abs(wav.data.readInt16LE(frame * wav.blockAlign));
        if (sample > max) max = sample;
      }
    }
    peaks.push(Number(clampPeakSample(max / 32_768).toFixed(4)));
  }

  return {
    schema_version: 1,
    recipe_id: WAVEFORM_PEAK_RECIPE_ID,
    peaks,
    source_duration_seconds: frameCount / wav.sampleRate,
  };
}
