import vm from "node:vm";

/**
 * Deterministic, offline sound synthesis from model-written code.
 * See docs/architecture/model-authored-motion-graphics.md#synthesized-sound.
 *
 * A synthesis program is plain JavaScript that defines
 *   function render({ sampleRate, controls, random }) { return { channels: [left, right?] } }
 * where each channel is an array or Float32Array of samples in [-1, 1].
 * It runs in an isolated VM context with no require, process, timers or network,
 * and with Math.random replaced by a seeded generator, so equal inputs give equal bytes.
 * The VM is a determinism boundary, not a security sandbox for hostile code.
 */

export const SYNTH_FILE_NAME = "synth.js";
export const SYNTH_RENDERER = "dreamcut-synth@1";
export const SYNTH_SAMPLE_RATE = 48_000;
export const MAX_SYNTH_SECONDS = 30;
const RUN_TIMEOUT_MS = 10_000;

/** mulberry32: small, fast, fully specified PRNG so seeds reproduce across machines. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export type SynthResult = { channels: Float32Array[]; sampleRate: number; durationSeconds: number };

export function runSynthProgram(
  code: string,
  options: { controls: Record<string, string | number | boolean>; seed: number; sampleRate?: number },
): SynthResult {
  const sampleRate = options.sampleRate ?? SYNTH_SAMPLE_RATE;
  const random = seededRandom(options.seed);
  const seededMath = Object.create(Math) as Math;
  Object.defineProperty(seededMath, "random", { value: random });
  const context = vm.createContext({
    Math: Object.freeze(seededMath),
    Float32Array,
    Float64Array,
    Array,
    Number,
    Object,
    JSON,
    Infinity,
    NaN,
    isFinite,
  }, { codeGeneration: { strings: false, wasm: false } });
  new vm.Script(code, { filename: SYNTH_FILE_NAME }).runInContext(context, { timeout: RUN_TIMEOUT_MS });
  const render = (context as { render?: unknown }).render;
  if (typeof render !== "function") throw new Error(`${SYNTH_FILE_NAME} must define function render({ sampleRate, controls, random })`);

  context.__args = Object.freeze({ sampleRate, controls: Object.freeze({ ...options.controls }), random });
  const output = vm.runInContext("render(__args)", context, { timeout: RUN_TIMEOUT_MS }) as { channels?: unknown };
  const rawChannels = output?.channels;
  if (!Array.isArray(rawChannels) || rawChannels.length < 1 || rawChannels.length > 2) {
    throw new Error("render() must return { channels } with one or two channels");
  }
  const channels = rawChannels.map((channel, index) => {
    if (!(channel instanceof Float32Array) && !Array.isArray(channel)
      && !(channel && typeof channel === "object" && "length" in channel)) {
      throw new Error(`Channel ${index + 1} must be an array of samples`);
    }
    const samples = Float32Array.from(channel as ArrayLike<number>);
    for (let sample = 0; sample < samples.length; sample += 1) {
      if (!Number.isFinite(samples[sample]!)) throw new Error(`Channel ${index + 1} has a non-finite sample at ${sample}`);
    }
    return samples;
  });
  const length = channels[0]!.length;
  if (length === 0) throw new Error("render() returned no samples");
  if (channels.some((channel) => channel.length !== length)) throw new Error("Channels must have the same length");
  if (length > MAX_SYNTH_SECONDS * sampleRate) throw new Error(`Synthesized sounds are limited to ${MAX_SYNTH_SECONDS} seconds`);
  return { channels, sampleRate, durationSeconds: length / sampleRate };
}

/** 16-bit PCM WAV with no metadata chunks, so identical samples give identical bytes. */
export function encodeWav16(channels: Float32Array[], sampleRate: number): Buffer {
  const channelCount = channels.length;
  const frames = channels[0]!.length;
  const dataBytes = frames * channelCount * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * 2, 28);
  buffer.writeUInt16LE(channelCount * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel]![frame]!));
      buffer.writeInt16LE(Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), offset);
      offset += 2;
    }
  }
  return buffer;
}

export function peakLevel(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  return peak;
}
