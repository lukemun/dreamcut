import { buildLaneDefs } from "./adapters";
import type { LaneDef, TimelineElement } from "./types";

// The parts of a clip an edit can change; bookkeeping such as updated_at is left out.
const EDITABLE_FIELDS = ["type", "source_url", "timeline_start", "duration", "lane_key", "trim_start", "trim_end", "volume", "fade_in", "fade_out", "playback_rate"] as const;
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};
const clipChanged = (live: TimelineElement, draft: TimelineElement) =>
  EDITABLE_FIELDS.some((field) => stable(live[field]) !== stable(draft[field])) || stable(live.props) !== stable(draft.props);

/**
 * What checked proposals would change on the timeline, from their combined draft: the clips they add
 * (shown faint until applied), the live clips they replace or remove (shown dimmed), and the live clips
 * they change in place, such as a new render, timing or level (tinted for review).
 */
export function pendingProposalClips(live: readonly TimelineElement[], draft: readonly TimelineElement[]) {
  const liveIds = new Set(live.map((element) => element.id));
  const draftById = new Map(draft.map((element) => [element.id, element]));
  const added = draft.filter((element) => !element.removed_at && !liveIds.has(element.id));
  const outgoingIds = new Set(live
    .filter((element) => !element.removed_at && (!draftById.has(element.id) || draftById.get(element.id)!.removed_at))
    .map((element) => element.id));
  const changedIds = new Set(live
    .filter((element) => {
      const next = draftById.get(element.id);
      return !element.removed_at && next && next !== element && !next.removed_at && clipChanged(element, next);
    })
    .map((element) => element.id));
  return { added, addedIds: new Set(added.map((element) => element.id)), outgoingIds, changedIds };
}

/**
 * Whether the timeline shows checked cards' pending clips. Deliberately blind to the Proposals drawer: a
 * card's new lane and clip stay in view after the drawer closes and after a reload.
 */
export function pendingProposalClipsWanted({ proposals, checkedCount }: { proposals: boolean; checkedCount: number }) {
  return proposals && checkedCount > 0;
}

/** The timeline with checked cards' pending clips merged in: the draft's lane order, live lanes keeping their settings. */
export function pendingProposalView({ live, lanes, draft, laneScale }: {
  live: readonly TimelineElement[];
  lanes: readonly LaneDef[];
  draft: { elements: readonly TimelineElement[]; laneOrderKeys: readonly string[] };
  laneScale: number;
}) {
  const { added, addedIds, outgoingIds, changedIds } = pendingProposalClips(live, draft.elements);
  if (added.length === 0 && outgoingIds.size === 0 && changedIds.size === 0) return null;
  const combined = [...live, ...added];
  const liveLaneByKey = new Map(lanes.map((lane) => [lane.key, lane]));
  const draftLanes = buildLaneDefs(combined.filter((element) => !element.removed_at), new Map(), laneScale, {}, draft.laneOrderKeys);
  const merged = draftLanes.map((lane) => liveLaneByKey.get(lane.key) ?? lane);
  for (const lane of lanes) if (!merged.some((candidate) => candidate.key === lane.key)) merged.push(lane);
  return { elements: combined, lanes: merged, pendingIds: addedIds, outgoingIds, changedIds };
}
