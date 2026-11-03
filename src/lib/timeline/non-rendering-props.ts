/**
 * Element props that never change a rendered pixel, so every renderer admits them without
 * an implementation: bookkeeping, provenance, review records, audio-only data, and inputs
 * that shared resolvers (speech sync, caption links, compounds, semantic layout, the caption
 * resolver both renderers use) apply before drawing.
 *
 * A prop belongs here only if no renderer reads it while drawing; `non-rendering-props.test.ts`
 * scans the Standard and GPU renderers to keep that true. Anything a renderer draws must be
 * implemented on Browser GPU instead (docs/architecture/playback-rendering.md#gpu-first-feature-rule).
 */
export const NON_RENDERING_ELEMENT_PROPS: ReadonlySet<string> = new Set([
  // Names, notes and provenance
  "label", "timeline_label", "beat_label", "editorial_note", "editorial_role", "effect_role", "source_effect_role",
  "effect_recipe", "effect_receipt", "effect_source_sha256", "source_effect_recipe", "source_provenance",
  "source_credit", "source_manifest_id", "source_page", "mask_recipe", "color_managed_recipe",
  "presenter_edit_map_path", "render_authority_required", "benchmark_order",
  // Library provenance written when a clip is placed from the Library (asset-shelf-payloads.ts)
  "catalog_visual_id", "catalog_image_id", "source_variation_id",
  // Probe records (source_width/height are NOT here: captions lay out inside the source's
  // picture area, so both renderers must read them; see gpu caption coordinate space)
  "source_aspect_ratio", "source_probe_width", "source_probe_height", "source_probe_fps", "source_lufs",
  // Edit history and selection bookkeeping
  "split_from_id", "duplicated_from_id", "caption_split_source_element_id", "intentional_visual_overlay",
  // The proposal block and role a clip was compiled from (proposal-blocks.ts), so a later card can reopen its settings.
  "block_ref",
  // media_motion_preset records which motion preset compiled the clip's keyframes; the keyframes draw.
  "media_motion_preset", "rough_cut_source_id", "selection", "selected_for", "custom_cutout_id",
  "source_segments", "source_segment_index", "source_segment_count", "source_segment_reason",
  "source_segment_incoming_word", "source_segment_outgoing_word",
  // Audition records (resolved by audition compiles)
  "audition_winner", "audition_section_id", "audition_candidate_id",
  // Compound bookkeeping. compound_preview is a preview-acceleration receipt that
  // projectCompoundPreviews (timeline/compound-preview.ts) resolves before Standard
  // draws; it bakes the members' own pictures. Browser GPU draws each member from its
  // own verified proxy instead, which is the same picture, so no drawing code reads it.
  "compound_clip_id", "compound_clip_label", "compound_preview", "runtime_compound_preview", "runtime_compound_clip_id",
  // Preview proxy receipts (proxy choice is validated separately)
  "preview_proxy_receipt", "preview_proxy_width", "preview_proxy_height", "preview_proxy_duration_seconds",
  "preview_audio_recipe",
  // Audio-only data (handled by the shared audio mixer)
  "detached_audio_original_volume", "detached_audio_original_volume_envelope",
  "follows_visual", "motion_timing", "ripple_after", "voice_enhancement", "voice_enhancement_original_source_url", "voice_enhancement_original_preview_audio_source_url",
  "voice_enhancement_original_render_authority_source_url", "speech_sync_binding", "pitch_semitones",
  // Placement relations (placement-relation.ts) resolve into absX/absY or media offsets before drawing
  "place",
  // Caption review, alignment and timing records (applied by speech sync and the caption resolver)
  "caption_alignment_path", "alignment_path", "caption_alignment_sha256", "caption_audio_binding",
  "caption_source_element_id", "speech_caption_source_element_id", "caption_source_start_seconds",
  "caption_source_end_seconds", "caption_source_playback_rate", "caption_hold_until_source_seconds",
  "caption_source_text", "caption_timing", "caption_display_timing", "caption_grouping", "caption_word_count",
  "caption_word_limit", "caption_cps", "caption_fast_verbatim", "caption_rapid_fragment", "caption_review_only",
  "caption_single_line_contract", "caption_follow_audio",
  // Player mount lookahead: when a Sequence mounts, never what it draws.
  "preview_premount_seconds",
  // Legacy flip flags: no renderer draws them; resolved-media-scene only reports them
  // as unsupported for analytic geometry (media_orientation/media_mirror are the controls).
  "flip_horizontal", "flip_vertical", "flip_x", "flip_y",
  // Resolved upstream or never drawn by any renderer
  "crowd_layout", "crowd_instance", "disabled", "fit", "media_fit", "paper_stack", "concentric_stack",
  "opening_emphasis", "opening_emphasis_owner", "opening_emphasis_timeline_seconds",
  "glass_lens_enabled", "glass_lens_center_x", "glass_lens_center_y", "glass_lens_radius_x", "glass_lens_radius_y",
  "glass_lens_feather", "glass_lens_magnification_enabled", "glass_lens_background_blur_enabled",
  "glass_lens_background_dim_enabled", "glass_lens_background_saturation_enabled",
]);
