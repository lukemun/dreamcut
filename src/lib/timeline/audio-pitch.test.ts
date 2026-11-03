import test from "node:test";
import assert from "node:assert/strict";
import { tempoFilters } from "../render/audio-manifest";
import { pitchRatio, pitchShiftFilters, readPitchSemitones } from "./audio-pitch";

test("pitch reads as no shift unless set, and stays within an octave", () => {
  assert.equal(readPitchSemitones(null), 0);
  assert.equal(readPitchSemitones({ pitch_semitones: "x" }), 0);
  assert.equal(readPitchSemitones({ pitch_semitones: -3 }), -3);
  assert.equal(readPitchSemitones({ pitch_semitones: -40 }), -12);
  assert.equal(readPitchSemitones({ pitch_semitones: 40 }), 12);
});

test("export shifts pitch by the semitone ratio and restores the original duration", () => {
  assert.deepEqual(pitchShiftFilters(0, 48000, tempoFilters), []);
  assert.equal(pitchRatio(-12), 0.5);
  const filters = pitchShiftFilters(-12, 48000, tempoFilters);
  // Half the rate halves pitch and doubles length; atempo=2 brings the length back.
  assert.deepEqual(filters, ["asetrate=24000", "aresample=48000", "atempo=2"]);
  const deeper = pitchShiftFilters(-3, 48000, tempoFilters);
  const rate = Number(deeper[0]!.split("=")[1]) / 48000, tempo = Number(deeper[2]!.split("=")[1]);
  assert.ok(Math.abs(rate * tempo - 1) < 1e-12);
});
