"use client";
import { useCallback, useMemo, useState } from "react";
import { useAgentSelection, useProjectReviewDock, type ChatSelection } from "@/components/desktop/ProjectReviewDock";

export type PanelSelection = Omit<ChatSelection, "group" | "onRemove">;

/**
 * Click-to-select for editor panels. A selection never edits the timeline; it joins the project's
 * selection, which the agent reads and the editor lists (a chat pill in the desktop dock, the Selected
 * list beside Marks otherwise). Outside a project, selection stays local to the panel.
 */
export function useChatSelection(group: string) {
  const shared = useAgentSelection();
  const sendsToChat = useProjectReviewDock() != null;
  const [local, setLocal] = useState<string[]>([]);
  const selectedIds = useMemo(() => new Set(shared
    ? shared.selections.filter(item => item.group === group).map(item => item.id)
    : local), [shared, group, local]);
  const toggle = useCallback((selection: PanelSelection) => {
    if (shared) shared.toggleSelection({ ...selection, group });
    else setLocal(current => current.includes(selection.id) ? current.filter(id => id !== selection.id) : [...current, selection.id]);
  }, [shared, group]);
  return { selectedIds, toggle, sendsToChat, sharesWithAgent: shared != null };
}
