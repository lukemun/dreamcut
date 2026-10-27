import type { TimelineElement } from "./types";

/**
 * A proposal that edits an actor on an already-muted (silent) or hidden (no
 * picture) lane must still be seen and heard while it is being reviewed. This is
 * a preview-only projection: lanes newly muted by the proposal remain muted, and
 * the saved timeline is never changed. The same rule resolves both lane sets.
 */
export function resolveProposalPreviewMutedLanes({
  liveMutedLanes,
  previewMutedLaneKeys,
  previewElements,
  touchedElementIds,
}: {
  liveMutedLanes: ReadonlySet<string>;
  previewMutedLaneKeys: readonly string[];
  previewElements: readonly TimelineElement[];
  touchedElementIds: readonly string[];
}) {
  const resolved = new Set(previewMutedLaneKeys);
  const touched = new Set(touchedElementIds);
  for (const element of previewElements) {
    if (!touched.has(element.id)) continue;
    if (!liveMutedLanes.has(element.lane_key)) continue;
    resolved.delete(element.lane_key);
  }
  return resolved;
}

export function resolveProposalPreviewHiddenLanes({
  liveHiddenLanes,
  previewHiddenLaneKeys,
  previewElements,
  touchedElementIds,
}: {
  liveHiddenLanes: ReadonlySet<string>;
  previewHiddenLaneKeys: readonly string[];
  previewElements: readonly TimelineElement[];
  touchedElementIds: readonly string[];
}) {
  return resolveProposalPreviewMutedLanes({
    liveMutedLanes: liveHiddenLanes,
    previewMutedLaneKeys: previewHiddenLaneKeys,
    previewElements,
    touchedElementIds,
  });
}

/** A touched actor revealed from a live hidden lane is brought to the front while reviewed. */
export function resolveProposalPreviewLaneOrder({
  liveHiddenLanes,
  previewLaneOrderKeys,
  previewElements,
  touchedElementIds,
}: {
  liveHiddenLanes: ReadonlySet<string>;
  previewLaneOrderKeys: readonly string[];
  previewElements: readonly TimelineElement[];
  touchedElementIds: readonly string[];
}) {
  const touched = new Set(touchedElementIds);
  const revealedLaneKeys = new Set(previewElements
    .filter((element) => touched.has(element.id) && liveHiddenLanes.has(element.lane_key))
    .map((element) => element.lane_key));
  if (revealedLaneKeys.size === 0) return [...previewLaneOrderKeys];
  return [
    ...previewLaneOrderKeys.filter((laneKey) => revealedLaneKeys.has(laneKey)),
    ...previewLaneOrderKeys.filter((laneKey) => !revealedLaneKeys.has(laneKey)),
  ];
}
