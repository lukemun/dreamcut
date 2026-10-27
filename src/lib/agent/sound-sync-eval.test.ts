import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { encodeWav16 } from "@/lib/sound-synth/synth";
import { SOUND_SYNC_CASES, gradeSoundSync, handwritingTurnTimes, proposalSounds, soundSyncCase, truthCurve } from "./sound-sync-eval";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("truth curves are silent where nothing moves and active where the fixture moves", () => {
  const sketch = truthCurve(soundSyncCase("drawn-sketch"));
  assert.equal(sketch[10], 0, "before the first stroke");
  assert.ok(sketch[50]! > 0, "first stroke");
  assert.equal(sketch[170], 0, "the pause between groups");
  const camera = truthCurve(soundSyncCase("camera-fast-section"));
  assert.ok(camera[160]! > 5 * camera[50]!, "the push is much faster than the drift");
  const footage = truthCurve(soundSyncCase("footage-motion-beats"));
  assert.equal(footage[20], 0);
  assert.ok(footage[75]! > 0, "first beat at 1.1-1.4 s on the timeline");
  const writing = truthCurve(soundSyncCase("handwriting"));
  assert.equal(writing[10], 0, "before the pen touches down");
  assert.ok(writing[110]! > writing[40]!, "the pen accelerates");
  assert.equal(writing[135], 0, "the pause");
  assert.deepEqual(handwritingTurnTimes(), [0.683, 0.867, 1.011]);
  assert.equal(SOUND_SYNC_CASES.length, 4);
});

test("proposal sounds come from the recommended option, a record or a bare operation list", () => {
  const create = { create_audio: { source_url: "/x.wav", timeline_start: 0 } };
  assert.equal(proposalSounds({ options: [{ id: "a", operations: [] }, { id: "b", recommended: true, operations: [create] }] }).length, 1);
  assert.equal(proposalSounds({ proposal: { options: [{ id: "a", operations: [create, { element_id: "e" }] }] } }).length, 1);
  assert.equal(proposalSounds({ options: [{ id: "a", operations: [create] }, { id: "b", operations: [] }] }, "b").length, 0);
  assert.equal(proposalSounds({ operations: [create] }).length, 1);
});

test("rendered audio that follows the truth passes and a single misplaced sound fails", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const testCase = soundSyncCase("drawn-sketch");
  const truth = truthCurve(testCase);
  const peak = Math.max(...truth);
  const sampleRate = 16_000;
  const seconds = testCase.window.end - testCase.window.start;
  const follow = new Float32Array(sampleRate * seconds);
  const misplaced = new Float32Array(sampleRate * seconds);
  let seed = 7;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 1073741824) - 1;
  for (let index = 0; index < follow.length; index += 1) {
    const bin = Math.min(truth.length - 1, Math.floor((index / sampleRate) * 100));
    follow[index] = noise() * 0.5 * (truth[bin]! / peak);
    const time = index / sampleRate;
    misplaced[index] = time > 1.5 && time < 2.1 ? noise() * 0.5 : 0;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-sound-sync-test-"));
  try {
    fs.writeFileSync(path.join(dir, "follow.wav"), encodeWav16([follow], sampleRate));
    fs.writeFileSync(path.join(dir, "misplaced.wav"), encodeWav16([misplaced], sampleRate));
    const proposal = { operations: [{ create_audio: { source_url: "/unused.wav" } }] };
    const good = await gradeSoundSync(testCase.id, { projectId: "unused", proposal, renderedAudio: path.join(dir, "follow.wav") });
    assert.equal(good.pass, true, good.failures.join("; "));
    assert.ok(good.correlation > 0.9);
    const bad = await gradeSoundSync(testCase.id, { projectId: "unused", proposal, renderedAudio: path.join(dir, "misplaced.wav") });
    assert.equal(bad.pass, false);
    assert.ok(bad.uncaused_fraction > 0.5, "the sound plays during the pause");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("handwriting needs a different sound at the turns, not only loudness on speed", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const testCase = soundSyncCase("handwriting");
  const truth = truthCurve(testCase);
  const peak = Math.max(...truth);
  const turns = handwritingTurnTimes();
  const sampleRate = 48_000;
  const length = sampleRate * (testCase.window.end - testCase.window.start);
  const plain = new Float32Array(length);
  const marked = new Float32Array(length);
  let seed = 11;
  const noise = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 1073741824) - 1;
  let low = 0;
  let previous = 0;
  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    const level = truth[Math.min(truth.length - 1, Math.floor(time * 100))]! / peak;
    const white = noise();
    low += 0.15 * (white - low);
    const grit = white - previous;
    previous = white;
    plain[index] = low * level;
    marked[index] = low * level + (turns.some((turn) => Math.abs(turn - time) < 0.025) ? grit * 0.3 : 0);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-handwriting-test-"));
  try {
    const proposal = { operations: [{ create_audio: { source_url: "/unused.wav" } }] };
    fs.writeFileSync(path.join(dir, "plain.wav"), encodeWav16([plain], sampleRate));
    fs.writeFileSync(path.join(dir, "marked.wav"), encodeWav16([marked], sampleRate));
    const without = await gradeSoundSync(testCase.id, { projectId: "unused", proposal, renderedAudio: path.join(dir, "plain.wav") });
    assert.equal(without.pass, false);
    assert.ok(without.failures.some((failure) => failure.includes("sharp turns")));
    const withTurns = await gradeSoundSync(testCase.id, { projectId: "unused", proposal, renderedAudio: path.join(dir, "marked.wav") });
    assert.equal(withTurns.pass, true, withTurns.failures.join("; "));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
