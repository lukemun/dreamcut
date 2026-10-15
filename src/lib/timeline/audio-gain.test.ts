import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_LOUDNESS_TARGETS } from "@/lib/qc/standards";
import {
  FADER_MAX_DB,
  FADER_MIN_DB,
  MAX_ABS_GAIN,
  defaultPlacementGain,
  faderDbToGain,
  gainToFaderDb,
  referenceGainFor,
  resultingLufs,
  roleForAudioElement,
  roleForLaneKey,
} from "@/lib/timeline/audio-gain";

const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

// ── referenceGainFor ─────────────────────────────────────────────────────────

test("referenceGainFor lifts a quiet source toward the target", () => {
  // -30 LUFS → -28 target is +2 dB ≈ 1.26×
  near(referenceGainFor(-30, -28), 1.259);
});

test("referenceGainFor attenuates a hot source", () => {
  // -12 LUFS → -28 target is -16 dB ≈ 0.158×
  near(referenceGainFor(-12, -28), 0.158, 0.005);
});

test("referenceGainFor is unity when loudness is unknown", () => {
  assert.equal(referenceGainFor(null, -28), 1);
  assert.equal(referenceGainFor(undefined, -16), 1);
  assert.equal(referenceGainFor(Number.NaN, -16), 1);
});

test("referenceGainFor clamps absurd normalization to the gain ceiling", () => {
  assert.ok(referenceGainFor(-90, -14) <= MAX_ABS_GAIN);
});

// ── defaultPlacementGain ─────────────────────────────────────────────────────

test("defaultPlacementGain uses the role target", () => {
  // a bed at -30 defaults toward the music target (-28)
  near(defaultPlacementGain(-30, "music"), referenceGainFor(-30, ROLE_LOUDNESS_TARGETS.music));
});

test("defaultPlacementGain is unity with no role", () => {
  assert.equal(defaultPlacementGain(-30, null), 1);
});

// ── fader dB <-> gain round trip (0 dB = unity) ───────────────────────────────

test("0 dB == unity gain (the clip as-is)", () => {
  near(faderDbToGain(0), 1);
  assert.equal(gainToFaderDb(1), 0);
});

test("+6 dB doubles, -6 dB halves", () => {
  near(faderDbToGain(6), 2, 0.01);
  near(faderDbToGain(-6), 0.5, 0.01);
  near(gainToFaderDb(2) ?? -999, 6, 0.1);
  near(gainToFaderDb(0.5) ?? -999, -6, 0.1);
});

test("mute round-trips: null dB -> gain 0 -> null dB", () => {
  assert.equal(faderDbToGain(null), 0);
  assert.equal(gainToFaderDb(0), null);
});

test("fader dB is clamped to travel and gain ceiling", () => {
  assert.equal(faderDbToGain(FADER_MIN_DB), 0); // at/below floor = mute
  assert.ok(faderDbToGain(999) <= MAX_ABS_GAIN);
  assert.equal(gainToFaderDb(MAX_ABS_GAIN * 10), FADER_MAX_DB);
});

// ── resultingLufs ────────────────────────────────────────────────────────────

test("resultingLufs reports where the clip lands", () => {
  // -30 LUFS at the reference gain for the -28 target should land at -28
  const ref = referenceGainFor(-30, -28);
  near(resultingLufs(-30, ref) ?? -999, -28, 0.05);
});

test("resultingLufs is null when muted or loudness unknown", () => {
  assert.equal(resultingLufs(-30, 0), null);
  assert.equal(resultingLufs(null, 1.2), null);
});

// ── roleForLaneKey ───────────────────────────────────────────────────────────

test("roleForLaneKey maps lanes to roles", () => {
  assert.equal(roleForLaneKey("audio_narrator"), "narrator");
  assert.equal(roleForLaneKey("music_0"), "music");
  assert.equal(roleForLaneKey("music_3"), "music");
  assert.equal(roleForLaneKey("sound_effect_0"), "sfx");
  assert.equal(roleForLaneKey("captions_0"), null);
  assert.equal(roleForLaneKey("visual_0"), null);
  assert.equal(roleForLaneKey(null), null);
});

test("talking video normalizes as narration even on a generic visual lane", () => {
  assert.equal(roleForAudioElement({
    type: "video_clip",
    lane_key: "visual_0",
    props: { preview_audio_source_url: "/voice.m4a" },
  }), "narrator");
  assert.equal(roleForAudioElement({ type: "video_clip", lane_key: "visual_0" }), null);
  assert.equal(roleForAudioElement({ type: "music", lane_key: "music_0" }), "music");
  assert.equal(roleForAudioElement({ type: "still", lane_key: "visual_0" }), null);
});
