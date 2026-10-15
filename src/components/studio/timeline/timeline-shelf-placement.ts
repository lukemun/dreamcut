import type { ElementCreatePayload } from "./AssetShelf";
import type { LaneDef, TimelineElement } from "./types";
import { isVisualLane, laneIndexFromKey, laneStackIndex, stackedLaneKey } from "@/lib/timeline/lanes";

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function supportsPlayheadShelfPlacement(type: ElementCreatePayload["type"]) {
  return (
    type === "still"
    || type === "video_clip"
    || type === "vo_segment"
    || type === "vo_full"
    || type === "music"
    || type === "sound_effect"
    || type === "caption_text"
  );
}

export function findReusableVisualLaneKey(
  laneKey: string,
  start: number,
  duration: number,
  visualLaneKeys: string[],
  elements: Array<{ id?: string; lane_key: string; timeline_start: number; duration: number }>,
) {
  if (!isVisualLane(laneKey)) return null;

  const end = start + duration;
  const visualElements = elements.filter((element) => isVisualLane(element.lane_key));

  const isLaneFree = (candidateLaneKey: string) =>
    !visualElements.some((element) =>
      element.lane_key === candidateLaneKey
      && overlaps(start, end, element.timeline_start, element.timeline_start + element.duration),
    );

  for (const candidateLaneKey of visualLaneKeys) {
    if (candidateLaneKey === laneKey) continue;
    if (isLaneFree(candidateLaneKey)) return candidateLaneKey;
  }

  return null;
}

type ResolveShelfPlacementArgs = {
  payload: ElementCreatePayload;
  playheadSec: number;
  lanes: LaneDef[];
  elements: TimelineElement[];
  addLane: (options?: { prepend?: boolean }) => Promise<string | null> | string | null;
};

export async function resolveShelfPlacementPayload({
  payload,
  playheadSec,
  lanes,
  elements,
  addLane,
}: ResolveShelfPlacementArgs) {
  const nextPayload: ElementCreatePayload = { ...payload };
  const playheadStart = Number(Math.max(0, playheadSec).toFixed(3));

  if (supportsPlayheadShelfPlacement(payload.type)) {
    nextPayload.timeline_start = playheadStart;
  }

  if (!supportsPlayheadShelfPlacement(payload.type)) {
    return nextPayload;
  }

  const playheadEnd = playheadStart + payload.duration;
  const isVisualPayload = payload.type === "still" || payload.type === "video_clip";
  const hasConflict = elements.some((element) =>
    element.lane_key === payload.lane_key
    && (isVisualPayload
      ? element.type === "still" || element.type === "video_clip"
      : element.type === payload.type)
    && overlaps(playheadStart, playheadEnd, element.timeline_start, element.timeline_start + element.duration),
  );

  if (!hasConflict) {
    return nextPayload;
  }

  let newLaneKey: string | null = null;
  if (isVisualPayload) {
    newLaneKey = findReusableVisualLaneKey(
      payload.lane_key,
      playheadStart,
      payload.duration,
      lanes.filter((lane) => lane.type === "visual").map((lane) => lane.key),
      elements,
    );
    if (!newLaneKey) {
      newLaneKey = await addLane({ prepend: true });
    }
  } else {
    const baseLaneKey = stackedLaneKey(payload.lane_key, 0);
    const nextStackIndex = elements
      .filter((element) => stackedLaneKey(element.lane_key, 0) === baseLaneKey)
      .reduce((max, element) => Math.max(max, laneStackIndex(element.lane_key)), laneStackIndex(baseLaneKey))
      + 1;
    newLaneKey = stackedLaneKey(baseLaneKey, nextStackIndex);
  }

  if (!newLaneKey) return null;
  nextPayload.lane_key = newLaneKey;
  nextPayload.lane_index = laneIndexFromKey(newLaneKey);
  return nextPayload;
}
