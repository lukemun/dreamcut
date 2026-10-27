import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { instrumentDirectory, readInstrumentAnalysis, saveInstrumentPreset, saveInstrumentSettings } from "./instrument-analysis";
import { moveInstrumentHit, visibleInstrumentHits } from "../timeline/instrument-analysis";

test("named hit sets persist independently, rename without changing hits, and reject invalid writes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "instrument-presets-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const source = path.join(root, "source.wav");
    fs.writeFileSync(source, "fixture source");
    const initial = readInstrumentAnalysis("fixture", source);
    const directory = instrumentDirectory("fixture", initial.key);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ state: "ready", source_sha256: initial.key.slice(0, 64), model: "htdemucs", duration: 10, sample_rate: 44100, sample_count: 441000, lanes: ["mix", "drums", "bass", "other", "vocals"].map(id => ({ id, peaks: [], hits: [], rms: 0 })) }));
    const settings = { ...initial.settings, minimum_strength: 0.5, manual_hits: [{ instrument: "drums" as const, time_seconds: 3 }] };
    const viewer = { listening: ["drums" as const, "bass" as const], loop: true, playhead: 3.2 };
    const first = saveInstrumentPreset("fixture", source, " Strong drums ", settings, undefined, { start: 2, end: 4 }, viewer).presets![0]!;
    assert.deepEqual(first.settings.snapshot, { start: 2, end: 4, hits: [{ instrument: "drums", time_seconds: 3, strength: 1 }] });
    const changedLane = { id: "drums" as const, peaks: [], rms: 0, hits: [{ time_seconds: 2.5, strength: 1 }, { time_seconds: 6, strength: 1 }] };
    assert.deepEqual(visibleInstrumentHits(changedLane, first.settings, { candidates: true }).map(hit => hit.time_seconds), [3, 6]);
    assert.deepEqual(visibleInstrumentHits(changedLane, first.settings), [], "Unmarked candidates must not become snap targets");
    saveInstrumentPreset("fixture", source, "Soft drums", { ...settings, minimum_strength: 0.1 });
    const renamed = saveInstrumentPreset("fixture", source, "Main cuts", undefined, first.id);
    assert.equal(renamed.presets!.length, 2);
    assert.equal(renamed.presets![0]!.name, "Main cuts");
    assert.deepEqual(renamed.presets![0]!.settings, first.settings);
    assert.deepEqual(renamed.presets![0]!.viewer, viewer);
    assert.deepEqual(readInstrumentAnalysis("fixture", source).presets, renamed.presets);
    assert.deepEqual(readInstrumentAnalysis("fixture", source).settings, initial.settings);
    const marked = saveInstrumentPreset("fixture", source, "Chosen beats", { ...settings, manual_hits: [{ instrument: "drums", time_seconds: 3 }, { instrument: "drums", time_seconds: 3.5 }], marked_hits: ["drums:3.000000"] }, undefined, { start: 2, end: 4 }).presets!.at(-1)!;
    assert.equal(marked.settings.snapshot!.hits.length, 2, "Unmarked candidates are saved too");
    const reloaded = readInstrumentAnalysis("fixture", source).presets!.at(-1)!;
    assert.deepEqual(reloaded.settings.marked_hits, ["drums:3.000000"]);
    assert.deepEqual(visibleInstrumentHits(changedLane, reloaded.settings).map(hit => hit.time_seconds), [3]);
    assert.deepEqual(visibleInstrumentHits(changedLane, reloaded.settings, { candidates: true }).map(hit => hit.time_seconds), [3, 3.5, 6]);
    saveInstrumentSettings("fixture", source, reloaded.settings);
    assert.deepEqual(readInstrumentAnalysis("fixture", source).settings.marked_hits, ["drums:3.000000"]);
    saveInstrumentSettings("fixture", source, moveInstrumentHit(reloaded.settings, "drums", 3, 3.1));
    const relocated = readInstrumentAnalysis("fixture", source).settings;
    assert.deepEqual(relocated.replaced_hits, ["drums:3.000000"]);
    assert.deepEqual(visibleInstrumentHits(changedLane, relocated).map(hit => hit.time_seconds), [3.1]);
    saveInstrumentSettings("fixture", source, { ...reloaded.settings, marked_hits: [] });
    assert.deepEqual(visibleInstrumentHits(changedLane, readInstrumentAnalysis("fixture", source).settings), []);
    assert.throws(() => saveInstrumentPreset("fixture", source, "  ", settings));
    assert.throws(() => saveInstrumentPreset("fixture", source, "main cuts", settings));
    assert.throws(() => saveInstrumentPreset("fixture", source, "Unknown", settings, "missing"));
    assert.throws(() => saveInstrumentPreset("fixture", source, "Outside", { ...settings, manual_hits: [{ instrument: "drums", time_seconds: 11 }] }));
    assert.equal(readInstrumentAnalysis("fixture", source).presets!.length, 3);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
