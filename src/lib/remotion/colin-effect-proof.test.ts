import assert from "node:assert/strict";
import test from "node:test";

import { buildCompositingLaneOrder } from "@/lib/timeline/compositing-lanes";
import { readKeyframeMap } from "@/lib/timeline/keyframes";
import { mirrorBandFromMaskInset, resolveMaskInsetAtTime } from "@/lib/timeline/media-transform";
import {
  buildColinEffectProofElements,
  COLIN_EFFECT_PROOF_LANE_ORDER,
  COLIN_EFFECT_PROOF_TIMES_SECONDS,
} from "./colin-effect-proof";

const urls = { top: "top.png", middle: "middle.png", bottom: "bottom.png" };

test("Colin proof keeps editable caption behind all three visual lanes", () => {
  const elements = buildColinEffectProofElements(urls);
  const caption = elements.find((element) => element.id === "proof-title");
  assert.equal(caption?.type, "caption_text");
  assert.equal(caption?.props?.text, "PORTLAND");
  assert.deepEqual(
    buildCompositingLaneOrder({
      visualLaneKeys: elements.filter((element) => element.type === "still").map((element) => element.lane_key),
      captionLaneKeys: [caption!.lane_key],
      persistedLaneOrderKeys: COLIN_EFFECT_PROOF_LANE_ORDER,
    }),
    ["captions_0", "visual_bottom", "visual_middle", "visual_top"],
  );
});

test("Colin proof has three distinct authored values for every animated primitive", () => {
  const panels = buildColinEffectProofElements(urls).filter((element) => element.type === "still");
  assert.equal(panels.length, 3);
  for (const panel of panels) {
    const keyframes = readKeyframeMap(panel.props);
    for (const field of ["media_scale", "media_offset_x", "media_offset_y", "mask_inset", "media_opacity", "mask_feather"]) {
      const values = keyframes[field]?.map((point) => JSON.stringify(point.v)) ?? [];
      assert.deepEqual(keyframes[field]?.map((point) => point.t), [...COLIN_EFFECT_PROOF_TIMES_SECONDS]);
      assert.equal(new Set(values).size, 3, `${panel.id} ${field} must change at every authored point`);
    }
  }
});

test("middle proof panel remains a symmetric Mirror band at each authored point", () => {
  const middle = buildColinEffectProofElements(urls).find((element) => element.id === "proof-middle")!;
  for (const time of COLIN_EFFECT_PROOF_TIMES_SECONDS) {
    const mask = resolveMaskInsetAtTime(middle.props, time);
    assert.ok(Math.abs(mask.top - mask.bottom) < 0.001);
    assert.equal(mirrorBandFromMaskInset(mask).center, 0.5);
  }
});
