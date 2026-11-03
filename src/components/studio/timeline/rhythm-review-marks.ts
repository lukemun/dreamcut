import type { FrameTag } from "@/lib/review/frame-tag-types";
import { timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";
import type { TimelineElement } from "./types";

export function rhythmReviewMarks(clip: TimelineElement | undefined, marks: FrameTag[], start: number, end: number) {
  if (!clip) return [];
  return marks.filter(mark => mark.timeline_seconds >= clip.timeline_start && mark.timeline_seconds < clip.timeline_start + clip.duration)
    .map(mark => ({ ...mark, sourceTime: timelineTimeToSourceTime(clip, mark.timeline_seconds - clip.timeline_start) }))
    .filter(mark => mark.sourceTime >= start && mark.sourceTime <= end);
}
