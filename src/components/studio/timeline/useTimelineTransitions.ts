import { clipSourceFileName } from "./clip-labels";
import { buildTimelineTransitionLayout, validateTransitionAdjacency } from "@/lib/timeline/transitions";
import { isVisualLane } from "@/lib/timeline/lanes";

import type { BeatMarker, TimelineElement, TimelineTransition } from "./types";

export function timelineElementInspectorLabel(
  element: Pick<TimelineElement, "id" | "type" | "beat_id"> & Partial<Pick<TimelineElement, "props" | "source_url">>,
  beatMarkers: Array<Pick<BeatMarker, "id" | "beat_label">>,
) {
  const beatLabel = element.beat_id ? beatMarkers.find((beat) => beat.id === element.beat_id)?.beat_label : null;
  const authored = [element.props?.compound_clip_label, element.props?.timeline_label, element.props?.title]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const filename = clipSourceFileName(element);
  return authored ?? beatLabel ?? filename ?? `${element.type === "still" ? "Still" : "Video"} ${element.id.slice(0, 4)}`;
}

export function buildTimelineTransitionState(
  elements: TimelineElement[],
  transitions: TimelineTransition[],
) {
  const transitionLayout = buildTimelineTransitionLayout(elements, transitions);
  const activeTransitionIds = new Set(transitionLayout.transitionChips.map((chip) => chip.id));

  return {
    renderedElements: transitionLayout.renderedElements,
    transitionChips: transitionLayout.transitionChips,
    activeTransitionIds,
    effectiveDurationSeconds: transitionLayout.effectiveDurationSeconds,
  };
}

export function selectElementTransitions(
  selectedElement: TimelineElement | null,
  transitions: TimelineTransition[],
  activeTransitionIds: Set<string>,
) {
  const selectedElementOutgoingTransition = selectedElement
    ? transitions.find(
      (transition) =>
        !transition.removed_at
        && activeTransitionIds.has(transition.id)
        && transition.from_element_id === selectedElement.id,
    ) ?? null
    : null;

  const selectedElementIncomingTransition = selectedElement
    ? transitions.find(
      (transition) =>
        !transition.removed_at
        && activeTransitionIds.has(transition.id)
        && transition.to_element_id === selectedElement.id,
    ) ?? null
    : null;

  return {
    selectedElementOutgoingTransition,
    selectedElementIncomingTransition,
  };
}

export function selectTransitionCreateCandidate(
  selectedElement: TimelineElement | null,
  selectedElementOutgoingTransition: TimelineTransition | null,
  elements: TimelineElement[],
  beatMarkers: BeatMarker[],
) {
  if (!selectedElement || selectedElementOutgoingTransition || !isVisualLane(selectedElement.lane_key)) return null;

  return transitionJoinAvailability(selectedElement, elements, beatMarkers).candidate;
}

/** Selection-only join discovery; the server uses the same frame-based validator. */
export function transitionJoinAvailability(selected: TimelineElement | null, elements: TimelineElement[], beats: BeatMarker[]) {
  if (!selected || !isVisualLane(selected.lane_key)) return { candidate: null, reason: "Transitions connect picture clips on the same lane." };
  const lane = elements.filter(e => !e.removed_at && e.lane_key === selected.lane_key).sort((a, b) => a.timeline_start - b.timeline_start || a.created_at.localeCompare(b.created_at));
  const index = lane.findIndex(e => e.id === selected.id);
  const next = index < 0 ? null : lane[index + 1];
  if (!next) return { candidate: null, reason: "No next clip on this lane. Use Exit for this clip’s ending." };
  const validation = validateTransitionAdjacency(elements.filter(e => !e.removed_at), selected.id, next.id, 0.5);
  if (!validation.ok) return { candidate: null, reason: validation.reason };
  return { candidate: { fromElementId: selected.id, toElementId: next.id, fromLabel: timelineElementInspectorLabel(selected, beats), toLabel: timelineElementInspectorLabel(next, beats) }, reason: null };
}
