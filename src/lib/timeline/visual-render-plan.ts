import { readVisualAssetMetadata, stripStillVideoWrapperMetadata } from "@/lib/timeline/visual-asset-metadata";
import { writeVideoClipTimingMetadata } from "@/lib/timeline/video-clip-metadata";
import type { CompositionElement } from "@/lib/render/composition-adapters";

export type VisualRenderPlan =
  | {
    renderKind: "still";
    sourceUrl: string | null;
    mediaElement: CompositionElement;
    usesLegacyStillVideoWrapper: false;
  }
  | {
    renderKind: "video";
    sourceUrl: string | null;
    mediaElement: CompositionElement;
    usesLegacyStillVideoWrapper: boolean;
  };

export function resolveVisualRenderPlan(element: CompositionElement): VisualRenderPlan {
  const metadata = readVisualAssetMetadata(element.props);
  const isLegacyStillVideoWrapper =
    element.type === "still"
    && metadata.renderAssetType === "still_video"
    && typeof metadata.sourceStillVideoUrl === "string"
    && metadata.sourceStillVideoUrl.length > 0;

  if (!isLegacyStillVideoWrapper) {
    return {
      renderKind: element.type === "video_clip" ? "video" : "still",
      sourceUrl: element.source_url,
      mediaElement: element,
      usesLegacyStillVideoWrapper: false,
    };
  }

  return {
    renderKind: "video",
    sourceUrl: metadata.sourceStillVideoUrl,
    mediaElement: {
      ...element,
      type: "video_clip",
      source_url: metadata.sourceStillVideoUrl,
      trim_start: 0,
      trim_end: null,
      playback_rate: 1,
      props: writeVideoClipTimingMetadata(
        stripStillVideoWrapperMetadata(element.props),
        { sourceDurationSeconds: metadata.sourceStillVideoDurationSeconds },
      ),
    },
    usesLegacyStillVideoWrapper: true,
  };
}
