import assert from 'node:assert/strict';
import test from 'node:test';
import {originalMediaSampleUs, previewMatchedSourceSampleUs, proxySlotAtUs, proxySlotSampleUs} from './source-sampling';

const US = 1_000_000n;
const RATES: Array<[string, bigint, bigint]> = [
  ['23.976', 24000n, 1001n], ['24', 24n, 1n], ['25', 25n, 1n], ['29.97', 30000n, 1001n], ['30', 30n, 1n],
  ['48', 48n, 1n], ['50', 50n, 1n], ['59.94', 60000n, 1001n], ['60', 60n, 1n], ['119.88', 120000n, 1001n],
];

/** round(n / d) with halves away from zero, on non-negative integers. */
const roundHalfUp = (n: bigint, d: bigint) => (2n * n + d) / (2n * d);

/** ffmpeg fps=30: source frame i goes to slot round(pts_i × 30); a slot shows the last such frame. */
function ffmpegProxyFrame(slot: number, num: bigint, den: bigint) {
  let shown = 0;
  for (let i = 0n; ; i++) {
    if (roundHalfUp(i * den * 30n, num) > BigInt(slot)) return shown;
    shown = Number(i);
  }
}

/** The export decoder: the frame whose microsecond-rounded interval covers the time. */
function coveringFrame(timeUs: number, num: bigint, den: bigint) {
  const ptsUs = (i: bigint) => roundHalfUp(i * den * US, num);
  let i = BigInt(timeUs) * num / (den * US);
  while (i > 0n && ptsUs(i) > BigInt(timeUs)) i--;
  while (ptsUs(i + 1n) <= BigInt(timeUs)) i++;
  return Number(i);
}

test('sampling the original at the slot midpoint reproduces the proxy frame at every common rate', () => {
  for (const [name, num, den] of RATES) {
    for (let slot = 0; slot < 1200; slot++) {
      const expected = ffmpegProxyFrame(slot, num, den);
      assert.equal(coveringFrame(proxySlotSampleUs(slot), num, den), expected, `${name} fps, slot ${slot}`);
    }
  }
});

test('the previous rule (sample at the slot start) disagrees with preview for non-30 sources', () => {
  const mismatches = (num: bigint, den: bigint) => Array.from({length: 300}, (_, slot) => slot)
    .filter(slot => coveringFrame(Math.round(slot * 1e6 / 30), num, den) !== ffmpegProxyFrame(slot, num, den)).length;
  assert.equal(mismatches(30n, 1n), 0);
  assert.ok(mismatches(30000n, 1001n) > 250, '29.97 fps export ran a frame behind preview');
  assert.ok(mismatches(24000n, 1001n) > 50);
});

test('authored times map to the slot preview shows, including float times on the 30 fps grid', () => {
  for (let frame = 0; frame < 20_000; frame++) {
    assert.equal(proxySlotAtUs(Math.round((frame / 30) * 1e6)), frame);
    assert.equal(previewMatchedSourceSampleUs(frame / 30), proxySlotSampleUs(frame));
  }
  // The renderer's end clamp (end - 10 µs) stays in the last slot of the window.
  assert.equal(previewMatchedSourceSampleUs(90 / 30 - .00001), proxySlotSampleUs(89));
  // Mid-slot times (non-integer speed) use the slot preview is showing.
  assert.equal(previewMatchedSourceSampleUs(1.5 * 7 / 30), proxySlotSampleUs(10));
});

test('a sample never leaves its slot, so the clip window end is never exceeded', () => {
  for (let slot = 0; slot < 50_000; slot++) {
    const sample = proxySlotSampleUs(slot);
    assert.ok(sample >= Math.round(slot * 1e6 / 30) && sample < Math.round((slot + 1) * 1e6 / 30), `slot ${slot}`);
  }
});

test('invalid times fail rather than guessing', () => {
  assert.throws(() => proxySlotAtUs(-1));
  assert.throws(() => proxySlotAtUs(1.5));
  assert.throws(() => proxySlotSampleUs(-1));
  assert.throws(() => previewMatchedSourceSampleUs(Number.NaN));
});

test('only the 30 fps proxy cadence is remapped; other compositions sample the exact time', () => {
  assert.equal(originalMediaSampleUs(1, 30), previewMatchedSourceSampleUs(1));
  assert.equal(originalMediaSampleUs(.32, 50), 320000);
  assert.equal(originalMediaSampleUs(0, 50), 0);
});
