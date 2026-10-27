import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "./types";
import { audioClipMetadata } from "./clip-labels";

function element(props: Record<string, unknown>, type: TimelineElement["type"] = "music"): TimelineElement {
  return {
    id: "clip",
    project_id: "project",
    type,
    source_url: "/audio.wav",
    props,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 2,
    lane_key: type === "sound_effect" ? "sound_effect_0" : "music_0",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0.01,
    fade_out: 0.01,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
  };
}

test("audioClipMetadata prefers explicit timeline labels", () => {
  assert.deepEqual(audioClipMetadata(element({
    timeline_label: "CONNERY",
    timeline_subtitle: "Stable Audio · noise 0.25",
    title: "Long internal title",
  })), {
    title: "CONNERY",
    subtitle: "Stable Audio · noise 0.25",
  });
});

test("audioClipMetadata describes generated audio from provenance", () => {
  assert.deepEqual(audioClipMetadata(element({
    title: "Craig candidate",
    generation_model: "fal-ai/stable-audio-3/small/music/audio-to-audio",
    init_noise_level: 0.65,
  })), {
    title: "Craig candidate",
    subtitle: "Stable Audio · noise 0.65",
  });
});

test("audioClipMetadata uses catalog metadata before generic labels", () => {
  assert.deepEqual(audioClipMetadata(element({
    music_catalog_track_title: "Night Drive",
    music_catalog_artist: "Example Artist",
    music_catalog_cue_label: "Opening sting",
  })), {
    title: "Night Drive",
    subtitle: "Example Artist · Opening sting",
  });
});

test("audioClipMetadata retains a useful SFX fallback", () => {
  assert.deepEqual(audioClipMetadata(element({}, "sound_effect")), {
    title: "SFX",
    subtitle: "SFX",
  });
});
