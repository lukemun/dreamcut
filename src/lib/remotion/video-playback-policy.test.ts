import assert from "node:assert/strict";
import test from "node:test";

import {
  collectTightlySyncedVideoIds,
  requiresTightVideoSync,
  shouldPauseTimelineForAudioBuffering,
  shouldPauseTimelineForVideoBuffering,
} from "./video-playback-policy";

test("ordinary sequential footage keeps the default playback tolerance", () => {
  const ids = collectTightlySyncedVideoIds([
    { id: "first", laneKey: "visual_0", timelineStart: 0, duration: 5 },
    { id: "second", laneKey: "visual_1", timelineStart: 5, duration: 5 },
  ]);

  assert.deepEqual([...ids], []);
});

test("overlapping videos on different lanes opt into tight synchronization", () => {
  const ids = collectTightlySyncedVideoIds([
    { id: "base", laneKey: "visual_0", timelineStart: 0, duration: 5 },
    { id: "cutout", laneKey: "visual_1", timelineStart: 1, duration: 3 },
  ]);

  assert.deepEqual([...ids].sort(), ["base", "cutout"]);
});

test("overlap inside one lane does not masquerade as layered compositing", () => {
  const ids = collectTightlySyncedVideoIds([
    { id: "outgoing", laneKey: "visual_0", timelineStart: 0, duration: 5 },
    { id: "incoming", laneKey: "visual_0", timelineStart: 4, duration: 5 },
  ]);

  assert.deepEqual([...ids], []);
});

test("a separate preview-audio proxy opts the matching video into tight sync", () => {
  assert.equal(requiresTightVideoSync({
    id: "talking-head",
    hasSeparatePreviewAudio: true,
    hasAudibleEmbeddedAudio: false,
    tightlySyncedVideoIds: new Set(),
  }), true);
});

test("audible embedded talking footage opts into tight sync", () => {
  assert.equal(requiresTightVideoSync({
    id: "talking-head",
    hasSeparatePreviewAudio: false,
    hasAudibleEmbeddedAudio: true,
    tightlySyncedVideoIds: new Set(),
  }), true);
});

test("silent single-file footage keeps the lighter playback policy", () => {
  assert.equal(requiresTightVideoSync({
    id: "b-roll",
    hasSeparatePreviewAudio: false,
    hasAudibleEmbeddedAudio: false,
    tightlySyncedVideoIds: new Set(),
  }), false);
});

test("silent alpha compositing layers do not enter a corrective-seek loop", () => {
  assert.equal(requiresTightVideoSync({
    id: "presenter-alpha",
    hasSeparatePreviewAudio: false,
    hasAudibleEmbeddedAudio: false,
    isSilentCompositingLayer: true,
    tightlySyncedVideoIds: new Set(["presenter-alpha"]),
  }), false);
});

test("a buffering speech picture cannot stall separately mounted narration", () => {
  assert.equal(shouldPauseTimelineForVideoBuffering({
    hasSeparatePreviewAudio: true,
    hasAudibleEmbeddedAudio: false,
  }), false);
});

test("speech-linked silent alpha follows the audio clock without owning it", () => {
  assert.equal(requiresTightVideoSync({ id: "presenter", hasSeparatePreviewAudio: false,
    hasAudibleEmbeddedAudio: false, isSilentCompositingLayer: true, isSpeechLinked: true,
    tightlySyncedVideoIds: new Set() }), true);
  assert.equal(shouldPauseTimelineForVideoBuffering({ hasSeparatePreviewAudio: false,
    hasAudibleEmbeddedAudio: false, isSpeechLinked: true }), false);
});

test("a buffering silent visual cannot pause narration on another lane", () => {
  assert.equal(shouldPauseTimelineForVideoBuffering({
    hasSeparatePreviewAudio: false,
    hasAudibleEmbeddedAudio: false,
  }), false);
});

test("audible muxed video pauses the timeline to preserve its own A/V sync", () => {
  assert.equal(shouldPauseTimelineForVideoBuffering({
    hasSeparatePreviewAudio: false,
    hasAudibleEmbeddedAudio: true,
  }), true);
});

test("short sound effects cannot freeze the shared playback clock", () => {
  assert.equal(shouldPauseTimelineForAudioBuffering("sound_effect"), false);
  assert.equal(shouldPauseTimelineForAudioBuffering("voiceover"), true);
  assert.equal(shouldPauseTimelineForAudioBuffering("music"), true);
});

test("speed-step preview preloads the next decoder without changing export timing", async () => {
  const {speedSegmentPremountFrames} = await import('./video-playback-policy');
  assert.equal(speedSegmentPremountFrames(8,30,false),15);
  assert.equal(speedSegmentPremountFrames(1,30,false),0);
  assert.equal(speedSegmentPremountFrames(8,30,true),0);
});
