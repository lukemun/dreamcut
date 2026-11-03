import assert from "node:assert/strict";
import test from "node:test";
import { lumaWaveform, scopeFrameInsideClip } from "./luma-waveform";
test("waveform maps black/white to display scale, preserves horizontal position, ignores transparency", () => {
  const bins = lumaWaveform(new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 255,255,255,0]),3,1);
  assert.equal(bins[100*3],1);
  assert.equal(bins[1],1);
  assert.equal(bins.reduce((sum,v)=>sum+v,0),2);
});
test("waveform uses Rec.709 display brightness weights", () => {
  const bins = lumaWaveform(new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,255]),3,1);
  assert.equal(bins[(100-21)*3],1);
  assert.equal(bins[(100-72)*3+1],1);
  assert.equal(bins[(100-7)*3+2],1);
});

test("RGB parade separates red green and blue and keeps source positions", async () => {
  const { rgbParade } = await import("./luma-waveform");
  const bins = rgbParade(new Uint8ClampedArray([255, 128, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0]), 3, 1);
  const plotWidth = 9;
  assert.equal(bins[0], 1); // red at x=0, full level
  assert.equal(bins[50 * plotWidth + 3], 1); // green at x=0, half level
  assert.equal(bins[100 * plotWidth + 6], 1); // blue at x=0, zero level
  assert.equal(bins[7], 1); // blue at x=1, full level
  assert.equal(bins.reduce((sum, count) => sum + count, 0), 6); // transparent pixel excluded
});
test("scope clock compares the presented timeline frame with the clip's timeline span", () => {
  const clip = { timeline_start: 62.4, duration: 8.9 };
  assert.equal(scopeFrameInsideClip(69 * 30, clip, 30), true);
  assert.equal(scopeFrameInsideClip(Math.round(62.4 * 30), clip, 30), true);
  assert.equal(scopeFrameInsideClip(Math.round(71.3 * 30), clip, 30), false, "end frame is exclusive");
  assert.equal(scopeFrameInsideClip(61 * 30, clip, 30), false);
  assert.equal(scopeFrameInsideClip(69 * 24, clip, 24), true);
  assert.equal(scopeFrameInsideClip(Number.NaN, clip, 30), false);
});
