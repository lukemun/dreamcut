import type { TimelineElement } from "@/components/studio/timeline/types";
import type { TranscriptWord } from "@/lib/instruments/captions";

export type SourceRegion = { sourceStart: number; sourceEnd: number; timelineStart: number; playbackRate: number };
export type RoughCutRemoval = {
  id: string;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  timelineEnd: number;
  reason: "dead_air" | "filler";
  transcript: string;
  confidence: number;
  approved: boolean;
};
export type EditMapRegion = SourceRegion & { timelineEnd: number };

const clean = (word: string) => word.toLowerCase().replace(/[^a-z]/g, "");

export function sourceRegions(elements: TimelineElement[], sourceGroupId: string): SourceRegion[] {
  return elements
    .filter((element) => element.removed_at == null && element.type === "video_clip" && (element.id === sourceGroupId || element.props?.rough_cut_source_id === sourceGroupId))
    .map((element) => ({
      sourceStart: element.trim_start,
      sourceEnd: element.trim_end == null
        ? element.trim_start + element.duration * element.playback_rate
        : Number(element.props?.source_duration_seconds) - element.trim_end,
      timelineStart: element.timeline_start,
      playbackRate: element.playback_rate,
    }))
    .sort((a, b) => a.sourceStart - b.sourceStart);
}

export function sourceToTimeline(sourceSeconds: number, regions: SourceRegion[]): number | null {
  const region = regions.find((candidate) => sourceSeconds >= candidate.sourceStart && sourceSeconds <= candidate.sourceEnd);
  return region == null ? null : region.timelineStart + (sourceSeconds - region.sourceStart) / region.playbackRate;
}

export function proposeRoughCuts(words: TranscriptWord[], regions: SourceRegion[], vadRegions: Array<{ start: number; end: number }> = []): RoughCutRemoval[] {
  const removals: RoughCutRemoval[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    const sourceStart = words[index]!.end + 0.08;
    const sourceEnd = words[index + 1]!.start - 0.08;
    if (sourceEnd - sourceStart < 0.1) continue;
    const timelineStart = sourceToTimeline(sourceStart, regions);
    const timelineEnd = sourceToTimeline(sourceEnd, regions);
    if (timelineStart == null || timelineEnd == null) continue;
    const overlapsSpeech = vadRegions.some((region) => region.start < sourceEnd && sourceStart < region.end);
    removals.push({
      id: `dead-air-${index}`,
      sourceStart,
      sourceEnd,
      timelineStart,
      timelineEnd,
      reason: "dead_air",
      transcript: `${words[index]!.word} […] ${words[index + 1]!.word}`,
      confidence: overlapsSpeech ? 0.65 : 0.98,
      approved: false,
    });
  }
  const fillers = new Set(["um", "uh", "erm", "basically", "actually"]);
  for (let index = 0; index < words.length; index += 1) {
    if (!fillers.has(clean(words[index]!.word))) continue;
    const timelineStart = sourceToTimeline(words[index]!.start, regions);
    const timelineEnd = sourceToTimeline(words[index]!.end, regions);
    if (timelineStart == null || timelineEnd == null) continue;
    removals.push({ id: `filler-${index}`, sourceStart: words[index]!.start, sourceEnd: words[index]!.end, timelineStart, timelineEnd, reason: "filler", transcript: words[index]!.word, confidence: 0.9, approved: false });
  }
  return removals.sort((a, b) => a.sourceStart - b.sourceStart);
}

export function retainedRegions(source: SourceRegion, removals: RoughCutRemoval[]): SourceRegion[] {
  const retained: SourceRegion[] = [];
  let cursor = source.sourceStart;
  for (const removal of removals.filter((item) => item.approved).sort((a, b) => a.sourceStart - b.sourceStart)) {
    const start = Math.max(cursor, removal.sourceStart);
    if (start > cursor) retained.push({ ...source, sourceStart: cursor, sourceEnd: start });
    cursor = Math.max(cursor, removal.sourceEnd);
  }
  if (cursor < source.sourceEnd) retained.push({ ...source, sourceStart: cursor });
  let timelineCursor = source.timelineStart;
  return retained.map((region) => {
    const mapped = { ...region, timelineStart: timelineCursor };
    timelineCursor += (region.sourceEnd - region.sourceStart) / region.playbackRate;
    return mapped;
  });
}

export function buildEditMap(regions: SourceRegion[]): EditMapRegion[] {
  return regions.map((region) => ({ ...region, timelineEnd: region.timelineStart + (region.sourceEnd - region.sourceStart) / region.playbackRate }));
}
