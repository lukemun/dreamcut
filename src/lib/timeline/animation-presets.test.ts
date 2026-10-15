import assert from "node:assert/strict";
import test from "node:test";

import {
  DROP_IN_EASING_BEZIER,
  resolveAnimationProps,
  presetsForElementType,
  resolveDiscretePeakVelocityOffsetSeconds,
  wordEntranceStyle,
} from "./animation-presets";

test("inspector animation values retain slow handwriting durations", () => {
  assert.equal(resolveAnimationProps({ animationIn: "handwriting", animationInDuration: 8 }).animationInDuration, 8);
  assert.equal(resolveAnimationProps({ animationIn: "fade", animationInDuration: 8 }).animationInDuration, 2);
});

test("the 300 ms drop-in peaks in the first rendered frame interval", () => {
  assert.equal(
    resolveDiscretePeakVelocityOffsetSeconds({
      durationSeconds: 0.3,
      fps: 30,
      bezier: DROP_IN_EASING_BEZIER,
    }),
    1 / 60,
  );
});

test("motion peak timing rejects invalid animation geometry", () => {
  assert.equal(resolveDiscretePeakVelocityOffsetSeconds({ durationSeconds: 0, fps: 30 }), 0);
  assert.equal(resolveDiscretePeakVelocityOffsetSeconds({ durationSeconds: 0.3, fps: 0 }), 0);
});

test("word presets are caption-only and word entrances settle exactly at progress 1", () => {
  assert.ok(presetsForElementType("caption_text").includes("word_pop"));
  assert.ok(presetsForElementType("still").includes("spring_pop"));
  assert.ok(presetsForElementType("still").includes("rotate_in"));
  assert.ok(!presetsForElementType("still").includes("word_pop"));
  assert.ok(!presetsForElementType("video_clip").includes("word_rise"));

  for (const preset of ["word_fade", "word_rise", "word_pop"] as const) {
    for (let wordIndex = 0; wordIndex < 5; wordIndex += 1) {
      const settled = wordEntranceStyle(preset, 1, wordIndex, 5);
      assert.equal(settled.opacity, 1, `${preset} w${wordIndex} settles opaque`);
      assert.ok(Math.abs(settled.translateYEm) < 1e-9);
      assert.ok(Math.abs(settled.scale - 1) < 1e-9, `${preset} settles at scale 1`);
      const start = wordEntranceStyle(preset, 0, wordIndex, 5);
      assert.ok(start.opacity < 1e-6, `${preset} w${wordIndex} starts invisible`);
    }
  }
});

test("word entrance staggers: earlier words are further along at mid-progress", () => {
  const at = (index: number) => wordEntranceStyle("word_fade", 0.5, index, 6).opacity;
  for (let index = 1; index < 6; index += 1) {
    assert.ok(at(index) <= at(index - 1) + 1e-9, `word ${index} must trail word ${index - 1}`);
  }
  assert.ok(at(0) > at(5), "the stagger is visible across the line");
});

test("word_pop overshoots briefly but stays bounded", () => {
  let peak = 1;
  for (let step = 0; step <= 100; step += 1) {
    peak = Math.max(peak, wordEntranceStyle("word_pop", step / 100, 0, 1).scale);
  }
  assert.ok(peak > 1.05, "pop reads as a pop");
  assert.ok(peak < 1.2, "pop never balloons");
});
