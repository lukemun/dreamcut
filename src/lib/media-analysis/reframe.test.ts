import assert from "node:assert/strict";
import test from "node:test";

import { compileReframe, coverScale, offsetsForFocalPoint, reframePropsPatch } from "@/lib/media-analysis/reframe";
import { projectSourceToComposition, projectNormalizedSourceBox } from "@/lib/timeline/source-projection";
import { MAX_MEDIA_SCALE } from "@/lib/timeline/media-transform";

const SOURCE = { width: 1920, height: 1080 };
const PORTRAIT = { width: 1080, height: 1920 };
const CLIP = { timeline_start: 0, duration: 8, trim_start: 0, playback_rate: 1 };

/** Where a source-normalized point lands in the composition, via the REAL renderer math. */
function projectPoint(fx: number, fy: number, mediaScale: number, offsetX: number, offsetY: number) {
  const projection = projectSourceToComposition({
    source_width: SOURCE.width, source_height: SOURCE.height,
    composition_width: PORTRAIT.width, composition_height: PORTRAIT.height,
    fit: "contain", media_scale: mediaScale, media_offset_x: offsetX, media_offset_y: offsetY,
    timeline_time_seconds: 0, timeline_start_seconds: 0,
  });
  const box = projectNormalizedSourceBox({ x: fx, y: fy, width: 0, height: 0 }, projection);
  return { x: box.x, y: box.y };
}

test("cover scale for 16:9 → 9:16 is the real ~3.16 ratio, clamped to the editor max", () => {
  assert.ok(Math.abs(coverScale(1920, 1080, 1080, 1920) - (16 / 9) * (16 / 9)) < 1e-6);
  const result = compileReframe([], CLIP, SOURCE, PORTRAIT);
  assert.equal(result.media_scale, MAX_MEDIA_SCALE);
  assert.equal(result.scaleClamped, true);
});

test("compiled offsets center the focal point in the composition (renderer round-trip)", () => {
  // A subject slightly left of center — reachable without hitting the edge clamp.
  const fx = 0.42, fy = 0.5;
  const offsets = offsetsForFocalPoint(fx, fy, SOURCE.width, SOURCE.height, PORTRAIT.width, PORTRAIT.height, MAX_MEDIA_SCALE);
  const landed = projectPoint(fx, fy, MAX_MEDIA_SCALE, offsets.offsetX, offsets.offsetY);
  assert.ok(Math.abs(landed.x - PORTRAIT.width / 2) < 1, `landed at x=${landed.x}, want ${PORTRAIT.width / 2}`);
  assert.ok(Math.abs(landed.y - PORTRAIT.height / 2) < 1, `landed at y=${landed.y}`);
});

test("the camera stops at the source edge instead of panning into letterbox", () => {
  // Subject far left: centering would need an offset beyond the overflow.
  const offsets = offsetsForFocalPoint(0.05, 0.5, SOURCE.width, SOURCE.height, PORTRAIT.width, PORTRAIT.height, MAX_MEDIA_SCALE);
  const projection = projectSourceToComposition({
    source_width: SOURCE.width, source_height: SOURCE.height,
    composition_width: PORTRAIT.width, composition_height: PORTRAIT.height,
    fit: "contain", media_scale: MAX_MEDIA_SCALE, media_offset_x: offsets.offsetX, media_offset_y: offsets.offsetY,
    timeline_time_seconds: 0, timeline_start_seconds: 0,
  });
  // Coverage holds: the transformed rect still spans the whole composition width.
  assert.ok(projection.transformed_rect.x <= 0.01);
  assert.ok(projection.transformed_rect.x + projection.transformed_rect.width >= PORTRAIT.width - 0.01);
});

test("a moving subject emits a smoothed, decimated keyframe path", () => {
  // Subject walks left → right across 8 seconds, sampled every 0.25s.
  const samples = Array.from({ length: 33 }, (_, index) => ({
    time_seconds: index * 0.25,
    box: { x: 0.15 + (0.6 * index) / 32, y: 0.4, width: 0.1, height: 0.3 },
  }));
  const result = compileReframe(samples, CLIP, SOURCE, PORTRAIT);
  assert.equal(result.usedSamples, 33);
  assert.ok(result.offsetX.length > 2, "real motion produces a path");
  assert.ok(result.offsetX.length < 20, `decimation keeps it sparse, got ${result.offsetX.length}`);
  // Monotonic subject → monotonic camera (EMA must not overshoot).
  const values = result.offsetX.map((point) => point.v as number);
  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index]! <= values[index - 1]! + 1e-9, "offset moves one way for a one-way walk");
  }
  // Last keyframe closes at the clip's end pose.
  assert.equal(result.offsetX[result.offsetX.length - 1]!.t, 8);
});

test("a static subject collapses to plain offsets with no keyframes", () => {
  const samples = Array.from({ length: 16 }, (_, index) => ({
    time_seconds: index * 0.5,
    box: { x: 0.38, y: 0.42, width: 0.12, height: 0.3 },
  }));
  const result = compileReframe(samples, CLIP, SOURCE, PORTRAIT);
  assert.equal(result.offsetX.length, 1);
  const patch = reframePropsPatch(result);
  assert.equal("keyframes" in patch, false);
  assert.equal(typeof patch.media_offset_x, "number");
});

test("samples respect trim and playback rate when localizing", () => {
  const clip = { timeline_start: 0, duration: 2, trim_start: 4, playback_rate: 2 };
  // Source seconds 4..8 map to local 0..2; outside-window samples are dropped.
  const samples = [
    { time_seconds: 2, box: { x: 0.1, y: 0.5, width: 0.1, height: 0.2 } },  // before trim → dropped
    { time_seconds: 4, box: { x: 0.4, y: 0.5, width: 0.1, height: 0.2 } },  // local t=0
    { time_seconds: 8, box: { x: 0.6, y: 0.5, width: 0.1, height: 0.2 } },  // local t=2
    { time_seconds: 9, box: { x: 0.9, y: 0.5, width: 0.1, height: 0.2 } },  // past window → dropped
  ];
  const result = compileReframe(samples, clip, SOURCE, PORTRAIT);
  assert.equal(result.usedSamples, 2);
  assert.equal(result.offsetX[result.offsetX.length - 1]!.t, 2);
});
