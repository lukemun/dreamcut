import { buildCompositionElements } from "./adapters";
import type { BeatMarker, TimelineElement } from "./types";
import type { CompositionElement } from "@/lib/render/composition-adapters";

export type TimelineNormalizedState = {
  elementsById: Record<string, TimelineElement>;
  orderedElementIds: string[];
  laneElementIds: Record<string, string[]>;
  laneBuckets: Record<string, TimelineElement[]>;
  beatsById: Record<string, BeatMarker>;
};

export type TimelineSelection = {
  selectedElement: TimelineElement | null;
  selectedBeat: BeatMarker | null;
  selectedBeatLabel: string | null;
};

export function buildTimelineNormalizedState(
  elements: TimelineElement[],
  beats: BeatMarker[],
): TimelineNormalizedState {
  const elementsById: Record<string, TimelineElement> = {};
  const orderedElementIds: string[] = [];
  const laneElementIds: Record<string, string[]> = {};
  const laneBuckets: Record<string, TimelineElement[]> = {};

  for (const element of elements) {
    elementsById[element.id] = element;
    orderedElementIds.push(element.id);

    const laneIds = laneElementIds[element.lane_key] ?? (laneElementIds[element.lane_key] = []);
    laneIds.push(element.id);

    const laneBucket = laneBuckets[element.lane_key] ?? (laneBuckets[element.lane_key] = []);
    laneBucket.push(element);
  }

  const beatsById: Record<string, BeatMarker> = {};
  for (const beat of beats) {
    beatsById[beat.id] = beat;
  }

  return {
    elementsById,
    orderedElementIds,
    laneElementIds,
    laneBuckets,
    beatsById,
  };
}

export function selectTimelineSelection(
  state: TimelineNormalizedState,
  selectedId: string | null,
  selectedBeatId: string | null,
): TimelineSelection {
  const selectedElement = selectedId ? state.elementsById[selectedId] ?? null : null;
  const selectedBeat = selectedBeatId ? state.beatsById[selectedBeatId] ?? null : null;
  const selectedBeatLabel = selectedElement?.beat_id
    ? state.beatsById[selectedElement.beat_id]?.beat_label ?? null
    : null;

  return {
    selectedElement,
    selectedBeat,
    selectedBeatLabel,
  };
}

export function selectLaneBuckets(state: TimelineNormalizedState): Record<string, TimelineElement[]> {
  return state.laneBuckets;
}

export function selectLaneElements(state: TimelineNormalizedState, laneKey: string): TimelineElement[] {
  return state.laneElementIds[laneKey]?.map((elementId) => state.elementsById[elementId]).filter(
    (element): element is TimelineElement => !!element,
  ) ?? [];
}

export function collectTimelineLaneKeys(
  state: TimelineNormalizedState,
  extraLaneKeys: Iterable<string>,
): Set<string> {
  const keys = new Set<string>(Object.keys(state.laneElementIds));
  for (const key of extraLaneKeys) {
    keys.add(key);
  }
  return keys;
}

export function buildRenderedTimelineElements(
  elements: TimelineElement[],
  overflowHoldStartFrameByElementId: Record<string, string>,
  overflowHoldEndFrameByElementId: Record<string, string>,
): TimelineElement[] {
  return elements.map((element) => {
    const overflowHoldStartFrameUrl = overflowHoldStartFrameByElementId[element.id];
    const overflowHoldEndFrameUrl = overflowHoldEndFrameByElementId[element.id];
    if (!overflowHoldStartFrameUrl && !overflowHoldEndFrameUrl) return element;
    return {
      ...element,
      props: {
        ...(element.props ?? {}),
        ...(overflowHoldStartFrameUrl ? { overflow_hold_start_frame_url: overflowHoldStartFrameUrl } : {}),
        ...(overflowHoldEndFrameUrl ? { overflow_hold_frame_url: overflowHoldEndFrameUrl } : {}),
      },
    };
  });
}

export function selectFirstRenderableVisual(elements: TimelineElement[]): TimelineElement | null {
  return (
    elements.find(
      (element) =>
        (element.type === "still" || element.type === "video_clip")
        && typeof element.source_url === "string"
        && element.source_url.length > 0,
    ) ?? null
  );
}

export function buildTimelineCompositionElements(
  elements: TimelineElement[],
  mutedLanes: ReadonlySet<string>,
  hiddenLanes: ReadonlySet<string> = new Set(),
): CompositionElement[] {
  return buildCompositionElements(elements, mutedLanes, hiddenLanes);
}
