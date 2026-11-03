import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "./types";
import {
  buildCaptionPayloadsFromAudioLane,
  insertLaneBefore,
  nextCaptionsLaneKey,
} from "./caption-lane-from-audio";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
    project_id: overrides.project_id ?? "project-1",
    type: overrides.type ?? "vo_segment",
    source_url: overrides.source_url ?? "https://example.com/voice.mp3",
    props: overrides.props ?? {},
    beat_id: overrides.beat_id ?? "beat-1",
    voice_clip_id: overrides.voice_clip_id ?? "clip-1",
    character_id: overrides.character_id ?? "char-1",
    timeline_start: overrides.timeline_start ?? 3,
    duration: overrides.duration ?? 2.5,
    lane_key: overrides.lane_key ?? "audio_character_char-1",
    lane_index: overrides.lane_index ?? 0,
    trim_start: overrides.trim_start ?? 0,
    trim_end: overrides.trim_end ?? null,
    volume: overrides.volume ?? 1,
    fade_in: overrides.fade_in ?? 0,
    fade_out: overrides.fade_out ?? 0,
    playback_rate: overrides.playback_rate ?? 1,
    position_locked: overrides.position_locked ?? false,
    removed_at: overrides.removed_at ?? null,
    removed_reason: overrides.removed_reason ?? null,
    created_at: overrides.created_at ?? new Date(0).toISOString(),
    updated_at: overrides.updated_at ?? new Date(0).toISOString(),
  };
}

test("nextCaptionsLaneKey finds the next unused captions lane", () => {
  assert.equal(nextCaptionsLaneKey(["visual_0", "captions_0", "captions_2"]), "captions_1");
});

test("insertLaneBefore inserts the new lane directly before the target", () => {
  assert.deepEqual(
    insertLaneBefore(["visual_0", "audio_character_char-1", "music_0"], "audio_character_char-1", "captions_1"),
    ["visual_0", "captions_1", "audio_character_char-1", "music_0"],
  );
});

test("buildCaptionPayloadsFromAudioLane mirrors selected audio clip timing", () => {
  const payloads = buildCaptionPayloadsFromAudioLane({
    audioElements: [buildElement({ timeline_start: 5.25, duration: 1.75, voice_clip_id: "clip-7" })],
    captionLaneKey: "captions_1",
    voiceClipsById: new Map([
      ["clip-7", { id: "clip-7", beat_id: "beat-1", character_id: "char-1", script_line_text: "Look at me." }],
    ]),
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0]?.lane_key, "captions_1");
  assert.equal(payloads[0]?.timeline_start, 5.25);
  assert.equal(payloads[0]?.duration, 1.75);
  assert.equal(payloads[0]?.props.text, "Look at me.");
});
