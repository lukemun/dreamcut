import type { TimelineElement } from "@/components/studio/timeline/types";

export type BlackInterval = { start: number; end: number; duration?: number };

export function unexpectedBlackIntervals(
  black: BlackInterval[],
  elements: TimelineElement[],
  frameToleranceSeconds = 1 / 30,
): BlackInterval[] {
  const declared = elements
    .filter((element) => element.removed_at == null && element.props?.intentional_black_stage === true)
    .map((element) => ({ start: element.timeline_start, end: element.timeline_start + element.duration }))
    .sort((a, b) => a.start - b.start);

  return black.filter((interval) => {
    let coveredThrough = interval.start;
    for (const declaration of declared) {
      if (declaration.end < coveredThrough - frameToleranceSeconds) continue;
      if (declaration.start > coveredThrough + frameToleranceSeconds) break;
      coveredThrough = Math.max(coveredThrough, declaration.end);
      if (coveredThrough >= interval.end - frameToleranceSeconds) return false;
    }
    return true;
  });
}
