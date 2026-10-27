/**
 * Rebuild an isolated sound unit as a tunable synth program.
 *
 * `scripts/sound-units.py` fits a sines-plus-noise model to each unit: up to four
 * partial tracks (frequency and amplitude over time) and twelve log-spaced noise
 * bands (RMS over time), on a time grid that is denser near the attack, plus the
 * measured pan and stereo width. This module turns that model into a self-contained
 * `synth.js` and its controls file for `sound_synth_prepare`, so the creator tunes
 * the rebuilt sound with ordinary sound controls. The program is generic: every unit
 * uses the same render code and differs only in its embedded model.
 */
import { MAX_SYNTH_SECONDS } from "./synth";

export type SoundUnitModel = {
  schema_version: 1;
  kind: string;
  duration_seconds: number;
  peak_seconds: number;
  times: number[];
  partials: Array<{ hz: number[]; amp: number[] }>;
  bands: Array<{ hz: number; width_hz: number; rms: number[] }>;
  pan: number;
  width: number;
};

export type SoundUnitControl = {
  id: string; kind: "number"; label: string; default: number; min: number; max: number; step: number; unit?: string;
};

function finiteList(values: unknown, length: number, minimum: number): values is number[] {
  return Array.isArray(values) && values.length === length && values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= minimum);
}

/** Runtime check of the Python output before it is embedded in code. */
export function parseSoundUnitModel(value: unknown): SoundUnitModel {
  const model = value as SoundUnitModel;
  if (!model || model.schema_version !== 1 || typeof model.kind !== "string") throw new Error("Invalid sound unit model");
  if (!(model.duration_seconds > 0 && model.duration_seconds <= MAX_SYNTH_SECONDS)) throw new Error("Sound unit model duration is out of range");
  const points = model.times?.length ?? 0;
  if (points < 2 || points > 200 || !finiteList(model.times, points, 0)) throw new Error("Sound unit model needs a time grid");
  if (!Array.isArray(model.partials) || model.partials.length > 8
    || !model.partials.every((partial) => finiteList(partial.hz, points, 0) && finiteList(partial.amp, points, 0))) {
    throw new Error("Sound unit model partials do not match its time grid");
  }
  if (!Array.isArray(model.bands) || model.bands.length === 0 || model.bands.length > 32
    || !model.bands.every((band) => band.hz > 0 && band.width_hz > 0 && finiteList(band.rms, points, 0))) {
    throw new Error("Sound unit model bands do not match its time grid");
  }
  if (!(Math.abs(model.pan) <= 1) || !(model.width >= 0 && model.width <= 1) || !(model.peak_seconds >= 0)) {
    throw new Error("Sound unit model pan, width or peak is out of range");
  }
  return model;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** Controls every rebuilt unit offers; pan and width default to the measured values. */
export function soundUnitControls(model: SoundUnitModel): SoundUnitControl[] {
  return [
    { id: "length", kind: "number", label: "Length", default: 1, min: 0.25, max: 4, step: 0.05, unit: "×" },
    { id: "attack", kind: "number", label: "Attack", default: 1, min: 0.25, max: 4, step: 0.05, unit: "×" },
    { id: "pitch", kind: "number", label: "Pitch", default: 0, min: -24, max: 24, step: 0.5, unit: "st" },
    { id: "brightness", kind: "number", label: "Brightness", default: 0, min: -12, max: 12, step: 0.5, unit: "dB/oct" },
    { id: "depth", kind: "number", label: "Low end", default: 0, min: -24, max: 12, step: 0.5, unit: "dB" },
    { id: "tone", kind: "number", label: "Tone level", default: 0, min: -48, max: 12, step: 0.5, unit: "dB" },
    { id: "noise", kind: "number", label: "Noise level", default: 0, min: -48, max: 12, step: 0.5, unit: "dB" },
    { id: "pan", kind: "number", label: "Pan", default: round(model.pan, 2), min: -1, max: 1, step: 0.01 },
    { id: "width", kind: "number", label: "Stereo width", default: round(model.width, 2), min: 0, max: 1, step: 0.01 },
    { id: "gain", kind: "number", label: "Volume", default: 0, min: -24, max: 12, step: 0.5, unit: "dB" },
  ];
}

/**
 * Render code shared by every rebuilt unit. Time warp: the attack (to the measured
 * peak) scales by length × attack, the rest by length. Noise bands are TPT
 * state-variable band-passes over independent noise sources (per band, mid and side),
 * each calibrated so a band's output RMS equals its measured RMS. Partials are
 * phase-continuous sines in the mid channel.
 */
const RENDER = String.raw`
function render({ sampleRate, controls, random }) {
  const db = (value) => Math.pow(10, value / 20);
  const stretch = controls.length, attackScale = controls.attack;
  const shift = Math.pow(2, controls.pitch / 12);
  const peak = Math.min(MODEL.peak_seconds, MODEL.duration_seconds);
  const attackOut = peak * stretch * attackScale;
  const totalOut = Math.min(MAX_SECONDS, attackOut + (MODEL.duration_seconds - peak) * stretch);
  const length = Math.max(1, Math.round(totalOut * sampleRate));
  const times = MODEL.times;
  const sourceTime = (t) => t < attackOut ? t / (stretch * attackScale) : peak + (t - attackOut) / stretch;
  const sample = (values, time) => {
    if (time <= times[0]) return values[0];
    for (let i = 1; i < times.length; i += 1) {
      if (time <= times[i]) {
        const span = times[i] - times[i - 1];
        const mix = span > 0 ? (time - times[i - 1]) / span : 1;
        return values[i - 1] + (values[i] - values[i - 1]) * mix;
      }
    }
    return values[values.length - 1];
  };
  const shape = (hz) => db(controls.brightness * Math.log2(Math.max(hz, 20) / 1000))
    * db(controls.depth / (1 + Math.pow(hz / 250, 4)));
  const nyquist = sampleRate * 0.45;
  // Three cascaded band-pass stages (18 dB/octave skirts) keep a loud low band from
  // spilling into quiet high bands; each stage is widened so the cascade spans the band.
  const STAGES = 3;
  const bands = MODEL.bands.map((band) => {
    const hz = band.hz * shift;
    const q = Math.max(0.35, (band.hz / band.width_hz) * Math.sqrt(Math.pow(2, 1 / STAGES) - 1));
    const g = Math.tan(Math.PI * Math.min(hz, nyquist) / sampleRate);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const step = (state, x) => {
      let value = x;
      for (let s = 0; s < STAGES; s += 1) {
        const v3 = value - state[2 * s + 1];
        const v1 = a1 * state[2 * s] + a2 * v3, v2 = state[2 * s + 1] + a2 * state[2 * s] + a3 * v3;
        state[2 * s] = 2 * v1 - state[2 * s]; state[2 * s + 1] = 2 * v2 - state[2 * s + 1];
        value = v1 * k;
      }
      return value;
    };
    // Calibrate with a fixed internal generator so random() stays the only noise source.
    const probe = new Float64Array(2 * STAGES);
    let seed = 22222, power = 0;
    for (let i = 0; i < 16384; i += 1) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const y = step(probe, seed / 2147483648 - 1);
      if (i >= 4096) power += y * y;
    }
    const scale = Math.sqrt(3) / Math.sqrt(Math.max(power / 12288, 1e-24));
    return { usable: hz < nyquist, step, scale: scale * shape(hz), rms: band.rms, mid: new Float64Array(2 * STAGES), side: new Float64Array(2 * STAGES) };
  });
  const partials = MODEL.partials.map((partial) => ({ partial, phase: 0 }));
  const left = new Float32Array(length), right = new Float32Array(length);
  const toneGain = db(controls.tone), noiseGain = db(controls.noise), gain = db(controls.gain);
  const angle = (controls.pan + 1) * Math.PI / 4;
  const panLeft = Math.cos(angle) * Math.SQRT2, panRight = Math.sin(angle) * Math.SQRT2;
  const block = 32;
  const levels = new Float64Array(bands.length), partialHz = new Float64Array(partials.length), partialAmp = new Float64Array(partials.length);
  for (let start = 0; start < length; start += block) {
    const at = sourceTime(start / sampleRate);
    for (let b = 0; b < bands.length; b += 1) levels[b] = sample(bands[b].rms, at) * bands[b].scale * noiseGain;
    for (let p = 0; p < partials.length; p += 1) {
      const hz = sample(partials[p].partial.hz, at) * shift;
      partialHz[p] = hz;
      partialAmp[p] = hz < nyquist ? sample(partials[p].partial.amp, at) * shape(hz) * toneGain : 0;
    }
    const end = Math.min(length, start + block);
    for (let i = start; i < end; i += 1) {
      let mid = 0, side = 0;
      // Each band filters its own noise: bands sharing one source partly cancel where
      // their skirts cross, leaving notches between them.
      for (let b = 0; b < bands.length; b += 1) {
        const band = bands[b];
        if (!band.usable) continue;
        mid += band.step(band.mid, (random() * 2 - 1) / Math.sqrt(3)) * levels[b];
        side += band.step(band.side, (random() * 2 - 1) / Math.sqrt(3)) * levels[b];
      }
      for (let p = 0; p < partials.length; p += 1) {
        partials[p].phase += 2 * Math.PI * partialHz[p] / sampleRate;
        if (partials[p].phase > 2 * Math.PI) partials[p].phase -= 2 * Math.PI;
        mid += Math.sin(partials[p].phase) * partialAmp[p];
      }
      side *= controls.width;
      const t = i / sampleRate;
      const edge = Math.min(1, t / 0.002, (totalOut - t) / 0.01);
      const l = (mid + side) * panLeft * gain * Math.max(0, edge), r = (mid - side) * panRight * gain * Math.max(0, edge);
      // Soft limit: a pushed dial saturates gently instead of hard clipping.
      left[i] = Math.tanh(l);
      right[i] = Math.tanh(r);
    }
  }
  return { channels: [left, right] };
}
`;

/** synth_js and controls file for sound_synth_prepare. */
export function soundUnitSynthSpec(model: SoundUnitModel): { synth_js: string; controls: { schema_version: 1; controls: SoundUnitControl[] } } {
  const embedded = JSON.stringify(parseSoundUnitModel(model));
  return {
    synth_js: `// Rebuilt from an isolated sound unit (${model.kind}); controls tune the fitted model.\nconst MAX_SECONDS = ${MAX_SYNTH_SECONDS};\nconst MODEL = ${embedded};\n${RENDER}`,
    controls: { schema_version: 1, controls: soundUnitControls(model) },
  };
}
