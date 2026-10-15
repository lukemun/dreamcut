import type { TimelineElement } from "./types";

export function compareTimelineElements(a: TimelineElement, b: TimelineElement) {
  if (a.lane_index !== b.lane_index) return a.lane_index - b.lane_index;
  if (a.timeline_start !== b.timeline_start) return a.timeline_start - b.timeline_start;
  return a.created_at.localeCompare(b.created_at);
}

export function sortTimelineElements(elements: TimelineElement[]) {
  return [...elements].sort(compareTimelineElements);
}

export function mergeElementPatch(
  element: TimelineElement,
  patch: Record<string, unknown>,
): TimelineElement {
  return {
    ...element,
    ...patch,
  };
}

export function updateElementInList(
  elements: TimelineElement[],
  elementId: string,
  updater: (element: TimelineElement) => TimelineElement,
) {
  return elements.map((element) => (element.id === elementId ? updater(element) : element));
}

export function mergePatchIntoElementList(
  elements: TimelineElement[],
  elementId: string,
  patch: Record<string, unknown>,
) {
  return updateElementInList(elements, elementId, (element) => mergeElementPatch(element, patch));
}

export function mergePatchesIntoElementList(
  elements: TimelineElement[],
  patches: Array<{ elementId: string; patch: Record<string, unknown> }>,
) {
  const patchById = new Map(patches.map(({ elementId, patch }) => [elementId, patch]));
  return elements.map((element) => {
    const patch = patchById.get(element.id);
    return patch ? mergeElementPatch(element, patch) : element;
  });
}

export function insertTimelineElement(
  elements: TimelineElement[],
  element: TimelineElement,
) {
  return sortTimelineElements([...elements, element]);
}

export function replaceAndInsertTimelineElements(
  elements: TimelineElement[],
  elementId: string,
  updated: TimelineElement,
  inserted: TimelineElement,
) {
  const next = updateElementInList(elements, elementId, () => updated);
  return insertTimelineElement(next, inserted);
}

export function pickElementPatchBeforeState(
  element: TimelineElement,
  patch: Record<string, unknown>,
) {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === "props" && patch.props && typeof patch.props === "object" && !Array.isArray(patch.props)) {
      const existingProps = element.props && typeof element.props === "object"
        ? element.props as Record<string, unknown>
        : {};
      const beforeProps: Record<string, unknown> = { ...existingProps };
      for (const propKey of Object.keys(patch.props as Record<string, unknown>)) {
        if (!Object.prototype.hasOwnProperty.call(existingProps, propKey)) beforeProps[propKey] = null;
      }
      before.props = beforeProps;
    } else {
      before[key] = (element as Record<string, unknown>)[key];
    }
  }
  return before;
}
