import { projectFrameRate, type ProjectFrameRate } from "@/lib/timeline/frame-quantization";
import type { TimelineAspectRatioValue } from "@/lib/aspect-ratios";
import { hydratePreviewQuality } from "./preview-quality";
import {hydrateStillPreview} from './still-preview';
import { readPreviewSettings } from "./preview-settings";
import {
  activeElements,
  activeTransitions,
  readMetadata,
  readPeaks,
  type TimelineFile,
} from "@/lib/local-store/store";
import { validatePreviewProxy } from "./preview-proxy-validation";
import { hydrateVideoPreview } from "./preview-media-hydration";
import { hydratePreparedCompoundPreviews } from "./compound-preview";
import { resolveCutoutEffects } from "@/lib/timeline/cutout-effects";
import { workspaceMediaSelectionContext } from "./workspace-media-selection";

/**
 * The wire shape the editor loads a timeline from. Shared by the live timeline
 * route and the proposal-preview route so a preview is rendered through exactly
 * the same projection as the real thing — the preview differs only in the
 * TimelineFile handed in, never in how it is presented.
 */

// The preprocessing worker extracts peaks from every source that contains
// audio, including camera/video containers. Hydrate those peaks onto video
// clips too so the timeline can show where embedded speech is actually coming
// from. Browser-side extraction deliberately remains audio-file-only: video
// peaks are produced once by preprocessing instead of repeatedly decoding the
// camera original in the editor.
const WAVEFORM_TYPES = new Set(["video_clip", "music", "vo_segment", "vo_full", "sound_effect"]);

export function timelinePayload(
  projectId: string,
  timeline: TimelineFile,
  laneOrderKeysOverride?: string[],
  outputFormatOverride?: { aspect_ratio?: TimelineAspectRatioValue; frame_rate?: ProjectFrameRate; delivery_target?: string },
  mutedLaneKeysOverride?: string[],
) {
  const quality = readPreviewSettings(projectId).quality;
  const hydrate = (source: string | null, props: Record<string, unknown>) => hydratePreviewQuality(projectId, source, hydrateVideoPreview(projectId, source, props), quality);
  const metadata = readMetadata(projectId);
  const peaks = readPeaks(projectId);

  const previewTimeline = hydratePreparedCompoundPreviews(projectId, timeline);
  const elements = activeElements(previewTimeline).map((original) => {
    const effective = resolveCutoutEffects(original);
    if (effective !== original) original = { ...original, props: { ...original.props,
      runtime_cutout_effect_preview: { source_url: effective.source_url, props: Object.fromEntries(Object.entries(hydrate(effective.source_url, effective.props ?? {}))
        .filter(([key]) => key.startsWith("runtime_preview_") || key === "preview_proxy_validation")) },
    } };
    const compoundPreview = (original.props?.runtime_compound_preview
      ?? original.props?.compound_preview) as { source_url?: string } | undefined;
    const element = original.type === "video_clip" ? {
      ...original,
      props: {
        ...hydrate(original.source_url, original.props ?? {}),
        compound_proxy_validation: validatePreviewProxy(compoundPreview?.source_url, true),
      },
    } : original.type==='still'?{...original,props:hydrateStillPreview(projectId,original.source_url,original.props??{},quality)}:original.type==='caption_text'?{...original,props:{...original.props,runtime_media_fill_preview:hydrateCaptionFill(original.props??{},quality)}}:original;
    if (!WAVEFORM_TYPES.has(element.type) || !element.source_url) return element;
    const cached = peaks[element.source_url];
    if (!cached) return element;
    return {
      ...element,
      _peaks: cached.peaks,
      _source_duration: cached.source_duration_seconds,
    };
  });

  return {
    library_selection: workspaceMediaSelectionContext(projectId),
    elements,
    transitions: activeTransitions(timeline),
    beats: [],
    lane_summary: [],
    lane_defaults: metadata.lane_defaults,
    lane_order_keys: laneOrderKeysOverride ?? metadata.lane_order_keys,
    muted_lane_keys: mutedLaneKeysOverride ?? metadata.muted_lane_keys,
    // Proposals cannot change picture visibility; previews show the live hidden lanes.
    hidden_lane_keys: metadata.hidden_lane_keys,
    warnings: [],
    aspect_ratio: outputFormatOverride?.aspect_ratio ?? metadata.output_aspect_ratio,
    frame_rate: outputFormatOverride?.frame_rate ?? projectFrameRate(metadata),
    delivery_target: outputFormatOverride?.delivery_target ?? metadata.delivery_target,
    caption_safe_area_mode: metadata.caption_safe_area_mode,
  };
}

/** Measure the explicitly selected Standard caption preview; never substitute its export original. */
export function hydrateCaptionFill(props:Record<string,unknown>,quality:unknown){
 const sourceUrl=props.mediaFillVideoUrl,previewUrl=props.mediaFillVideoPreviewUrl;
 if(typeof sourceUrl!=='string'||!sourceUrl||typeof previewUrl!=='string'||!previewUrl)return null;
 const measured=validatePreviewProxy(previewUrl,false,quality);
 const alpha='has_alpha' in measured&&measured.has_alpha===true;
 return {sourceUrl,previewUrl,alpha,validation:alpha?validatePreviewProxy(previewUrl,true,quality):measured};
}
