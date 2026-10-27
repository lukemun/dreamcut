import { timelineElementPatchSchema } from "@/lib/timeline/contracts";
import { applyElementPatch } from "@/lib/local-store/element-patch";
import { speechClockDependentIds } from "@/lib/timeline/speech-sync-contract";
import assert from "node:assert/strict";
import test from "node:test";

import { videoAudioStatus } from "./video-audio-status";
import { disconnectSpeechPatch, resolveSpeechSyncStatus } from "./speech-sync-status";
import type { TimelineElement } from "./types";

function element(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    project_id: "project",
    type: "video_clip",
    source_url: "/same-source.mp4",
    props: {},
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 84.2,
    duration: 13,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: 127.2666666667,
    trim_end: 3.8666666667,
    volume: 0,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

test("matching a muted source to speech does not invent a timing connection", () => {
  const picture = element({});
  const speech = element({ id: "22222222-2222-4222-8222-222222222222", type: "vo_segment", volume: 1 });
  assert.equal(resolveSpeechSyncStatus(picture, [picture, speech]), null);
});

test("reports an explicitly bound pair as synchronized", () => {
  const speechId = "22222222-2222-4222-8222-222222222222";
  const picture = element({
    timeline_start: 86.8,
    duration: 9.7,
    trim_start: 130.5666666667,
    voice_clip_id: speechId,
  });
  const speech = element({
    id: speechId,
    type: "vo_segment",
    timeline_start: 86.8,
    duration: 9.7,
    trim_start: 130.5666666667,
    lane_key: "audio_0",
    volume: 1,
  });
  const status = resolveSpeechSyncStatus(picture, [picture, speech]);
  assert.equal(status?.state, "synced");
  assert.equal(status?.explicit, true);
});

test("compares a cutout through its original source interval rather than derivative time zero", () => {
  const speechId = "22222222-2222-4222-8222-222222222222";
  const picture = element({
    timeline_start: 55.4333333333,
    duration: 6.2333333333,
    trim_start: 1.9666666667,
    trim_end: 1.9666666667,
    playback_rate: 1.08,
    voice_clip_id: speechId,
    props: {
      custom_cutout_receipt: { source_interval_seconds: [67.5, 78.2] },
      speech_sync_binding: {
        source_element_id: speechId,
        source_sha256: "same",
        source_start_seconds: 69.468,
        source_end_seconds: 76.2,
        source_playback_rate: 1.08,
      },
    },
  });
  const speech = element({
    id: speechId,
    timeline_start: 0,
    duration: 84.2,
    trim_start: 9.6,
    trim_end: 43.57,
    playback_rate: 1.08,
    lane_key: "visual_0",
    volume: 1,
  });

  const status = resolveSpeechSyncStatus(picture, [picture, speech]);
  assert.equal(status?.state, "synced");
  assert.ok(Math.abs(status?.offsetSeconds ?? 1) < 0.005);
});

test("ordinary muted video has no speech status", () => {
  const picture = element({});
  assert.equal(resolveSpeechSyncStatus(picture, [picture]), null);
});

test("disconnect preserves the cut and sound and removes timing dependencies; Undo restores them", () => {
  const speech = element({ id: "22222222-2222-4222-8222-222222222222", type: "vo_segment", volume: 1 });
  const picture = element({ voice_clip_id: speech.id, props: { speech_sync_binding: { source_element_id: speech.id }, title: "Presenter" } });
  const before = structuredClone(picture);
  const patch = timelineElementPatchSchema.parse(disconnectSpeechPatch(picture));
  applyElementPatch(picture, patch);
  assert.equal(resolveSpeechSyncStatus(picture, [picture, speech]), null);
  assert.deepEqual(speechClockDependentIds([picture, speech], speech.id), []);
  for (const key of ["timeline_start", "duration", "source_url", "volume", "trim_start", "playback_rate"] as const) assert.equal(picture[key], before[key]);
  applyElementPatch(picture, timelineElementPatchSchema.parse({ voice_clip_id: before.voice_clip_id, props: before.props }));
  assert.equal(resolveSpeechSyncStatus(picture, [picture, speech])?.state, "synced");
  assert.deepEqual(speechClockDependentIds([picture, speech], speech.id), [picture.id]);
});

test("missing speech remains an actionable explicit relationship", () => {
  const picture = element({ voice_clip_id: "missing" });
  assert.equal(resolveSpeechSyncStatus(picture, [picture])?.state, "missing");
});

test("video audio badges distinguish source presence from clip and lane muting", () => {
  const video = element({ props: { runtime_source_has_audio: true }, volume: 1 });
  assert.equal(videoAudioStatus(video)?.state, "available");
  assert.equal(videoAudioStatus(video, true)?.state, "muted");
  assert.equal(videoAudioStatus({ ...video, volume: 0 })?.state, "muted");
  assert.equal(videoAudioStatus({ ...video, props: { runtime_source_has_audio: false } })?.state, "none");
  assert.equal(videoAudioStatus({ ...video, props: {} })?.state, "unknown");
  assert.equal(videoAudioStatus({ ...video, type: "still" }), null);
  // An authored envelope owns gain even when the legacy scalar is zero.
  assert.equal(videoAudioStatus({ ...video, volume: 0, props: { runtime_source_has_audio: true,
    volume_envelope: [{ time_seconds: 0, volume: 0 }, { time_seconds: 13, volume: 1 }] } })?.state, "available");
  assert.equal(videoAudioStatus({ ...video, props: { runtime_source_has_audio: true,
    volume_envelope: [{ time_seconds: 0, volume: 0 }, { time_seconds: 13, volume: 0 }] } })?.state, "muted");
});
