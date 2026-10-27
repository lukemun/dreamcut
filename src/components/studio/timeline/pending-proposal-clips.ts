import type { TimelineElement } from "./types";

/**
 * What checked proposals would change on the timeline, from their combined draft: the clips they add
 * (shown faint until applied) and the live clips they replace or remove (shown dimmed).
 */
export function pendingProposalClips(live: readonly TimelineElement[], draft: readonly TimelineElement[]) {
  const liveIds = new Set(live.map((element) => element.id));
  const draftById = new Map(draft.map((element) => [element.id, element]));
  const added = draft.filter((element) => !element.removed_at && !liveIds.has(element.id));
  const outgoingIds = new Set(live
    .filter((element) => !element.removed_at && (!draftById.has(element.id) || draftById.get(element.id)!.removed_at))
    .map((element) => element.id));
  return { added, addedIds: new Set(added.map((element) => element.id)), outgoingIds };
}
