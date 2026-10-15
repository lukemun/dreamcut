import assert from "node:assert/strict";
import test from "node:test";

import {
  collectKeyframeTimes,
  completeKeyframeMoment,
  countKeyframes,
  hasKeyframeAtTime,
  hasKeyframeMoments,
  removeKeyframes,
  removeKeyframesAtTime,
  resolveNumberKeyframe,
  resolveTupleKeyframe,
  upsertKeyframe,
  retimeKeyframeMoment,
  keyframeValuesAtTime,
  updateKeyframeAtTime,
} from "./keyframes";

test("keyframe banner visibility is data-driven and ignores out-of-range points", () => {
  assert.equal(hasKeyframeMoments(null, 5), false);
  assert.equal(hasKeyframeMoments({ keyframes: {} }, 5), false);
  assert.equal(hasKeyframeMoments({
    keyframes: { media_scale: [{ t: 6, v: 1.2 }] },
  }, 5), false);
  assert.equal(hasKeyframeMoments({
    keyframes: { arbitrary_supported_field: [{ t: 2, v: 0.5 }] },
  }, 5), true);
});

test("collectKeyframeTimes deduplicates visual markers and hides points beyond the clip", () => {
  const props = {
    keyframes: {
      media_scale: [{ t: 0, v: 1 }, { t: 2, v: 2 }, { t: 8, v: 3 }],
      media_offset_x: [{ t: 2, v: 0.5 }],
      unrelated: [{ t: 1, v: 10 }],
    },
  };

  assert.deepEqual(collectKeyframeTimes(props, ["media_scale", "media_offset_x"], 5), [0, 2]);
});

test("retiming a keyframe moment moves every associated field and replaces same-field collisions", () => {
  const source = {
    keyframes: {
      media_scale: [{ t: 1, v: 1.2 }, { t: 2, v: 1.8 }],
      media_offset_x: [{ t: 1, v: 0.25 }],
      media_opacity: [{ t: 2, v: 0.5 }],
    },
  };
  const moved = retimeKeyframeMoment(source, 1, 1.99, 5);
  assert.equal(moved.timeSeconds, 2);
  assert.deepEqual(moved.props.keyframes, {
    media_scale: [{ t: 2, v: 1.2 }],
    media_offset_x: [{ t: 2, v: 0.25 }],
    media_opacity: [{ t: 2, v: 0.5 }],
  });
  assert.deepEqual(keyframeValuesAtTime(moved.props, 2), [
    { field: "media_offset_x", value: 0.25, ease: "linear" },
    { field: "media_opacity", value: 0.5, ease: "linear" },
    { field: "media_scale", value: 1.2, ease: "linear" },
  ]);
});

test("upsertKeyframe stores sorted local-time points", () => {
  let props = upsertKeyframe({}, "media_scale", 2, 1.5);
  props = upsertKeyframe(props, "media_scale", 0, 1);

  assert.deepEqual(props.keyframes, {
    media_scale: [
      { t: 0, v: 1, ease: "linear" },
      { t: 2, v: 1.5, ease: "linear" },
    ],
  });
});

test("a later keyframe inherits controls already animated at an earlier moment", () => {
  const source = {
    keyframes: {
      media_offset_x: [{ t: 0, v: 0.2, ease: "hold" as const }],
      media_offset_y: [{ t: 0, v: -0.4, ease: "linear" as const }],
    },
  };

  const completed = upsertKeyframe(source, "media_scale", 2, 0.75);
  assert.deepEqual(keyframeValuesAtTime(completed, 2), [
    { field: "media_offset_x", value: 0.2, ease: "hold" },
    { field: "media_offset_y", value: -0.4, ease: "linear" },
    { field: "media_scale", value: 0.75, ease: "linear" },
  ]);
});

test("retiming a sparse later marker completes and moves the inherited control bundle", () => {
  const source = {
    keyframes: {
      media_offset_x: [{ t: 0, v: 0 }, { t: 3.4, v: 0 }],
      media_offset_y: [{ t: 0, v: 0 }, { t: 3.4, v: 0 }],
      media_scale: [{ t: 0, v: 0.68 }, { t: 3.4, v: 0.68 }, { t: 6.767, v: 0.49 }],
    },
  };

  const moved = retimeKeyframeMoment(source, 6.767, 6, 7.9);
  assert.deepEqual(keyframeValuesAtTime(moved.props, 6), [
    { field: "media_offset_x", value: 0, ease: "linear" },
    { field: "media_offset_y", value: 0, ease: "linear" },
    { field: "media_scale", value: 0.49, ease: "linear" },
  ]);
});

test("completing a visual keyframe never clones source-bound speed controls", () => {
  const source = {
    keyframes: {
      playback_rate: [{ t: 1, v: 1.5, ease: "hold" as const, source_t: 12 }],
      media_scale: [{ t: 2, v: 0.8 }],
    },
  };

  const completed = completeKeyframeMoment(source, 2);
  assert.equal(keyframeValuesAtTime(completed, 2).some(({ field }) => field === "playback_rate"), false);
});

test("editing an existing keyframe preserves source authority and updates interpolation", () => {
  const props = {
    keyframes: {
      playback_rate: [{ t: 1, source_t: 12.5, v: 1.25, ease: "hold" as const }],
      media_scale: [{ t: 1, v: 1.1, ease: "linear" as const }],
    },
  };

  const speed = updateKeyframeAtTime(props, "playback_rate", 1, { value: 2 });
  assert.deepEqual((speed.keyframes as Record<string, unknown>).playback_rate, [
    { t: 1, source_t: 12.5, v: 2, ease: "hold" },
  ]);

  const eased = updateKeyframeAtTime(props, "media_scale", 1, { ease: "easeInOut" });
  assert.deepEqual((eased.keyframes as Record<string, unknown>).media_scale, [
    { t: 1, v: 1.1, ease: "easeInOut" },
  ]);
});

test("resolveNumberKeyframe interpolates between points", () => {
  const props = {
    keyframes: {
      media_scale: [
        { t: 0, v: 1 },
        { t: 2, v: 2 },
      ],
    },
  };

  assert.equal(resolveNumberKeyframe(props, "media_scale", 1, 1), 1.5);
  assert.equal(resolveNumberKeyframe(props, "media_scale", 5, 1), 2);
});

test("an exact keyframe wins over the previous hold segment", () => {
  const props = {
    keyframes: {
      media_offset_y: [
        { t: 0, v: 0, ease: "hold" },
        { t: 5.367, v: 0.67, ease: "linear" },
      ],
    },
  };

  assert.equal(resolveNumberKeyframe(props, "media_offset_y", 5.3666666667, 0), 0.67);
});

test("resolveTupleKeyframe interpolates tuple values", () => {
  const props = {
    keyframes: {
      mask_inset: [
        { t: 0, v: [0, 0, 0, 0] },
        { t: 2, v: [0.2, 0.4, 0.6, 0.8] },
      ],
    },
  };

  assert.deepEqual(resolveTupleKeyframe(props, "mask_inset", 1, [0, 0, 0, 0], { length: 4 }), [
    0.1,
    0.2,
    0.3,
    0.4,
  ]);
});

test("removeKeyframes deletes selected fields", () => {
  const props = {
    keyframes: {
      media_scale: [{ t: 0, v: 1 }],
      mask_inset: [{ t: 0, v: [0, 0, 0, 0] }],
    },
  };

  assert.equal(countKeyframes(props, ["media_scale", "mask_inset"]), 2);
  assert.deepEqual(removeKeyframes(props, ["media_scale"]), {
    keyframes: {
      mask_inset: [{ t: 0, v: [0, 0, 0, 0] }],
    },
  });
});

test("current-time key state can be detected and cleared", () => {
  const props = {
    keyframes: {
      media_scale: [{ t: 0, v: 1 }, { t: 2, v: 2 }],
      media_offset_x: [{ t: 2, v: 0.5 }],
    },
  };
  assert.equal(hasKeyframeAtTime(props, ["media_scale", "media_offset_x"], 2), true);
  assert.deepEqual(removeKeyframesAtTime(props, ["media_scale", "media_offset_x"], 2), {
    keyframes: { media_scale: [{ t: 0, v: 1 }] },
  });
});
