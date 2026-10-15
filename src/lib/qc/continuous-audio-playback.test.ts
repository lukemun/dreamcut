import assert from "node:assert/strict";
import test from "node:test";

import {
  assessContinuousAudioPlayback,
  type ContinuousPlaybackSample,
} from "@/lib/qc/continuous-audio-playback";

const media = (currentTime: number, playedSeconds = currentTime) => [{
  key: "narration.m4a",
  tag: "audio" as const,
  audible: true,
  paused: false,
  currentTime,
  playedSeconds,
}];

test("near-real-time audible playback across a boundary passes", () => {
  const samples: ContinuousPlaybackSample[] = [
    { wallMs: 0, frame: 255, media: media(8.5, 1) },
    { wallMs: 1_000, frame: 285, media: media(9.5, 2) },
    { wallMs: 2_000, frame: 315, media: media(10.5, 3) },
    { wallMs: 3_000, frame: 345, media: media(11.5, 4) },
  ];
  const result = assessContinuousAudioPlayback({
    samples,
    events: [],
    fps: 30,
    boundaryFrame: 300,
  });
  assert.equal(result.pass, true);
});

test("a repeating wait/resume loop and slow clock fail", () => {
  const samples: ContinuousPlaybackSample[] = [
    { wallMs: 0, frame: 255, media: media(8.5, 1) },
    { wallMs: 1_000, frame: 258, media: media(8.6, 1.1) },
    { wallMs: 2_000, frame: 261, media: media(8.7, 1.2) },
    { wallMs: 3_000, frame: 264, media: media(8.8, 1.3) },
  ];
  const result = assessContinuousAudioPlayback({
    samples,
    events: [
      { wallMs: 400, key: "narration.m4a", audible: true, event: "waiting" },
      { wallMs: 600, key: "narration.m4a", audible: true, event: "playing" },
      { wallMs: 900, key: "narration.m4a", audible: true, event: "waiting" },
      { wallMs: 1_100, key: "narration.m4a", audible: true, event: "playing" },
    ],
    fps: 30,
    boundaryFrame: 300,
  });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.some((reason) => reason.includes("wall time")));
  assert.ok(result.reasons.some((reason) => reason.includes("buffering loop")));
});

test("silent visual buffering does not fail an otherwise clean audio probe", () => {
  const samples: ContinuousPlaybackSample[] = [
    { wallMs: 0, frame: 255, media: media(8.5, 1) },
    { wallMs: 1_000, frame: 285, media: media(9.5, 2) },
    { wallMs: 2_000, frame: 315, media: media(10.5, 3) },
  ];
  const result = assessContinuousAudioPlayback({
    samples,
    events: [
      { wallMs: 400, key: "wall-animation.webm", audible: false, event: "waiting" },
      { wallMs: 600, key: "wall-animation.webm", audible: false, event: "playing" },
      { wallMs: 900, key: "wall-animation.webm", audible: false, event: "waiting" },
      { wallMs: 1_100, key: "wall-animation.webm", audible: false, event: "playing" },
    ],
    fps: 30,
    boundaryFrame: 300,
  });
  assert.equal(result.pass, true);
  assert.equal(result.waitingResumePairs, 0);
});

test("duplicate audible clock owners fail even when time advances", () => {
  const samples: ContinuousPlaybackSample[] = [
    { wallMs: 0, frame: 255, media: [...media(8.5, 1), ...media(8.5, 1)] },
    { wallMs: 2_000, frame: 315, media: [...media(10.5, 3), ...media(10.5, 3)] },
  ];
  const result = assessContinuousAudioPlayback({
    samples,
    events: [],
    fps: 30,
    boundaryFrame: 300,
  });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.some((reason) => reason.includes("more than one media node")));
});

test("restarting the same audible source at a cut fails even without overlap or a stall", () => {
  const samples: ContinuousPlaybackSample[] = [
    { wallMs: 0, frame: 0, media: media(2.47, 0) },
    { wallMs: 1_000, frame: 30, media: media(3.47, 1) },
    { wallMs: 2_000, frame: 60, media: media(4.47, 2) },
  ];
  const result = assessContinuousAudioPlayback({
    samples,
    events: [
      { wallMs: 5, key: "narration.m4a", audible: true, event: "playing" },
      { wallMs: 1_083, key: "narration.m4a", audible: true, event: "playing" },
    ],
    fps: 30,
    boundaryFrame: 32,
  });

  assert.equal(result.pass, false);
  assert.equal(result.unexpectedPlayingRestarts, 1);
  assert.ok(result.reasons.some((reason) => reason.includes("source restart")));
});
