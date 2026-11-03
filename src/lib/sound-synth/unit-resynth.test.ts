import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { encodeWav16, runSynthProgram } from "./synth";
import { parseSoundUnitModel, soundUnitControls, soundUnitSynthSpec, type SoundUnitModel } from "./unit-resynth";

const POINTS = 16;
const times = Array.from({ length: POINTS }, (_, i) => 0.4 * (i / (POINTS - 1)) ** 1.7);
const decay = times.map((t) => Math.exp(-t * 8));
const edges = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000];

/** A thump body (falling sine) over a mid-bright noise wash. */
function model(overrides: Partial<SoundUnitModel> = {}): SoundUnitModel {
  return {
    schema_version: 1, kind: "thump", duration_seconds: 0.4, peak_seconds: 0.01, times,
    partials: [{ hz: times.map((t) => 120 - 60 * t), amp: decay.map((v) => 0.4 * v) }],
    bands: edges.slice(0, -1).map((low, i) => ({
      hz: Math.sqrt(low * edges[i + 1]), width_hz: edges[i + 1] - low,
      rms: decay.map((v) => v * (i >= 6 && i <= 9 ? 0.05 : 0.005)),
    })),
    pan: 0, width: 0.3,
    ...overrides,
  };
}

function render(values: Record<string, number> = {}, unit = model()) {
  const spec = soundUnitSynthSpec(unit);
  const defaults = Object.fromEntries(spec.controls.controls.map((control) => [control.id, control.default]));
  return runSynthProgram(spec.synth_js, { controls: { ...defaults, ...values }, seed: 1 });
}

const energy = (channel: Float32Array) => channel.reduce((sum, value) => sum + value * value, 0);

/** Share of energy above `hz`, by a first-difference proxy (a high-pass weighting). */
function brightness(channel: Float32Array) {
  let high = 0;
  for (let i = 1; i < channel.length; i += 1) high += (channel[i] - channel[i - 1]) ** 2;
  return high / Math.max(energy(channel), 1e-12);
}

/** Dominant low frequency by zero crossings of a smoothed copy. */
function lowCrossings(channel: Float32Array) {
  let smooth = 0, previous = 0, crossings = 0;
  for (const value of channel) {
    smooth += (value - smooth) * 0.02;
    if ((previous < 0) !== (smooth < 0)) crossings += 1;
    previous = smooth;
  }
  return crossings;
}

test("renders the fitted length and is reproducible for the same values and seed", () => {
  const first = render();
  assert.ok(Math.abs(first.durationSeconds - 0.4) < 0.002);
  const hash = (result: ReturnType<typeof render>) => createHash("sha256").update(encodeWav16(result.channels, result.sampleRate)).digest("hex");
  assert.equal(hash(first), hash(render()));
  assert.ok(first.channels.every((channel) => channel.every((value) => value >= -1 && value <= 1)));
});

test("noise bands reproduce their measured RMS", () => {
  const flat = model({ partials: [], width: 0, bands: model().bands.map((band) => ({ ...band, rms: times.map(() => 0.02) })) });
  const { channels } = render({}, flat);
  const rms = Math.sqrt(energy(channels[0]) / channels[0].length);
  // Twelve uncorrelated bands at 0.02 RMS each sum to about 0.069.
  assert.ok(Math.abs(rms - 0.02 * Math.sqrt(12)) / (0.02 * Math.sqrt(12)) < 0.2, `rms ${rms}`);
});

test("every control changes the sound in its own direction", () => {
  const base = render();
  assert.ok(Math.abs(render({ length: 2 }).durationSeconds - 0.8) < 0.003);
  assert.ok(render({ attack: 4 }).durationSeconds > base.durationSeconds);
  assert.ok(lowCrossings(render({ pitch: 12, noise: -48 }).channels[0]) > 1.6 * lowCrossings(render({ noise: -48 }).channels[0]));
  assert.ok(brightness(render({ brightness: 9 }).channels[0]) > 1.5 * brightness(base.channels[0]));
  assert.ok(energy(render({ depth: 12, noise: -48 }).channels[0]) > 4 * energy(render({ noise: -48 }).channels[0]));
  assert.ok(energy(render({ tone: -48 }).channels[0]) < energy(base.channels[0]));
  assert.ok(energy(render({ noise: -48 }).channels[0]) < energy(base.channels[0]));
  const left = render({ pan: -1 });
  assert.ok(energy(left.channels[1]) < 0.01 * energy(left.channels[0]));
  const mono = render({ width: 0 });
  assert.ok(mono.channels[0].every((value, i) => Math.abs(value - mono.channels[1][i]) < 1e-6));
  assert.ok(energy(render({ gain: -12 }).channels[0]) < 0.1 * energy(base.channels[0]));
});

test("controls default pan and width to the measured values", () => {
  const controls = soundUnitControls(model({ pan: -0.42, width: 0.77 }));
  assert.equal(controls.find((control) => control.id === "pan")?.default, -0.42);
  assert.equal(controls.find((control) => control.id === "width")?.default, 0.77);
  assert.ok(controls.length <= 15);
});

test("rejects a model whose tracks do not match its time grid", () => {
  const broken = model();
  broken.bands[0].rms = broken.bands[0].rms.slice(1);
  assert.throws(() => parseSoundUnitModel(broken), /bands/);
  assert.throws(() => parseSoundUnitModel({ ...model(), duration_seconds: 31 }), /duration/);
  assert.throws(() => parseSoundUnitModel({ ...model(), pan: 2 }), /pan/);
});
