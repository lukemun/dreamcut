import assert from "node:assert/strict";
import test from "node:test";

test("line feather softens only the dividing edge, not the far canvas edge", () => {
  const lower = maskInsetStyle({ top: .5, right: 0, bottom: 0, left: 0 }, .1);
  assert.equal(lower.maskImage, "linear-gradient(to bottom, transparent 0%, transparent 50%, #000 60%, #000 100%)");
  const upper = maskInsetStyle({ top: 0, right: 0, bottom: .5, left: 0 }, .1);
  assert.equal(upper.maskImage, "linear-gradient(to bottom, #000 0%, #000 40%, transparent 50%, transparent 100%)");
});
test("rotated line masks use an aspect-correct gradient without cropping the video", () => {
  const line = { top: .5, right: 0, bottom: 0, left: 0 };
  const style = maskInsetStyle(line, 0, 90, { width: 360, height: 640 });
  assert.equal(style.maskImage, "linear-gradient(270deg, transparent 50%, #000 50%)");
  assert.equal(style.clipPath, undefined);
  const feather = maskInsetStyle(line, .1, 45, { width: 360, height: 640 });
  assert.match(feather.maskImage!, /^linear-gradient\(225deg, transparent 50%, #000 59\.05/);
  const rectangle = { top: .2, right: .2, bottom: .2, left: .2 };
  assert.deepEqual(maskInsetStyle(rectangle, .1, 90), maskInsetStyle(rectangle, .1));
});

import {
  clearMediaKeyframes,
  commitMaskInsetAtTime,
  commitMediaEffectFieldAtTime,
  commitMediaTransformFieldAtTime,
  maskInsetClipPath,
  maskInsetFromMirrorBand,
  maskInsetStyle,
  mirrorBandFromMaskInset,
  readMediaEffectProps,
  readMediaTransformProps,
  readMaskInsetProps,
  resolveMediaEffectAtTime,
  resolveMaskInsetAtTime,
  resolveMediaTransformAtTime,
  resolveMediaTransformLayout,
  upsertMaskInsetKeyframe,
  upsertMediaTransformKeyframes,
  writeMediaTransformProps,
  writeMaskInsetProps,
} from "./media-transform";

test("readMediaTransformProps returns safe defaults", () => {
  assert.deepEqual(readMediaTransformProps(null), {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
});

test("readMediaTransformProps clamps scale and offsets", () => {
  assert.deepEqual(
    readMediaTransformProps({
      media_scale: 10,
      media_offset_x: -5,
      media_offset_y: 2,
    }),
    {
      scale: 3,
      offsetX: -2,
      offsetY: 2,
    },
  );
});

test("writeMediaTransformProps preserves other props", () => {
  assert.deepEqual(
    writeMediaTransformProps({ foo: "bar" }, { scale: 1.25, offsetX: 0.5, offsetY: -0.25 }),
    {
      foo: "bar",
      media_scale: 1.25,
      media_offset_x: 0.5,
      media_offset_y: -0.25,
    },
  );
});

test("resolveMediaTransformLayout maps offsets to canvas-centered translation", () => {
  assert.deepEqual(
    resolveMediaTransformLayout(1080, 1920, {
      scale: 1.5,
      offsetX: 2,
      offsetY: -1,
    }),
    {
      translateX: 1080,
      translateY: -960,
      scale: 1.5,
    },
  );
});

test("readMaskInsetProps clamps percentage fractions", () => {
  assert.deepEqual(
    readMaskInsetProps({ mask_inset: [0.1, 2, -1, 0.25] }),
    {
      top: 0.1,
      right: 0.95,
      bottom: 0,
      left: 0.25,
    },
  );
});

test("writeMaskInsetProps preserves props and writes tuple", () => {
  assert.deepEqual(
    writeMaskInsetProps({ foo: "bar" }, { top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 }),
    {
      foo: "bar",
      mask_inset: [0.1, 0.2, 0.3, 0.4],
    },
  );
});

test("keyframed media transform resolves at local time", () => {
  let props = upsertMediaTransformKeyframes({}, 0, { scale: 1, offsetX: 0, offsetY: 0 });
  props = upsertMediaTransformKeyframes(props, 2, { scale: 2, offsetX: 0.5, offsetY: -0.5 });

  assert.deepEqual(resolveMediaTransformAtTime(props, 1), {
    scale: 1.5,
    offsetX: 0.25,
    offsetY: -0.25,
  });
});

test("animated transforms preserve sub-cent precision instead of stair-stepping", () => {
  const props = {
    keyframes: {
      media_scale: [{ t: 0, v: 1.5 }, { t: 1, v: 1.6 }],
      media_offset_x: [{ t: 0, v: 0.5 }, { t: 1, v: 0.6 }],
      media_offset_y: [{ t: 0, v: 0.5 }, { t: 1, v: 0.6 }],
    },
  };
  assert.deepEqual(resolveMediaTransformAtTime(props, 1 / 30), {
    scale: 1.5033,
    offsetX: 0.5033,
    offsetY: 0.5033,
  });
});

test("keyframed mask inset resolves to clip-path", () => {
  let props = writeMaskInsetProps({}, { top: 0, right: 0, bottom: 0, left: 0 });
  props = upsertMaskInsetKeyframe(props, 2, { top: 0.2, right: 0.1, bottom: 0.2, left: 0.1 });

  const mask = resolveMaskInsetAtTime(props, 2);
  assert.deepEqual(mask, { top: 0.2, right: 0.1, bottom: 0.2, left: 0.1 });
  assert.equal(maskInsetClipPath(mask), "inset(20% 10% 20% 10%)");
});

test("animated transform commits changed values at the playhead", () => {
  let props = upsertMediaTransformKeyframes({}, 0, { scale: 1, offsetX: 0, offsetY: 0 });
  props = commitMediaTransformFieldAtTime(props, 2, "offsetY", 0.6);

  assert.equal(resolveMediaTransformAtTime(props, 1).offsetY, 0.3);
  assert.equal(resolveMediaTransformAtTime(props, 2).offsetY, 0.6);
});

test("non-animated transform commit updates only the static fallback", () => {
  const props = commitMediaTransformFieldAtTime({}, 2, "scale", 1.5);
  assert.equal(readMediaTransformProps(props).scale, 1.5);
  assert.equal(props.keyframes, undefined);
});

test("clearing video keyframes preserves the clip's static framing values", () => {
  const props = clearMediaKeyframes({
    media_scale: 1.4,
    media_offset_x: 0.2,
    media_offset_y: -0.1,
    mask_inset: [0.2, 0, 0.4, 0],
    keyframes: {
      media_scale: [{ t: 0, v: 1 }],
      media_offset_y: [{ t: 0, v: 0 }, { t: 2, v: 0.5 }],
      mask_inset: [{ t: 0, v: [0.4, 0, 0.4, 0] }],
      grade_contrast: [{ t: 0, v: 0.2 }],
    },
  });

  assert.equal(props.keyframes, undefined);
  assert.deepEqual(readMediaTransformProps(props), { scale: 1.4, offsetX: 0.2, offsetY: -0.1 });
  assert.deepEqual(readMaskInsetProps(props), { top: 0.2, right: 0, bottom: 0.4, left: 0 });
});

test("animated mask commit creates a distinct second point", () => {
  let props = upsertMaskInsetKeyframe({}, 0, { top: 0.4, right: 0, bottom: 0.4, left: 0 });
  props = commitMaskInsetAtTime(props, 2, { top: 0.2, right: 0, bottom: 0.2, left: 0 });
  assert.deepEqual(resolveMaskInsetAtTime(props, 1), { top: 0.3, right: 0, bottom: 0.3, left: 0 });
});

test("opacity and feather use identity defaults and interpolate", () => {
  assert.deepEqual(readMediaEffectProps(null), { opacity: 1, maskFeather: 0, maskCornerRadius: 0 });
  let props = commitMediaEffectFieldAtTime({}, 0, "opacity", 0.25);
  assert.equal(readMediaEffectProps(props).opacity, 0.25);
  props = commitMediaEffectFieldAtTime({
    ...props,
    keyframes: { media_opacity: [{ t: 0, v: 0.25 }] },
  }, 2, "opacity", 0.75);
  assert.equal(resolveMediaEffectAtTime(props, 1).opacity, 0.5);
});

test("feathered mask emits a vertical alpha gradient and preserves horizontal crop", () => {
  const style = maskInsetStyle({ top: 0.2, right: 0.1, bottom: 0.2, left: 0.1 }, 0.1);
  assert.equal(style.clipPath, "inset(0 10% 0 10%)");
  assert.match(style.maskImage ?? "", /transparent 20%/);
  assert.match(style.maskImage ?? "", /#000 30/);
  assert.equal(style.WebkitMaskImage, style.maskImage);
});

test("Mirror band keeps left and right edges while linking top and bottom", () => {
  const current = { top: 0.2, right: 0.1, bottom: 0.4, left: 0.15 };
  assert.deepEqual(mirrorBandFromMaskInset(current), { center: 0.4, height: 0.4 });
  assert.deepEqual(
    maskInsetFromMirrorBand(current, { center: 0.5, height: 0.2 }),
    { top: 0.4, right: 0.1, bottom: 0.4, left: 0.15 },
  );
});

test("crop roundness resolves keyframes at a time, clamps to 0–0.5 and keeps older clips' props", () => {
  assert.equal(readMediaEffectProps({ mask_corner_radius: 0.9 }).maskCornerRadius, 0.5);
  assert.equal(readMediaEffectProps({ mask_corner_radius: -1 }).maskCornerRadius, 0);
  assert.equal(readMediaEffectProps({ mask_corner_radius: "round" }).maskCornerRadius, 0);
  const props = { mask_corner_radius: 0.1, keyframes: { mask_corner_radius: [{ t: 0, v: 0 }, { t: 2, v: 0.5 }] } };
  assert.equal(resolveMediaEffectAtTime(props, 1).maskCornerRadius, 0.25);
  assert.equal(resolveMediaEffectAtTime(props, 5).maskCornerRadius, 0.5);
  assert.equal(resolveMediaEffectAtTime({ mask_corner_radius: 0.2 }, 3).maskCornerRadius, 0.2);
  // Writing opacity on a clip without roundness adds no roundness prop.
  assert.equal("mask_corner_radius" in commitMediaEffectFieldAtTime({}, 0, "opacity", 0.5), false);
  assert.equal(commitMediaEffectFieldAtTime({}, 0, "maskCornerRadius", 0.7).mask_corner_radius, 0.5);
  const keyed = commitMediaEffectFieldAtTime(props, 1, "maskCornerRadius", 0.4);
  assert.equal(keyed.mask_corner_radius, 0.1);
  assert.equal(resolveMediaEffectAtTime(keyed, 1).maskCornerRadius, 0.4);
});

test("Standard crop roundness is an inset clip with a pixel radius on the crop's shorter side", () => {
  const canvas = { width: 1920, height: 1080 };
  const square = { top: 680 / 1080, right: 1520 / 1920, bottom: 40 / 1080, left: 40 / 1920 };
  const style = maskInsetStyle(square, 0, 0, canvas, 0.5);
  assert.match(style.clipPath ?? "", / round 180px\)$/);
  assert.equal(style.maskImage, undefined);
  assert.deepEqual(maskInsetStyle(square, 0, 0, canvas, 0), maskInsetStyle(square, 0, 0, canvas));
  // A full frame can be rounded too.
  assert.equal(maskInsetStyle({ top: 0, right: 0, bottom: 0, left: 0 }, 0, 0, { width: 200, height: 100 }, 0.1).clipPath, "inset(0% 0% 0% 0% round 10px)");
  // Feathered roundness keeps the rounded clip and adds a soft rounded alpha mask.
  const soft = maskInsetStyle(square, 0.05, 0, canvas, 0.5);
  assert.match(soft.clipPath ?? "", /round 180px/);
  assert.match(soft.maskImage ?? "", /^url\("data:image\/svg\+xml,/);
  // A rotated line is not a rectangle; roundness leaves it unchanged.
  const line = { top: 0.5, right: 0, bottom: 0, left: 0 };
  assert.deepEqual(maskInsetStyle(line, 0.1, 30, canvas, 0.5), maskInsetStyle(line, 0.1, 30, canvas));
});

test("Standard and GPU crop roundness agree on the rounded rectangle", async () => {
  const { gpuRoundedMask } = await import("../gpu-preview/feather-mask");
  const canvas = { width: 1280, height: 720 };
  for (const [mask, radius] of [[{ top: 0.5, right: 0.6, bottom: 0.1, left: 0.05 }, 0.5], [{ top: 0.1, right: 0.2, bottom: 0.3, left: 0.1 }, 0.2]] as const) {
    const plan = gpuRoundedMask(mask, 0, radius, canvas.width, canvas.height)!;
    const css = maskInsetStyle(mask, 0, 0, canvas, radius).clipPath!;
    const px = Number(/round ([\d.]+)px/.exec(css)![1]);
    assert.ok(Math.abs(px - plan[4]) < 1e-3, `${css} vs ${plan[4]}`);
    assert.ok(Math.abs(plan[0] - plan[2] - mask.left * canvas.width) < 1e-9);
    assert.ok(Math.abs(plan[1] - plan[3] - mask.top * canvas.height) < 1e-9);
  }
});
