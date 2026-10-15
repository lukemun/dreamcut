import type { TimelineElement } from "./types";

export type TimelineClipMetadata = {
  title: string;
  subtitle: string;
};

function stringProp(element: TimelineElement, key: string): string | null {
  const value = element.props?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberProp(element: TimelineElement, key: string): number | null {
  const value = element.props?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function generatedAudioSubtitle(element: TimelineElement): string | null {
  const model = stringProp(element, "generation_model");
  const noise = numberProp(element, "init_noise_level");
  if (!model && noise == null) return null;
  const modelLabel = model?.includes("stable-audio")
    ? "Stable Audio"
    : model?.includes("ace-step")
      ? "ACE-Step"
      : model;
  return [modelLabel, noise == null ? null : `noise ${noise.toFixed(2)}`].filter(Boolean).join(" · ");
}

/** Human-facing metadata for audio clips on the timeline canvas. */
export function audioClipMetadata(element: TimelineElement): TimelineClipMetadata | null {
  if (element.type !== "music" && element.type !== "sound_effect" && element.type !== "vo_segment" && element.type !== "vo_full") {
    return null;
  }

  const timelineLabel = stringProp(element, "timeline_label");
  const timelineSubtitle = stringProp(element, "timeline_subtitle");
  const catalogTitle = stringProp(element, "music_catalog_track_title");
  const sfxCatalogTitle = stringProp(element, "sfx_catalog_title");
  const catalogArtist = stringProp(element, "music_catalog_artist");
  const catalogCue = stringProp(element, "music_catalog_cue_label");
  const catalogSubtitle = [catalogArtist, catalogCue].filter(Boolean).join(" · ");
  const authoredTitle = stringProp(element, "title");

  const fallbackTitle = element.type === "music"
    ? "Music"
    : element.type === "sound_effect"
      ? "SFX"
      : "Voiceover";
  const fallbackSubtitle = element.type === "music"
    ? "Audio"
    : element.type === "sound_effect"
      ? "SFX"
      : "Voice";

  return {
    title: timelineLabel ?? authoredTitle ?? catalogTitle ?? sfxCatalogTitle ?? fallbackTitle,
    subtitle: timelineSubtitle
      ?? generatedAudioSubtitle(element)
      ?? (catalogSubtitle || fallbackSubtitle),
  };
}
