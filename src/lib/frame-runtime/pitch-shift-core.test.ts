import test from "node:test";
import assert from "node:assert/strict";
import { pitchRatio } from "../timeline/audio-pitch";
import { loadPitchShifter } from "./pitch-shift-core";

const SR = 48000;
const createPitchShifter = loadPitchShifter();

/** Runs a mono signal through the shifter in 128-sample blocks, as an AudioWorklet does. */
function shift(signal: Float32Array, ratio: number) {
  const shifter = createPitchShifter(SR, 2), out = new Float32Array(signal.length);
  for (let at = 0; at < signal.length; at += 128) {
    const block = signal.subarray(at, Math.min(signal.length, at + 128));
    const left = new Float32Array(block.length), right = new Float32Array(block.length);
    shifter.process([block], [left, right], ratio);
    out.set(left, at);
  }
  return out;
}

/** The shifter this replaced: two read heads half a 40 ms window apart, crossfaded. */
function twoHeadShift(signal: Float32Array, ratio: number) {
  const window = Math.round(SR * 0.04), out = new Float32Array(signal.length);
  let phase = 0;
  for (let i = 0; i < signal.length; i++) {
    const second = (phase + 0.5) % 1;
    const read = (p: number) => { const at = i - (p * window + 1), k = Math.floor(at), f = at - k; return (signal[k] ?? 0) * (1 - f) + (signal[k + 1] ?? 0) * f; };
    out[i] = read(phase) * Math.sin(Math.PI * phase) ** 2 + read(second) * Math.sin(Math.PI * second) ** 2;
    phase += (1 - ratio) / window; phase -= Math.floor(phase);
  }
  return out;
}

/** A steady-level sine gliding from 150 to 1200 Hz: any comb filter carves level dips into it. */
function sweep(seconds: number) {
  const out = new Float32Array(SR * seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) { phase += 2 * Math.PI * 150 * 8 ** (i / out.length) / SR; out[i] = 0.3 * Math.sin(phase); }
  return out;
}

/** A sung "ah": a 120 Hz pulse train through two vowel resonances. */
function vowel(seconds: number, f0 = 120) {
  const out = new Float32Array(SR * seconds), states = [[0, 0], [0, 0]];
  const resonators = [[700, 110], [1200, 120]].map(([f, bw]) => {
    const r = Math.exp(-Math.PI * bw! / SR);
    return [2 * r * Math.cos(2 * Math.PI * f! / SR), -r * r];
  });
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase += f0 / SR;
    let x = phase >= 1 ? (phase -= 1, 1) : 0;
    resonators.forEach(([a1, a2], k) => { const y = x + a1! * states[k]![0]! + a2! * states[k]![1]!; states[k] = [y, states[k]![0]!]; x = y; });
    out[i] = x * 0.01;
  }
  return out;
}

/**
 * Level of a shifted sweep in 5 ms frames, relative to its input level, as [5th percentile, lowest].
 * Two copies of the sound a few ms apart (the echo) cancel wherever they meet out of phase.
 */
function sweepLevel(signal: Float32Array) {
  const frame = 240, levels: number[] = [];
  for (let at = SR; at + frame < signal.length - SR / 10; at += frame) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += signal[at + i]! ** 2;
    levels.push(Math.sqrt(2 * energy / frame) / 0.3);
  }
  levels.sort((x, y) => x - y);
  return [levels[Math.floor(levels.length * 0.05)]!, levels[0]!];
}

/** Fundamental from the strongest autocorrelation period between 60 and 400 Hz. */
function fundamental(signal: Float32Array) {
  const x = signal.subarray(SR, SR + 8192);
  let best = -Infinity, period = 0;
  const score = (lag: number) => { let s = 0; for (let i = 0; i + lag < x.length; i++) s += x[i]! * x[i + lag]!; return s; };
  for (let lag = SR / 400; lag <= SR / 60; lag++) { const s = score(lag); if (s > best) { best = s; period = lag; } }
  const [a, b, c] = [score(period - 1), best, score(period + 1)];
  return SR / (period + (a - c) / (2 * (a - 2 * b + c)));
}

test("shifted sound keeps a steady level with no echo notches; the old two-head shifter does not", () => {
  const source = sweep(4);
  const [, controlLowest] = sweepLevel(twoHeadShift(source, pitchRatio(-3)));
  assert.ok(controlLowest < 0.3, `the check must catch the old echo (lowest level ${controlLowest.toFixed(2)})`);
  for (const semitones of [-1.5, -3, 3]) {
    const [low, lowest] = sweepLevel(shift(source, pitchRatio(semitones)));
    assert.ok(low > 0.9 && lowest > 0.85, `${semitones} st: level dips to ${lowest.toFixed(2)} (5th percentile ${low.toFixed(2)})`);
  }
});

test("pitch moves by the semitone ratio", () => {
  const source = vowel(2);
  const original = fundamental(source);
  for (const semitones of [-1.5, -3, -12, 4]) {
    const measured = fundamental(shift(source, pitchRatio(semitones))) / original;
    assert.ok(Math.abs(measured / pitchRatio(semitones) - 1) < 0.01, `${semitones} st: ratio ${measured.toFixed(4)}`);
  }
});

test("timing holds: a click train comes out at one fixed delay with no drift", () => {
  const ratio = pitchRatio(-3), shifter = createPitchShifter(SR, 1), seconds = 10;
  const source = new Float32Array(SR * seconds);
  for (let t = 0.5; t < seconds; t += 0.5) for (let i = 0; i < 480; i++) source[Math.round(t * SR) + i] = Math.sin(2 * Math.PI * 200 * i / SR) * Math.sin(Math.PI * i / 480);
  const out = shift(source, ratio);
  const onset = (signal: Float32Array, from: number) => { let peak = 0, at = from; for (let i = from; i < from + SR / 4; i++) if (Math.abs(signal[i]!) > peak) { peak = Math.abs(signal[i]!); at = i; } return at; };
  const lags = [1, 5, 9.5].map(t => (onset(out, Math.round(t * SR)) - onset(source, Math.round(t * SR))) * 1000 / SR);
  const expected = shifter.delay(ratio) * 1000 / SR;
  // Grains keep the source's own timing for a few ms around a transient, within the alignment search.
  for (const lag of lags) assert.ok(Math.abs(lag - expected) < 8, `lag ${lag.toFixed(1)} ms, expected about ${expected.toFixed(1)} ms`);
  assert.ok(Math.max(...lags) - Math.min(...lags) < 2, `drift ${lags.map(l => l.toFixed(1)).join(", ")}`);
  assert.ok(expected < 45, "delay stays well inside the preview's drift tolerance");
});

test("no shift passes the sound through untouched and without delay", () => {
  const source = vowel(1);
  assert.deepEqual(shift(source, 1), source);
});

test("dragging the dial through no shift leaves no grain tail to come back as a click", () => {
  const ratio = pitchRatio(-3), source = vowel(0.2);
  const run = (shifter: ReturnType<typeof createPitchShifter>, signal: Float32Array, r: number) => {
    const out = new Float32Array(signal.length);
    for (let at = 0; at < signal.length; at += 128) {
      const block = new Float32Array(Math.min(128, signal.length - at));
      shifter.process([signal.subarray(at, at + 128)], [block], r);
      out.set(block, at);
    }
    return out;
  };
  // Shifted, then a moment at no shift, then shifted again; against one that was never shifted before.
  const dragged = createPitchShifter(SR, 1), steady = createPitchShifter(SR, 1);
  run(dragged, source, ratio); run(steady, source, 1);
  run(dragged, new Float32Array(256), 1); run(steady, new Float32Array(256), 1);
  assert.deepEqual(run(dragged, new Float32Array(4096), ratio), run(steady, new Float32Array(4096), ratio));
});
