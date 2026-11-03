import assert from "node:assert/strict";
import { test } from "node:test";

import fs from "node:fs";

import {
  PREVIEW_CANVAS_PICTURE_SELECTOR,
  PREVIEW_MEDIA_ROOT_SELECTOR,
  expectsDomPreviewMedia,
  isPreviewWarmingComplete,
  nextStableReadySampleCount,
  hasReadyPreviewBuffer,
  previewClockAudioIdsAtTime,
  readinessUsesPreviewMixer,
  REQUIRED_STABLE_READY_SAMPLES,
  timelineExpectsMountedMediaAtTime,
} from "./usePreviewReadiness";

test("readiness must remain stable for a full sampling window and resets on a stall", () => {
  let count = 0;
  for (let index = 0; index < REQUIRED_STABLE_READY_SAMPLES - 1; index += 1) {
    count = nextStableReadySampleCount(count, true);
  }
  assert.equal(count, REQUIRED_STABLE_READY_SAMPLES - 1);
  count = nextStableReadySampleCount(count, false);
  assert.equal(count, 0);
  for (let index = 0; index < REQUIRED_STABLE_READY_SAMPLES; index += 1) {
    count = nextStableReadySampleCount(count, true);
  }
  assert.equal(count, REQUIRED_STABLE_READY_SAMPLES);
});

// The bug this guards (2026-07-22): a stills-and-captions-only timeline mounts
// no real <audio>/<video>. The Player's `data:` silence is excluded by the
// sampler, so realMediaCount is 0 forever. Before the fix the gate required
// realMediaCount > 0 and warmed until timeout, blocking queued play.
test("no-real-media timeline is ready once nothing is pending", () => {
  assert.equal(
    isPreviewWarmingComplete({ realMediaCount: 0, pendingCount: 0, expectsRealMedia: false }),
    true,
  );
});

test("a timeline that expects media is NOT ready before any mounts", () => {
  assert.equal(
    isPreviewWarmingComplete({ realMediaCount: 0, pendingCount: 0, expectsRealMedia: true }),
    false,
  );
});

test("readiness only expects media that overlaps the current playhead", () => {
  const music = [{
    type: "music",
    timeline_start: 0.333,
    duration: 6,
    source_url: "/music.m4a",
    removed_at: null,
  }];
  assert.equal(timelineExpectsMountedMediaAtTime(music, 0), false);
  assert.equal(timelineExpectsMountedMediaAtTime(music, 0.333), true);
  assert.equal(timelineExpectsMountedMediaAtTime(music, 0.333, true), false);
  assert.equal(timelineExpectsMountedMediaAtTime([{...music[0],type: "video_clip"}], 0.333, true), true);
  assert.equal(timelineExpectsMountedMediaAtTime(music, 6.333), false);
});

test("the start gate waits for active soundtrack and voice clocks, not future audio or clicks", () => {
  const make = (id: string, type: string, lane_key: string, timeline_start = 0) => ({
    id, type, lane_key, timeline_start, duration: 5, source_url: `/${id}.opus`, removed_at: null,
  });
  assert.deepEqual(previewClockAudioIdsAtTime([
    make("song", "music", "music_0"),
    make("voice", "vo_full", "audio_0"),
    make("click", "sound_effect", "audio_1"),
    make("later", "music", "music_1", 5),
  ], 1), ["song", "voice"]);
  assert.deepEqual(previewClockAudioIdsAtTime([
    make("talk", "video_clip", "visual_0"),
    { ...make("broll", "video_clip", "visual_1"), props: { runtime_source_has_audio: false } },
  ], 1), ["talk"], "a video's own sound is a clock channel; a known-silent source is not");
});

test("mounted-and-decoded real media is ready", () => {
  assert.equal(
    isPreviewWarmingComplete({ realMediaCount: 2, pendingCount: 0, expectsRealMedia: true }),
    true,
  );
});

test("still-decoding media is never ready, regardless of expectation", () => {
  assert.equal(
    isPreviewWarmingComplete({ realMediaCount: 2, pendingCount: 1, expectsRealMedia: true }),
    false,
  );
  assert.equal(
    isPreviewWarmingComplete({ realMediaCount: 1, pendingCount: 1, expectsRealMedia: false }),
    false,
  );
});

test("readiness scopes picture sampling to the composition frame", () => {
  assert.equal(PREVIEW_MEDIA_ROOT_SELECTOR, "[data-composition-master-frame='true']");
});

// The bug this guards (2026-10-12): with the GPU canvas owning the picture and
// the mixer owning sound, a playhead covering only video clips (a talking head
// whose voice is embedded in the clip) mounts no DOM <video> and no required
// music/voice channel. Expecting DOM media there kept the gate warming with one
// "pending" forever, so a proposal's queued Replay showed "Loading" and never played.
test("a GPU-drawn picture does not wait for a DOM video that never mounts", () => {
  assert.equal(PREVIEW_CANVAS_PICTURE_SELECTOR, "canvas[data-gpu-preview]");
  const gpuVideoOnly = expectsDomPreviewMedia({
    expectsRealMedia: true,
    externalAudioPreview: true,
    requiredExternalAudioCount: 0,
    canvasOwnsPicture: true,
  });
  assert.equal(gpuVideoOnly, false);
  assert.equal(isPreviewWarmingComplete({ realMediaCount: 0, pendingCount: 0, expectsRealMedia: gpuVideoOnly }), true);
  assert.equal(expectsDomPreviewMedia({
    expectsRealMedia: true,
    externalAudioPreview: true,
    requiredExternalAudioCount: 1,
    canvasOwnsPicture: true,
  }), true, "an active music/voice clock still has to mount and buffer");
  assert.equal(expectsDomPreviewMedia({
    expectsRealMedia: true,
    externalAudioPreview: true,
    requiredExternalAudioCount: 0,
    canvasOwnsPicture: false,
  }), true, "a DOM-decoded picture still waits for its <video>");
  assert.equal(expectsDomPreviewMedia({
    expectsRealMedia: true,
    externalAudioPreview: false,
    requiredExternalAudioCount: 0,
    canvasOwnsPicture: true,
  }), true, "in-composition audio is still sampled when the mixer is not in use");
});

// A short edit with layered video (a cutout over its shot) counts as "prepared playback",
// which once switched readiness off the mixer even under the GPU preview. The GPU canvas
// still owned the picture, so the gate waited for a DOM <video> forever and a paused
// cutout proposal's button never left Loading.
test("the GPU preview's layered edits still use the mixer for readiness", () => {
  const gpuLayered = readinessUsesPreviewMixer({ renderBackend: "gpu", externalAudioPreview: false, preparesPlayback: true });
  assert.equal(gpuLayered, true);
  assert.equal(expectsDomPreviewMedia({
    expectsRealMedia: true,
    externalAudioPreview: gpuLayered,
    requiredExternalAudioCount: 0,
    canvasOwnsPicture: true,
  }), false);
  assert.equal(readinessUsesPreviewMixer({ renderBackend: "standard", externalAudioPreview: true, preparesPlayback: true }), false,
    "a prepared standard picture carries its own sound");
  assert.equal(readinessUsesPreviewMixer({ renderBackend: "standard", externalAudioPreview: true, preparesPlayback: false }), true);
  assert.equal(readinessUsesPreviewMixer({ renderBackend: "standard", externalAudioPreview: false, preparesPlayback: false }), false);
});

test("readiness never commands an individual media element", () => {
  const source = fs.readFileSync(new URL("./usePreviewReadiness.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\belement\.(?:play|pause)\s*\(/);
});


test("fast startup requires decoded, settled media and a continuous half-second forward buffer", () => {
  const buffered = (ranges: number[][]) => ({length:ranges.length,start:(i:number)=>ranges[i][0],end:(i:number)=>ranges[i][1]});
  const media = {readyState:4,seeking:false,error:null,currentTime:3,duration:10,buffered:buffered([[0,10]])};
  assert.equal(hasReadyPreviewBuffer(media), true);
  for (const patch of [{readyState:3},{seeking:true},{currentTime:10},{duration:Infinity},{buffered:buffered([])},{buffered:buffered([[0,3.2],[3.3,10]])}]) {
    assert.equal(hasReadyPreviewBuffer({...media,...patch}), false);
  }
  assert.equal(hasReadyPreviewBuffer({...media,currentTime:9.9}), true, "a short media tail needs only its remaining buffer");
});
