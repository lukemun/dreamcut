import assert from "node:assert/strict";
import test from "node:test";

import { entranceCurveScale, resolveEntranceCurve } from "./animation-presets";
import { animationStyle, elementAnimationFrame } from "./element-animation";
import { resolveCaptionProps } from "./captions";

test("without a curve each scale entrance keeps its own start and easing", () => {
  for (const progress of [0, 0.3, 0.7, 1]) {
    assert.equal(animationStyle("pop", progress, "in", 1080, 1920).scale, 0.92 + progress * 0.08);
  }
  assert.deepEqual(resolveEntranceCurve({}, "spring_pop"), { startScale: 0.72, overshoot: 0 });
  assert.equal(resolveEntranceCurve({}, "fade"), null);
});

test("the start size dial moves where a pop begins and it still lands at full size", () => {
  const curve = { startScale: 0.4, overshoot: 0 };
  assert.equal(animationStyle("pop", 0, "in", 1080, 1920, 0.45, curve).scale, 0.4);
  assert.equal(animationStyle("pop", 1, "in", 1080, 1920, 0.45, curve).scale, 1);
});

test("overshoot punches past full size at 60% of the entrance, then settles", () => {
  const curve = { startScale: 0.6, overshoot: 0.2 };
  assert.equal(entranceCurveScale(curve, 0, 0), 0.6);
  assert.ok(Math.abs(entranceCurveScale(curve, 0.6, 0.6) - 1.2) < 1e-9);
  assert.equal(entranceCurveScale(curve, 1, 1), 1);
  const samples = Array.from({ length: 21 }, (_, i) => entranceCurveScale(curve, i / 20, i / 20));
  assert.ok(Math.max(...samples) <= 1.2 + 1e-9);
});

test("captions and other elements read the same curve from their props", () => {
  const caption = resolveCaptionProps({ text: "Hi", animationIn: "spring_pop" });
  assert.equal(caption.entranceStartScale, 0.72);
  assert.equal(resolveCaptionProps({ text: "Hi", animationIn: "pop", entranceStartScale: 0.6, entranceOvershoot: 0.2 }).entranceOvershoot, 0.2);
  const frame = elementAnimationFrame({ animationIn: "pop", animationInDuration: 1, entranceStartScale: 0.5 }, 0, 120, 1080, 1920, { fps: 30 });
  assert.equal(frame.scale, 0.5);
});
