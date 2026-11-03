import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResetElementPatch,
  buildResolvedResetElementPatch,
  buildPasteElementPayload,
  normalizeElementPatch,
  resolveDefaultTransitionTargetId,
} from "@/components/studio/timeline/useTimelineMutations";
import type { TimelineElement } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
    project_id: "project-1",
    type: overrides.type ?? "still",
    source_url: "https://example.com/asset.png",
    props: overrides.props ?? null,
    beat_id: overrides.beat_id ?? null,
    voice_clip_id: overrides.voice_clip_id ?? null,
    character_id: overrides.character_id ?? null,
    timeline_start: overrides.timeline_start ?? 0,
    duration: overrides.duration ?? 2,
    lane_key: overrides.lane_key ?? "visual_0",
    lane_index: overrides.lane_index ?? 0,
    trim_start: overrides.trim_start ?? 0,
    trim_end: overrides.trim_end ?? null,
    volume: overrides.volume ?? 1,
    fade_in: overrides.fade_in ?? 0,
    fade_out: overrides.fade_out ?? 0,
    playback_rate: overrides.playback_rate ?? 1,
    position_locked: overrides.position_locked ?? false,
    removed_at: overrides.removed_at ?? null,
    removed_reason: overrides.removed_reason ?? null,
    created_at: overrides.created_at ?? "2026-03-20T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-03-20T00:00:00.000Z",
    _source_duration: overrides._source_duration,
  };
}

test("resolveDefaultTransitionTargetId returns the next clip in the same lane order", () => {
  const elements = [
    buildElement({ id: "a", lane_key: "visual_0", timeline_start: 0 }),
    buildElement({ id: "b", lane_key: "visual_1", timeline_start: 0 }),
    buildElement({ id: "c", lane_key: "visual_0", timeline_start: 2 }),
  ];

  assert.equal(resolveDefaultTransitionTargetId("a", "visual_0", elements), "c");
  assert.equal(resolveDefaultTransitionTargetId("c", "visual_0", elements), null);
});

test("buildPasteElementPayload preserves clipboard media fields and stamps pasted_from_id", () => {
  const clip = buildElement({
    id: "video-1",
    type: "video_clip",
    trim_start: 0.133,
    trim_end: 1.433,
    props: { existing: true },
  });

  const payload = buildPasteElementPayload(clip, 1.234);
  const props = payload.props as { pasted_from_id: string; existing?: boolean };

  assert.equal(payload.type, "video_clip");
  assert.equal(payload.timeline_start >= 0, true);
  assert.equal(props.pasted_from_id, "video-1");
  assert.equal(props.existing, true);
});

test("buildResetElementPatch restores media clips to an unedited source-backed state", () => {
  const element = buildElement({
    type: "video_clip",
    duration: 3,
    trim_start: 1.25,
    trim_end: 2.5,
    playback_rate: 1.75,
    volume: 0.4,
    fade_in: 0.3,
    fade_out: 0.6,
    props: {
      source_duration_seconds: 12,
      intent_key: "visual:slot-1",
      animationIn: "fade",
      animationOut: "slide_left",
      volume_envelope: [{ time_seconds: 0, volume: 0.4 }],
    },
  });

  const patch = buildResetElementPatch(element);
  const props = patch.props as Record<string, unknown>;

  assert.equal(patch.trim_start, 0);
  assert.equal(patch.trim_end, null);
  assert.equal(patch.playback_rate, 1);
  assert.equal(patch.duration, 12);
  assert.equal(patch.volume, 1);
  assert.equal(patch.fade_in, 0);
  assert.equal(patch.fade_out, 0);
  assert.equal(props.intent_key, "visual:slot-1");
  assert.equal(props.animationIn, "none");
  assert.equal(props.animationOut, "none");
  assert.equal(props.animationInDuration, 0.25);
  assert.equal(props.animationOutDuration, 0.25);
  assert.equal(props.volume_envelope, null);
});

test("buildResetElementPatch strips SEV hold and still metadata from video clips", () => {
  const element = buildElement({
    type: "video_clip",
    duration: 3,
    trim_start: 1.25,
    trim_end: 2.5,
    playback_rate: 1.75,
    props: {
      source_duration_seconds: 12,
      intent_key: "visual:slot-1",
      source_still_video_url: "https://example.com/source-still.mp4",
      source_still_video_duration_seconds: 3.2,
      overflow_hold_still_video_url: "https://example.com/end-still.mp4",
      overflow_hold_still_video_duration_seconds: 1.1,
      leading_hold_duration_seconds: 0.75,
      media_limit_duration_seconds: 5.5,
      animationIn: "fade",
      animationOut: "slide_left",
    },
  });

  const patch = buildResetElementPatch(element);
  const props = patch.props as Record<string, unknown>;

  assert.equal(patch.duration, 12);
  assert.equal(patch.trim_start, 0);
  assert.equal(patch.trim_end, null);
  assert.equal(patch.playback_rate, 1);
  assert.equal(props.intent_key, "visual:slot-1");
  assert.equal(props.animationIn, "none");
  assert.equal(props.animationOut, "none");
  assert.equal("source_still_video_url" in props, false);
  assert.equal("source_still_video_duration_seconds" in props, false);
  assert.equal("overflow_hold_still_video_url" in props, false);
  assert.equal("overflow_hold_still_video_duration_seconds" in props, false);
  assert.equal("leading_hold_duration_seconds" in props, false);
  assert.equal("media_limit_duration_seconds" in props, false);
});

test("buildResetElementPatch restores source duration for video clips from transient metadata", () => {
  const element = buildElement({
    type: "video_clip",
    duration: 3,
    trim_start: 1.25,
    trim_end: 2.5,
    playback_rate: 1.75,
    _source_duration: 9.25,
    props: {
      intent_key: "visual:slot-1",
      media_limit_duration_seconds: 5.5,
      leading_hold_duration_seconds: 0.75,
      animationIn: "fade",
      animationOut: "slide_left",
    },
  });

  const patch = buildResetElementPatch(element);
  const props = patch.props as Record<string, unknown>;

  assert.equal(patch.duration, 9.25);
  assert.equal(patch.trim_start, 0);
  assert.equal(patch.trim_end, null);
  assert.equal(patch.playback_rate, 1);
  assert.equal(props.source_duration_seconds, 9.25);
  assert.equal("media_limit_duration_seconds" in props, false);
  assert.equal("leading_hold_duration_seconds" in props, false);
});

test("buildResetElementPatch restores caption style defaults while preserving caption text", () => {
  const element = buildElement({
    type: "caption_text",
    duration: 4,
    volume: 0.4,
    fade_in: 0.3,
    fade_out: 0.6,
    props: {
      intent_key: "caption:cap-1",
      text: "Original caption",
      positionPreset: "top_left",
      fontPreset: "mono",
      fontSizePx: 64,
      animationIn: "fade",
      animationOut: "slide_left",
      volume_envelope: [{ time_seconds: 0, volume: 0.4 }],
    },
  });

  const patch = buildResetElementPatch(element);
  const props = patch.props as Record<string, unknown>;

  assert.equal(patch.duration, undefined);
  assert.equal(patch.volume, 1);
  assert.equal(patch.fade_in, 0);
  assert.equal(patch.fade_out, 0);
  assert.equal(props.intent_key, "caption:cap-1");
  assert.equal(props.text, "Original caption");
  assert.equal(props.positionPreset, "bottom_center");
  assert.equal(props.fontPreset, "display_serif");
  assert.equal(props.fontSizePx, 42);
  assert.equal(props.animationIn, "none");
  assert.equal(props.animationOut, "none");
  assert.equal(props.volume_envelope, null);
});

test("buildResetElementPatch converts still-video wrappers into plain video clips and strips still-only props", () => {
  const element = buildElement({
    type: "still",
    source_url: "https://example.com/original-still.png",
    duration: 5,
    props: {
      intent_key: "visual:slot-1",
      source_variation_id: "variation-1",
      render_asset_type: "still_video",
      source_still_video_url: "https://example.com/generated-video.mp4",
      source_still_video_duration_seconds: 3.2,
      overflow_hold_still_video_url: "https://example.com/end-still.mp4",
      overflow_hold_still_video_duration_seconds: 1.1,
      animationIn: "fade",
    },
  });

  const patch = buildResetElementPatch(element);
  const props = patch.props as Record<string, unknown>;

  assert.equal(patch.type, "video_clip");
  assert.equal(patch.source_url, "https://example.com/generated-video.mp4");
  assert.equal(patch.duration, 3.2);
  assert.equal(patch.trim_start, 0);
  assert.equal(patch.trim_end, null);
  assert.equal(patch.playback_rate, 1);
  assert.equal(props.intent_key, "visual:slot-1");
  assert.equal(props.source_variation_id, "variation-1");
  assert.equal(props.source_duration_seconds, 3.2);
  assert.equal("render_asset_type" in props, false);
  assert.equal("source_still_video_url" in props, false);
  assert.equal("overflow_hold_still_video_url" in props, false);
});

test("buildResolvedResetElementPatch keeps the current start time and overflows a reset visual into a new lane", () => {
  const active = buildElement({
    id: "active",
    type: "video_clip",
    timeline_start: 6,
    duration: 2,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: 1.5,
    trim_end: 2,
    playback_rate: 1.5,
    props: { source_duration_seconds: 8, animationIn: "fade" },
  });

  const patch = buildResolvedResetElementPatch(active, [
    active,
    buildElement({
      id: "blocker",
      type: "still",
      timeline_start: 10,
      duration: 2,
      lane_key: "visual_0",
      lane_index: 0,
    }),
  ]);

  const props = patch.props as Record<string, unknown>;

  assert.equal(patch.timeline_start, undefined);
  assert.equal(patch.duration, 8);
  assert.equal(patch.lane_key, "visual_1");
  assert.equal(patch.lane_index, 1);
  assert.equal(patch.trim_start, 0);
  assert.equal(patch.trim_end, null);
  assert.equal(patch.playback_rate, 1);
  assert.equal(props.media_limit_duration_seconds, 8);
});

test("normalizeElementPatch preserves incoming reset props when duration changes", () => {
  const element = buildElement({
    type: "video_clip",
    duration: 2,
    props: {
      source_duration_seconds: 8,
      render_asset_type: "still_video",
      source_still_video_url: "https://example.com/source-still.mp4",
      source_still_video_duration_seconds: 3.2,
      media_limit_duration_seconds: 2,
      leading_hold_duration_seconds: 0.5,
      volume_envelope: [{ time_seconds: 0, volume: 0.4 }],
    },
  });

  const normalized = normalizeElementPatch(element, {
    duration: 8,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    props: {
      source_duration_seconds: 8,
      animationIn: "none",
      animationOut: "none",
      volume_envelope: null,
    },
  });

  const props = normalized.props as Record<string, unknown>;
  assert.equal(normalized.duration, 8);
  assert.equal(props.source_duration_seconds, 8);
  assert.equal(props.animationIn, "none");
  assert.equal(props.animationOut, "none");
  assert.equal(props.volume_envelope, null);
  assert.equal("render_asset_type" in props, false);
  assert.equal("source_still_video_url" in props, false);
  assert.equal("source_still_video_duration_seconds" in props, false);
  assert.equal("media_limit_duration_seconds" in props, false);
  assert.equal("leading_hold_duration_seconds" in props, false);
});
