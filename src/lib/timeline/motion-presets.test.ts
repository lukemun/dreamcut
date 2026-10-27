import assert from "node:assert/strict";
import test from "node:test";

import { readKeyframeMap } from "./keyframes";
import { applyMediaMotionPreset, identifyMediaMotionPreset } from "./motion-presets";

test("every motion preset closes its loop and stays within the editor offset bounds", () => {
  for (const preset of ["float", "bounce", "orbit"] as const) {
    const props = applyMediaMotionPreset({ media_offset_x: 0.1, media_offset_y: -0.05 }, preset, 7);
    const keyframes = readKeyframeMap(props);
    for (const field of ["media_offset_x", "media_offset_y"] as const) {
      const points = keyframes[field]!;
      assert.equal(points[0]!.t, 0);
      assert.equal(points.at(-1)!.t, 7);
      assert.equal(points[0]!.v, points.at(-1)!.v);
      assert.ok(points.every((entry) => typeof entry.v === "number" && entry.v >= -2 && entry.v <= 2));
    }
  }
});

test("applying motion preserves unrelated keyframes", () => {
  const props = applyMediaMotionPreset({
    keyframes: {
      media_scale: [{ t: 0, v: 1 }, { t: 2, v: 1.2 }],
      media_opacity: [{ t: 0, v: 0.5 }],
    },
  }, "bounce", 4);
  const keyframes = readKeyframeMap(props);
  assert.deepEqual(keyframes.media_scale, [{ t: 0, v: 1 }, { t: 2, v: 1.2 }]);
  assert.deepEqual(keyframes.media_opacity, [{ t: 0, v: 0.5 }]);
});

test("none clears only position motion", () => {
  const animated = applyMediaMotionPreset({ keyframes: { media_scale: [{ t: 0, v: 1.25 }] } }, "orbit", 5);
  const cleared = applyMediaMotionPreset(animated, "none", 5);
  assert.deepEqual(readKeyframeMap(cleared), { media_scale: [{ t: 0, v: 1.25 }] });
});

test("identifies generated presets and leaves hand-authored movement custom", () => {
  const base = { media_offset_x: 0.1, media_offset_y: 0.2 };
  for (const preset of ["float", "bounce", "orbit"] as const) {
    assert.equal(identifyMediaMotionPreset(applyMediaMotionPreset(base, preset, 7), 7), preset);
  }
  assert.equal(identifyMediaMotionPreset(base, 7), "none");
  assert.equal(identifyMediaMotionPreset({
    ...base,
    keyframes: { media_offset_x: [{ t: 0, v: 0 }, { t: 1, v: 0.4 }] },
  }, 7), "custom");
});

test("spiral makes three inward turns and shrinks to the center", () => {
  const base = { media_offset_x: -0.6, media_offset_y: -0.4, media_scale: 0.3 };
  const animated = applyMediaMotionPreset(base, "spiral", 2.4);
  const k = readKeyframeMap(animated);
  assert.equal(identifyMediaMotionPreset(animated, 2.4), "spiral");
  assert.equal(k.media_offset_x![0]!.v, -0.6);
  assert.equal(k.media_offset_y![0]!.v, -0.4);
  assert.equal(Math.abs(Number(k.media_offset_x!.at(-1)!.v)), 0);
  assert.equal(Math.abs(Number(k.media_offset_y!.at(-1)!.v)), 0);
  assert.equal(k.media_scale!.at(-1)!.v, 0.01);
  for (let i = 1; i < k.media_scale!.length; i++) assert.ok(Number(k.media_scale![i]!.v) <= Number(k.media_scale![i-1]!.v));
  const cleared = readKeyframeMap(applyMediaMotionPreset(animated, "none", 2.4));
  assert.equal(cleared.media_scale, undefined);
});
