"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ProjectReviewDock } from "@/components/desktop/ProjectReviewDock";
import { ProjectLibraryProvider } from "@/components/studio/timeline/ProjectLibraryDrawer";
import { ProjectVersionHeader } from "./ProjectVersionHeader";
import { getStoredItem } from "@/lib/persisted-key";
import { OPEN_GENERATE_EVENT } from "@/components/studio/generation/open-generate";
import { assetGenerationPoll, libraryPresentationPoll } from "@/components/studio/timeline/shared-poll";

/** Typing in a field, or media playing: bringing up Generate now would interrupt the creator. */
function creatorIsBusy() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return true;
  return [...document.querySelectorAll("video, audio")].some(media => !(media as HTMLMediaElement).paused);
}

/** The project frame survives section navigation, including loading states. */
export function ProjectShell({ children, ...header }: ComponentProps<typeof ProjectVersionHeader> & { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = pathname.split("/")[3];
  const activeView = section === "generate" || section === "storyboard" || section === "library" || section === "guide" || section === "user" || section === "history" ? section : "editor";
  const embedded = activeView === "editor" && searchParams.get("embed") === "1";
  useEffect(() => {
    if (embedded) return;
    const projectId = header.currentProjectId, key = `dreamcut:library-presentation:${projectId}`;
    let seen: string | null = null;
    try { seen = getStoredItem(sessionStorage, key); } catch { /* In-memory fallback. */ }
    // Shared with the Library catalog: one visibility-aware conditional poll.
    return libraryPresentationPoll(projectId).subscribe(({ presentation }) => {
      if (!presentation?.id || presentation.id === seen) return;
      seen = presentation.id;
      try { sessionStorage.setItem(key, seen); } catch { /* In-memory fallback. */ }
      if (activeView !== "library") router.push(`/p/${encodeURIComponent(projectId)}/library?presentation=${encodeURIComponent(presentation.id)}`);
    });
  }, [header.currentProjectId, embedded, activeView, router]);
  // Previews made at an earlier quality are refreshed only once this tab is in front of the creator, so
  // projects left open in background tabs or other windows never take the machine from the one being edited.
  useEffect(() => {
    if (embedded) return;
    const projectId = header.currentProjectId;
    let done = false;
    const refresh = () => {
      if (done || document.visibilityState !== "visible" || !document.hasFocus()) return;
      done = true;
      void fetch(`/api/projects/${encodeURIComponent(projectId)}/media-preparation`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_stale: true }),
      }).catch(() => { done = false; });
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [header.currentProjectId, embedded]);
  // An agent-staged generation draft opens Generate once per staging. The baseline is the draft present on the
  // first visit, so old drafts never pop up; a draft staged while the creator is busy waits behind a quiet notice.
  const [draftNotice, setDraftNotice] = useState(false);
  useEffect(() => {
    if (embedded) return;
    const projectId = header.currentProjectId, key = `dreamcut:generation-draft-seen:${projectId}`;
    let seen: string | null | undefined;
    try { seen = getStoredItem(localStorage, key); } catch { /* In-memory fallback. */ }
    const remember = (id: string) => { seen = id; try { localStorage.setItem(key, id); } catch { /* In-memory fallback. */ } };
    return assetGenerationPoll<{ workspace: { stagedId?: string } }>(projectId).subscribe(({ workspace }) => {
      const stagedId = workspace?.stagedId;
      if (!stagedId || stagedId === seen) return;
      const first = seen === null || seen === undefined;
      remember(stagedId);
      if (first) return;
      if (creatorIsBusy()) setDraftNotice(true);
      else openGenerateDrawer(projectId);
    });
  }, [header.currentProjectId, embedded, activeView, router]);
  /** Library hosts the Generate drawer: open it in place, or go to Library with it open. */
  function openGenerateDrawer(projectId: string) {
    if (activeView === "library") window.dispatchEvent(new CustomEvent(OPEN_GENERATE_EVENT, { detail: { pane: "create" } }));
    else router.push(`/p/${encodeURIComponent(projectId)}/library?generate=create`);
  }
  // Chat and Proposals dock: desktop app only (a browser driven from Claude Code or Codex has its own chat), and
  // only beside the Storyboard. The Editor keeps proposals in its own drawer.
  const [desktopApp, setDesktopApp] = useState(false);
  useEffect(() => { setDesktopApp(Boolean(window.dreamcutDesktop)); }, []);
  return <ProjectLibraryProvider projectId={header.currentProjectId} route={activeView}><main className="editor-chrome editor-glass-workspace flex h-[100vh] h-[100dvh] min-h-0 flex-col overflow-hidden">
    {!embedded && <ProjectVersionHeader {...header} activeView={activeView} />}
    {draftNotice && <div role="status" className="fixed bottom-4 left-1/2 z-(--layer-panel) flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[var(--chrome-panel)] py-2 pl-4 pr-2 text-sm shadow-lg">
      <span>Generation draft ready</span>
      <Button size="sm" onClick={() => { setDraftNotice(false); openGenerateDrawer(header.currentProjectId); }}>Open</Button>
      <Button size="sm" variant="ghost" onClick={() => setDraftNotice(false)}>Later</Button>
    </div>}
    <ProjectReviewDock key={header.currentProjectId} projectId={header.currentProjectId} visible={!embedded && desktopApp && activeView === "storyboard"} editorActive={activeView === "editor"}>{children}</ProjectReviewDock>
  </main></ProjectLibraryProvider>;
}
