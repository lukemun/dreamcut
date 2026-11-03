import test from "node:test";
import assert from "node:assert/strict";
import { waveformPath } from "./waveform-path";
test("full waveform includes both source ends and preserves silent regions", () => {
  const peaks = Array(900).fill(0); peaks[0]=1; peaks[899]=1;
  const whole=waveformPath(peaks,10,0,10);
  assert.match(whole,/M0,7V73/);
  assert.match(whole,/M450,40V40/);
  assert.match(whole,/M898,7V73/);
  const middle=waveformPath(peaks,10,2,5);
  assert.ok(!middle.includes(",7V73"));
});
