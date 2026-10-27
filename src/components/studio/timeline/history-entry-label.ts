import {
  describeElementPatch,
  describeElementPatches,
  describeElementPresence,
  historyOperationLabel,
  type HistoryElementLike,
} from "@/lib/timeline/history-label";
import type { HistoryEntry } from "./useTimelineHistory";

export type HistoryElementLookup = (elementId: string) => HistoryElementLike | null | undefined;

/** Plain description of one in-session Undo step, named from the change it holds. */
export function historyEntryLabel(entry?: HistoryEntry, lookup: HistoryElementLookup = () => null): string {
  if (!entry) return "nothing in this session";
  switch (entry.type) {
    case "snapshot":
      return entry.label === "agent edit" ? "Apply proposal" : historyOperationLabel(entry.label.replaceAll(" ", "_"));
    case "patch":
      return describeElementPatch(lookup(entry.elementId) ?? null, entry.before, entry.after);
    case "batch_patch":
      return describeElementPatches(entry.patches.map(patch => ({ element: lookup(patch.elementId) ?? null, before: patch.before, after: patch.after })));
    case "delete":
      return describeElementPresence(entry.element, "remove");
    case "create":
      return describeElementPresence(entry.element, "add");
    case "split":
      return describeElementPresence(lookup(entry.originalId) ?? entry.insertedElement, "split");
    case "lane_structure":
      return entry.deletedElements?.length ? "Remove track" : "Change tracks";
    case "transition_mutation":
      return entry.before && entry.after ? "Change transition" : entry.after ? "Add transition" : "Remove transition";
    case "beat_durations":
      return "Change beat timing";
    case "caption_lane_style":
      return "Style captions";
    default:
      return "Edit";
  }
}
