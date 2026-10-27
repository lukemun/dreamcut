"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { selectTimelineSelection, type TimelineNormalizedState } from "./timeline-selectors";
import type { TimelineElement, TimelineTransition } from "./types";

export function sanitizeSelectedIds(selectedIds: string[], validElementIds: Set<string>) {
  return selectedIds.filter((id) => validElementIds.has(id));
}

export function sanitizeSelectedTransitionId(
  selectedTransitionId: string | null,
  transitions: TimelineTransition[],
  activeTransitionIds: Set<string>,
) {
  if (!selectedTransitionId) return null;
  const transition = transitions.find((candidate) => candidate.id === selectedTransitionId && !candidate.removed_at) ?? null;
  if (!transition) return null;
  return activeTransitionIds.has(transition.id) ? transition.id : null;
}

export function selectActiveTimelineTransition(
  transitions: TimelineTransition[],
  selectedTransitionId: string | null,
  activeTransitionIds: Set<string>,
) {
  if (!selectedTransitionId) return null;
  return transitions.find(
    (transition) =>
      transition.id === selectedTransitionId
      && !transition.removed_at
      && activeTransitionIds.has(transition.id),
  ) ?? null;
}

type UseTimelineSelectionArgs = {
  elements: TimelineElement[];
  transitions: TimelineTransition[];
  timelineState: TimelineNormalizedState;
  activeTransitionIds: Set<string>;
};

export function useTimelineSelection({
  elements,
  transitions,
  timelineState,
  activeTransitionIds,
}: UseTimelineSelectionArgs) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);

  const selectedId = selectedIds.at(-1) ?? null;

  const setSelectedId = useCallback((elementId: string | null) => {
    setSelectedTransitionId(null);
    setSelectedIds(elementId ? [elementId] : []);
  }, []);

  const selectTransition = useCallback((transitionId: string | null) => {
    setSelectedTransitionId(transitionId);
    if (transitionId) {
      setSelectedIds([]);
      setSelectedBeatId(null);
    }
  }, []);

  useEffect(() => {
    const validElementIds = new Set(elements.map((element) => element.id));
    setSelectedIds((prev) => {
      const next = sanitizeSelectedIds(prev, validElementIds);
      return next.length === prev.length ? prev : next;
    });
  }, [elements]);

  useEffect(() => {
    setSelectedTransitionId((prev) => {
      const next = sanitizeSelectedTransitionId(prev, transitions, activeTransitionIds);
      return next === prev ? prev : next;
    });
  }, [activeTransitionIds, transitions]);

  const selection = useMemo(
    () => selectTimelineSelection(timelineState, selectedId, selectedBeatId),
    [selectedBeatId, selectedId, timelineState],
  );

  const selectedTransition = useMemo(
    () => selectActiveTimelineTransition(transitions, selectedTransitionId, activeTransitionIds),
    [activeTransitionIds, selectedTransitionId, transitions],
  );

  return {
    selectedIds,
    setSelectedIds,
    selectedId,
    setSelectedId,
    selectedBeatId,
    setSelectedBeatId,
    selectedTransitionId,
    setSelectedTransitionId,
    selectedTransition,
    selectTransition,
    ...selection,
  };
}
