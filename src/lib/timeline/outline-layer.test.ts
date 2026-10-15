import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOutlineLayers, outlineFrameUrl } from "./outline-layer";
import type { TimelineElement } from "@/components/studio/timeline/types";

test("outline follows source timing and geometry while retaining independent appearance and lane", () => {
  const parent = { id: "subject", timeline_start: 4, duration: 8, trim_start: 2, playback_rate: 1.5,
    props: { has_alpha: true, media_offset_y: .25, keyframes: { media_scale: [{ time: 0, value: 1 }] } } } as unknown as TimelineElement;
  const outline = { id: "outline", lane_key: "visual_2", props: { outline_parent_id: "subject", outline_width: 12, outline_color: "#ff0000" } } as unknown as TimelineElement;
  const resolved = resolveOutlineLayers([parent, outline])[1]!;
  assert.equal(resolved.timeline_start, 4);
  assert.equal(resolved.trim_start, 2);
  assert.equal(resolved.playback_rate, 1.5);
  assert.equal(resolved.props?.media_offset_y, .25);
  assert.deepEqual(resolved.props?.keyframes, parent.props?.keyframes);
  assert.equal(resolved.props?.outline_width, 12);
  assert.equal(resolved.lane_key, "visual_2");
  assert.equal(resolved.volume, 0);
  assert.equal(resolveOutlineLayers([outline])[0]!.props?.disabled, true);
  assert.equal(resolveOutlineLayers([{ ...parent, removed_at: "now" }, outline])[1]!.props?.disabled, true);
});

test("outline source-frame selection clamps handles and uses source clock", () => {
  const mask = { source_url: "/masks", fps: 30, frame_count: 300, width: 1080, height: 1920, source_sha256: "hash" };
  assert.equal(outlineFrameUrl(mask, 2), "/masks/00061.png");
  assert.equal(outlineFrameUrl(mask, -1), "/masks/00001.png");
  assert.equal(outlineFrameUrl(mask, 11), "/masks/00300.png");
});
