"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { useWorkspaceChrome } from "@/app/WorkspaceChrome";
import { createPortal } from "react-dom";
import { usePanelShortcuts } from "@/components/studio/hooks/usePanelShortcuts";
import { Check, DownloadIcon, Clapperboard, ClipboardCheckIcon, MoreHorizontal, RectangleHorizontal, RectangleVertical, HistoryIcon, ImagesIcon, LayoutList, Library as LibraryIcon, Redo2Icon, Undo2Icon, UserRound } from "lucide-react";


import { cn } from "@/lib/utils";
import type { ProjectVersion } from "@/lib/local-store/project-versions";


type Props = {
  currentProjectId: string;
  projectTitle: string;
  versions: ProjectVersion[];
  activeView?: "editor" | "storyboard" | "generate" | "library" | "guide" | "user" | "history";
  memoryAttentionCount?: number;
};

export function ProjectVersionHeader({ currentProjectId, projectTitle, versions, activeView = "editor", memoryAttentionCount = 0 }: Props) {

  const { projectActions: target, setExportActions, setEditActions, setLayoutActions } = useWorkspaceChrome();
  if (!target) return null;
  return createPortal(
    <header className="editor-chrome timeline-project-header relative z-[1100] flex h-12 shrink-0 items-center gap-3 border-b border-[var(--chrome-line)] px-3">
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {versions.length > 1 ? (
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto py-1" aria-label="Project versions">
            <span className="shrink-0 px-2 text-sm font-medium text-[var(--ink-secondary)]">Versions</span>
            {versions.map((version) => {
              const isCurrent = version.projectId === currentProjectId;
              return (
                <Link
                  key={version.projectId}
                  href={`/p/${version.projectId}`}
                  aria-current={isCurrent ? "page" : undefined}
                  title={version.title}
                  className={cn(
                    "flex min-h-8 shrink-0 items-center rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isCurrent
                      ? "border-[var(--chrome-selected-ring)] bg-[var(--chrome-raised)] font-semibold text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                      : "border-transparent bg-transparent font-medium text-[var(--ink-secondary)] hover:border-[var(--chrome-line-strong)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]",
                  )}
                >
                  {version.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      <SegmentedControl as="nav" size="sm" className="timeline-project-nav" aria-label="Project sections">
        {/* Icons with names on hover, so the header's controls keep their room. */}
        {([
          ["editor", "Editor", `/p/${currentProjectId}`, Clapperboard],
          ["storyboard", "Storyboard", `/p/${currentProjectId}/storyboard`, LayoutList],
          ["library", "Library", `/p/${currentProjectId}/library`, LibraryIcon],
        ] as const).map(([view, label, href, Icon]) => <Link
          key={view}
          href={href}
          prefetch={true}
          aria-label={label}
          title={label}
          aria-current={(activeView === view || (view === "editor" && activeView === "history")) ? "page" : undefined}
        ><Icon size={16} aria-hidden="true" /></Link>)}
      </SegmentedControl>
        {/* The editor fills these: the Tall/Wide workspace switch, then Undo/History/Redo, Library and Proposals.
            Other sections show the same controls, unavailable, so the header never shifts between sections. */}
        <div ref={setLayoutActions} className="workspace-layout-actions">{activeView !== "editor" && <EditorOnlyLayout />}</div>
        <div ref={setEditActions} className="workspace-edit-actions">{activeView !== "editor" && <EditorOnlyActions />}</div>
        <div id="timeline-project-header-actions" ref={setExportActions} className="flex min-w-20 shrink-0 items-center justify-end [&>div]:w-full [&>div]:min-w-0">{activeView !== "editor" && <Button variant="outline" size="sm" disabled title="Export from Editor"><DownloadIcon data-icon="inline-start" /><span className="workspace-action-label">Export</span></Button>}</div>
        <HeaderMoreMenu userHref={`/?view=user&project=${encodeURIComponent(currentProjectId)}`} />
        {/* Opens the dashboard's User view (My Style, Skills, Settings) with this project as context. */}
        <Link href={`/?view=user&project=${encodeURIComponent(currentProjectId)}`} className="workspace-user-link" aria-label="You: style, skills and settings" title="You: style, skills and settings">
          <UserRound size={16} aria-hidden="true" /></Link>
      </div>
    </header>, target
  );
}

const EDITOR_ONLY = "Available in the Editor";

/** The Editor's Tall/Wide switch, shown unavailable in other sections so the header keeps its shape. */
function EditorOnlyLayout() {
  return <div role="group" aria-label="Editor layout" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
    {[[8, 13], [13, 8]].map(([width, height], index) => <button key={index} type="button" disabled title={EDITOR_ONLY}
      aria-label={index ? "Use wide editor layout" : "Use tall editor layout"}>
      <span aria-hidden="true" style={{ display: "block", width, height, borderRadius: 2, border: "1.5px solid currentColor" }} />
    </button>)}
  </div>;
}

/** Undo/History/Redo and the Library and Proposals panels, unavailable outside the Editor. */
function EditorOnlyActions() {
  const shortcuts = usePanelShortcuts();
  // The same names as the Editor's buttons, so both have the same width.
  const withShortcut = (label: string, shortcut: string) => shortcut === "Off" ? label : `${label} · ${shortcut}`;
  return <div role="group" aria-label="Edit and panels" className="workspace-edit-actions-group">
    <div className="timeline-history-controls" role="group" aria-label="Undo, history and redo" style={{ display: "flex" }}>
      {([["Undo", Undo2Icon], ["Open edit history", HistoryIcon], ["Redo", Redo2Icon]] as const).map(([label, Icon]) =>
        <button key={label} type="button" disabled aria-label={label} title={EDITOR_ONLY}><Icon aria-hidden="true" /></button>)}
    </div>
    <div className="timeline-history-controls workspace-panel-group" role="group" aria-label="Panels" style={{ display: "flex" }}>
      {([["Open Library", "Library", ImagesIcon, shortcuts.library], ["Open Proposals", "Proposals", ClipboardCheckIcon, shortcuts.proposals]] as const).map(([label, name, Icon, shortcut]) =>
        <button key={label} type="button" disabled aria-label={label} title={withShortcut(EDITOR_ONLY, shortcut)} className="workspace-panel-button" style={{ gap: "0.35rem" }}><Icon aria-hidden="true" /><span className="workspace-panel-label">{name}</span></button>)}
    </div>
  </div>;
}

/**
 * Narrow windows: the Tall/Wide switch and You fold into one menu so the project name keeps its room.
 * Each item presses the real control it stands for, so state stays with that control.
 */
function HeaderMoreMenu({ userHref }: { userHref: string }) {
  const router = useRouter();
  const control = (label: string) => document.querySelector<HTMLButtonElement>(`#workspace-project-actions .workspace-layout-actions button[aria-label="${label}"]`);
  return <div className="workspace-header-more">
    <ActionMenu trigger={<Button variant="ghost" size="icon-sm" aria-label="More" title="More"><MoreHorizontal aria-hidden="true" /></Button>}>
      {([["Tall layout", "Use tall editor layout", RectangleVertical], ["Wide layout", "Use wide editor layout", RectangleHorizontal]] as const).map(([name, label, Icon]) =>
        <ActionMenuItem key={label} icon={control(label)?.getAttribute("aria-pressed") === "true" ? <Check /> : <Icon />}
          disabled={!control(label) || control(label)!.disabled} onClick={() => control(label)?.click()}>{name}</ActionMenuItem>)}
      <ActionMenuItem icon={<UserRound />} onClick={() => router.push(userHref)}>Style, skills and settings</ActionMenuItem>
    </ActionMenu>
  </div>;
}
