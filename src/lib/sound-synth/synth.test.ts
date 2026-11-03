import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { encodeWav16, runSynthProgram, seededRandom } from "./synth";

const WHOOSH = `
function render({ sampleRate, controls, random }) {
  const length = Math.round(sampleRate * controls.length_seconds);
  const left = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    left[i] = (random() * 2 - 1) * Math.sin(Math.PI * t) * 0.5;
  }
  return { channels: [left, left] };
}
`;

const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

test("the same program, values and seed produce byte-identical WAV files", () => {
  const render = (seed: number) => {
    const result = runSynthProgram(WHOOSH, { controls: { length_seconds: 0.25 }, seed });
    return encodeWav16(result.channels, result.sampleRate);
  };
  assert.equal(hash(render(7)), hash(render(7)));
  assert.notEqual(hash(render(7)), hash(render(8)));
});

test("reports duration and writes a standard 16-bit PCM header", () => {
  const result = runSynthProgram(WHOOSH, { controls: { length_seconds: 0.5 }, seed: 1 });
  assert.equal(result.durationSeconds, 0.5);
  const wav = encodeWav16(result.channels, result.sampleRate);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48_000);
  assert.equal(wav.length, 44 + 24_000 * 2 * 2);
});

test("programs cannot reach Node, timers or string code generation", () => {
  assert.throws(() => runSynthProgram(`function render() { return { channels: [[require("fs") ? 1 : 0]] }; }`, { controls: {}, seed: 1 }), /require is not defined/);
  assert.throws(() => runSynthProgram(`function render() { return { channels: [[process.exit(1)]] }; }`, { controls: {}, seed: 1 }), /process is not defined/);
  assert.throws(() => runSynthProgram(`function render() { return { channels: [[eval("1")]] }; }`, { controls: {}, seed: 1 }), /Code generation from strings disallowed/);
  assert.throws(() => runSynthProgram(`function render() { while (true) {} }`, { controls: {}, seed: 1 }), /timed out/);
});

test("rejects malformed output with a specific message", () => {
  assert.throws(() => runSynthProgram(`const x = 1;`, { controls: {}, seed: 1 }), /must define function render/);
  assert.throws(() => runSynthProgram(`function render() { return { channels: [] }; }`, { controls: {}, seed: 1 }), /one or two channels/);
  assert.throws(() => runSynthProgram(`function render() { return { channels: [[0, NaN]] }; }`, { controls: {}, seed: 1 }), /non-finite sample at 1/);
  assert.throws(() => runSynthProgram(`function render() { return { channels: [[0, 0], [0]] }; }`, { controls: {}, seed: 1 }), /same length/);
});

test("seeded random is reproducible", () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});
