import assert from "node:assert/strict";
import test from "node:test";

import type { CompositionElement } from "@/lib/render/composition-adapters";
import { applyCutoutReviewMode, cutoutReviewVideoStyle } from "./cutout-review";

function element(id: string, hasAlpha = false): CompositionElement {
  return {
    id,
    type: "video_clip",
    source_url: `/${id}.webm`,
    props: hasAlpha ? { has_alpha: true } : {},
    timeline_start: 0,
    duration: 1,
    lane_key: `visual_${id}`,
    lane_index: 0,
    volume: 0,
    playback_rate: 1,
    trim_start: 0,
    trim_end: null,
    fade_in: 0,
    fade_out: 0,
  };
}

test("cutout review can compare the composite, base, isolated cutout, and matte", () => {
  const base = element("base");
  const cutout = element("cutout", true);
  const elements = [base, cutout];

  assert.equal(applyCutoutReviewMode(elements, cutout.id, "composite"), elements);
  assert.deepEqual(applyCutoutReviewMode(elements, cutout.id, "base").map((item) => item.id), ["base"]);
  assert.deepEqual(applyCutoutReviewMode(elements, cutout.id, "cutout").map((item) => item.id), ["cutout"]);
  const matte = applyCutoutReviewMode(elements, cutout.id, "matte");
  assert.equal(matte[0].props?.cutout_review_mode, "matte");
  assert.deepEqual(cutoutReviewVideoStyle(matte[0]), { filter: "brightness(0) invert(1)" });
});
