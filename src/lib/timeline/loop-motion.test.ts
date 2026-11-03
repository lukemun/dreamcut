import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LOOP_MOTION, NO_LOOP_MOTION, elementLoopMotionFrame, loopMotionFrame, resolveLoopMotion, wordLoopTransform } from "./loop-motion";
import { elementAnimationFrame } from "./element-animation";

const loop = (patch: Partial<typeof DEFAULT_LOOP_MOTION>) => ({ ...DEFAULT_LOOP_MOTION, ...patch });

test("off by default; unknown values fall back", () => {
  assert.deepEqual(resolveLoopMotion({}), DEFAULT_LOOP_MOTION);
  assert.equal(resolveLoopMotion({ loopMotion: "spin", loopMotionAmount: 4, loopMotionSeconds: 0 }).loopMotion, "none");
  assert.equal(resolveLoopMotion({ loopMotionAmount: 4 }).loopMotionAmount, 1);
  assert.equal(resolveLoopMotion({ loopMotionSeconds: 0 }).loopMotionSeconds, 0.2);
  assert.deepEqual(loopMotionFrame(DEFAULT_LOOP_MOTION, 0.4, 1000), NO_LOOP_MOTION);
});

test("each motion repeats every cycle and scales with its strength", () => {
  for (const kind of ["sway", "float", "pulse", "shake"] as const) {
    const a = loopMotionFrame(loop({ loopMotion: kind, loopMotionSeconds: 1 }), 0.3, 1000);
    assert.deepEqual(loopMotionFrame(loop({ loopMotion: kind, loopMotionSeconds: 1 }), 1.3, 1000), a, kind);
    assert.notDeepEqual(a, NO_LOOP_MOTION, kind);
  }
  const strong = loopMotionFrame(loop({ loopMotion: "float", loopMotionAmount: 1, loopMotionSeconds: 1 }), 0.75, 1000);
  const weak = loopMotionFrame(loop({ loopMotion: "float", loopMotionAmount: 0.5, loopMotionSeconds: 1 }), 0.75, 1000);
  assert.equal(strong.translateY, 12);
  assert.equal(weak.translateY, 6);
  assert.ok(loopMotionFrame(loop({ loopMotion: "pulse", loopMotionSeconds: 1 }), 0.5, 1000).scale > 1);
});

test("media clips carry the loop in their animation pose; a per-word loop leaves the block still", () => {
  const props = { loopMotion: "float", loopMotionAmount: 1, loopMotionSeconds: 1 };
  assert.equal(elementAnimationFrame(props, 45, 300, 1080, 1920, { fps: 60 }).translateY, 1920 * 0.012);
  assert.deepEqual(elementLoopMotionFrame({ ...props, loopMotionPerWord: true }, 0.25, 1920), NO_LOOP_MOTION);
});

test("per-word loops trail the word before", () => {
  const perWord = loop({ loopMotion: "float", loopMotionPerWord: true, loopMotionSeconds: 1 });
  assert.equal(wordLoopTransform(loop({ loopMotion: "float" }), 0.2, 0), null);
  assert.notEqual(wordLoopTransform(perWord, 0.2, 0), wordLoopTransform(perWord, 0.2, 1));
  assert.match(wordLoopTransform(perWord, 0.2, 1)!, /^translate\(0em, -?[\d.]+em\) rotate\(0deg\) scale\(1\)$/);
});
