import assert from "node:assert/strict";
import test from "node:test";

import type { ProbeResult } from "./schema";
import { probeHasAlphaChannel } from "./alpha-channel";

function probe(overrides: Partial<ProbeResult>): ProbeResult {
  return {
    duration_seconds: null,
    width: null,
    height: null,
    frame_rate: null,
    nominal_frame_rate: null,
    is_variable_frame_rate: null,
    video_time_base: null,
    display_rotation_degrees: null,
    sample_aspect_ratio: null,
    pixel_format: null,
    video_alpha_mode: null,
    color_transfer: null,
    color_primaries: null,
    video_codec: null,
    audio_codec: null,
    audio_channels: null,
    audio_channel_layout: null,
    sample_rate: null,
    has_video: true,
    has_audio: false,
    ...overrides,
  };
}

test("detects VP9 WebM alpha from alpha_mode even when ffprobe reports yuv420p", () => {
  assert.equal(probeHasAlphaChannel(probe({ pixel_format: "yuv420p", video_alpha_mode: "1" })), true);
});

test("detects codecs whose pixel format carries alpha", () => {
  assert.equal(probeHasAlphaChannel(probe({ pixel_format: "yuva420p" })), true);
  assert.equal(probeHasAlphaChannel(probe({ pixel_format: "gbrap10le" })), true);
  assert.equal(probeHasAlphaChannel(probe({ pixel_format: "rgba" })), true);
});

test("does not mark ordinary video as alpha", () => {
  assert.equal(probeHasAlphaChannel(probe({ pixel_format: "yuv420p" })), false);
  assert.equal(probeHasAlphaChannel(null), false);
});
