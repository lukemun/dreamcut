import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import type { CompositionElement } from "@/lib/render/composition-adapters";
import {
  clearAllPreviewAudioGains,
  setPreviewAudioGain,
} from "@/lib/remotion/preview-audio-gain-store";
import {
  isEditorMixedAudioElement,
  resolvePreviewAudioPlaybackState,
  shouldCorrectPreviewAudioDrift,
  TimelinePreviewAudioEngine,
} from "./timeline-preview-audio-engine";

const element: CompositionElement = {
  id: "music-1",
  type: "music",
  source_url: "/api/media/music.mp3",
  props: null,
  timeline_start: 2,
  duration: 4,
  lane_key: "music_0",
  lane_index: 0,
  volume: 0.8,
  playback_rate: 1,
  trim_start: 0.5,
  trim_end: 4.5,
  fade_in: 1,
  fade_out: 1,
};

test.afterEach(() => clearAllPreviewAudioGains());

test("editor mixer owns standalone audio lanes but not video media", () => {
  assert.equal(isEditorMixedAudioElement(element), true);
  assert.equal(isEditorMixedAudioElement({
    ...element,
    type: "video_clip",
    lane_key: "visual_0",
  }), false);
});

test("maps Player time to a trimmed source clock without changing clip identity", () => {
  assert.equal(resolvePreviewAudioPlaybackState(element, 1).active, false);
  const active = resolvePreviewAudioPlaybackState(element, 3);
  assert.equal(active.active, true);
  assert.equal(active.sourceTimeSeconds, 1.5);
  assert.equal(active.gain, 0.8);
  assert.equal(resolvePreviewAudioPlaybackState(element, 6).active, false);
});

test("applies fades and live inspector gain in the persistent channel", () => {
  const opening = resolvePreviewAudioPlaybackState(element, 2);
  assert.equal(opening.gain, 0);

  setPreviewAudioGain(element.id, 1.2);
  const middle = resolvePreviewAudioPlaybackState(element, 4);
  assert.equal(middle.gain, 1.2);

  const tail = resolvePreviewAudioPlaybackState(element, 5.5);
  assert.equal(tail.gain, 0.6);
});

test("only corrects material clock drift", () => {
  assert.equal(shouldCorrectPreviewAudioDrift(2, 2.08), false);
  assert.equal(shouldCorrectPreviewAudioDrift(2, 2.2), true);
  assert.equal(shouldCorrectPreviewAudioDrift(Number.NaN, 2), true);
});

test("reuses the MediaElementSource when React replays the channel effect", () => {
  const originalWindow = globalThis.window;
  let sourceCreations = 0;
  let loadRequests = 0;
  const source = {
    connect() {},
    disconnect() {},
  };
  const makeGain = () => ({
    gain: { value: 1 },
    connect() {},
    disconnect() {},
  });
  class FakeAudioContext {
    destination = {};
    createGain = makeGain;
    createMediaElementSource() {
      sourceCreations += 1;
      return source;
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudioContext },
  });
  const audio = {
    paused: true,
    readyState: 0,
    error: null,
    load() { loadRequests += 1; },
    currentTime: 0,
    playbackRate: 1,
    preload: "",
    crossOrigin: "",
    pause() {},
    play() {
      return Promise.resolve();
    },
  } as unknown as HTMLAudioElement;
  const engine = new TimelinePreviewAudioEngine();

  try {
    engine.register(element, audio);
    engine.unregister(element.id);
    engine.register(element, audio);
    assert.equal(sourceCreations, 1);
    const initialLoads = loadRequests;
    engine.retryPendingChannels();
    assert.equal(loadRequests, initialLoads + 1, "retry restarts stalled audio loading");
    Object.assign(audio, { readyState: 4 });
    engine.retryPendingChannels();
    assert.equal(loadRequests, initialLoads + 1, "retry leaves buffered audio intact");
    Object.assign(audio, { readyState: 0, paused: false });
    engine.retryPendingChannels();
    assert.equal(loadRequests, initialLoads + 1, "retry must not reset playing audio");
    Object.assign(audio, { readyState: 4, paused: true, error: { code: 2 } });
    engine.retryPendingChannels();
    assert.equal(loadRequests, initialLoads + 2, "a failed channel can be reloaded");
    Object.assign(audio, { currentTime: 0, error: null });
    engine.updateElement({ ...element, timeline_start: 0 });
    assert.equal(audio.currentTime, 0.5, "metadata resync restores the source trim");
    engine.updateElement({ ...element, timeline_start: 0, fade_in: 0 });
    let clock: (() => number | null) | null = null;
    const listeners = new Map<string, (event: {detail: {frame: number}}) => void>();
    const detach = engine.attachPlayer({
      setPreviewClock(value: (() => number | null) | null) { clock = value; },
      getVolume: () => 1, isMuted: () => false, getPlaybackRate: () => 1, getCurrentFrame: () => 0,
      isPlaying: () => true, addEventListener(name: string, fn: (event: {detail: {frame: number}}) => void) { listeners.set(name, fn); }, removeEventListener() {},
    } as Parameters<TimelinePreviewAudioEngine["attachPlayer"]>[0]);
    assert.equal(clock!(), null, "a paused decoder must not pin the playing timeline clock");
    Object.assign(audio, { paused: false });
    assert.notEqual(clock!(), null, "a running decoded source may own the clock");
    listeners.get("waiting")!({detail:{frame:0}});
    Object.assign(audio, {paused:true,currentTime:.52});
    listeners.get("frameupdate")!({detail:{frame:0}});
    assert.equal(audio.currentTime,.52,"temporary waiting must not trigger exact paused seeking");
    listeners.get("pause")!({detail:{frame:0}});
    assert.equal(audio.currentTime,.5,"explicit Pause still positions exactly");
    detach();
    engine.unregister(element.id);
    const beforeFuture = loadRequests;
    engine.register({ ...element, timeline_start: 100 }, audio);
    assert.equal(loadRequests, beforeFuture, "distant audio must not compete with startup downloads");
    assert.equal(audio.preload, "none");
    engine.restartLoad(element.id);
    assert.equal(loadRequests, beforeFuture, "a remount restart must not load distant audio (Chrome ignores preload=none on load())");
    Object.assign(audio, { currentTime: 0, paused: true, readyState: 4 });
    engine.updateElement({ ...element, timeline_start: 1.5 });
    assert.equal(audio.preload, "auto", "upcoming audio warms without pressing Play");
    const beforeRestart = loadRequests;
    engine.restartLoad(element.id);
    assert.equal(loadRequests, beforeRestart + 1, "a remount restart reloads a warm channel");
    assert.equal(audio.currentTime, .5, "upcoming audio seeks to its source trim before its entrance");
    assert.equal(audio.paused, true, "warming must not start audible playback");

  } finally {
    engine.dispose();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("preview audio is externalized while render audio stays in the composition", () => {
  const timelineDir = path.dirname(new URL(import.meta.url).pathname);
  const shell = fs.readFileSync(path.join(timelineDir, "TimelinePlaybackShell.tsx"), "utf8");
  const mixer = fs.readFileSync(path.join(timelineDir, "TimelinePreviewAudioMixer.tsx"), "utf8");
  const composition = fs.readFileSync(
    path.join(timelineDir, "../../../lib/remotion/TimelineComposition.tsx"),
    "utf8",
  );

  assert.match(shell, /externalAudioPreview/);
  assert.match(mixer, /key=\{`\$\{element\.id\}:\$\{element\.source_url\}`\}/);
  assert.match(composition, /\(!externalAudioPreview \|\| isRendering\)/);
});

test("cleaned video narration keeps one preview topology and follows live gain", () => {
  const timelineDir = path.dirname(new URL(import.meta.url).pathname);
  const composition = fs.readFileSync(
    path.join(timelineDir, "../../../lib/remotion/TimelineComposition.tsx"),
    "utf8",
  );

  assert.match(composition, /function PreviewNarrationSegment\(/);
  assert.match(composition, /const previewGain = usePreviewAudioGain\(element\.id\)/);
  assert.match(composition, /shouldUseWebAudioForTimelineTrack\(\s*isRendering,\s*authoredTopologyUsesWebAudio/);
  assert.match(composition, /audioVolume\(element, durationInFrames, liveGain\)/);
  assert.match(composition, /title=\{`preview-narration:/);
  assert.equal(
    (composition.match(/speedSegments=\{playbackSegments\}/g) ?? []).length,
    2,
    "persistent picture and narration decoders must share the same fallback-safe source clock",
  );
});
