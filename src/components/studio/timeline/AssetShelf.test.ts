import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCaptionElementPayload,
  buildMusicElementPayload,
  buildSfxElementPayload,
  buildVisualElementPayload,
  buildVoiceElementPayload,
} from "@/components/studio/timeline/asset-shelf-payloads";
import { composeCaptionProps } from "@/lib/timeline/captions";

const beats = [
  { id: "beat-1", sort_order: 0, beat_label: "Hook", duration_seconds: 4 },
  { id: "beat-2", sort_order: 1, beat_label: "Turn", duration_seconds: 6 },
];

test("buildVisualElementPayload maps still and video assets to valid timeline types", () => {
  const stillPayload = buildVisualElementPayload({
    slot_id: "slot-1",
    variation_id: "variation-1",
    beat_id: "beat-1",
    type: "still",
    source_url: "https://example.com/still.png",
    still_video_url: "https://example.com/still.mp4",
    still_video_duration_seconds: 1,
    duration_seconds: null,
    is_approved: true,
    name: "Still One",
  }, beats);

  const videoPayload = buildVisualElementPayload({
    slot_id: "slot-2",
    variation_id: null,
    beat_id: "beat-2",
    type: "video_clip",
    source_url: "https://example.com/video.mp4",
    duration_seconds: 3,
    is_approved: true,
    name: "Video One",
  }, beats);

  assert.equal(stillPayload.type, "still");
  assert.equal(stillPayload.timeline_start, 0);
  assert.equal(stillPayload.duration, 5);
  assert.deepEqual(stillPayload.props, {
    intent_key: "visual:slot-1:variation-1",
    source_variation_id: "variation-1",
    render_asset_type: "still_video",
    source_still_video_url: "https://example.com/still.mp4",
    source_still_video_duration_seconds: 1,
  });
  assert.equal(videoPayload.type, "video_clip");
  assert.equal(videoPayload.timeline_start, 4);
  assert.equal(videoPayload.duration, 3);
  assert.deepEqual(videoPayload.props, {
    intent_key: "visual:slot-2",
    source_duration_seconds: 3,
  });
});

test("buildVisualElementPayload keeps uploaded visuals project-scoped until placement", () => {
  const payload = buildVisualElementPayload({
    slot_id: "upload:visual-1",
    upload_id: "visual-1",
    variation_id: null,
    beat_id: null,
    type: "still",
    source_url: "https://example.com/uploaded-still.png",
    duration_seconds: null,
    is_approved: true,
    is_uploaded: true,
    name: "Uploaded Still",
  }, beats);

  assert.equal(payload.timeline_start, 0);
  assert.deepEqual(payload.props, {
    intent_key: "upload:visual:visual-1",
  });
});

test("buildVisualElementPayload preserves global catalog identity", () => {
  const payload = buildVisualElementPayload({
    slot_id: "catalog:bookshelf_bright_library",
    variation_id: null,
    beat_id: null,
    type: "still",
    source_url: "/api/image-catalog/media/licensed/unsplash/bookshelf-bright-library.jpg",
    duration_seconds: null,
    is_approved: true,
    is_catalog: true,
    catalog_image_id: "bookshelf_bright_library",
    name: "Bright library bookshelf",
  }, beats);

  assert.deepEqual(payload.props, {
    intent_key: "catalog:image:bookshelf_bright_library",
    catalog_image_id: "bookshelf_bright_library",
  });
});

test("buildVisualElementPayload preserves reusable video catalog identity", () => {
  const payload = buildVisualElementPayload({
    slot_id: "catalog:visual:falling-dollar-bills",
    variation_id: null,
    beat_id: null,
    type: "video_clip",
    source_url: "/api/visual-catalog/media/licensed/falling-dollar-bills.mp4",
    duration_seconds: 5,
    is_approved: true,
    is_catalog: true,
    catalog_visual_id: "falling-dollar-bills",
    name: "Falling dollar bills",
  }, beats);

  assert.deepEqual(payload.props, {
    intent_key: "catalog:visual:falling-dollar-bills",
    source_duration_seconds: 5,
    catalog_visual_id: "falling-dollar-bills",
  });
});

test("buildVisualElementPayload flags analyzed alpha video for transparent rendering", () => {
  const payload = buildVisualElementPayload({
    slot_id: "local:hand-cutout.webm",
    upload_id: "hand-cutout.webm",
    variation_id: null,
    beat_id: null,
    type: "video_clip",
    source_url: "/api/projects/cutout-test/media/hand-cutout.webm",
    duration_seconds: 5,
    is_approved: true,
    is_uploaded: true,
    has_alpha_channel: true,
    name: "hand-cutout.webm",
  }, []);

  assert.equal(payload.props?.has_alpha, true);
});

test("buildVisualElementPayload preserves a baked Scratchpad outline as source provenance", () => {
  const outputSha = "b".repeat(64);
  const payload = buildVisualElementPayload({
    slot_id: "local:cutouts/scratchpad.webm",
    upload_id: "cutouts/scratchpad.webm",
    variation_id: null,
    beat_id: null,
    type: "video_clip",
    source_url: "/api/projects/cutout-test/media/cutouts/scratchpad.webm",
    duration_seconds: 5,
    is_approved: true,
    is_uploaded: true,
    has_alpha_channel: true,
    baked_sticker_outline: {
      recipe_id: "scratchpad-alpha-outline/v1",
      width: 8,
      output_sha256: outputSha,
    },
    name: "scratchpad.webm · Baked outline",
  }, []);

  assert.equal(payload.props?.has_alpha, true);
  assert.equal(payload.props?.sticker_outline, true);
  assert.equal(payload.props?.sticker_outline_baked, true);
  assert.equal(payload.props?.sticker_outline_width, 8);
  assert.equal(payload.props?.sticker_outline_recipe, "scratchpad-alpha-outline/v1");
  assert.equal(payload.props?.render_authority_sha256, outputSha);
});

test("buildVisualElementPayload preserves linked HyperFrames source and render provenance", () => {
  const fingerprint = "a".repeat(64);
  const outputSha = "b".repeat(64);
  const payload = buildVisualElementPayload({
    slot_id: "local:hyperframes/hook-title/hook-title.webm",
    upload_id: "hyperframes/hook-title/hook-title.webm",
    variation_id: null,
    beat_id: null,
    type: "video_clip",
    source_url: "/api/projects/demo/media/hyperframes/hook-title/hook-title.webm",
    duration_seconds: 3,
    is_approved: true,
    is_uploaded: true,
    has_alpha_channel: true,
    hyperframes_composition: {
      composition_id: "hook-title",
      source_directory: "hyperframes/hook-title",
      source_fingerprint_sha256: fingerprint,
      output_sha256: outputSha,
      receipt_path: "preprocess/hyperframes/hook-title.json",
    },
    name: "hook-title.webm",
  }, []);

  assert.deepEqual(payload.props, {
    intent_key: "upload:visual:hyperframes/hook-title/hook-title.webm",
    source_duration_seconds: 3,
    has_alpha: true,
    hyperframes_composition_id: "hook-title",
    hyperframes_source_directory: "hyperframes/hook-title",
    hyperframes_source_fingerprint_sha256: fingerprint,
    hyperframes_receipt_path: "preprocess/hyperframes/hook-title.json",
    render_authority_sha256: outputSha,
  });
});

test("buildVisualElementPayload preserves the shared source-context reference", () => {
  const fingerprint = "a".repeat(64);
  const payload = buildVisualElementPayload({
    slot_id: "local:source.mov",
    upload_id: "source.mov",
    variation_id: null,
    beat_id: null,
    type: "video_clip",
    source_url: "/api/projects/context-test/media/source.mov",
    duration_seconds: 5,
    is_approved: true,
    is_uploaded: true,
    media_context_ref: { context_id: `sha256:${fingerprint}`, timebase: "source_seconds" },
    name: "source.mov",
  }, []);

  assert.deepEqual(payload.props?.media_context_ref, { context_id: `sha256:${fingerprint}`, timebase: "source_seconds" });
  assert.equal(payload.props?.source_sha256, fingerprint);
});

test("buildVoiceElementPayload maps voice clips to vo_segment lanes", () => {
  const narratorPayload = buildVoiceElementPayload({
    clip_id: "clip-1",
    beat_id: "beat-1",
    beat_sort_order: 0,
    beat_label: "Hook",
    clip_name: "Narration",
    source_url: "https://example.com/voice.mp3",
    duration_seconds: 2.5,
    is_selected: true,
    character_id: null,
  }, beats);

  const characterPayload = buildVoiceElementPayload({
    clip_id: "clip-2",
    beat_id: "beat-2",
    beat_sort_order: 1,
    beat_label: "Turn",
    clip_name: "Dialogue",
    source_url: "https://example.com/dialogue.mp3",
    duration_seconds: null,
    is_selected: true,
    character_id: "char-1",
  }, beats);

  assert.equal(narratorPayload.type, "vo_segment");
  assert.equal(narratorPayload.lane_key, "audio_narrator");
  assert.equal(narratorPayload.lane_index, 1);
  assert.equal(characterPayload.type, "vo_segment");
  assert.equal(characterPayload.lane_key, "audio_character_char-1");
  assert.equal(characterPayload.lane_index, 2);
  assert.equal(characterPayload.timeline_start, 4);
});

test("buildCaptionElementPayload maps captions to caption_text and beat duration fallback", () => {
  const payload = buildCaptionElementPayload({
    caption_id: "caption-1",
    beat_id: "beat-2",
    beat_sort_order: 1,
    beat_label: "Turn",
    text: "A caption line",
    duration_seconds: null,
  }, beats);

  assert.equal(payload.type, "caption_text");
  assert.equal(payload.timeline_start, 4);
  assert.equal(payload.duration, 6);
  assert.deepEqual(payload.props, {
    intent_key: "caption:caption-1",
    ...composeCaptionProps("A caption line"),
  });
});

test("buildMusicElementPayload keeps music on the music lane", () => {
  const payload = buildMusicElementPayload({
    track_id: "track-1",
    track_name: "Cue",
    source_url: "https://example.com/music.mp3",
    duration_seconds: null,
  }, beats);

  assert.equal(payload.type, "music");
  assert.equal(payload.timeline_start, 0);
  assert.equal(payload.duration, 30);
  assert.equal(payload.lane_key, "music_0");
  assert.equal(payload.lane_index, 0);
});

test("buildMusicElementPayload carries catalog version and cue guidance", () => {
  const payload = buildMusicElementPayload({
    track_id: "catalog:bright-turn",
    track_name: "Bright Turn",
    source_url: null,
    duration_seconds: null,
    catalog_track_id: "bright_turn",
    artist: "Example Artist",
    moods: ["hopeful", "warm"],
    good_for: ["Earned reveal"],
    avoid_for: ["Dense dialogue"],
    recommended_version_id: "reels_edit",
    versions: [{
      id: "reels_edit",
      label: "Reels edit",
      source_url: "https://example.com/reels.mp3",
      file_available: true,
      source_status: "licensed",
      delivery_mode: "embedded",
      platforms: ["instagram"],
      cues: [{
        id: "reveal",
        label: "Reveal hook",
        start_seconds: 41.8,
        end_seconds: 55.8,
        role: "reveal",
        use_when: ["The cover lands on the downbeat"],
        avoid_when: [],
      }],
    }],
  }, beats, { versionId: "reels_edit", cueId: "reveal" });

  assert.equal(payload.source_url, "https://example.com/reels.mp3");
  assert.equal(payload.duration, 14);
  assert.equal(payload.trim_start, 41.8);
  assert.equal(payload.trim_end, null);
  assert.equal(payload.props?.music_catalog_track_id, "bright_turn");
  assert.equal(payload.props?.music_catalog_version_id, "reels_edit");
  assert.equal(payload.props?.music_catalog_cue_id, "reveal");
  assert.equal(payload.props?.music_catalog_cue_end_seconds, 55.8);
  assert.deepEqual(payload.props?.music_catalog_moods, ["hopeful", "warm"]);
});

test("buildSfxElementPayload maps uploaded SFX to sound_effect elements", () => {
  const payload = buildSfxElementPayload({
    track_id: "sfx-1",
    track_name: "Whoosh",
    source_url: "https://example.com/whoosh.mp3",
    duration_seconds: 1.2,
  });

  assert.equal(payload.type, "sound_effect");
  assert.equal(payload.lane_key, "sound_effect_0");
  assert.equal(payload.lane_index, 0);
  assert.equal(payload.duration, 1.2);
  assert.deepEqual(payload.props, { intent_key: "sfx:sfx-1" });
});

test("buildSfxElementPayload preserves searchable catalog metadata", () => {
  const payload = buildSfxElementPayload({
    track_id: "catalog:short_swipe",
    track_name: "Short Whoosh Swipe",
    source_url: "/api/sfx-catalog/media/licensed/short-swipe.wav",
    duration_seconds: 0.9,
    catalog_sfx_id: "short_swipe",
    category: "transition",
    tags: ["whoosh", "text"],
    good_for: ["Fast text entrance"],
    avoid_for: ["Heavy reveal"],
    editorial: { motion: "in", intensity: "light", texture: ["airy"] },
  });

  assert.equal(payload.type, "sound_effect");
  assert.equal(payload.props?.sfx_catalog_id, "short_swipe");
  assert.equal(payload.props?.timeline_label, "Short Whoosh Swipe");
  assert.equal(payload.props?.timeline_subtitle, "transition · in · light");
  assert.deepEqual(payload.props?.sfx_catalog_tags, ["whoosh", "text"]);
});
