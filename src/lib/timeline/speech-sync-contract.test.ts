import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";

import {
  assertSpeechBoundVisualTimingPatch,
  assertSpeechClockMutationIsBundled,
  assertSpeechSynchronizationAfterMutation,
  deriveSpeechClockDependentPatches,
  speechClockDependentIds,
} from "./speech-sync-contract";

function element(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
    project_id: "project",
    type: "video_clip",
    source_url: "/source.mov",
    props: {},
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 5,
    lane_key: "visual_0",
    lane_index: 0,
    trim_start: 0,
    trim_end: 0,
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

test("rejects an independent timing patch on a speech-bound presenter view", () => {
  const cutout = element({
    props: { speech_sync_binding: { source_element_id: "speech" } },
  });
  assert.throws(
    () => assertSpeechBoundVisualTimingPatch(cutout, { timeline_start: 2 }),
    /linked to speech/,
  );
  assert.doesNotThrow(() => assertSpeechBoundVisualTimingPatch(cutout, {
    timeline_start: 2,
    props: { speech_sync_binding: { source_element_id: "speech" } },
  }));
});

test("requires a speech clock move to include every linked view", () => {
  const speech = element({ id: "speech" });
  const picture = element({ id: "picture", voice_clip_id: "speech" });
  const caption = element({
    id: "caption",
    type: "caption_text",
    props: { caption_source_element_id: "speech", caption_follow_audio: true, text: "hello" },
  });
  const elements = [speech, picture, caption];
  assert.deepEqual(speechClockDependentIds(elements, "speech"), ["picture", "caption"]);
  assert.throws(
    () => assertSpeechClockMutationIsBundled({ elements, element: speech, patch: { timeline_start: 1 } }),
    /missing 1 linked/,
  );
  assert.doesNotThrow(() => assertSpeechClockMutationIsBundled({
    elements,
    element: speech,
    patch: { timeline_start: 1 },
    bundledElementIds: new Set(["speech", "picture", "caption"]),
  }));
});

test("derives and verifies real picture and caption synchronization after a speech retime", () => {
  const speech = element({ id: "speech", type: "vo_full", timeline_start: 10, trim_start: 5, playback_rate: 1 });
  const picture = element({
    id: "picture",
    timeline_start: 12,
    duration: 2,
    trim_start: 2,
    trim_end: 6,
    voice_clip_id: "speech",
    props: {
      source_duration_seconds: 10,
      custom_cutout_receipt: { source_interval_seconds: [5, 15] },
      speech_sync_binding: {
        source_element_id: "speech",
        source_start_seconds: 7,
        source_end_seconds: 9,
        source_playback_rate: 1,
      },
    },
  });
  const caption = element({
    id: "caption",
    type: "caption_text",
    timeline_start: 12,
    duration: 1,
    lane_key: "captions_0",
    voice_clip_id: "speech",
    props: {
      text: "hello",
      caption_follow_audio: true,
      caption_source_element_id: "speech",
      caption_source_start_seconds: 7,
      caption_source_end_seconds: 8,
      caption_source_playback_rate: 1,
    },
  });
  const before = [speech, picture, caption];
  const speechAfter = { ...speech, timeline_start: 20, playback_rate: 2 };
  const after = structuredClone(before);
  Object.assign(after[0], speechAfter);
  const patches = deriveSpeechClockDependentPatches(before, speech, speechAfter);
  for (const [id, patch] of patches) {
    const target = after.find((candidate) => candidate.id === id)!;
    Object.assign(target, patch);
  }

  assert.doesNotThrow(() => assertSpeechSynchronizationAfterMutation({
    before,
    after,
    touchedElementIds: new Set(["speech", "picture", "caption"]),
  }));
  assert.equal(after[1]!.timeline_start, 21);
  assert.equal(after[2]!.duration, 0.5);

  after[1]!.timeline_start += 1;
  assert.throws(() => assertSpeechSynchronizationAfterMutation({
    before,
    after,
    touchedElementIds: new Set(["speech", "picture", "caption"]),
  }), /without being synchronized/);
});

test("rejects a presenter retime that only echoes the old binding", () => {
  const speech = element({ id: "speech", type: "vo_full", timeline_start: 10, trim_start: 5 });
  const picture = element({
    id: "picture",
    timeline_start: 12,
    duration: 2,
    trim_start: 2,
    trim_end: 6,
    voice_clip_id: "speech",
    props: {
      source_duration_seconds: 10,
      custom_cutout_receipt: { source_interval_seconds: [5, 15] },
      speech_sync_binding: {
        source_element_id: "speech",
        source_start_seconds: 7,
        source_end_seconds: 9,
        source_playback_rate: 1,
      },
    },
  });
  const after = structuredClone([speech, picture]);
  after[1]!.timeline_start = 13;
  assert.throws(() => assertSpeechSynchronizationAfterMutation({
    before: [speech, picture],
    after,
    touchedElementIds: new Set(["picture"]),
  }), /without being synchronized/);
});

test("rejects a speech tail trim that evicts a linked source window", () => {
  const speech = element({
    id: "speech",
    type: "vo_full",
    duration: 10,
    trim_start: 0,
    trim_end: 0,
    props: { source_duration_seconds: 10 },
  });
  const caption = element({
    id: "caption",
    type: "caption_text",
    timeline_start: 8,
    duration: 2,
    lane_key: "captions_0",
    voice_clip_id: "speech",
    props: {
      text: "ending",
      caption_follow_audio: true,
      caption_source_element_id: "speech",
      caption_source_start_seconds: 8,
      caption_source_end_seconds: 10,
      caption_source_playback_rate: 1,
    },
  });
  assert.throws(() => deriveSpeechClockDependentPatches(
    [speech, caption],
    speech,
    { ...speech, duration: 8, trim_end: 2 },
  ), /outside the retained speech window/);
});
