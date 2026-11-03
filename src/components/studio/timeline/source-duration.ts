"use client";

import { resolveMediaTiming } from "@/lib/timeline/media";

import type { TimelineElement } from "./types";

const ACTUAL_DURATION_ELEMENT_TYPES = new Set(["music", "vo_segment", "vo_full", "sound_effect"]);

function roundDuration(value: number) {
  return Number(value.toFixed(3));
}

export function clampElementToActualSourceDuration<T extends TimelineElement>(element: T): T {
  if (!ACTUAL_DURATION_ELEMENT_TYPES.has(element.type)) return element;
  if (typeof element._source_duration !== "number" || !Number.isFinite(element._source_duration) || element._source_duration <= 0) {
    return element;
  }

  const maxPlayableDuration = resolveMediaTiming(element).maxPlayableTimelineDuration;
  if (!Number.isFinite(maxPlayableDuration) || maxPlayableDuration <= 0) return element;
  if (element.duration <= maxPlayableDuration) return element;

  return {
    ...element,
    duration: roundDuration(maxPlayableDuration),
  };
}

export function clampElementsToActualSourceDuration<T extends TimelineElement>(elements: T[]): T[] {
  return elements.map(clampElementToActualSourceDuration);
}
