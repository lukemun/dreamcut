import { resolveVideoPlaybackSource } from "@/lib/remotion/video-preview-source";
import { getVideoHoldSegments } from "@/lib/timeline/media";
import type { TimelineElement } from "./types";

/** Elements whose timeline thumbnails (filmstrip frames, stills, hold frames) are worth loading now. */
export function visibleThumbnailElements(elements: TimelineElement[], viewportStart: number, viewportEnd: number) {
  return elements.filter((element) => !element.removed_at
    && element.timeline_start < viewportEnd
    && element.timeline_start + element.duration > viewportStart);
}

/**
 * What the thumbnail loader would fetch for these elements. The editor replaces the element
 * array whenever any clip changes (preview-cache polls, peaks, durations), and restarting on
 * each new array tore down a half-read filmstrip decoder and re-requested the same preview.
 * The loader restarts only when this key changes.
 */
export function thumbnailWorkKey(visible: TimelineElement[]) {
  const parts: string[] = [];
  for (const element of visible) {
    const holds = [element.props?.overflow_hold_frame_url, element.props?.overflow_hold_start_frame_url]
      .filter((url): url is string => typeof url === "string" && url.length > 0);
    if (element.type === "still" && typeof element.source_url === "string" && element.source_url.length > 0) holds.push(element.source_url);
    let video = "";
    if (element.type === "video_clip" && typeof element.source_url === "string" && element.source_url.length > 0) {
      const preview = resolveVideoPlaybackSource(element, element.source_url, false) ?? "";
      video = [element.source_url, preview, element.trim_start, element.trim_end, element.playback_rate,
        element.duration, getVideoHoldSegments(element).playableDuration].join("|");
    }
    if (holds.length === 0 && !video) continue;
    parts.push(`${element.id}@${element.timeline_start}:${holds.join(",")}:${video}`);
  }
  return parts.join("\n");
}
