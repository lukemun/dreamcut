import assert from "node:assert/strict";
import test from "node:test";
import { glitchHash, glitchPlan, glitchPreset, glitchRemovalPatch, hasGlitchData, resolveGlitchAtTime } from "./glitch";
import { gpuSceneCapabilityIssues } from "../gpu-preview/scene";
import type { CompositionElement } from "../render/composition-adapters";

test("glitch is off at zero amount and absent props, so neither renderer changes a pixel", () => {
  assert.equal(resolveGlitchAtTime({}, 1), null);
  assert.equal(resolveGlitchAtTime({ glitch_amount: 0, glitch_shift: 0.4 }, 1), null);
  assert.equal(hasGlitchData({ glitch_amount: 0 }), true, "a keyed-off clip keeps its wrapper mounted");
});

test("the pattern is a pure function of seed, quantized clip time and block index", () => {
  const props = { glitch_amount: 0.8, glitch_rate: 12, glitch_seed: 4 };
  const at = (seconds: number) => glitchPlan(resolveGlitchAtTime(props, seconds)!, 1080, 1920);
  assert.deepEqual(at(10 / 30), at(10 / 30), "repeated seeks draw the same frame");
  assert.deepEqual(at(10 / 30), at(11 / 30), "frames inside one step share a pattern");
  assert.notDeepEqual(at(10 / 30), at(13 / 30), "the next step changes the pattern");
  // 5/30 s × 12 is exactly step 2 even though the float product is 1.9999…
  assert.equal(resolveGlitchAtTime(props, 5 / 30)!.step, 2);
  assert.notDeepEqual(at(1), glitchPlan(resolveGlitchAtTime({ ...props, glitch_seed: 5 }, 1)!, 1080, 1920));
  assert.equal(glitchHash(1, 2, 3), glitchHash(1, 2, 3));
  assert.ok(glitchHash(1, 2, 3) >= 0 && glitchHash(1, 2, 3) < 1);
});

test("blocks tile disjoint bands inside the frame with whole-pixel geometry", () => {
  for (const seed of [0, 1, 2, 3, 99]) {
    const plan = glitchPlan(resolveGlitchAtTime({ glitch_amount: 1, glitch_seed: seed, glitch_smear: 0.5 }, 0.5)!, 1080, 1920);
    assert.ok(plan.blocks.length > 5);
    let bottom = 0;
    for (const block of plan.blocks) {
      const r = block.rect;
      assert.ok([r.x, r.y, r.width, r.height].every(Number.isSafeInteger));
      assert.ok(r.x >= 0 && r.y >= bottom && r.width > 0 && r.height > 0 && r.x + r.width <= 1080 && r.y + r.height <= 1920);
      if (block.kind === "smear") assert.ok(block.axis === "x" ? block.line >= r.x && block.line < r.x + r.width : block.line >= r.y && block.line < r.y + r.height);
      else assert.ok(block.dx !== 0 && Math.abs(block.dx) <= 0.12 * 1080);
      bottom = r.y + r.height;
    }
    assert.equal(plan.split, 10);
  }
});

test("amount scales the share of blocks, shift and split; keyframed amount gives a burst", () => {
  const count = (amount: number) => [0, 1, 2, 3, 4, 5, 6, 7].reduce((sum, step) => sum + glitchPlan(resolveGlitchAtTime({ glitch_amount: amount }, step / 12)!, 1080, 1920).blocks.length, 0);
  assert.ok(count(0.2) < count(1));
  assert.equal(glitchPlan(resolveGlitchAtTime({ glitch_amount: 0.5, glitch_rgb_split: 20 }, 0)!, 1080, 1920).split, 10);
  const burst = { glitch_amount: 0, keyframes: { glitch_amount: [{ t: 0, v: 0, ease: "hold" }, { t: 1, v: 1, ease: "hold" }, { t: 1.1, v: 0, ease: "hold" }] } };
  assert.equal(resolveGlitchAtTime(burst, 0.9), null);
  assert.equal(resolveGlitchAtTime(burst, 1.05)!.amount, 1);
  assert.equal(resolveGlitchAtTime(burst, 1.2), null);
});

test("add and remove are single patches; remove clears values and animation", () => {
  const props = { glitch_amount: 0.5, keyframes: { glitch_amount: [{ t: 0, v: 0 }, { t: 1, v: 1 }], media_scale: [{ t: 0, v: 1 }, { t: 1, v: 2 }] } };
  const removed = JSON.parse(JSON.stringify({ ...props, ...glitchRemovalPatch(props) }));
  assert.equal(hasGlitchData(removed), false);
  assert.ok(removed.keyframes.media_scale);
  assert.equal(resolveGlitchAtTime({ ...glitchPreset({}) }, 0)!.amount, 0.6);
});

test("CanvasKit admits glitch on stills and video, including keyframes; WebGPU does not offer it", () => {
  const still = (props: Record<string, unknown>) => ({ id: "s", type: "still", source_url: "/fixture.png", timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0, volume: 0, playback_rate: 1, trim_start: 0, trim_end: 0, fade_in: 0, fade_out: 0, props: { source_width: 160, source_height: 160, ...props } }) as unknown as CompositionElement;
  const props = { glitch_amount: 0.4, glitch_block_size: 60, glitch_shift: 0.2, glitch_rgb_split: 12, glitch_smear: 0.5, glitch_rate: 8, glitch_seed: 3,
    keyframes: { glitch_amount: [{ t: 0, v: 0 }, { t: 1, v: 1 }], glitch_shift: [{ t: 0, v: 0 }, { t: 1, v: 0.5 }], glitch_rgb_split: [{ t: 0, v: 0 }, { t: 1, v: 60 }], glitch_smear: [{ t: 0, v: 0 }, { t: 1, v: 1 }] } };
  assert.deepEqual(gpuSceneCapabilityIssues([still(props)], "fixture", "canvaskit"), []);
  assert.ok(gpuSceneCapabilityIssues([still(props)], "fixture", "webgpu").length > 0);
  assert.ok(gpuSceneCapabilityIssues([still({ glitch_shift: 0.9 })], "fixture", "canvaskit").some(issue => issue.capability === "property:glitch_shift"));
  assert.ok(gpuSceneCapabilityIssues([still({ keyframes: { glitch_amount: [{ t: 0, v: 0 }, { t: 1, v: 2 }] } })], "fixture", "canvaskit").some(issue => issue.capability === "animation:glitch_amount"));
});
