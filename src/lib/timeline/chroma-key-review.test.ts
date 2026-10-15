import assert from "node:assert/strict";
import test from "node:test";

import type { CompositionElement } from "@/lib/render/composition-adapters";

import { CHROMA_KEY_MODEL } from "./chroma-key";
import {
  applyChromaKeyReviewMode,
  chromaKeyReviewVideoStyle,
  isChromaKeyed,
} from "./chroma-key-review";

const element = (over: Partial<CompositionElement>): CompositionElement => ({
  id: "x",
  project_id: "t",
  type: "video_clip",
  lane_key: "visual_0",
  lane_index: 0,
  timeline_start: 0,
  duration: 4,
  trim_start: 0,
  trim_end: 0,
  volume: 1,
  fade_in: 0,
  fade_out: 0,
  playback_rate: 1,
  position_locked: false,
  source_url: "/media/a.mp4",
  props: {},
  transition_in: null,
  transition_out: null,
  ...over,
} as CompositionElement);

const keyed = element({
  id: "keyed",
  props: { chroma_key_color: "#00b140", chroma_key_model: CHROMA_KEY_MODEL, chroma_key_tolerance: 0.4 },
});
const backdrop = element({ id: "backdrop", type: "still", lane_key: "visual_1", lane_index: 1 });

test("only a keyed video clip is a review target", () => {
  assert.equal(isChromaKeyed(keyed), true);
  assert.equal(isChromaKeyed(backdrop), false);
  assert.equal(isChromaKeyed(element({ props: {} })), false);
  assert.equal(isChromaKeyed(element({ type: "still", props: keyed.props })), false);
});

test("composite and an absent target leave the stack untouched", () => {
  const stack = [keyed, backdrop];
  assert.equal(applyChromaKeyReviewMode(stack, "keyed", "composite"), stack);
  assert.equal(applyChromaKeyReviewMode(stack, null, "matte"), stack);
  assert.equal(applyChromaKeyReviewMode(stack, "missing", "matte"), stack);
});

test("source turns the key off in place so the real backdrop is visible", () => {
  const [first, second] = applyChromaKeyReviewMode([keyed, backdrop], "keyed", "source");
  assert.equal("chroma_key_color" in (first!.props ?? {}), false);
  assert.equal("chroma_key_model" in (first!.props ?? {}), false);
  assert.equal("chroma_key_tolerance" in (first!.props ?? {}), false);
  // Everything else in the stack is preserved, so the shot still reads normally.
  assert.equal(second!.id, "backdrop");
});

test("key and matte isolate the clip so nothing underneath hides a bad edge", () => {
  for (const mode of ["key", "matte"] as const) {
    const result = applyChromaKeyReviewMode([keyed, backdrop], "keyed", mode);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.id, "keyed");
    assert.equal(result[0]!.props?.chroma_key_review_mode, mode);
    // The key itself must stay on — the point is to inspect what it produced.
    assert.equal(result[0]!.props?.chroma_key_color, "#00b140");
  }
});

test("review state is a projection and never mutates the source elements", () => {
  const stack = [keyed, backdrop];
  const snapshot = JSON.stringify(stack);
  applyChromaKeyReviewMode(stack, "keyed", "source");
  applyChromaKeyReviewMode(stack, "keyed", "matte");
  assert.equal(JSON.stringify(stack), snapshot);
});

test("only the matte view recolours the clip", () => {
  assert.deepEqual(chromaKeyReviewVideoStyle({ props: { chroma_key_review_mode: "matte" } }), {
    filter: "brightness(0) invert(1)",
  });
  assert.deepEqual(chromaKeyReviewVideoStyle({ props: { chroma_key_review_mode: "key" } }), {});
  assert.deepEqual(chromaKeyReviewVideoStyle({ props: {} }), {});
});
