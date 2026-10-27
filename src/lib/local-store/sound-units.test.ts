import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { encodeWav16, seededRandom } from "@/lib/sound-synth/synth";

import { parseSoundUnitsRequest } from "./sound-units";

const python = process.env.STEMS_PYTHON || path.resolve(process.cwd(), ".venv-stems/bin/python");
const script = path.resolve(process.cwd(), "scripts/sound-units.py");

test("requests are validated before any work starts", () => {
  const base = { source: "sources/clip.mp4", start_seconds: 1, end_seconds: 5 };
  const parsed = parseSoundUnitsRequest(base);
  assert.deepEqual(parsed.stems, ["drums", "bass", "other"]);
  assert.equal(parsed.max_units, 12);
  assert.equal(parsed.import, true);
  assert.equal(parsed.recreate, false);
  assert.throws(() => parseSoundUnitsRequest({ ...base, end_seconds: 40 }), /at most 30 seconds/);
  assert.throws(() => parseSoundUnitsRequest({ ...base, end_seconds: 0.5 }), /after start_seconds/);
  assert.throws(() => parseSoundUnitsRequest({ ...base, stems: ["drums", "drums"] }), /distinct/);
  assert.throws(() => parseSoundUnitsRequest({ ...base, events: [{ time_seconds: 9 }] }), /inside the window/);
  assert.throws(() => parseSoundUnitsRequest({ ...base, events: [{ time_seconds: 2, stem: "vocals" }] }), /requested stems/);
  assert.throws(() => parseSoundUnitsRequest({ ...base, events: [{ time_seconds: 2, when: 1 }] }), /unknown field when/);
  assert.throws(() => parseSoundUnitsRequest({ ...base, window: 3 }), /Unknown field window/);
  assert.throws(() => parseSoundUnitsRequest({ start_seconds: 1, end_seconds: 2 }), /source/);
  assert.equal(parseSoundUnitsRequest({ ...base, source_url: "/api/projects/p/media/sources/a.wav" }).source, "/api/projects/p/media/sources/a.wav");
});

/** A 70 Hz thump at 1.00 s with a long decay, and a 2-6 kHz noise whoosh at 1.15 s over its tail. */
function overlappingStem(directory: string) {
  const sampleRate = 44100;
  const length = 3 * sampleRate;
  const random = seededRandom(3);
  const left = new Float32Array(length);
  let low = 0, band = 0, high = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    let value = 0;
    if (t >= 1) value += 0.6 * Math.sin(2 * Math.PI * 70 * (t - 1)) * Math.exp(-(t - 1) * 5);
    const noise = random() * 2 - 1;
    // Crude band-pass: difference of two one-pole low-passes (~6 kHz minus ~2 kHz).
    high += (noise - high) * 0.58; low += (noise - low) * 0.25; band = high - low;
    if (t >= 1.15 && t < 1.5) value += 0.5 * band * Math.min(1, (t - 1.15) / 0.02) * Math.exp(-(t - 1.15) * 9);
    value += 0.002 * noise;
    left[i] = value;
  }
  fs.writeFileSync(path.join(directory, "drums.wav"), encodeWav16([left, left], sampleRate));
}

type Unit = { name: string; label: string; onset_seconds: number; character: string; file: string; features: { spectral_centroid_hz: number; low_energy_share: number }; leakage: { time_cut_foreign_share: number; unit_residual_crosstalk: number }; model: { partials: unknown[]; bands: unknown[] } };

test("overlapping events come out as separate units with less leakage than time cuts", { skip: !fs.existsSync(python) && "stem runtime not installed" }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sound-units-test-"));
  try {
    overlappingStem(directory);
    const out = path.join(directory, "out");
    execFileSync(python, ["-I", script, "extract", "--stems-dir", directory, "--stems", "drums", "--start", "0.6", "--end", "2.4",
      "--out", out, "--models", "--events", JSON.stringify([{ time_seconds: 1.0, stem: "drums", label: "thump" }, { time_seconds: 1.15, stem: "drums", label: "whoosh" }])],
    { stdio: ["ignore", "pipe", "ignore"], timeout: 120_000 });
    const { units } = JSON.parse(fs.readFileSync(path.join(out, "units.json"), "utf8")) as { units: Unit[] };
    const thump = units.find((unit) => unit.label === "thump")!;
    const whoosh = units.find((unit) => unit.label === "whoosh")!;
    assert.ok(thump && whoosh, "both named events have units");
    assert.ok(Math.abs(thump.onset_seconds - 1.0) < 0.03 && Math.abs(whoosh.onset_seconds - 1.15) < 0.03);
    assert.ok(thump.features.spectral_centroid_hz < 400, `thump centroid ${thump.features.spectral_centroid_hz}`);
    assert.ok(whoosh.features.spectral_centroid_hz > 1500, `whoosh centroid ${whoosh.features.spectral_centroid_hz}`);
    assert.ok(whoosh.features.low_energy_share < 0.05, `whoosh keeps ${whoosh.features.low_energy_share} of the thump's low end`);
    assert.ok(["thump", "boom"].includes(thump.character), thump.character);
    assert.ok(!["thump", "boom"].includes(whoosh.character), whoosh.character);
    // The whoosh's time cut carries the thump's tail; its unit does not.
    assert.ok(whoosh.leakage.time_cut_foreign_share > 0.15, `cut foreign ${whoosh.leakage.time_cut_foreign_share}`);
    assert.ok(whoosh.leakage.unit_residual_crosstalk < whoosh.leakage.time_cut_foreign_share / 4, JSON.stringify([whoosh.leakage, whoosh.features.frequency_profile.map((b) => b.level_db), thump.features.frequency_profile.map((b) => b.level_db)]));
    for (const unit of units) {
      assert.ok(fs.existsSync(path.join(out, unit.file)));
      assert.ok(unit.model.bands.length === 12);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
