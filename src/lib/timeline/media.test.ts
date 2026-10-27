import assert from "node:assert/strict";
import test from "node:test";

import {
  computePlaybackRateTimelineDuration,
  derivePlaybackRateVideoProps,
  getMaxExtendableTimelineDuration,
  getMaxPlayableTimelineDuration,
  resolveMediaTiming,
  WAVEFORM_SUPPORTED_TYPES,
} from "./media";
import { resolveVisualRenderPlan } from "./visual-render-plan";

test("talking video clips expose waveform and gain-envelope controls", () => {
  assert.equal(WAVEFORM_SUPPORTED_TYPES.has("video_clip"), true);
});

test("getMaxPlayableTimelineDuration does not force a half-second floor for source-backed video", () => {
  const playable = getMaxPlayableTimelineDuration({
    type: "video_clip",
    duration: 4,
    trim_start: 0,
    trim_end: 3.9,
    playback_rate: 0.5,
    _source_duration: 4,
    props: { source_duration_seconds: 4 },
  });

  assert.equal(playable, 0.2);
});

test("getMaxExtendableTimelineDuration preserves known right-edge source handles", () => {
  const media = {
    type: "music",
    duration: 40,
    trim_start: 0,
    trim_end: 165.793,
    playback_rate: 1,
    _source_duration: 205.793,
  };

  assert.equal(getMaxPlayableTimelineDuration(media), 40);
  assert.equal(getMaxExtendableTimelineDuration(media), 205.793);
});

test("derivePlaybackRateVideoProps scales an explicit playable limit when slowing a video clip", () => {
  const props = derivePlaybackRateVideoProps({
    type: "video_clip",
    duration: 8,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    props: {
      media_limit_duration_seconds: 8,
      leading_hold_duration_seconds: 1.5,
    },
  }, 0.5);

  assert.deepEqual(props, {
    media_limit_duration_seconds: 16,
    leading_hold_duration_seconds: 1.5,
  });
});

test("derivePlaybackRateVideoProps strips still-wrapper metadata from video clips", () => {
  const props = derivePlaybackRateVideoProps({
    type: "video_clip",
    duration: 4,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    props: {
      source_duration_seconds: 4,
      render_asset_type: "still_video",
      source_still_video_url: "https://example.com/still.mp4",
      source_still_video_duration_seconds: 4,
      overflow_hold_still_video_url: "https://example.com/end-still.mp4",
    },
  }, 2);

  assert.equal(props?.render_asset_type, undefined);
  assert.equal(props?.source_still_video_url, undefined);
  assert.equal(props?.source_still_video_duration_seconds, undefined);
  assert.equal(props?.overflow_hold_still_video_url, "https://example.com/end-still.mp4");
});

test("resolveMediaTiming normalizes video playable and hold segments from one model", () => {
  const timing = resolveMediaTiming({
    timeline_start: 3,
    type: "video_clip",
    duration: 10,
    trim_start: 0.5,
    trim_end: 0.5,
    playback_rate: 0.5,
    props: {
      source_duration_seconds: 6,
      leading_hold_duration_seconds: 2,
    },
  });

  assert.deepEqual(timing, {
    timelineStart: 3,
    timelineDuration: 10,
    trimStart: 0.5,
    trimEnd: 0.5,
    playbackRate: 0.5,
    sourceDuration: 6,
    sourcePlayableDuration: 5,
    leadingHoldDuration: 2,
    maxPlayableTimelineDuration: 10,
    visiblePlayableTimelineDuration: 8,
    trailingHoldDuration: 0,
    visibleSourceDuration: 4,
  });
});

test("computePlaybackRateTimelineDuration does not create overflow when none exists", () => {
  const duration = computePlaybackRateTimelineDuration({
    type: "video_clip",
    duration: 4,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    props: {
      source_duration_seconds: 4,
    },
  }, 2);

  assert.equal(duration, 2);
});

test("computePlaybackRateTimelineDuration preserves an existing overflow as a minimum", () => {
  const duration = computePlaybackRateTimelineDuration({
    type: "video_clip",
    duration: 5,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    props: {
      source_duration_seconds: 4,
      media_limit_duration_seconds: 4,
    },
  }, 2);

  assert.equal(duration, 5);
});

test("resolveVisualRenderPlan keeps video SEV rendering on the source video path", () => {
  const plan = resolveVisualRenderPlan({
    id: "clip-1",
    type: "video_clip",
    source_url: "https://example.com/source.mp4",
    props: {
      source_duration_seconds: 4,
      overflow_hold_still_video_url: "https://example.com/legacy-end-still.mp4",
    },
    timeline_start: 0,
    duration: 6,
    lane_key: "visual_0",
    lane_index: 0,
    volume: 1,
    playback_rate: 1,
    trim_start: 0,
    trim_end: null,
    fade_in: 0,
    fade_out: 0,
    transition_in: null,
    transition_out: null,
  });

  assert.equal(plan.renderKind, "video");
  assert.equal(plan.sourceUrl, "https://example.com/source.mp4");
  assert.equal(plan.usesLegacyStillVideoWrapper, false);
});

test("resolveVisualRenderPlan normalizes legacy still-video wrappers into video render plans", () => {
  const plan = resolveVisualRenderPlan({
    id: "clip-2",
    type: "still",
    source_url: "https://example.com/source-still.png",
    props: {
      render_asset_type: "still_video",
      source_still_video_url: "https://example.com/source-still.mp4",
      source_still_video_duration_seconds: 1.5,
      intent_key: "visual:slot-1",
    },
    timeline_start: 0,
    duration: 3,
    lane_key: "visual_0",
    lane_index: 0,
    volume: 1,
    playback_rate: 1,
    trim_start: 0,
    trim_end: null,
    fade_in: 0,
    fade_out: 0,
    transition_in: null,
    transition_out: null,
  });

  assert.equal(plan.renderKind, "video");
  assert.equal(plan.sourceUrl, "https://example.com/source-still.mp4");
  assert.equal(plan.usesLegacyStillVideoWrapper, true);
  assert.equal(plan.mediaElement.type, "video_clip");
  assert.equal(plan.mediaElement.source_url, "https://example.com/source-still.mp4");
  assert.equal(plan.mediaElement.trim_start, 0);
  assert.equal(plan.mediaElement.trim_end, null);
  assert.equal((plan.mediaElement.props ?? {}).source_duration_seconds, 1.5);
  assert.equal((plan.mediaElement.props ?? {}).intent_key, "visual:slot-1");
  assert.equal((plan.mediaElement.props ?? {}).render_asset_type, undefined);
  assert.equal((plan.mediaElement.props ?? {}).source_still_video_url, undefined);
});
