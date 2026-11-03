import assert from "node:assert/strict";
import test from "node:test";

import { fitSegments, matchRegion, type Frames } from "@/lib/media-analysis/reference-match";

const W = 8, H = 8;
// Each frame is a distinct flat level, with a different pattern in each take so takes never cross-match.
const frame = (take: number, index: number, half?: "top" | "bottom", other?: Uint8Array) => {
  const pixels = new Uint8Array(W * H);
  for (let i = 0; i < pixels.length; i++) {
    const top = i < (W * H) / 2;
    pixels[i] = other && ((half === "top" && !top) || (half === "bottom" && top)) ? other[i]! : (take * 97 + index * 3 + (i % 2) * take * 40) % 256;
  }
  return pixels;
};
const take = (index: number, count: number): Frames => ({ width: W, height: H, fps: 30, frames: Array.from({ length: count }, (_, i) => frame(index, i)) });

test("finds the take, frame and speed a reference uses: 1x, then 1.5x, then a cut to another take", () => {
  const jump = take(1, 60), splash = take(2, 60);
  // Reference: jump frames 10-19 at 1x, 20-29 at 1.5x (20,21,23,24,26,27,29), then splash from 5.
  const picks: Array<[number, number]> = [
    ...Array.from({ length: 10 }, (_, i) => [0, 10 + i] as [number, number]),
    ...Array.from({ length: 7 }, (_, i) => [0, 20 + Math.round(i * 1.5)] as [number, number]),
    ...Array.from({ length: 8 }, (_, i) => [1, 5 + i] as [number, number]),
  ];
  const reference: Frames = { width: W, height: H, fps: 30, frames: picks.map(([t, f]) => [jump, splash][t]!.frames[f]!) };
  const matches = matchRegion(reference, [jump, splash], { left: 0, top: 0, right: 1, bottom: 1 });
  assert.deepEqual(matches.map(m => [m.take, m.take_frame]), picks);
  assert.ok(matches.every(m => m.error === 0));
  const segments = fitSegments(matches, 12);
  assert.deepEqual(segments.map(s => s.take), [0, 0, 1]);
  // The speed change's first frame (take frame 20) lies on both lines: the boundary reads within one frame.
  assert.ok(Math.abs(segments[0]!.reference_frames[1] - 9) <= 1);
  assert.deepEqual([segments[0]!.speed, segments[2]!.speed], [1, 1]);
  assert.ok(Math.abs(segments[1]!.speed - 1.5) <= 0.1, `fast part reads ${segments[1]!.speed}x`);
  assert.deepEqual([segments[0]!.take_frames[0], segments[1]!.take_frames[1]], [10, 29]);
  assert.deepEqual([segments[2]!.reference_frames, segments[2]!.take_frames], [[17, 24], [5, 12]]);
});

test("regions read separately: the top from one take while the bottom keeps running in another", () => {
  const jump = take(1, 40), splash = take(2, 40);
  const reference: Frames = { width: W, height: H, fps: 30, frames: Array.from({ length: 10 }, (_, i) => frame(1, 20 + i, "top", splash.frames[3 + i])) };
  const top = fitSegments(matchRegion(reference, [jump, splash], { left: 0, top: 0, right: 1, bottom: 0.5 }), 12);
  const bottom = fitSegments(matchRegion(reference, [jump, splash], { left: 0, top: 0.5, right: 1, bottom: 1 }), 12);
  assert.deepEqual(top.map(s => [s.take, s.take_frames]), [[0, [20, 29]]]);
  assert.deepEqual(bottom.map(s => [s.take, s.take_frames]), [[1, [3, 12]]]);
});

test("a frame no take explains is left unmatched, and a still plate reads as static", () => {
  const plate: Frames = { width: W, height: H, fps: 30, frames: Array.from({ length: 5 }, () => frame(3, 0)) };
  const stranger = new Uint8Array(W * H).fill(255);
  const reference: Frames = { width: W, height: H, fps: 30, frames: [frame(3, 0), frame(3, 0), frame(3, 0), frame(3, 0), stranger] };
  const matches = matchRegion(reference, [plate], { left: 0, top: 0, right: 1, bottom: 1 });
  const segments = fitSegments(matches, 12);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]!.static, true);
  assert.deepEqual(segments[0]!.reference_frames, [0, 3]);
  assert.ok(matches[4]!.error > 12);
});

test("regions smaller than the analysis grid are refused", () => {
  assert.throws(() => matchRegion(take(1, 2), [take(1, 2)], { left: 0, top: 0, right: 0.05, bottom: 1 }), /at least 2%/);
});
