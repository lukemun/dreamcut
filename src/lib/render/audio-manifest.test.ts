import test from "node:test";
import assert from "node:assert/strict";
import { audioRuns, tempoFilters } from "./audio-manifest";
const sample = (time: number, volume = 1, rate = 1) => ({ id: "voice", src: "voice.wav", time, volume, rate, preservePitch: true });
test("gain automation preserves continuous source runs, including silent frames", () => {
  const runs = audioRuns([[sample(2)], [sample(2 + 1 / 30, 0)], [sample(2 + 2 / 30, 2)]], 30);
  assert.equal(runs.length, 1); assert.deepEqual(runs[0].gains, [1, 0, 2]); assert.equal(runs[0].sourceStart, 2);
});
test("loops, cuts, rate changes, and absent owners split runs", () => {
  const runs = audioRuns([[sample(2)], [sample(0)], [sample(1 / 30, 1, 2)], [], [sample(2)]], 30);
  assert.deepEqual(runs.map(r => r.firstFrame), [0, 1, 2, 4]);
});
test("pitch preserving filter chains stay inside safe tempo bounds", () => {
  assert.deepEqual(tempoFilters(8), ["atempo=2", "atempo=2", "atempo=2"]);
  assert.deepEqual(tempoFilters(.125), ["atempo=0.5", "atempo=0.5", "atempo=0.5"]);
  assert.throws(() => tempoFilters(Infinity));
  assert.throws(() => audioRuns([[sample(NaN)]], 30));
});
test("a reversed clip's backward source clock stays one run and never joins a forward run", () => {
  const back = (time: number) => ({ ...sample(time, 1, 2), reverse: true });
  const runs = audioRuns([[back(4)], [back(4 - 2 / 30)], [back(4 - 4 / 30)], [sample(4 - 4 / 30 + 2 / 30, 1, 2)]], 30);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map(r => [r.reverse ?? false, r.gains.length]), [[true, 3], [false, 1]]);
  assert.equal(runs[0].sourceStart, 4);
});
