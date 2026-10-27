import assert from "node:assert/strict";
import test from "node:test";
import { gpuSceneCapabilityIssues } from "@/lib/gpu-preview/scene";
import type { CompositionElement } from "@/lib/render/composition-adapters";
import { CAPTION_LOOKS, TEXT_PANEL_FONTS, TEXT_PRESETS } from "@/lib/timeline/panel-text-presets";
import { presetsForElementType } from "@/lib/timeline/animation-presets";
import {
  buildCaptionElementPayload,
  buildCaptionLookPayload,
  buildFontTextPayload,
  buildTextPresetPayload,
  buildVisualElementPayload,
  type ElementCreatePayload,
  type VisualAsset,
} from "./asset-shelf-payloads";

/**
 * GPU-first contract (docs/architecture/playback-rendering.md#gpu-first-feature-rule).
 * Everything an editor panel can add must be admitted by Browser GPU (CanvasKit). Add every
 * new preset catalog or payload builder here; never widen this test by skipping an issue.
 */
const admit = (name: string, payload: ElementCreatePayload) => gpuSceneCapabilityIssues(
  [{ id: name, ...payload, timeline_start: 0 } as unknown as CompositionElement], "gpu-contract", "canvaskit",
);

test("caption looks, text presets and fonts are fully admitted by Browser GPU", () => {
  const payloads: [string, ElementCreatePayload][] = [
    ...CAPTION_LOOKS.map(look => [`look:${look.id}`, buildCaptionLookPayload(look)] as [string, ElementCreatePayload]),
    ...TEXT_PRESETS.map(item => [`text:${item.id}`, buildTextPresetPayload(item)] as [string, ElementCreatePayload]),
    ...TEXT_PANEL_FONTS.map(font => [`font:${font}`, buildFontTextPayload(font)] as [string, ElementCreatePayload]),
  ];
  for (const [name, payload] of payloads) assert.deepEqual(admit(name, payload).map(issue => issue.reason), [], name);
});

test("Library placement bookkeeping never pushes a clip off the GPU path", () => {
  const asset = { slot_id: "slot", variation_id: null, beat_id: null, type: "still", source_url: "/media/frame.png", duration_seconds: null, is_approved: true } as VisualAsset;
  const caption = buildCaptionElementPayload({ caption_id: "c1", beat_id: null, text: "Hello", duration_seconds: 2 } as Parameters<typeof buildCaptionElementPayload>[0], []);
  for (const [name, payload] of [["library still", buildVisualElementPayload(asset, [])], ["library caption", caption]] as const) {
    // Source resolution needs real project media; property admission must not depend on it.
    const issues = admit(name, payload).filter(issue => issue.capability !== "source");
    assert.deepEqual(issues.map(issue => issue.reason), [], name);
  }
});

test("media animation presets offered by the inspector are admitted by Browser GPU", () => {
  const media = { type: "still", source_url: "/media/frame.png", duration: 2, props: {} } as unknown as ElementCreatePayload;
  for (const type of ["still", "video_clip"] as const) {
    for (const preset of presetsForElementType(type)) {
      const issues = admit(`${type}:${preset}`, { ...media, type, props: { animationIn: preset, animationOut: preset, animationInDuration: .4, animationOutDuration: .4 } } as ElementCreatePayload)
        .filter(issue => issue.capability !== "source");
      assert.deepEqual(issues.map(issue => issue.reason), [], `${type}:${preset}`);
    }
  }
});

test("outline layer controls (width 0-64, any picked color) stay on the GPU path", () => {
  const mask = { source_url: "/api/projects/p/media/outline-masks/abc", frame_count: 30, fps: 30, width: 100, height: 100, source_sha256: "a".repeat(64) };
  for (const [width, color] of [[0, "#ffffff"], [8, "#00aaff"], [64, "#000000"]] as const) {
    const outline = { type: "video_clip", source_url: "/media/cutout.webm", duration: 1, props: { has_alpha: true, outline_parent_id: "subject", outline_mask: mask, outline_source_url: "/media/cutout.webm", outline_width: width, outline_color: color } } as unknown as ElementCreatePayload;
    assert.deepEqual(admit(`outline:${width}:${color}`, outline).map(issue => issue.reason), [], `outline ${width} ${color}`);
  }
});

test("letter-fall controls offered by the inspector stay on the GPU path", () => {
  const caption = buildCaptionElementPayload({ caption_id: "fall", beat_id: null, text: "Goulash soup", duration_seconds: 3 } as Parameters<typeof buildCaptionElementPayload>[0], []);
  // ElementMenu: direction select plus Release at (0..duration), fall time (.2..2), stagger (0..0.15).
  for (const order of ["outside_in", "left_to_right", "right_to_left"])
    for (const [start, seconds, stagger] of [[0, .2, 0], [1, .45, .04], [3, 2, .15]]) {
      const payload = { ...caption, props: { ...caption.props, letter_fall_order: order, letter_fall_start_seconds: start, letter_fall_seconds: seconds, letter_fall_stagger_seconds: stagger } } as ElementCreatePayload;
      assert.deepEqual(admit(`letter-fall:${order}:${start}`, payload).map(issue => issue.reason), [], `letter fall ${order} ${start}`);
    }
});
