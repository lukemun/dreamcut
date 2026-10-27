"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import Link from "next/link";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Keycap } from "@/components/ui/keycap";
import { useOptionalWorkspaceChrome, useWorkspaceChrome } from "@/app/WorkspaceChrome";
import { createPortal } from "react-dom";
import { useProjectLibrary } from "@/components/studio/timeline/ProjectLibraryDrawer";
import { useKeyboardShortcuts } from "@/components/studio/hooks/useKeyboardShortcuts";
import { Check, DownloadIcon, Clapperboard, ClipboardCheckIcon, MoreHorizontal, RectangleHorizontal, RectangleVertical, HistoryIcon, ImagesIcon, LayoutList, Library as LibraryIcon, Redo2Icon, Undo2Icon, UserRound } from "lucide-react";


import { cn } from "@/lib/utils";
import type { ProjectVersion } from "@/lib/local-store/project-versions";


type Props = {
  currentProjectId: string;
  projectTitle: string;
  versions: ProjectVersion[];
  activeView?: "editor" | "storyboard" | "generate" | "library" | "guide" | "user" | "history";
};

export function ProjectVersionHeader({ currentProjectId, projectTitle, versions, activeView = "editor" }: Props) {

  const { projectActions: target, setExportActions, setEditActions, setLayoutActions } = useWorkspaceChrome();
  if (!target) return null;
  return createPortal(
    <header className="editor-chrome timeline-project-header relative z-(--layer-header) flex h-12 shrink-0 items-center gap-3 border-b border-[var(--chrome-line)] px-3">
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
                      : "border-transparent bg-transparent font-medium text-[var(--ink-secondary)] hover:border-[var(--edge-outline)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]",
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
          ["user", "User", `/p/${currentProjectId}/user`, UserRound],
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
            Every section, and the editor while it loads, shows the same controls unavailable, so the header never
            changes shape; the editor's own controls replace them once mounted (editor-glass.css). */}
        <div ref={setLayoutActions} className="workspace-layout-actions"><EditorOnlyLayout /></div>
        <div ref={setEditActions} className="workspace-edit-actions"><EditorOnlyActions editorLoading={activeView === "editor"} /></div>
        <div id="timeline-project-header-actions" ref={setExportActions} className="flex min-w-20 shrink-0 items-center justify-end [&>div]:w-full [&>div]:min-w-0"><Button className="editor-only-placeholder" variant="outline" size="sm" disabled title="Export from Editor"><DownloadIcon data-icon="inline-start" /><span className="workspace-action-label">Export</span></Button></div>
        <HeaderMoreMenu />
      </div>
    </header>, target
  );
}

const EDITOR_ONLY = "Available in the Editor";

/** The Editor's Tall/Wide switch, shown unavailable in other sections so the header keeps its shape. */
function EditorOnlyLayout() {
  return <div role="group" aria-label="Editor layout" className="editor-only-placeholder" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
    {[[8, 13], [13, 8]].map(([width, height], index) => <button key={index} type="button" disabled title={EDITOR_ONLY}
      aria-label={index ? "Use wide editor layout" : "Use tall editor layout"}>
      <span aria-hidden="true" style={{ display: "block", width, height, borderRadius: 2, border: "1.5px solid currentColor" }} />
    </button>)}
  </div>;
}

/** History and proposals remain editor-owned; Library is available throughout the project. */
function EditorOnlyActions({ editorLoading = false }: { editorLoading?: boolean }) {
  const shortcuts = useKeyboardShortcuts();
  const library = useProjectLibrary();
  const history = useOptionalWorkspaceChrome()?.pageHistory;
  // The same icons and keys as the Editor's buttons, so both have the same width.
  const withShortcut = (label: string, shortcut: string) => shortcut === "Off" ? label : `${label} · ${shortcut}`;
  return <div role="group" aria-label="Edit and panels" className="workspace-edit-actions-group editor-only-placeholder">
    <div className="timeline-history-controls" role="group" aria-label="Undo, history and redo" style={{ display: "flex" }}>
      {([["Undo", Undo2Icon, shortcuts.undo], ["Open edit history", HistoryIcon, "Off"], ["Redo", Redo2Icon, shortcuts.redo]] as const).map(([label, Icon, shortcut]) => {
        // A section with its own history (Storyboard) supplies Undo/Redo; edit history stays the editor's.
        const action = label === "Undo" ? history?.canUndo && history.undo : label === "Redo" ? history?.canRedo && history.redo : null;
        return <button key={label} type="button" disabled={!action} aria-label={label} title={history && label !== "Open edit history" ? withShortcut(label, shortcut) : EDITOR_ONLY} onClick={action || undefined}><Icon aria-hidden="true" /></button>;
      })}
    </div>
    <div className="timeline-history-controls workspace-panel-group" role="group" aria-label="Panels" style={{ display: "flex" }}>
      {([["Open Library", ImagesIcon, shortcuts.library], ["Open Proposals", ClipboardCheckIcon, shortcuts.proposals]] as const).map(([label, Icon, shortcut]) =>
        label === "Open Library"
          ? <button key={label} type="button" disabled={editorLoading} aria-label={label} aria-pressed={library?.open ?? false} aria-keyshortcuts={shortcut === "Off" ? undefined : shortcut} title={withShortcut("Library", shortcut)}
            className="workspace-panel-button" style={{ gap: "0.35rem" }} onClick={() => library?.toggle()}><Icon aria-hidden="true" />{shortcut !== "Off" && <Keycap>{shortcut}</Keycap>}</button>
          : <button key={label} type="button" disabled aria-label={label} title={withShortcut(EDITOR_ONLY, shortcut)} className="workspace-panel-button" style={{ gap: "0.35rem" }}><Icon aria-hidden="true" />{shortcut !== "Off" && <Keycap>{shortcut}</Keycap>}</button>)}
    </div>
  </div>;
}

/**
 * Narrow windows: the Tall/Wide switch folds into one menu so the project name keeps its room.
 * Each item presses the real control it stands for, so state stays with that control.
 */
function HeaderMoreMenu() {
  const control = (label: string) => document.querySelector<HTMLButtonElement>(`#workspace-project-actions .workspace-layout-actions > :not(.editor-only-placeholder) button[aria-label="${label}"]`)
    ?? document.querySelector<HTMLButtonElement>(`#workspace-project-actions .workspace-layout-actions button[aria-label="${label}"]`);
  return <div className="workspace-header-more">
    <ActionMenu trigger={<Button variant="ghost" size="icon-sm" aria-label="More" title="More"><MoreHorizontal aria-hidden="true" /></Button>}>
      {([["Tall layout", "Use tall editor layout", RectangleVertical], ["Wide layout", "Use wide editor layout", RectangleHorizontal]] as const).map(([name, label, Icon]) =>
        <ActionMenuItem key={label} icon={control(label)?.getAttribute("aria-pressed") === "true" ? <Check /> : <Icon />}
          disabled={!control(label) || control(label)!.disabled} onClick={() => control(label)?.click()}>{name}</ActionMenuItem>)}
    </ActionMenu>
  </div>;
}
