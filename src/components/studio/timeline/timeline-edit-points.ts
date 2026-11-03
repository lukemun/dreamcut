import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

import type { TimelineElement } from "./types";

export function collectTimelineEditPointFrames(
  elements: readonly TimelineElement[],
  durationInFrames: number,
): number[] {
  const lastFrame = Math.max(0, durationInFrames - 1);
  const frames = new Set<number>([0, lastFrame]);

  for (const element of elements) {
    if (element.removed_at != null || element.props?.disabled === true) continue;
    frames.add(Math.min(lastFrame, Math.max(0, Math.round(element.timeline_start * currentFrameRate()))));
    frames.add(Math.min(lastFrame, Math.max(0, Math.round((element.timeline_start + element.duration) * currentFrameRate()))));
  }

  return [...frames].sort((a, b) => a - b);
}

export function previousTimelineEditPointFrame(points: readonly number[], currentFrame: number): number {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index]! < currentFrame) return points[index]!;
  }
  return 0;
}

export function nextTimelineEditPointFrame(
  points: readonly number[],
  currentFrame: number,
  durationInFrames: number,
): number {
  const next = points.find((point) => point > currentFrame);
  return next ?? Math.max(0, durationInFrames - 1);
}
