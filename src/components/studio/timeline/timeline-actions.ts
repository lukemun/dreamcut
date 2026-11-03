import {
  computePlaybackRateTimelineDuration,
  derivePlaybackRateVideoProps,
  getMaxExtendableTimelineDuration,
  getSourceDurationSeconds,
  resolveMediaTiming,
  supportsOverflowHold,
} from "@/lib/timeline/media";
import {
  minTimelineDurationSeconds,
  isVisualElementType,
  quantizeVisualFrameSpan,
  toVisualFrame,
} from "@/lib/timeline/frame-quantization";
import { isCaptionsLane, isMusicLane, isSoundEffectLane, isVisualLane, laneIndexFromKey, visualLaneKey } from "@/lib/timeline/lanes";
import { writeVideoClipTimingMetadata } from "@/lib/timeline/video-clip-metadata";

import type { BeatMarker, TimelineBeatBand, TimelineElement } from "./types";

export type TimelineElementMoveInput = {
  timelineStart?: number;
  laneKey?: string;
};

export type TimelineElementResizeInput = {
  timelineStart?: number;
  duration?: number;
};

export type TimelineElementTimingInput = TimelineElementResizeInput & {
  playbackRate?: number;
};

/**
 * A left-edge drag keeps the clip's existing right edge fixed. Supplying both
 * fields is important for stills: a timelineStart-only edit is a move, not a
 * resize, so the canvas must make the fixed-end intent explicit.
 */
export function buildLeftEdgeResizeInput(
  element: Pick<TimelineElement, "timeline_start" | "duration">,
  requestedStart: number,
): Required<TimelineElementResizeInput> {
  const originalEnd = element.timeline_start + element.duration;
  const timelineStart = Number(clamp(
    Number(requestedStart.toFixed(3)),
    0,
    Math.max(0, originalEnd - minTimelineDurationSeconds()),
  ).toFixed(3));
  return {
    timelineStart,
    duration: Number(Math.max(
      minTimelineDurationSeconds(),
      originalEnd - timelineStart,
    ).toFixed(3)),
  };
}

type SpeechSyncBinding = {
  schema_version?: number;
  source_element_id: string;
  source_sha256: string;
  source_start_seconds: number;
  source_end_seconds: number;
  source_playback_rate: number;
};

type CutoutReceipt = {
  source_interval_seconds: [number, number];
};

/**
 * Resolve the editable source segment behind a speech-synchronised visual.
 *
 * A cutout can keep pointing at the original speech row after that row has
 * been split. In that case the visible cutout may be source-bounded while the
 * segment that actually carries the current audio is one of the descendants.
 * Prefer the active descendant under the cutout's right edge so the Inspector
 * can take the editor to the clip whose tail can really be revealed.
 */
export function resolveEditableSpeechSourceElement(
  visual: TimelineElement | null,
  elements: TimelineElement[],
): TimelineElement | null {
  const binding = visual?.props?.speech_sync_binding as SpeechSyncBinding | undefined;
  if (!visual || !binding?.source_element_id) return null;

  const familyIds = new Set([binding.source_element_id]);
  let added = true;
  while (added) {
    added = false;
    for (const element of elements) {
      const splitFromId = typeof element.props?.split_from_id === "string"
        ? element.props.split_from_id
        : null;
      if (splitFromId && familyIds.has(splitFromId) && !familyIds.has(element.id)) {
        familyIds.add(element.id);
        added = true;
      }
    }
  }

  const activeFamily = elements.filter((element) =>
    familyIds.has(element.id)
    && element.removed_at == null
    && element.type !== "caption_text"
    && element.type !== "still");
  if (activeFamily.length === 0) return null;

  const visualRightEdge = visual.timeline_start + visual.duration;
  const EDGE_EPSILON_SECONDS = 0.05;
  const underRightEdge = activeFamily.filter((element) =>
    element.timeline_start <= visualRightEdge + EDGE_EPSILON_SECONDS
    && element.timeline_start + element.duration >= visualRightEdge - EDGE_EPSILON_SECONDS);
  const candidates = underRightEdge.length > 0 ? underRightEdge : activeFamily;

  return candidates.sort((left, right) => {
    const leftEnd = left.timeline_start + left.duration;
    const rightEnd = right.timeline_start + right.duration;
    const leftDistance = Math.abs(leftEnd - visualRightEdge);
    const rightDistance = Math.abs(rightEnd - visualRightEdge);
    return leftDistance - rightDistance || right.timeline_start - left.timeline_start;
  })[0] ?? null;
}

export type TimelineElementGroupMoveInput = {
  elementIds: string[];
  deltaSec: number;
  laneDelta?: number;
  orderedVisualLaneKeys?: string[];
};

function supportsTrimResize(type: string) {
  return type !== "still";
}

function clampMin(value: number, min: number) {
  return Math.max(min, value);
}

const OVERLAP_EPSILON = 0.001;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd - OVERLAP_EPSILON && bStart < aEnd - OVERLAP_EPSILON;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readSpeechSyncBinding(element: TimelineElement): SpeechSyncBinding | null {
  const value = (element.props as Record<string, unknown> | null)?.speech_sync_binding;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const binding = value as Record<string, unknown>;
  if (
    typeof binding.source_element_id !== "string"
    || typeof binding.source_sha256 !== "string"
    || typeof binding.source_start_seconds !== "number"
    || typeof binding.source_end_seconds !== "number"
    || typeof binding.source_playback_rate !== "number"
  ) return null;
  return binding as SpeechSyncBinding;
}

function readCutoutReceipt(element: TimelineElement): CutoutReceipt | null {
  const value = (element.props as Record<string, unknown> | null)?.custom_cutout_receipt;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const interval = (value as Record<string, unknown>).source_interval_seconds;
  if (
    !Array.isArray(interval)
    || interval.length !== 2
    || typeof interval[0] !== "number"
    || typeof interval[1] !== "number"
  ) return null;
  return { source_interval_seconds: [interval[0], interval[1]] };
}

function sourceClockAt(element: TimelineElement, timelineSeconds: number) {
  const rate = Math.max(0.001, element.playback_rate || 1);
  return element.trim_start + (timelineSeconds - element.timeline_start) * rate;
}

/**
 * A speech cutout is a trimmed view of a longer, source-mapped derivative.
 * Moving it chooses the matching source interval at the new timeline position;
 * trimming an edge reveals or hides real source frames. Neither gesture is
 * allowed to turn picture timing into a second, independent clock.
 */
export function calculateSpeechSyncedTimingPatch(
  element: TimelineElement,
  next: TimelineElementResizeInput,
  allElements: TimelineElement[],
  gesture: "move" | "resize",
): Record<string, unknown> | null {
  if (element.type !== "video_clip") return null;
  const binding = readSpeechSyncBinding(element);
  const receipt = readCutoutReceipt(element);
  const source = binding
    ? allElements.find((candidate) => candidate.id === binding.source_element_id && candidate.removed_at == null) ?? null
    : null;
  if (!binding || !receipt || !source) return null;

  const sourceRate = Math.max(0.001, source.playback_rate || 1);
  const [receiptStart, receiptEnd] = receipt.source_interval_seconds;
  const sourceDuration = getSourceDurationSeconds(source)
    ?? source.trim_start + source.duration * sourceRate + (source.trim_end ?? 0);
  const availableSourceStart = Math.max(receiptStart, source.trim_start);
  const availableSourceEnd = Math.min(receiptEnd, sourceDuration - (source.trim_end ?? 0));
  const availableTimelineStart = source.timeline_start + (availableSourceStart - source.trim_start) / sourceRate;
  const availableTimelineEnd = source.timeline_start + (availableSourceEnd - source.trim_start) / sourceRate;
  const minimum = minTimelineDurationSeconds();

  let requestedStart = typeof next.timelineStart === "number" ? next.timelineStart : element.timeline_start;
  let requestedEnd: number;
  if (gesture === "move") {
    requestedEnd = requestedStart + element.duration;
  } else if (typeof next.timelineStart === "number" && typeof next.duration !== "number") {
    requestedEnd = element.timeline_start + element.duration;
  } else {
    requestedEnd = requestedStart + (next.duration ?? element.duration);
  }

  if (gesture === "move") {
    const duration = Math.min(element.duration, Math.max(minimum, availableTimelineEnd - availableTimelineStart));
    requestedStart = clamp(requestedStart, availableTimelineStart, Math.max(availableTimelineStart, availableTimelineEnd - duration));
    requestedEnd = requestedStart + duration;
  } else {
    requestedStart = clamp(requestedStart, availableTimelineStart, availableTimelineEnd - minimum);
    requestedEnd = clamp(requestedEnd, requestedStart + minimum, availableTimelineEnd);
  }

  const span = quantizeVisualFrameSpan(requestedStart, requestedEnd - requestedStart);
  const syncedSourceStart = sourceClockAt(source, span.timeline_start);
  const syncedSourceEnd = sourceClockAt(source, span.timeline_start + span.duration);
  const derivativeDuration = getSourceDurationSeconds(element) ?? Math.max(0, receiptEnd - receiptStart);
  const nextTrimStart = Math.max(0, syncedSourceStart - receiptStart);
  const nextTrimEnd = Math.max(0, derivativeDuration - nextTrimStart - (syncedSourceEnd - syncedSourceStart));

  return {
    timeline_start: span.timeline_start,
    duration: span.duration,
    trim_start: nextTrimStart,
    trim_end: nextTrimEnd,
    playback_rate: sourceRate,
    props: {
      ...(element.props ?? {}),
      speech_sync_binding: {
        ...binding,
        schema_version: 1,
        source_start_seconds: syncedSourceStart,
        source_end_seconds: syncedSourceEnd,
        source_playback_rate: sourceRate,
      },
    },
  };
}

function isBeatVisualElement(element: TimelineElement, beatId: string) {
  return (
    element.beat_id === beatId
    && (element.type === "still" || element.type === "video_clip")
    && Number.isFinite(element.timeline_start)
    && Number.isFinite(element.duration)
    && element.duration > 0
  );
}

export function calculateMoveElementPatch(
  element: TimelineElement,
  next: TimelineElementMoveInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (typeof next.timelineStart === "number") {
    const nextStart = Math.max(0, Number(next.timelineStart.toFixed(3)));
    if (Math.abs(nextStart - element.timeline_start) >= 0.001) {
      patch.timeline_start = nextStart;
    }
  }

  if (
    typeof next.laneKey === "string"
    && next.laneKey !== element.lane_key
    && (
      (isVisualLane(element.lane_key) && isVisualLane(next.laneKey))
      || (element.type === "music" && isMusicLane(element.lane_key) && isMusicLane(next.laneKey))
      || (element.type === "sound_effect" && isSoundEffectLane(element.lane_key) && isSoundEffectLane(next.laneKey))
      || (element.type === "caption_text" && isCaptionsLane(element.lane_key) && isCaptionsLane(next.laneKey))
    )
  ) {
    patch.lane_key = next.laneKey;
    patch.lane_index = laneIndexFromKey(next.laneKey);
  }

  return patch;
}

function hasLaneConflict(
  elementId: string,
  laneKey: string,
  start: number,
  duration: number,
  allElements: TimelineElement[],
) {
  const end = start + duration;
  return allElements.some(
    (entry) =>
      entry.id !== elementId
      && entry.lane_key === laneKey
      && overlaps(start, end, entry.timeline_start, entry.timeline_start + entry.duration),
  );
}

function findFreeVisualLanePatchForPlacement(
  element: TimelineElement,
  allElements: TimelineElement[],
  nextStart: number,
  nextDuration: number,
  preferredLaneKey: string,
) {
  const visualElements = allElements.filter(
    (entry) => entry.id !== element.id && isVisualLane(entry.lane_key),
  );
  const currentLaneIndex = laneIndexFromKey(preferredLaneKey);
  const maxLaneIndex = visualElements.reduce(
    (max, entry) => Math.max(max, laneIndexFromKey(entry.lane_key)),
    currentLaneIndex,
  );

  const isLaneFree = (laneKey: string) =>
    !visualElements.some(
      (entry) =>
        entry.lane_key === laneKey
        && overlaps(nextStart, nextStart + nextDuration, entry.timeline_start, entry.timeline_start + entry.duration),
    );

  for (let laneIndex = currentLaneIndex + 1; laneIndex <= maxLaneIndex; laneIndex += 1) {
    const laneKey = visualLaneKey(laneIndex);
    if (isLaneFree(laneKey)) {
      return { lane_key: laneKey, lane_index: laneIndexFromKey(laneKey) };
    }
  }

  for (let laneIndex = currentLaneIndex - 1; laneIndex >= 0; laneIndex -= 1) {
    const laneKey = visualLaneKey(laneIndex);
    if (isLaneFree(laneKey)) {
      return { lane_key: laneKey, lane_index: laneIndexFromKey(laneKey) };
    }
  }

  return null;
}

function findNearestOpenStartOnLane(
  elementId: string,
  laneKey: string,
  desiredStart: number,
  currentStart: number,
  duration: number,
  allElements: TimelineElement[],
) {
  const laneElements = allElements
    .filter((entry) => entry.id !== elementId && entry.lane_key === laneKey)
    .sort((a, b) => a.timeline_start - b.timeline_start);

  const candidates = new Set<number>([Number(Math.max(0, desiredStart).toFixed(3)), 0]);
  for (const entry of laneElements) {
    candidates.add(Number(Math.max(0, entry.timeline_start - duration).toFixed(3)));
    candidates.add(Number((entry.timeline_start + entry.duration).toFixed(3)));
  }

  const viable = [...candidates]
    .filter((start) => !hasLaneConflict(elementId, laneKey, start, duration, allElements))
    .sort((a, b) => {
      const movingEarlier = desiredStart < currentStart - 0.001;
      const movingLater = desiredStart > currentStart + 0.001;
      if (movingEarlier) {
        const aOnPreferredSide = a <= desiredStart + 0.001;
        const bOnPreferredSide = b <= desiredStart + 0.001;
        if (aOnPreferredSide !== bOnPreferredSide) return aOnPreferredSide ? -1 : 1;
      } else if (movingLater) {
        const aOnPreferredSide = a >= desiredStart - 0.001;
        const bOnPreferredSide = b >= desiredStart - 0.001;
        if (aOnPreferredSide !== bOnPreferredSide) return aOnPreferredSide ? -1 : 1;
      }
      const dist = Math.abs(a - desiredStart) - Math.abs(b - desiredStart);
      if (Math.abs(dist) > 0.0001) return dist;
      return a - b;
    });

  return viable[0] ?? Number(Math.max(0, desiredStart).toFixed(3));
}

export function clampRightEdgeResizeDuration(
  element: TimelineElement,
  requestedDuration: number,
  allElements: TimelineElement[],
) {
  const originalEnd = element.timeline_start + element.duration;
  const useFrameComparison = isVisualElementType(element.type);
  const originalEndFrame = useFrameComparison ? toVisualFrame(originalEnd) : 0;
  const nextBlockerStart = allElements
    .filter(
      (entry) =>
        entry.id !== element.id
        && entry.lane_key === element.lane_key
        && (useFrameComparison
          ? toVisualFrame(entry.timeline_start) >= originalEndFrame
          : entry.timeline_start >= originalEnd - 0.001),
    )
    .reduce<number | null>((nearest, entry) => {
      if (nearest == null) return entry.timeline_start;
      return Math.min(nearest, entry.timeline_start);
    }, null);

  if (nextBlockerStart == null) return requestedDuration;

  return Number(
    Math.max(
      minTimelineDurationSeconds(),
      Math.min(requestedDuration, nextBlockerStart - element.timeline_start),
    ).toFixed(3),
  );
}

export function clampLeftEdgeResizeStart(
  element: TimelineElement,
  requestedStart: number,
  allElements: TimelineElement[],
) {
  const useFrameComparison = isVisualElementType(element.type);
  const elementStartFrame = useFrameComparison ? toVisualFrame(element.timeline_start) : 0;
  const previousBlockerEnd = allElements
    .filter(
      (entry) =>
        entry.id !== element.id
        && entry.lane_key === element.lane_key
        && (useFrameComparison
          ? toVisualFrame(entry.timeline_start + entry.duration) <= elementStartFrame
          : entry.timeline_start + entry.duration <= element.timeline_start + 0.001),
    )
    .reduce<number | null>((nearest, entry) => {
      const entryEnd = Number((entry.timeline_start + entry.duration).toFixed(3));
      if (nearest == null) return entryEnd;
      return Math.max(nearest, entryEnd);
    }, null);

  if (previousBlockerEnd == null) return requestedStart;

  return Number(Math.max(requestedStart, previousBlockerEnd).toFixed(3));
}

export function calculateResolvedMoveElementPatch(
  element: TimelineElement,
  next: TimelineElementMoveInput,
  allElements: TimelineElement[],
): Record<string, unknown> {
  const speechPatch = typeof next.timelineStart === "number"
    ? calculateSpeechSyncedTimingPatch(
        element,
        { timelineStart: next.timelineStart },
        allElements,
        "move",
      )
    : null;
  const patch = speechPatch ?? calculateMoveElementPatch(element, next);
  if (typeof next.laneKey === "string") {
    Object.assign(patch, calculateMoveElementPatch(element, { laneKey: next.laneKey }));
  }
  const nextStart = typeof patch.timeline_start === "number" ? patch.timeline_start : element.timeline_start;
  const nextLaneKey = typeof patch.lane_key === "string" ? patch.lane_key : element.lane_key;

  if (!(isVisualLane(element.lane_key) && isVisualLane(nextLaneKey))) {
    return patch;
  }

  if (!hasLaneConflict(element.id, nextLaneKey, nextStart, element.duration, allElements)) {
    return patch;
  }

  const nextLanePatch = findFreeVisualLanePatchForPlacement(
    element,
    allElements,
    nextStart,
    element.duration,
    nextLaneKey,
  );
  if (nextLanePatch) {
    patch.lane_key = nextLanePatch.lane_key;
    patch.lane_index = nextLanePatch.lane_index;
    return patch;
  }

  const fallbackStart = findNearestOpenStartOnLane(
    element.id,
    nextLaneKey,
    nextStart,
    element.timeline_start,
    element.duration,
    allElements,
  );
  if (Math.abs(fallbackStart - element.timeline_start) < 0.001 && nextLaneKey === element.lane_key) {
    return {};
  }
  patch.timeline_start = fallbackStart;
  return patch;
}

export function calculateResolvedGroupMovePatches(
  input: TimelineElementGroupMoveInput,
  allElements: TimelineElement[],
): Map<string, Record<string, unknown>> {
  const selectedIds = new Set(input.elementIds);
  const requestedLaneDelta = Math.trunc(input.laneDelta ?? 0);
  if (selectedIds.size === 0 || (Math.abs(input.deltaSec) < 0.001 && requestedLaneDelta === 0)) {
    return new Map();
  }

  const selectedElements = allElements.filter((element) => selectedIds.has(element.id));
  if (selectedElements.length === 0) return new Map();

  // The whole group shares one delta, clamped so its earliest clip stops at 0.
  const earliestStart = Math.min(...selectedElements.map((element) => element.timeline_start));
  const roundedDelta = Number(Math.max(input.deltaSec, -earliestStart).toFixed(3));
  const nextStarts = new Map<string, number>();
  const nextLaneKeys = new Map<string, string>();
  for (const element of selectedElements) {
    nextStarts.set(
      element.id,
      Number(Math.max(0, element.timeline_start + roundedDelta).toFixed(3)),
    );
    nextLaneKeys.set(element.id, element.lane_key);
  }

  // Pictures bound to a moved speech clock move with it even when unselected.
  const followerPatches = new Map<string, Record<string, unknown>>();
  if (Math.abs(roundedDelta) >= 0.001) {
    for (const element of selectedElements) {
      const linked = expandSpeechClockMovePatches(
        element,
        { timeline_start: nextStarts.get(element.id) },
        allElements,
      );
      for (const [linkedId, linkedPatch] of linked) {
        if (!selectedIds.has(linkedId)) followerPatches.set(linkedId, linkedPatch);
      }
    }
  }
  const unselectedElements = allElements.filter(
    (element) => !selectedIds.has(element.id) && !followerPatches.has(element.id),
  );

  if (requestedLaneDelta !== 0 && input.orderedVisualLaneKeys && input.orderedVisualLaneKeys.length > 0) {
    const selectedVisuals = selectedElements.filter((element) => isVisualLane(element.lane_key));
    if (selectedVisuals.length === selectedElements.length) {
      const laneIndexByKey = new Map(input.orderedVisualLaneKeys.map((key, index) => [key, index]));
      let minAllowedDelta = Number.NEGATIVE_INFINITY;
      let maxAllowedDelta = Number.POSITIVE_INFINITY;
      for (const element of selectedVisuals) {
        const currentIndex = laneIndexByKey.get(element.lane_key);
        if (currentIndex == null) {
          minAllowedDelta = 0;
          maxAllowedDelta = 0;
          break;
        }
        minAllowedDelta = Math.max(minAllowedDelta, -currentIndex);
        maxAllowedDelta = Math.min(maxAllowedDelta, input.orderedVisualLaneKeys.length - 1 - currentIndex);
      }
      const clampedLaneDelta = clamp(requestedLaneDelta, minAllowedDelta, maxAllowedDelta);
      for (const element of selectedVisuals) {
        const currentIndex = laneIndexByKey.get(element.lane_key);
        if (currentIndex == null) continue;
        const nextLaneKey = input.orderedVisualLaneKeys[currentIndex + clampedLaneDelta];
        if (nextLaneKey) nextLaneKeys.set(element.id, nextLaneKey);
      }
    }
  }

  for (const element of selectedElements) {
    if (!isVisualLane(element.lane_key)) continue;
    const nextStart = nextStarts.get(element.id) ?? element.timeline_start;
    const nextEnd = nextStart + element.duration;
    const nextLaneKey = nextLaneKeys.get(element.id) ?? element.lane_key;
    const hasConflict = unselectedElements.some(
      (entry) =>
        entry.lane_key === nextLaneKey
        && overlaps(nextStart, nextEnd, entry.timeline_start, entry.timeline_start + entry.duration),
    );
    if (hasConflict) return new Map();
  }
  for (const [followerId, followerPatch] of followerPatches) {
    const follower = allElements.find((element) => element.id === followerId);
    if (!follower || !isVisualLane(follower.lane_key)) continue;
    const nextStart = followerPatch.timeline_start as number;
    const hasConflict = unselectedElements.some(
      (entry) =>
        entry.lane_key === follower.lane_key
        && overlaps(nextStart, nextStart + follower.duration, entry.timeline_start, entry.timeline_start + entry.duration),
    );
    if (hasConflict) return new Map();
  }

  const patches = new Map<string, Record<string, unknown>>();
  for (const element of selectedElements) {
    const patch = calculateMoveElementPatch(element, {
      timelineStart: nextStarts.get(element.id),
      laneKey: nextLaneKeys.get(element.id),
    });
    if (Object.keys(patch).length > 0) {
      patches.set(element.id, patch);
    }
  }
  if (patches.size === 0) return patches;
  for (const [followerId, followerPatch] of followerPatches) patches.set(followerId, followerPatch);
  return patches;
}

/** Move the owner of a speech clock and every picture/caption view that names
 * it. Source bounds stay unchanged; only their shared timeline origin moves. */
export function expandSpeechClockMovePatches(
  source: TimelineElement,
  sourcePatch: Record<string, unknown>,
  allElements: TimelineElement[],
) {
  const nextStart = sourcePatch.timeline_start;
  if (typeof nextStart !== "number") {
    return new Map([[source.id, sourcePatch]]);
  }
  const delta = nextStart - source.timeline_start;
  const patches = new Map<string, Record<string, unknown>>([[source.id, sourcePatch]]);
  if (Math.abs(delta) < 0.001) return patches;
  for (const candidate of allElements) {
    if (candidate.id === source.id || candidate.removed_at != null) continue;
    // Source-bound captions are projected once by the server, including explicit unlink state.
    if (candidate.type === "caption_text") continue;
    const props = candidate.props as Record<string, unknown> | null;
    const sync = props?.speech_sync_binding;
    const syncSourceId = sync && typeof sync === "object" && !Array.isArray(sync)
      ? (sync as Record<string, unknown>).source_element_id
      : null;
    const captionSourceId = props?.caption_source_element_id;
    if (
      candidate.voice_clip_id !== source.id
      && syncSourceId !== source.id
      && captionSourceId !== source.id
    ) continue;
    const candidatePatch: Record<string, unknown> = {
      timeline_start: Math.max(0, Number((candidate.timeline_start + delta).toFixed(3))),
    };
    if (syncSourceId === source.id) {
      candidatePatch.props = { ...(candidate.props ?? {}), speech_sync_binding: sync };
    }
    patches.set(candidate.id, candidatePatch);
  }
  return patches;
}

export function calculateResizeElementPatch(
  element: TimelineElement,
  next: TimelineElementResizeInput,
  allElements: TimelineElement[] = [],
): Record<string, unknown> {
  const speechPatch = calculateSpeechSyncedTimingPatch(element, next, allElements, "resize");
  if (speechPatch) return speechPatch;
  const patch: Record<string, unknown> = {};
  const playbackRate = element.playback_rate ?? 1;
  const originalStart = element.timeline_start;
  const originalDuration = element.duration;

  if (supportsTrimResize(element.type)) {
    const hasTimelineStart = typeof next.timelineStart === "number";
    const hasDuration = typeof next.duration === "number";
    const nextStart = hasTimelineStart
      ? Math.max(0, Number(next.timelineStart!.toFixed(3)))
      : originalStart;
    const requestedDuration = hasDuration
      ? Math.max(minTimelineDurationSeconds(), Number(next.duration!.toFixed(3)))
      : originalDuration;

    if (hasTimelineStart && Math.abs(nextStart - originalStart) >= 0.001) {
      if (element.type === "caption_text") {
        const clampedStart = nextStart < originalStart
          ? clampLeftEdgeResizeStart(element, nextStart, allElements)
          : nextStart;
        const adjustedDuration = Number(
          Math.max(minTimelineDurationSeconds(), originalStart + originalDuration - clampedStart).toFixed(3),
        );
        if (Math.abs(clampedStart - originalStart) >= 0.001) {
          patch.timeline_start = clampedStart;
        }
        if (Math.abs(adjustedDuration - originalDuration) >= 0.001) {
          patch.duration = adjustedDuration;
        }
        return patch;
      }

      const clampedForLaneStart = nextStart < originalStart
        ? clampLeftEdgeResizeStart(element, nextStart, allElements)
        : nextStart;
      const canOverflowHold = supportsOverflowHold(element.type);
      const existingLeadingHold = canOverflowHold ? resolveMediaTiming(element).leadingHoldDuration : 0;
      const originalActualMediaStart = Number((originalStart + existingLeadingHold).toFixed(3));
      const earliestActualMediaStart = Number((
        originalActualMediaStart - (playbackRate > 0 ? element.trim_start / playbackRate : 0)
      ).toFixed(3));
      const clampedStart = Number((
        canOverflowHold
          ? clampedForLaneStart
          : Math.max(earliestActualMediaStart, clampedForLaneStart)
      ).toFixed(3));
      const nextActualMediaStart = Number(Math.max(clampedStart, earliestActualMediaStart).toFixed(3));
      const mediaStartDelta = Number((nextActualMediaStart - originalActualMediaStart).toFixed(3));
      const adjustedDuration = Number(
        Math.max(minTimelineDurationSeconds(), originalStart + originalDuration - clampedStart).toFixed(3),
      );
      const nextTrimStart = Math.max(
        0,
        Number((element.trim_start + mediaStartDelta * playbackRate).toFixed(3)),
      );
      const nextLeadingHold = canOverflowHold
        ? Number(Math.max(0, nextActualMediaStart - clampedStart).toFixed(3))
        : 0;

      if (Math.abs(clampedStart - originalStart) >= 0.001) {
        patch.timeline_start = clampedStart;
      }
      if (Math.abs(nextTrimStart - element.trim_start) >= 0.001) {
        patch.trim_start = nextTrimStart;
      }
      if (Math.abs(adjustedDuration - originalDuration) >= 0.001) {
        patch.duration = adjustedDuration;
      }
      if (canOverflowHold) {
        const currentPlayableDuration = resolveMediaTiming(element).maxPlayableTimelineDuration;
        const nextPlayableDuration = Number(
          Math.max(minTimelineDurationSeconds(), currentPlayableDuration - mediaStartDelta).toFixed(3),
        );
        patch.props = writeVideoClipTimingMetadata(element.props, {
          sourceDurationSeconds: getSourceDurationSeconds(element),
          playableWindowDurationSeconds: nextPlayableDuration,
          leadingHoldDurationSeconds: nextLeadingHold,
        });
      }
      return patch;
    }

    if (hasDuration) {
      if (element.type === "caption_text") {
        const clampedDuration = clampRightEdgeResizeDuration(
          element,
          requestedDuration,
          allElements,
        );
        if (Math.abs(clampedDuration - originalDuration) >= 0.001) {
          patch.duration = clampedDuration;
        }
        return patch;
      }

      const canOverflowHold = supportsOverflowHold(element.type);
      const timing = resolveMediaTiming(element);
      const maxPlayableDuration = timing.maxPlayableTimelineDuration;
      const maxExtendableDuration = getMaxExtendableTimelineDuration(element);
      const trailingHoldDuration = canOverflowHold ? timing.trailingHoldDuration : 0;
      const clampedDuration = canOverflowHold
        ? requestedDuration
        : Math.min(requestedDuration, maxExtendableDuration);

      let durationDelta = clampedDuration - originalDuration;
      if (canOverflowHold && durationDelta < 0 && trailingHoldDuration > 0) {
        const overflowReduction = Math.min(trailingHoldDuration, Math.abs(durationDelta));
        durationDelta += overflowReduction;
      }

      const sourceDelta = Number((durationDelta * playbackRate).toFixed(3));
      const existingTrimEnd = element.trim_end ?? 0;
      let nextTrimEnd = Number((existingTrimEnd - sourceDelta).toFixed(3));
      if (nextTrimEnd < 0) {
        nextTrimEnd = 0;
      }

      if (Math.abs(clampedDuration - originalDuration) >= 0.001) {
        patch.duration = Number(clampedDuration.toFixed(3));
      }

      const normalizedTrimEnd = canOverflowHold
        ? (element.trim_end == null && nextTrimEnd === 0 ? null : nextTrimEnd)
        : (
            requestedDuration <= maxExtendableDuration + 0.001
              ? (element.trim_end == null && nextTrimEnd === 0 ? null : nextTrimEnd)
              : 0
          );
      if (normalizedTrimEnd !== element.trim_end) {
        patch.trim_end = normalizedTrimEnd ?? 0;
      }

      if (canOverflowHold) {
        patch.props = writeVideoClipTimingMetadata(element.props, {
          sourceDurationSeconds: getSourceDurationSeconds(element),
          playableWindowDurationSeconds: maxPlayableDuration,
        });
      }

      const shouldSeekOpenLane =
        isVisualElementType(element.type)
        && requestedDuration > originalDuration + 0.001;
      if (shouldSeekOpenLane) {
        const lanePatch = findFreeVisualLanePatch(
          element,
          allElements,
          typeof patch.duration === "number" ? patch.duration : clampedDuration,
        );
        if (lanePatch) {
          patch.lane_key = lanePatch.lane_key;
          patch.lane_index = lanePatch.lane_index;
        } else {
          const clampedByBlocker = clampRightEdgeResizeDuration(
            element,
            typeof patch.duration === "number" ? patch.duration : clampedDuration,
            allElements,
          );
          if (Math.abs(clampedByBlocker - element.duration) >= 0.001) {
            patch.duration = Number(clampedByBlocker.toFixed(3));
          } else {
            delete patch.duration;
          }
        }
      } else if (hasDuration && !hasTimelineStart) {
        const clampedByBlocker = clampRightEdgeResizeDuration(
          element,
          typeof patch.duration === "number" ? patch.duration : clampedDuration,
          allElements,
        );
        if (Math.abs(clampedByBlocker - element.duration) >= 0.001) {
          patch.duration = Number(clampedByBlocker.toFixed(3));
        } else {
          delete patch.duration;
        }
      }
    }

    return patch;
  }

  if (typeof next.timelineStart === "number") {
    const requestedTimelineStart = Math.max(0, Number(next.timelineStart.toFixed(3)));
    const timelineStart = requestedTimelineStart < element.timeline_start
      ? clampLeftEdgeResizeStart(element, requestedTimelineStart, allElements)
      : requestedTimelineStart;
    if (Math.abs(timelineStart - element.timeline_start) >= 0.001) {
      patch.timeline_start = timelineStart;
    }
  }

  if (typeof next.duration === "number") {
    const requestedDuration = clampMin(Number(next.duration.toFixed(3)), minTimelineDurationSeconds());
    let duration = requestedDuration;
    if (isVisualElementType(element.type) && requestedDuration > element.duration + 0.001) {
      const lanePatch = findFreeVisualLanePatch(element, allElements, requestedDuration);
      if (lanePatch) {
        patch.lane_key = lanePatch.lane_key;
        patch.lane_index = lanePatch.lane_index;
      } else {
        duration = clampRightEdgeResizeDuration(
          element,
          requestedDuration,
          allElements,
        );
      }
    } else {
      duration = clampRightEdgeResizeDuration(
        element,
        requestedDuration,
        allElements,
      );
    }
    if (Math.abs(duration - element.duration) >= 0.001) {
      patch.duration = duration;
    }
  }

  return patch;
}

export function findFreeVisualLanePatch(
  element: TimelineElement,
  allElements: TimelineElement[],
  nextDuration: number,
) {
  if (!isVisualLane(element.lane_key)) return null;

  const start = element.timeline_start;
  const end = start + nextDuration;
  const visualElements = allElements.filter(
    (entry) => entry.id !== element.id && isVisualLane(entry.lane_key),
  );
  const conflictsOnCurrentLane = visualElements.some(
    (entry) =>
      entry.lane_key === element.lane_key
      && overlaps(start, end, entry.timeline_start, entry.timeline_start + entry.duration),
  );
  if (!conflictsOnCurrentLane) return null;

  const currentLaneIndex = laneIndexFromKey(element.lane_key);
  const maxLaneIndex = visualElements.reduce(
    (max, entry) => Math.max(max, laneIndexFromKey(entry.lane_key)),
    currentLaneIndex,
  );

  const isLaneFree = (laneKey: string) =>
    !visualElements.some(
      (entry) =>
        entry.lane_key === laneKey
        && overlaps(start, end, entry.timeline_start, entry.timeline_start + entry.duration),
    );

  for (let laneIndex = currentLaneIndex + 1; laneIndex <= maxLaneIndex + 1; laneIndex += 1) {
    const laneKey = visualLaneKey(laneIndex);
    if (isLaneFree(laneKey)) {
      return { lane_key: laneKey, lane_index: laneIndexFromKey(laneKey) };
    }
  }

  for (let laneIndex = currentLaneIndex - 1; laneIndex >= 0; laneIndex -= 1) {
    const laneKey = visualLaneKey(laneIndex);
    if (isLaneFree(laneKey)) {
      return { lane_key: laneKey, lane_index: laneIndexFromKey(laneKey) };
    }
  }

  return null;
}

export function calculatePlaybackRatePatch(
  element: TimelineElement,
  nextPlaybackRate: number,
  allElements: TimelineElement[],
) {
  const currentPlaybackRate = element.playback_rate ?? 1;
  if (Math.abs(nextPlaybackRate - currentPlaybackRate) < 0.001) {
    return {
      patch: null,
      duration: element.duration,
      laneChanged: false,
    };
  }

  const currentLeadingHoldDuration = supportsOverflowHold(element.type)
    ? resolveMediaTiming(element).leadingHoldDuration
    : 0;
  const currentVisiblePlayableDuration = supportsOverflowHold(element.type)
    ? resolveMediaTiming(element).visiblePlayableTimelineDuration
    : element.duration;
  const nextBaseDuration = Number(
    Math.max(
      minTimelineDurationSeconds(),
      currentLeadingHoldDuration + currentVisiblePlayableDuration * (currentPlaybackRate / nextPlaybackRate),
    ).toFixed(3),
  );
  const nextDuration = computePlaybackRateTimelineDuration(element, nextPlaybackRate, {
    minDuration: minTimelineDurationSeconds(),
  });
  const patch: Record<string, unknown> = {
    playback_rate: nextPlaybackRate,
    duration: nextDuration,
  };

  if (supportsOverflowHold(element.type)) {
    patch.props = derivePlaybackRateVideoProps(element, nextPlaybackRate, {
      minDuration: minTimelineDurationSeconds(),
    });
  }

  const nextLane = findFreeVisualLanePatch(element, allElements, nextDuration);
  if (nextLane) {
    patch.lane_key = nextLane.lane_key;
    patch.lane_index = nextLane.lane_index;
  }

  return {
    patch,
    duration: nextDuration,
    laneChanged: !!nextLane,
    baseDuration: nextBaseDuration,
  };
}

function mergeTimingPatches(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!("props" in existing) && !("props" in incoming)) {
    return { ...existing, ...incoming };
  }

  const existingProps = existing.props as Record<string, unknown> | undefined;
  const incomingProps = incoming.props as Record<string, unknown> | undefined;
  return {
    ...existing,
    ...incoming,
    ...(existingProps || incomingProps
      ? {
        props: {
          ...(existingProps ?? {}),
          ...(incomingProps ?? {}),
        },
      }
      : {}),
  };
}

function applyTimingPatchToElement(
  element: TimelineElement,
  patch: Record<string, unknown>,
): TimelineElement {
  const next = {
    ...element,
    ...patch,
  } as TimelineElement;

  if ("props" in patch) {
    next.props = {
      ...(element.props ?? {}),
      ...((patch.props as Record<string, unknown> | undefined) ?? {}),
    };
  }

  return next;
}

export function resolveTimingEditPreview(
  element: TimelineElement,
  next: TimelineElementTimingInput,
  allElements: TimelineElement[],
) {
  let patch: Record<string, unknown> = {};
  let workingElement = element;

  if (typeof next.playbackRate === "number") {
    const playbackRateResult = calculatePlaybackRatePatch(
      workingElement,
      next.playbackRate,
      allElements,
    );
    if (playbackRateResult.patch) {
      patch = mergeTimingPatches(patch, playbackRateResult.patch);
      workingElement = applyTimingPatchToElement(workingElement, playbackRateResult.patch);
    }
  }

  if (typeof next.timelineStart === "number" || typeof next.duration === "number") {
    const resizePatch = calculateResizeElementPatch(
      workingElement,
      {
        ...(typeof next.timelineStart === "number" ? { timelineStart: next.timelineStart } : {}),
        ...(typeof next.duration === "number" ? { duration: next.duration } : {}),
      },
      allElements.map((candidate) => (candidate.id === element.id ? workingElement : candidate)),
    );
    if (Object.keys(resizePatch).length > 0) {
      patch = mergeTimingPatches(patch, resizePatch);
      workingElement = applyTimingPatchToElement(workingElement, resizePatch);
    }
  }

  return {
    patch: Object.keys(patch).length > 0 ? patch : null,
    previewStartSec: workingElement.timeline_start,
    previewDurationSec: workingElement.duration,
    previewLaneKey: workingElement.lane_key,
    previewPlaybackRate: workingElement.playback_rate,
    previewProps: workingElement.props,
    laneChanged: workingElement.lane_key !== element.lane_key,
  };
}

export function calculateBeatBoundaryDurationUpdates(
  beatMarkers: TimelineBeatBand[],
  beatId: string,
  edge: "start" | "end",
  boundarySec: number,
) {
  const beatIndex = beatMarkers.findIndex((beat) => beat.id === beatId);
  if (beatIndex < 0) return null;

  const MIN_BEAT_DURATION = 0.5;
  const updates = new Map<string, number>();

  if (edge === "start") {
    if (beatIndex === 0) return null;
    const previousBeat = beatMarkers[beatIndex - 1];
    const currentBeat = beatMarkers[beatIndex];
    const clampedBoundary = clamp(
      boundarySec,
      previousBeat.startSec + MIN_BEAT_DURATION,
      currentBeat.endSec - MIN_BEAT_DURATION,
    );
    updates.set(previousBeat.id, Number((clampedBoundary - previousBeat.startSec).toFixed(3)));
    updates.set(currentBeat.id, Number((currentBeat.endSec - clampedBoundary).toFixed(3)));
    return updates;
  }

  const currentBeat = beatMarkers[beatIndex];
  const nextBeat = beatMarkers[beatIndex + 1] ?? null;
  const clampedBoundary = nextBeat
    ? clamp(
        boundarySec,
        currentBeat.startSec + MIN_BEAT_DURATION,
        nextBeat.endSec - MIN_BEAT_DURATION,
      )
    : Math.max(currentBeat.startSec + MIN_BEAT_DURATION, boundarySec);
  updates.set(currentBeat.id, Number((clampedBoundary - currentBeat.startSec).toFixed(3)));
  if (nextBeat) {
    updates.set(nextBeat.id, Number((nextBeat.endSec - clampedBoundary).toFixed(3)));
  }
  return updates;
}

export function applyBeatDurationUpdates(
  beats: BeatMarker[],
  updates: Map<string, number>,
) {
  return beats.map((beat) => {
    const nextDuration = updates.get(beat.id);
    return nextDuration == null ? beat : { ...beat, duration_seconds: nextDuration };
  });
}

export function calculateFitBeatToVisualContentUpdates(
  beatMarkers: TimelineBeatBand[],
  elements: TimelineElement[],
  beatId: string,
) {
  const beatIndex = beatMarkers.findIndex((beat) => beat.id === beatId);
  if (beatIndex < 0) {
    return { updates: null, reason: "missing_beat" as const };
  }

  const visualElements = elements.filter((element) => isBeatVisualElement(element, beatId));
  if (visualElements.length === 0) {
    return { updates: null, reason: "no_visuals" as const };
  }

  const currentBeat = beatMarkers[beatIndex];
  const previousBeat = beatMarkers[beatIndex - 1] ?? null;
  const earliestVisualStart = Math.min(...visualElements.map((element) => element.timeline_start));
  const latestVisualEnd = Math.max(
    ...visualElements.map((element) => element.timeline_start + element.duration),
  );
  const MIN_BEAT_DURATION = 0.5;
  const updates = new Map<string, number>();

  if (previousBeat) {
    const fittedStart = clamp(
      earliestVisualStart,
      previousBeat.startSec + MIN_BEAT_DURATION,
      latestVisualEnd - MIN_BEAT_DURATION,
    );
    updates.set(previousBeat.id, Number((fittedStart - previousBeat.startSec).toFixed(3)));
    updates.set(
      beatId,
      Number((Math.max(latestVisualEnd - fittedStart, MIN_BEAT_DURATION)).toFixed(3)),
    );
  } else {
    updates.set(
      beatId,
      Number((Math.max(latestVisualEnd - currentBeat.startSec, MIN_BEAT_DURATION)).toFixed(3)),
    );
  }

  return { updates, reason: null };
}

export function calculateMoveBeatVisualsToStart(
  beatMarkers: TimelineBeatBand[],
  elements: TimelineElement[],
  beatId: string,
) {
  const beat = beatMarkers.find((entry) => entry.id === beatId);
  if (!beat) {
    return { shiftedElements: null, originalStarts: null, delta: null, reason: "missing_beat" as const };
  }

  const visualElements = elements
    .filter((element) => isBeatVisualElement(element, beatId))
    .sort((a, b) => a.timeline_start - b.timeline_start);

  if (visualElements.length === 0) {
    return { shiftedElements: null, originalStarts: null, delta: null, reason: "no_visuals" as const };
  }

  const earliestVisualStart = visualElements[0]!.timeline_start;
  const delta = Number((beat.startSec - earliestVisualStart).toFixed(3));
  if (Math.abs(delta) < 0.001) {
    return { shiftedElements: null, originalStarts: null, delta: 0, reason: "already_aligned" as const };
  }

  const originalStarts = new Map(
    visualElements.map((element) => [element.id, element.timeline_start]),
  );
  const shiftedElements = elements.map((element) =>
    originalStarts.has(element.id)
      ? {
          ...element,
          timeline_start: Number(
            ((originalStarts.get(element.id) ?? element.timeline_start) + delta).toFixed(3),
          ),
        }
      : element,
  );

  return {
    shiftedElements,
    originalStarts,
    delta,
    reason: null,
  };
}
