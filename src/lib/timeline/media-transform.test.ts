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
  assert.deepEqual(readMediaEffectProps(null), { opacity: 1, maskFeather: 0 });
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
