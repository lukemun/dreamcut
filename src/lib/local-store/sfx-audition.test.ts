import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { editorAgentOperationSchema } from "@/lib/agent/timeline-editor-agent-apply";
import type { SfxCatalogEntry } from "@/lib/sfx-catalog/schema";
import { expandTokens, searchSfxCatalog, sfxTokens } from "@/lib/sfx-catalog/search";

import { cueContext, freeSfxLane, placeAtCue, renderAuditionImage } from "./sfx-audition";

function entry(id: string, overrides: Partial<SfxCatalogEntry> = {}): SfxCatalogEntry {
  return {
    id,
    title: id,
    category: "ui",
    tags: [],
    good_for: [],
    avoid_for: [],
    file: `licensed/${id}.wav`,
    source_status: "licensed",
    duration_seconds: 0.8,
    sample_rate_hz: 48000,
    channels: 2,
    source_provider: "test",
    source_url: "https://example.com",
    acquired_at: "2026-10-11",
    analysis: {
      version: "t", codec: "pcm_16", integrated_lufs: -12, active_start_seconds: 0, active_end_seconds: 0.6,
      peak_time_seconds: 0.2, peak_position: "front", spectral_centroid_hz: 2000, audibility_status: "audible",
      analyzed_at: "2026-10-11T00:00:00.000Z",
    },
    ...overrides,
  };
}

function element(id: string, type: string, start: number, duration: number, extra: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id, project_id: "demo", type, source_url: null, props: null, beat_id: null, character_id: null,
    timeline_start: start, duration, lane_key: type === "caption_text" ? "captions_0" : type === "sound_effect" ? "sound_effect_0" : "visual_1",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: "", updated_at: "", ...extra,
  };
}

test("search expands editor synonyms and ranks by words, role and audibility", () => {
  assert.ok(expandTokens(sfxTokens("soft swoosh")).has("whoosh"));
  const entries = [
    entry("whoosh-air", { title: "Whoosh Air", tags: ["transition"], editorial: { motion: "in_out", intensity: "light", texture: [] } }),
    entry("boom", { title: "Cinematic Boom", tags: ["impact"] }),
    entry("silent-whoosh", { title: "Whoosh Silent", analysis: { ...entry("x").analysis!, audibility_status: "silent" } }),
    entry("long-whoosh", { title: "Whoosh Long", duration_seconds: 6, analysis: { ...entry("x").analysis!, active_end_seconds: 5.5 } }),
  ];
  const results = searchSfxCatalog(entries, { query: "swoosh", role: "movement", max_duration_seconds: 2 });
  assert.deepEqual(results.map((hit) => hit.id), ["whoosh-air", "silent-whoosh"]);
  assert.equal(results[0]!.source_url, "/api/sfx-catalog/media/licensed/whoosh-air.wav");
  assert.deepEqual(searchSfxCatalog(entries, { query: "accordion" }), []);
});

test("cue context reports entrances, exact words and the next speech start", () => {
  const elements = [
    element("bg", "video_clip", 0, 10, { lane_key: "visual_0", props: { title: "Background" } }),
    element("title", "still", 5, 3, { props: { title: "Logo" } }),
    element("cap", "caption_text", 4, 4, { props: { text: "hello there friend", wordTimings: [
      { text: "hello", start: 0, end: 0.4 }, { text: "there", start: 1.4, end: 1.8 }, { text: "friend", start: 1.9, end: 2.3 },
    ] } }),
    element("music", "music", 0, 20, { lane_key: "music_0", volume: 0.3 }),
  ];
  const context = cueContext(elements, 5);
  assert.equal(context.picture.find((item) => item.element_id === "title")?.at_cue, "enters");
  assert.equal(context.picture.find((item) => item.element_id === "bg")?.at_cue, "on_screen");
  assert.equal(context.speech_basis, "words");
  assert.equal(context.speaking_at_cue, false, "the pause between words is not speech");
  assert.equal(context.speech_after_start_seconds, 5.4);
  assert.equal(context.speech_before_end_seconds, 4.4);
  assert.deepEqual(context.audio.map((item) => item.element_id), ["music"]);

  const captionsOnly = cueContext([element("cap", "caption_text", 4, 4, { props: { text: "hi" } })], 5);
  assert.equal(captionsOnly.speech_basis, "captions");
  assert.equal(captionsOnly.speaking_at_cue, true);
});

test("placement puts the measured peak on the cue, trims the head near zero and levels", () => {
  const hit = searchSfxCatalog([entry("pop")], { role: "entrance_accent" })[0]!;
  const quiet = cueContext([], 3);
  const placed = placeAtCue(hit, quiet);
  assert.equal(placed.timeline_start, 2.8);
  assert.equal(placed.source_start_seconds, 0);
  assert.equal(placed.volume, 0.5, "-12 LUFS leveled to -18 is half gain");

  const early = placeAtCue(hit, cueContext([], 0.05));
  assert.equal(early.timeline_start, 0);
  assert.equal(early.source_start_seconds, 0.15);

  const overSpeech = placeAtCue(hit, cueContext([element("cap", "caption_text", 2.5, 2, { props: { text: "x" } })], 3));
  assert.equal(overSpeech.volume, 0.25);
});

test("free lane skips busy sound effect lanes", () => {
  const elements = [element("a", "sound_effect", 2, 1), element("b", "sound_effect", 0, 10, { lane_key: "sound_effect_1" })];
  assert.deepEqual(freeSfxLane(elements, 2.5, 3), { lane_key: "sound_effect_2", lane_index: 2 });
  assert.deepEqual(freeSfxLane(elements, 5, 6), { lane_key: "sound_effect_0", lane_index: 0 });
});

test("the returned operation shape validates as a proposal create_audio", () => {
  const hit = searchSfxCatalog([entry("pop")], { role: "entrance_accent" })[0]!;
  const placed = placeAtCue(hit, cueContext([], 3));
  const operation = {
    element_id: "6f1c1f62-4f36-4a8e-9a49-6f6f0f4c2a11",
    create_audio: {
      type: "sound_effect", title: hit.title, source_url: hit.source_url, timeline_start: placed.timeline_start,
      source_duration_seconds: hit.duration_seconds, source_start_seconds: placed.source_start_seconds,
      source_end_seconds: placed.source_end_seconds, lane_key: "sound_effect_0", lane_index: 0, volume: placed.volume,
    },
  };
  assert.equal(editorAgentOperationSchema.safeParse(operation).success, true);
});

test("the alignment image renders as a PNG", async () => {
  const hit = searchSfxCatalog([entry("pop")], { role: "entrance_accent" })[0]!;
  const context = cueContext([element("title", "still", 3, 2, { props: { title: "Logo" } })], 3);
  const image = await renderAuditionImage(context, [{ label: "Pop", placement: placeAtCue(hit, context), envelope: [0, 0.5, 1, 0.4, 0.1] }]);
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
});
