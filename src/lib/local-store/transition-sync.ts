import type { TimelineTransition } from "@/components/studio/timeline/types";
import { validateTransitionAdjacency } from "@/lib/timeline/transitions";
import { activeElements, newId, newRowTimestamps, type TimelineFile } from "@/lib/local-store/store";

// In-memory port of src/lib/timeline/transition-persistence.ts (the app runs
// these against Supabase). All functions mutate the passed TimelineFile; the
// caller persists it afterwards.

function touchesAny(transition: TimelineTransition, elementIds?: string[]) {
  if (!elementIds || elementIds.length === 0) return true;
  return elementIds.includes(transition.from_element_id) || elementIds.includes(transition.to_element_id);
}

/** Re-validate transitions after element mutations: invalidate ones that no
 *  longer fit, restore previously-invalidated ones that fit again, and keep
 *  duration_seconds at the quantized value. */
export function syncTransitionsForElements(timeline: TimelineFile, elementIds?: string[]) {
  const elements = activeElements(timeline);

  for (const transition of timeline.transitions) {
    if (!touchesAny(transition, elementIds)) continue;
    if (transition.removed_at && transition.removed_reason === "element_removed") continue;

    const validation = validateTransitionAdjacency(
      elements,
      transition.from_element_id,
      transition.to_element_id,
      transition.duration_seconds,
    );

    if (!validation.ok) {
      if (transition.removed_at) continue;
      transition.removed_at = new Date().toISOString();
      transition.removed_reason = "invalidated";
      transition.updated_at = new Date().toISOString();
      continue;
    }

    if (transition.removed_at) {
      if (transition.removed_reason !== "invalidated") continue;
      transition.removed_at = null;
      transition.removed_reason = null;
      transition.duration_seconds = validation.durationSeconds;
      transition.updated_at = new Date().toISOString();
      continue;
    }

    if (Math.abs(validation.durationSeconds - transition.duration_seconds) < 0.0001) continue;
    transition.duration_seconds = validation.durationSeconds;
    transition.updated_at = new Date().toISOString();
  }
}

export function softDeleteTransitionsForElements(timeline: TimelineFile, elementIds: string[]) {
  if (elementIds.length === 0) return;
  for (const transition of timeline.transitions) {
    if (transition.removed_at != null) continue;
    if (!touchesAny(transition, elementIds)) continue;
    transition.removed_at = new Date().toISOString();
    transition.removed_reason = "element_removed";
    transition.updated_at = new Date().toISOString();
  }
}

export function restoreTransitionsForElement(timeline: TimelineFile, elementId: string) {
  const elements = activeElements(timeline);
  for (const transition of timeline.transitions) {
    if (transition.removed_at == null || transition.removed_reason !== "element_removed") continue;
    if (transition.from_element_id !== elementId && transition.to_element_id !== elementId) continue;

    const validation = validateTransitionAdjacency(
      elements,
      transition.from_element_id,
      transition.to_element_id,
      transition.duration_seconds,
    );
    if (!validation.ok) continue;
    transition.removed_at = null;
    transition.removed_reason = null;
    transition.duration_seconds = validation.durationSeconds;
    transition.updated_at = new Date().toISOString();
  }
}

/** After a split, the inserted right segment inherits the original's outgoing transitions. */
export function cloneOutgoingTransitionsForSplit(
  timeline: TimelineFile,
  projectId: string,
  originalElementId: string,
  insertedElementId: string,
) {
  const outgoing = timeline.transitions.filter(
    (transition) => transition.from_element_id === originalElementId && transition.removed_at == null,
  );
  for (const transition of outgoing) {
    timeline.transitions.push({
      id: newId(),
      project_id: projectId,
      from_element_id: insertedElementId,
      to_element_id: transition.to_element_id,
      type: transition.type,
      duration_seconds: transition.duration_seconds,
      params: transition.params ?? {},
      removed_at: null,
      removed_reason: null,
      ...newRowTimestamps(),
    });
  }
}
