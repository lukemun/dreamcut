import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCutoutEffects, cutoutEffectState } from "./cutout-effects";
import type { CompositionElement } from "@/lib/render/composition-adapters";

const base: CompositionElement = {
  id: "presenter", type: "video_clip", source_url: "styled.webm", timeline_start: 25,
  duration: 4, lane_key: "visual_21", lane_index: 21, playback_rate: 1.1,
  trim_start: 1, trim_end: 4.6, volume: 0, fade_in: 0, fade_out: 0,
  props: { source_duration_seconds: 10, has_alpha: true, sticker_outline: true,
    custom_cutout_receipt: { scratchpad_treatment: {} }, media_scale: .38,
    speech_sync_binding: { source_element_id: "speech" },
    cutout_effects: { schema_version: 1, background: true, scratchpad: true,
      original: { source_url: "original.mov", preview_source_url: "original-small.mp4", offset: 20, duration: 96, alpha: false },
      clean: { source_url: "clean.webm", preview_source_url: "clean-small.webm", offset: 0, duration: 10, alpha: true },
    },
  },
};
function select(background: boolean, scratchpad: boolean) {
  return { ...base, props: { ...base.props, cutout_effects: { ...(base.props!.cutout_effects as object), background, scratchpad } } };
}
test("legacy treated cutouts expose both applied effects", () => {
  assert.deepEqual(cutoutEffectState({ custom_cutout_receipt: { scratchpad_treatment: {} } }), { background: true, scratchpad: true, hasScratchpad: true });
});
test("Scratchpad off uses clean cutout, not a cosmetic outline flag", () => {
  const result = resolveCutoutEffects(select(true, false));
  assert.equal(result.source_url, "clean.webm");
  assert.equal(result.trim_start, 1);
  assert.equal(result.trim_end, 4.6);
  assert.equal(result.props?.sticker_outline, false);
  assert.equal(result.props?.has_alpha, true);
});
test("background off restores original absolute source clock and never doubles speech", () => {
  const result = resolveCutoutEffects(select(false, true));
  assert.equal(result.source_url, "original.mov");
  assert.equal(result.trim_start, 21);
  assert.equal(result.trim_end, 70.6);
  assert.equal(result.timeline_start, 25);
  assert.equal(result.duration, 4);
  assert.equal(result.playback_rate, 1.1);
  assert.equal(result.volume, 0);
  assert.equal(result.props?.has_alpha, false);
  assert.equal(result.props?.media_scale, .38);
  assert.deepEqual(result.props?.speech_sync_binding, base.props?.speech_sync_binding);
});
test("repeated selection is pure and restoring both gives exact authored version", () => {
  const before = JSON.stringify(base);
  for (let i = 0; i < 4; i++) { resolveCutoutEffects(select(false, true)); resolveCutoutEffects(select(true, false)); }
  assert.equal(resolveCutoutEffects(base), base);
  assert.equal(JSON.stringify(base), before);
});
test("missing version fails closed; stale preview and compound cannot override selected media", () => {
  assert.throws(() => resolveCutoutEffects({ ...base, props: { ...base.props, cutout_effects: { background: false } } }), /unavailable/);
  const result = resolveCutoutEffects({ ...select(false, true), props: { ...select(false, true).props,
    runtime_preview_source_url: "old.webm", compound_preview: { source_url: "old-compound.webm" },
    runtime_cutout_effect_preview: { source_url: "clean.webm", props: { runtime_preview_source_url: "wrong.webm" } },
  } });
  assert.equal(result.props?.runtime_preview_source_url, undefined);
  assert.equal(result.props?.compound_preview, undefined);
  assert.equal(result.props?.preview_source_url, "original-small.mp4");
});
