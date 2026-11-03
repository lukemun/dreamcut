import type { TimelineElement } from "@/components/studio/timeline/types";
import { PREPARED_PICTURE_SIZE_PROP } from "@/lib/media-analysis/visual-overlap";
import { resolveLocalMediaSource } from "./audio-effects";
import { readPreparation } from "./media-preparation";

/**
 * The timeline as the spatial engine should measure it: a video clip with no probed source size takes
 * its prepared preview's size (same shape as the source) from its preparation record, the evidence the
 * editor plays from. Only those clips are copied, under a measuring-only prop that is never written;
 * every other element keeps its identity, so placed labels resolved against this list update in place.
 */
export function withPreparedPictureSize(projectId: string, elements: TimelineElement[]): TimelineElement[] {
  const sizes = new Map<string, { width: number; height: number } | null>();
  return elements.map((element) => {
    if (element.type !== "video_clip" || element.removed_at) return element;
    const props = element.props ?? {};
    if (typeof props.source_width === "number" && typeof props.source_height === "number") return element;
    const sourceUrl = typeof props.archival_source_url === "string" ? props.archival_source_url : element.source_url;
    if (!sourceUrl) return element;
    if (!sizes.has(sourceUrl)) {
      const source = resolveLocalMediaSource(projectId, sourceUrl, { allowReferencedProject: true });
      const probe = source ? readPreparation(source.sourceProjectId, source.relativePath)?.preview_probe : undefined;
      sizes.set(sourceUrl, probe && probe.width > 0 && probe.height > 0 ? { width: probe.width, height: probe.height } : null);
    }
    const size = sizes.get(sourceUrl);
    return size ? { ...element, props: { ...props, [PREPARED_PICTURE_SIZE_PROP]: size } } : element;
  });
}
