"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePanelSize, useWorkspaceSize, WorkspaceResizeHandle } from "@/components/ui/workspace-resize";
import Link from "next/link";
import {MessageSquare, ClipboardCheck} from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DrawerHeaderTab } from "@/components/studio/timeline/DrawerHeader";
import { DesktopChat } from "./DesktopChat";

export type ProposalReply = { id: string; summary: string };
/** Work the review panel hands to the agent in this chat (Repair, Draft): sent as a message the creator sees. */
export type AgentAsk = { id: string; text: string; display: string; label: string };
/**
 * What the current page contributes to each chat message (e.g. the Generate draft and
 * its marks), attached silently. `tips` show under the empty chat's question.
 */
export type PageChatContext = { key: string; label: string; text: string; tips?: string[] };
/**
 * Something the creator selected in an editor panel (a track, caption style, text preset…).
 * It shows as a removable pill in the composer and rides along with each message until
 * removed. `agentText` is what the agent reads; `label` is what the creator sees.
 * `group` lets a panel replace all of its own selections at once.
 */
export type ChatSelection = { id: string; group: string; kind: string; label: string; agentText: string; onRemove?: () => void };
type DockContext = {
  tab: "chat" | "proposals";
  setTab: (tab: "chat" | "proposals") => void;
  setAttentionCount: (count: number) => void;
  marksTarget: HTMLDivElement | null;
  reviewTarget: HTMLDivElement | null;
  replyToProposal: (proposal: ProposalReply) => void;
  askAgent: (ask: AgentAsk) => void;
  setPageContext: (context: PageChatContext | null) => void;
  selections: ChatSelection[];
  toggleSelection: (selection: ChatSelection) => void;
  removeSelection: (id: string) => void;
  replaceSelectionGroup: (group: string, selections: ChatSelection[]) => void;
};
const Context = createContext<DockContext | null>(null);
export const useProjectReviewDock = () => useContext(Context);

/** Everything the creator has selected across the editor, with or without the chat dock. It is saved with the
 *  project (library-selection `items`), so an agent in another window (Claude Code, Codex) reads it through
 *  editor_context_get and timeline_get, and it shows in the editor's Selected list. */
export type AgentSelection = {
  selections: ChatSelection[];
  toggleSelection: (selection: ChatSelection) => void;
  removeSelection: (id: string) => void;
  replaceSelectionGroup: (group: string, selections: ChatSelection[]) => void;
  clearSelections: () => void;
};
const SelectionContext = createContext<AgentSelection | null>(null);
export const useAgentSelection = () => useContext(SelectionContext);

/** Owned by the persistent project shell: switching review tabs never disconnects Chat. */
export function ProjectReviewDock({ projectId, visible, editorActive, children }: {
  projectId: string; visible: boolean; editorActive: boolean; children: ReactNode;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const size = useWorkspaceSize(workspaceRef);
  // Chat may take up to 45% of the window; the editor keeps ~600 px (its panel and viewer minimums).
  const chatMax = Math.max(280, Math.min(size.width * .45, size.width - 600));
  const chat = usePanelSize("dreamcut:chat-panel-width", Math.min(360, size.width * .25), 280, chatMax);
  const [attentionCount, setAttentionCount] = useState(0);
  const [tab, setTab] = useState<"chat" | "proposals">("chat");
  const [marksTarget, setMarksTarget] = useState<HTMLDivElement | null>(null);
  const [reviewTarget, setReviewTarget] = useState<HTMLDivElement | null>(null);
  const [reply, setReply] = useState<ProposalReply | null>(null);
  const [ask, setAsk] = useState<AgentAsk | null>(null);
  const [pageContext, setPageContext] = useState<PageChatContext | null>(null);
  const [selections, setSelections] = useState<ChatSelection[]>([]);
  // Owners hear about removals made from the pill so their own selected state stays honest.
  const selectionsRef = useRef(selections); selectionsRef.current = selections;
  const removeSelection = useCallback((id: string) => {
    selectionsRef.current.find(item => item.id === id)?.onRemove?.();
    setSelections(current => current.filter(item => item.id !== id));
  }, []);
  const toggleSelection = useCallback((selection: ChatSelection) => setSelections(current => current.some(item => item.id === selection.id)
    ? current.filter(item => item.id !== selection.id)
    : [...current, selection]), []);
  const replaceSelectionGroup = useCallback((group: string, next: ChatSelection[]) => setSelections(current => {
    const others = current.filter(item => item.group !== group);
    const unchanged = current.filter(item => item.group === group);
    if (unchanged.length === next.length && unchanged.every((item, index) => item.id === next[index].id && item.label === next[index].label)) return current;
    return [...others, ...next];
  }), []);
  const clearSelections = useCallback(() => {
    for (const item of selectionsRef.current) item.onRemove?.();
    setSelections([]);
  }, []);
  const agentSelection = useMemo<AgentSelection>(() => ({ selections, toggleSelection, removeSelection, replaceSelectionGroup, clearSelections }),
    [selections, toggleSelection, removeSelection, replaceSelectionGroup, clearSelections]);
  // Save what is selected for agents outside this window; brief pauses coalesce rapid clicks into one write.
  useEffect(() => {
    const items = selections.map(item => ({ id: item.id.slice(0, 300), group: item.group.slice(0, 64), kind: item.kind.slice(0, 64),
      label: item.label.slice(0, 300) || item.kind, agent_text: item.agentText.slice(0, 2000) })).slice(0, 300);
    const timer = window.setTimeout(() => {
      void fetch(`/api/projects/${encodeURIComponent(projectId)}/library-selection`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_items", items }) }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(timer);
  }, [projectId, selections]);
  const context = useMemo<DockContext>(() => ({ tab, setTab, setAttentionCount, marksTarget, reviewTarget,
    replyToProposal: proposal => { setReply(proposal); setTab("chat"); },
    askAgent: next => { setAsk(next); setTab("chat"); }, setPageContext,
    selections, toggleSelection, removeSelection, replaceSelectionGroup,
  }), [tab, marksTarget, reviewTarget, selections, toggleSelection, removeSelection, replaceSelectionGroup]);
  // The Editor has no chat: its proposals use the editor's own right drawer and marks sit in the timeline toolbar.
  return <SelectionContext.Provider value={agentSelection}><Context.Provider value={visible ? context : null}>
    <div ref={workspaceRef} className={`project-workspace-body${visible ? " project-workspace-body--docked" : ""}`}>
      <div className="project-workspace-content">{children}</div>
      <aside style={{ width:chat.value, position:"relative" }} className="project-review-dock" aria-label="Chat and Proposals" hidden={!visible}>
        <WorkspaceResizeHandle label="Resize chat panel" axis="x" reverse value={chat.value} min={280} max={chatMax} onChange={chat.change} onReset={chat.reset} style={{left:-4,top:0,bottom:0}} />
        <div className="project-review-header"><SegmentedControl size="sm" fill className="project-review-tabs" role="tablist" aria-label="Chat and Proposals">
          {(["chat", "proposals"] as const).map((value, index) => <DrawerHeaderTab key={value}
            style={{ height: "100%" }} id={`project-dock-tab-${value}`} aria-controls={`project-dock-panel-${value}`} active={tab === value}
            onClick={() => setTab(value)} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "chat" : event.key === "End" ? "proposals" : index === 0 ? "proposals" : "chat";
              setTab(next); document.getElementById(`project-dock-tab-${next}`)?.focus();
            }}>{value === "chat" ? <MessageSquare size={15} aria-hidden="true" /> : <ClipboardCheck size={15} aria-hidden="true" />}<span>{value === "chat" ? "Chat" : "Proposals"}</span>{value === "proposals" && attentionCount > 0 && <span className="proposal-count-badge" aria-label={`${attentionCount} ${attentionCount === 1 ? "item" : "items"} awaiting review`}>{attentionCount}</span>}</DrawerHeaderTab>)}
        </SegmentedControl></div>
        <div className="project-dock-content" id="project-dock-panel-chat" role="tabpanel" aria-labelledby="project-dock-tab-chat" hidden={tab !== "chat"}>
          <DesktopChat projectId={projectId} embedded reply={reply} onClearReply={() => setReply(null)} ask={ask} onAskSent={() => setAsk(null)} pageContext={pageContext} selections={selections} onRemoveSelection={removeSelection} onViewProposals={() => setTab("proposals")} marksSlot={<div ref={setMarksTarget} className="project-chat-marks" />} />
        </div>
        <div className="project-dock-content" id="project-dock-panel-proposals" role="tabpanel" aria-labelledby="project-dock-tab-proposals" hidden={tab !== "proposals"}>
          <div ref={setReviewTarget} className="project-review-target" />
          {!editorActive && <p className="p-4 text-sm text-[var(--ink-secondary)]">Review and tune proposals alongside the timeline. <Link className="underline" href={`/p/${encodeURIComponent(projectId)}`}>Open Editor</Link></p>}
        </div>
      </aside>
    </div>
  </Context.Provider></SelectionContext.Provider>;
}
