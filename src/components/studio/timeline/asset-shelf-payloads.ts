import type { TimelineElementType } from "@/lib/timeline/contracts";
import { composeCaptionProps, type CaptionFontPreset } from "@/lib/timeline/captions";
import { captionLookStyleProps, type CaptionLook, type TextPreset } from "@/lib/timeline/panel-text-presets";
import { laneIndexFromKey, MUSIC_LANE_KEY, SOUND_EFFECT_LANE_KEY } from "@/lib/timeline/lanes";
import { writeVideoClipTimingMetadata } from "@/lib/timeline/video-clip-metadata";
import { writeVisualAssetMetadata } from "@/lib/timeline/visual-asset-metadata";
import type { BeatMarker } from "./types";

export type ElementCreatePayload = {
  type: TimelineElementType;
  source_url: string | null;
  beat_id: string | null;
  voice_clip_id?: string | null;
  character_id: string | null;
  timeline_start: number;
  /** Null lets the server take a video's length from its prepared source. */
  duration: number | null;
  trim_start?: number;
  trim_end?: number | null;
  lane_key: string;
  lane_index: number;
  props?: Record<string, unknown>;
};

export type VisualAsset = {
  import_search_text?: string;
  preparation?: { state: "imported" | "preparing" | "ready" | "failed"; error?: string; render?: string };
  slot_id: string;
  upload_id?: string | null;
  variation_id: string | null;
  beat_id: string | null;
  type: "still" | "video_clip";
  source_url: string | null;
  still_video_url?: string | null;
  still_video_duration_seconds?: number | null;
  end_still_video_url?: string | null;
  end_still_video_duration_seconds?: number | null;
  duration_seconds: number | null;
  is_approved: boolean;
  is_uploaded?: boolean;
  is_catalog?: boolean;
  catalog_image_id?: string | null;
  catalog_visual_id?: string | null;
  file_available?: boolean;
  /** False for a shared catalog clip that downloads from DreamCut Cloud the first time it is played or added. */
  downloaded?: boolean;
  catalog_metadata?: Record<string, unknown>;
  has_alpha_channel?: boolean;
  baked_sticker_outline?: {
    recipe_id: "scratchpad-alpha-outline/v1";
    width: number;
    output_sha256: string;
  };
  hyperframes_composition?: {
    composition_id: string;
    source_directory: string;
    source_fingerprint_sha256: string;
    output_sha256: string;
    receipt_path: string;
  };
  media_context_ref?: { context_id: string; timebase: "source_seconds" };
  name: string;
};

export type VoiceClip = {
  clip_id: string;
  beat_id: string;
  beat_sort_order: number;
  beat_label: string;
  clip_name: string;
  source_url: string | null;
  duration_seconds: number | null;
  is_selected: boolean;
  character_id: string | null;
};

export type MusicTrack = {
  import_search_text?: string;
  track_id: string;
  track_name: string;
  source_url: string | null;
  duration_seconds: number | null;
  catalog_track_id?: string;
  artist?: string | null;
  description?: string | null;
  moods?: string[];
  energy?: "low" | "medium" | "high" | "dynamic" | null;
  tempo_bpm?: number | null;
  textures?: string[];
  vocals?: "instrumental" | "vocal" | "mixed" | "unknown";
  good_for?: string[];
  avoid_for?: string[];
  recommended_version_id?: string | null;
  delivery_target?: string;
  delivery_platform?: "instagram" | "tiktok" | "youtube" | "other" | null;
  versions?: MusicTrackVersion[];
};

export type MusicTrackCue = {
  id: string;
  label: string;
  start_seconds: number;
  end_seconds: number;
  role: "intro" | "bed" | "build" | "hook" | "reveal" | "outro" | "custom";
  use_when: string[];
  avoid_when: string[];
  notes?: string;
};

export type MusicTrackVersion = {
  id: string;
  label: string;
  source_url: string | null;
  file_available: boolean;
  source_status: "owned" | "licensed" | "platform_native" | "reference_only" | "unknown";
  delivery_mode: "embedded" | "platform_native";
  platforms: Array<"instagram" | "tiktok" | "youtube" | "other">;
  platform_sound_url?: string;
  platform_sound_id?: string;
  duration_seconds?: number;
  notes?: string;
  cues: MusicTrackCue[];
};

export type MusicSelection = { versionId?: string; cueId?: string };

export type SfxTrack = {
  import_search_text?: string;
  track_id: string;
  track_name: string;
  source_url: string | null;
  duration_seconds: number | null;
  catalog_sfx_id?: string;
  file_available?: boolean;
  category?: string;
  description?: string | null;
  tags?: string[];
  good_for?: string[];
  avoid_for?: string[];
  source_provider?: string;
  source_status?: "owned" | "licensed" | "reference_only";
  /** Shared catalog sounds: members-only ones need a DreamCut membership. */
  access?: "free" | "members";
  analysis?: {
    integrated_lufs?: number;
    true_peak_dbtp?: number;
    peak_position?: "front" | "center" | "tail";
  } | null;
  editorial?: {
    motion: "in" | "out" | "in_out" | "hit" | "rise" | "texture" | "other";
    intensity: "light" | "medium" | "heavy";
    texture: string[];
  } | null;
};

export type CaptionAsset = {
  caption_id: string;
  beat_id: string;
  beat_sort_order: number;
  beat_label: string;
  text: string;
  duration_seconds: number | null;
};

export type BookVisualAsset = {
  asset_id: string;
  type: "still" | "video_clip";
  source_url: string | null;
  duration_seconds: number | null;
  name: string;
  is_cover?: boolean;
};

export type BookAudioAsset = {
  asset_id: string;
  source_url: string | null;
  duration_seconds: number | null;
  name: string;
};

function beatStartTime(beatId: string, beats: BeatMarker[]): number {
  const sorted = [...beats].sort((a, b) => a.sort_order - b.sort_order);
  let t = 0;
  for (const b of sorted) {
    if (b.id === beatId) return t;
    t += b.duration_seconds ?? 5;
  }
  return t;
}

function beatDuration(beatId: string, beats: BeatMarker[]): number {
  const b = beats.find((x) => x.id === beatId);
  return b?.duration_seconds ?? 5;
}

export function getVisualIntentKey(asset: VisualAsset): string {
  if (asset.is_catalog && asset.catalog_visual_id) return `catalog:visual:${asset.catalog_visual_id}`;
  if (asset.is_catalog && asset.catalog_image_id) return `catalog:image:${asset.catalog_image_id}`;
  if (asset.is_uploaded && asset.upload_id) return `upload:visual:${asset.upload_id}`;
  return asset.variation_id ? `visual:${asset.slot_id}:${asset.variation_id}` : `visual:${asset.slot_id}`;
}

export function buildVisualElementPayload(asset: VisualAsset, beats: BeatMarker[]): ElementCreatePayload {
  let props: Record<string, unknown> = {
    intent_key: getVisualIntentKey(asset),
  };
  if (asset.type === "video_clip" && typeof asset.duration_seconds === "number" && Number.isFinite(asset.duration_seconds)) {
    props = writeVideoClipTimingMetadata(props, {
      sourceDurationSeconds: asset.duration_seconds,
    });
  }
  if (asset.type === "video_clip" && typeof asset.end_still_video_url === "string" && asset.end_still_video_url.length > 0) {
    props = writeVisualAssetMetadata(props, {
      overflowHoldStillVideoUrl: asset.end_still_video_url,
      overflowHoldStillVideoDurationSeconds:
        typeof asset.end_still_video_duration_seconds === "number" && Number.isFinite(asset.end_still_video_duration_seconds)
          ? asset.end_still_video_duration_seconds
          : null,
    });
  }
  if (asset.variation_id) {
    props.source_variation_id = asset.variation_id;
  }
  if (asset.is_catalog && asset.catalog_image_id) {
    props.catalog_image_id = asset.catalog_image_id;
  }
  if (asset.is_catalog && asset.catalog_visual_id) {
    props.catalog_visual_id = asset.catalog_visual_id;
  }
  if (asset.type === "video_clip" && asset.has_alpha_channel === true) {
    props.has_alpha = true;
  }
  if (asset.type === "video_clip" && asset.baked_sticker_outline) {
    props.sticker_outline = true;
    props.sticker_outline_baked = true;
    props.sticker_outline_width = asset.baked_sticker_outline.width;
    props.sticker_outline_recipe = asset.baked_sticker_outline.recipe_id;
    props.render_authority_sha256 = asset.baked_sticker_outline.output_sha256;
  }
  if (asset.type === "video_clip" && asset.hyperframes_composition) {
    props.hyperframes_composition_id = asset.hyperframes_composition.composition_id;
    props.hyperframes_source_directory = asset.hyperframes_composition.source_directory;
    props.hyperframes_source_fingerprint_sha256 = asset.hyperframes_composition.source_fingerprint_sha256;
    props.hyperframes_receipt_path = asset.hyperframes_composition.receipt_path;
    props.render_authority_sha256 = asset.hyperframes_composition.output_sha256;
  }
  if (asset.type === "video_clip" && asset.media_context_ref) {
    props.media_context_ref = asset.media_context_ref;
    props.source_sha256 = asset.media_context_ref.context_id.replace(/^sha256:/, "");
  }
  if (asset.type === "still" && typeof asset.still_video_url === "string" && asset.still_video_url.length > 0) {
    props = writeVisualAssetMetadata(props, {
      renderAssetType: "still_video",
      sourceStillVideoUrl: asset.still_video_url,
      sourceStillVideoDurationSeconds:
        typeof asset.still_video_duration_seconds === "number" && Number.isFinite(asset.still_video_duration_seconds)
          ? asset.still_video_duration_seconds
          : null,
    });
  }

  return {
    type: asset.type,
    source_url: asset.source_url,
    beat_id: asset.beat_id,
    voice_clip_id: null,
    character_id: null,
    timeline_start: asset.beat_id ? beatStartTime(asset.beat_id, beats) : 0,
    // A video listed before its preparation finished has no length yet; the server reads it from the source.
    duration: asset.duration_seconds ?? (asset.type === "video_clip" ? null : 5),
    lane_key: "visual_0",
    lane_index: 0,
    props,
  };
}

export function buildVoiceElementPayload(clip: VoiceClip, beats: BeatMarker[]): ElementCreatePayload {
  const laneKey = clip.character_id
    ? `audio_character_${clip.character_id}`
    : "audio_narrator";
  const laneIndex = clip.character_id ? 2 : 1;
  return {
    type: "vo_segment",
    source_url: clip.source_url,
    beat_id: clip.beat_id,
    voice_clip_id: clip.clip_id,
    character_id: clip.character_id,
    timeline_start: beatStartTime(clip.beat_id, beats),
    duration: clip.duration_seconds ?? 5,
    lane_key: laneKey,
    lane_index: laneIndex,
    props: { intent_key: `voice:${clip.clip_id}` },
  };
}

export function resolveTrackVersion(track: MusicTrack, selection?: MusicSelection): MusicTrackVersion | null {
  if (!track.versions?.length) return null;
  return track.versions.find((version) => version.id === selection?.versionId)
    ?? track.versions.find((version) => version.id === track.recommended_version_id)
    ?? track.versions[0]
    ?? null;
}

export function resolveTrackCue(version: MusicTrackVersion | null, selection?: MusicSelection): MusicTrackCue | null {
  if (!version) return null;
  return version.cues.find((cue) => cue.id === selection?.cueId) ?? version.cues[0] ?? null;
}

export function buildMusicElementPayload(
  track: MusicTrack,
  beats: BeatMarker[],
  selection?: MusicSelection,
): ElementCreatePayload {
  void beats;
  const version = resolveTrackVersion(track, selection);
  const cue = resolveTrackCue(version, selection);
  const sourceUrl = version?.source_url ?? track.source_url;
  return {
    type: "music",
    source_url: sourceUrl,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: cue
      ? cue.end_seconds - cue.start_seconds
      : version?.duration_seconds ?? track.duration_seconds ?? 30,
    trim_start: cue?.start_seconds ?? 0,
    // Timeline trim_end is a tail-trim amount, not an absolute source timestamp.
    // Cue duration plus trim_start defines the desired source window.
    trim_end: null,
    lane_key: MUSIC_LANE_KEY,
    lane_index: laneIndexFromKey(MUSIC_LANE_KEY),
    props: {
      intent_key: `music:${track.track_id}`,
      ...(track.catalog_track_id ? {
        music_catalog_track_id: track.catalog_track_id,
        music_catalog_track_title: track.track_name,
        music_catalog_artist: track.artist ?? null,
        music_catalog_version_id: version?.id ?? null,
        music_catalog_version_label: version?.label ?? null,
        music_catalog_cue_id: cue?.id ?? null,
        music_catalog_cue_label: cue?.label ?? null,
        music_catalog_cue_start_seconds: cue?.start_seconds ?? null,
        music_catalog_cue_end_seconds: cue?.end_seconds ?? null,
        music_catalog_source_status: version?.source_status ?? "unknown",
        music_catalog_delivery_mode: version?.delivery_mode ?? "embedded",
        music_catalog_platforms: version?.platforms ?? [],
        music_catalog_platform_sound_url: version?.platform_sound_url ?? null,
        music_catalog_platform_sound_id: version?.platform_sound_id ?? null,
        music_catalog_moods: track.moods ?? [],
        music_catalog_good_for: track.good_for ?? [],
        music_catalog_avoid_for: track.avoid_for ?? [],
      } : {}),
    },
  };
}

export function buildSfxElementPayload(track: SfxTrack): ElementCreatePayload {
  return {
    type: "sound_effect",
    source_url: track.source_url,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: track.duration_seconds ?? 5,
    lane_key: SOUND_EFFECT_LANE_KEY,
    lane_index: laneIndexFromKey(SOUND_EFFECT_LANE_KEY),
    props: {
      intent_key: `sfx:${track.track_id}`,
      ...(track.catalog_sfx_id ? {
        sfx_catalog_id: track.catalog_sfx_id,
        sfx_catalog_title: track.track_name,
        sfx_catalog_category: track.category ?? null,
        sfx_catalog_tags: track.tags ?? [],
        sfx_catalog_good_for: track.good_for ?? [],
        sfx_catalog_avoid_for: track.avoid_for ?? [],
        sfx_catalog_motion: track.editorial?.motion ?? null,
        sfx_catalog_intensity: track.editorial?.intensity ?? null,
        timeline_label: track.track_name,
        timeline_subtitle: [
          track.category,
          track.editorial?.motion?.replace("_", " → "),
          track.editorial?.intensity,
        ].filter(Boolean).join(" · "),
      } : {}),
    },
  };
}

export function buildCaptionElementPayload(cap: CaptionAsset, beats: BeatMarker[]): ElementCreatePayload {
  return {
    type: "caption_text",
    source_url: null,
    beat_id: cap.beat_id,
    voice_clip_id: null,
    character_id: null,
    timeline_start: beatStartTime(cap.beat_id, beats),
    duration: cap.duration_seconds ?? beatDuration(cap.beat_id, beats),
    lane_key: "captions_0",
    lane_index: beats.length + 2,
    props: { intent_key: `caption:${cap.caption_id}`, ...composeCaptionProps(cap.text) },
  };
}

export function buildBookVisualElementPayload(asset: BookVisualAsset): ElementCreatePayload {
  return {
    type: asset.type,
    source_url: asset.source_url,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration: asset.duration_seconds ?? 5,
    lane_key: "visual_0",
    lane_index: 0,
    props: { intent_key: `book_visual:${asset.asset_id}`, ...(asset.is_cover ? { is_book_cover: true } : {}) },
  };
}


/** New text from the Captions or Text panel; placement time and lane conflicts are resolved by the timeline. */
function panelTextPayload(text: string, duration: number, style: Record<string, unknown>): ElementCreatePayload {
  return {
    type: "caption_text",
    source_url: null,
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 0,
    duration,
    lane_key: "captions_0",
    lane_index: laneIndexFromKey("captions_0"),
    props: { ...composeCaptionProps(text, style) },
  };
}

export function buildCaptionLookPayload(look: CaptionLook): ElementCreatePayload {
  return panelTextPayload("Your caption here", 2, captionLookStyleProps(look));
}

export function buildTextPresetPayload(item: TextPreset): ElementCreatePayload {
  return panelTextPayload(item.sampleText, item.durationSeconds, item.props);
}

export function buildFontTextPayload(fontPreset: CaptionFontPreset): ElementCreatePayload {
  return panelTextPayload("Your text", 3, { fontPreset, styleVariant: "cinematic", positionPreset: "center", fontSizing: "fixed", fontSizePx: 72 });
}
