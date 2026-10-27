import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_NATIVE_CLOCK_GAIN_CEILING,
  previewAudioPlaybackIdentity,
  previewNarrationGain,
  readPreviewAudioBakedGain,
  shouldUseWebAudioForTimelineTrack,
  shouldUseWebAudioForPreviewNarration,
} from "./preview-narration-audio";

test("normal-volume preview narration stays on the native media clock", () => {
  assert.equal(shouldUseWebAudioForPreviewNarration({ volume: 1 }), false);
  assert.equal(
    shouldUseWebAudioForPreviewNarration({
      volume: 1,
      props: {
        volume_envelope: [
          { time_seconds: 0, volume: 1 },
          { time_seconds: 2, volume: 0.8 },
        ],
      },
    }),
    false,
  );
});

test("preview narration uses Web Audio only for above-unity gain", () => {
  assert.equal(shouldUseWebAudioForPreviewNarration({ volume: 1.02 }), false);
  assert.equal(
    shouldUseWebAudioForPreviewNarration({ volume: PREVIEW_NATIVE_CLOCK_GAIN_CEILING }),
    false,
  );
  assert.equal(shouldUseWebAudioForPreviewNarration({ volume: 1.2 }), true);
  assert.equal(
    shouldUseWebAudioForPreviewNarration({
      volume: 1,
      props: {
        volume_envelope: [
          { time_seconds: 0, volume: 1 },
          { time_seconds: 2, volume: 1.2 },
        ],
      },
    }),
    true,
  );
});

test("native-clock preview caps near-unity gain without changing Web Audio gain", () => {
  assert.equal(previewNarrationGain(1.02, false), 1);
  assert.equal(previewNarrationGain(0.84, false), 0.84);
  assert.equal(previewNarrationGain(1.2, true), 1.2);
});

test("a gain-baked preview clock stays native while preserving authored render gain", () => {
  const element = {
    volume: 2.85,
    props: { preview_audio_baked_gain: 2.85 },
  };
  assert.equal(readPreviewAudioBakedGain(element), 2.85);
  assert.equal(shouldUseWebAudioForPreviewNarration(element), false);
  assert.equal(previewNarrationGain(2.85, false, 2.85), 1);
});

test("an edited clip gets a fresh preview audio clock without remounting unrelated clips", () => {
  const base = {
    id: "clip-1",
    timeline_start: 68,
    duration: 20.66,
    trim_start: 91.15,
    trim_end: 111.81,
    playback_rate: 1,
  };
  const source = "/preview-audio/clip-1.m4a";
  const initial = previewAudioPlaybackIdentity(base, source);

  assert.equal(previewAudioPlaybackIdentity({ ...base }, source), initial);
  assert.notEqual(
    previewAudioPlaybackIdentity({ ...base, timeline_start: 68.2 }, source),
    initial,
  );
  assert.notEqual(
    previewAudioPlaybackIdentity({ ...base, trim_start: 91.35 }, source),
    initial,
  );
  assert.notEqual(
    previewAudioPlaybackIdentity({ ...base, playback_rate: 0.95 }, source),
    initial,
  );
  assert.notEqual(
    previewAudioPlaybackIdentity(base, "/preview-audio/clip-1-v2.m4a"),
    initial,
  );
});

test("gain edits preserve the media clock while native-to-Web-Audio switches re-arm it", () => {
  const base = {
    id: "clip-1",
    timeline_start: 10,
    duration: 4,
    trim_start: 2,
    trim_end: 0,
    playback_rate: 1,
    volume: 0.7,
    fade_in: 0,
    fade_out: 0,
    props: {
      volume_envelope: [
        { time_seconds: 0, volume: 0.7 },
        { time_seconds: 4, volume: 0.7 },
      ],
    },
  };
  const source = "/audio/sfx.mp3";
  const native = previewAudioPlaybackIdentity(base, source, false);
  assert.equal(
    previewAudioPlaybackIdentity({
      ...base,
      volume: 0.9,
      props: {
        volume_envelope: [
          { time_seconds: 0, volume: 0.9 },
          { time_seconds: 4, volume: 0.9 },
        ],
      },
    }, source, false),
    native,
  );
  assert.notEqual(previewAudioPlaybackIdentity(base, source, true), native);
});

test("timeline audio preview uses one Web Audio topology across pooled tag owners", () => {
  assert.equal(shouldUseWebAudioForTimelineTrack(false, false), true);
  assert.equal(shouldUseWebAudioForTimelineTrack(false, true), true);
  assert.equal(shouldUseWebAudioForTimelineTrack(true, false), false);
  assert.equal(shouldUseWebAudioForTimelineTrack(true, true), true);
});
