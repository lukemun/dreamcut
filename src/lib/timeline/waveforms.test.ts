import assert from "node:assert/strict";
import test from "node:test";

import { getWaveformPeakSlice } from "./waveforms";

test("getWaveformPeakSlice treats trim_end as tail trim seconds", () => {
  const slice = getWaveformPeakSlice({
    trimStart: 2,
    trimEnd: 3,
    sourceDuration: 10,
    peakCount: 100,
  });
  assert.deepEqual(slice, { startIndex: 20, endIndex: 70 });
});

test("getWaveformPeakSlice always returns at least one sample", () => {
  const slice = getWaveformPeakSlice({
    trimStart: 9.9,
    trimEnd: 0.05,
    sourceDuration: 10,
    peakCount: 20,
  });
  assert.equal(slice.endIndex > slice.startIndex, true);
});
