"use client";

import Link from "next/link";
import Image from "next/image";
import logo from "./icon.png";
import { EditableProjectTitle } from "./p/[projectId]/EditableProjectTitle";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Film, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";

import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import type { ProjectCover } from "@/lib/media/project-cover-source";
import { useWorkspaceChrome } from "./WorkspaceChrome";
import { UpdateButton } from "./UpdateButton";
import { BugReportButton } from "./BugReportButton";

// Only the most recently used projects stay open as tabs.
const MAX_OPEN_TABS = 3;
// Saved in the profile, not browser storage: the desktop app starts each launch with empty storage.
const saveOpenTabs = (open: string[]) => {
  void fetch("/api/workspace-tabs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open }) })
    .then(response => response.body?.cancel()).catch(() => {});
};
type Project = { id: string; title: string; cover?: ProjectCover };
export function WorkspaceTabs({ projects }: { projects: Project[] }) {
  const { setProjectActions } = useWorkspaceChrome();
  const [desktopMac, setDesktopMac] = useState(false);
  useEffect(() => { setDesktopMac(window.dreamcutDesktop?.platform === "darwin"); }, []);
  const pathname = usePathname();
  const search = useSearchParams();
  const visible = (pathname === "/" || pathname.startsWith("/p/") || pathname.startsWith("/templates/")) && search.get("embed") !== "1";
  const router = useRouter();
  const current = pathname.match(/^\/p\/([^/]+)/)?.[1];
  // Until the saved tabs load, show the current project so the header never paints without its name.
  const [open, setOpen] = useState<string[]>(() => current ? [current] : []);
  const tabsList = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  // Least recently used first. Tabs keep their positions; recency only decides which one closes.
  const recency = useRef<string[]>([]);
  // The project whose tab was just closed; it stays closed while the page navigates away from it.
  const closing = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || saved) return;
    let cancelled = false;
    fetch("/api/workspace-tabs").then(response => response.ok ? response.json() : response.body?.cancel().then(() => ({ open: [] })) ?? { open: [] })
      .then((value: { open?: unknown }) => { if (!cancelled) setSaved(Array.isArray(value.open) ? value.open.filter((id): id is string => typeof id === "string") : []); })
      .catch(() => { if (!cancelled) setSaved([]); });
    return () => { cancelled = true; };
  }, [saved, visible]);
  useEffect(() => {
    if (!visible || !saved) return;
    const here = current ?? new URLSearchParams(window.location.search).get("project");
    if (here !== closing.current) closing.current = null;
    const context = here === closing.current ? null : here;
    if (context) recency.current = [...recency.current.filter(id => id !== context), context];
    const next = [...new Set([...saved, ...(context ? [context] : [])])].filter(id => !projects.length || projects.some(p => p.id === id) || id === current);
    while (next.length > MAX_OPEN_TABS) {
      const rank = (id: string) => recency.current.indexOf(id);
      const oldest = next.filter(id => id !== context).reduce((a, b) => rank(b) < rank(a) ? b : a);
      next.splice(next.indexOf(oldest), 1);
    }
    setOpen(next);
    if (next.join("\n") !== saved.join("\n")) { setSaved(next); saveOpenTabs(next); }
  }, [current, projects, saved, visible]);
  const close = (id: string) => {
    const next = open.filter(item => item !== id);
    setOpen(next); setSaved(next); saveOpenTabs(next);
    recency.current = recency.current.filter(item => item !== id);
    if (id !== current) return;
    closing.current = id;
    // Closing the open project moves to the tab beside it, like a browser; the Library only when none are left.
    const index = open.indexOf(id);
    const neighbour = open[index + 1] ?? open[index - 1];
    router.push(neighbour ? `/p/${encodeURIComponent(neighbour)}` : "/");
  };
  // Other projects show only their preview frame, so the current project's name has the room.
  // When even that does not fit, the current name ellipsizes; past that, other projects move into a
  // menu beside the current tab, and in the narrowest header the menu alone holds every open project.
  type Fit = { activeShrinks: boolean; overflow: "none" | "others" | "all" };
  const [fit, setFit] = useState<Fit>({ activeShrinks: false, overflow: "none" });
  useEffect(() => {
    const list = tabsList.current;
    if (!list) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    const titleOf = (id: string) => projects.find(p => p.id === id)?.title ?? id;
    const measure = () => {
      const style = getComputedStyle(list.querySelector(".workspace-tab") ?? list);
      context.font = `600 ${style.fontSize} ${style.fontFamily}`;
      const background = open.filter(id => id !== current).length;
      // The current tab: its frame (when the project has a picture), name and close button.
      const active = current && open.includes(current) ? Math.min(392, context.measureText(titleOf(current)).width + 82) : 0;
      const room = list.clientWidth - active - 6 * Math.max(0, open.length - 1);
      // Each other project is a 44px frame; the current tab keeps its frame and a few letters (96px).
      const squeezed = background * 44 > room;
      const tight = background * 44 > list.clientWidth - 96 - 6 * background;
      const overflow: Fit["overflow"] = list.clientWidth < 96 + 6 + 28 ? "all" : tight && background ? "others" : "none";
      const next: Fit = { activeShrinks: squeezed, overflow };
      setFit(previous => previous.activeShrinks === next.activeShrinks && previous.overflow === next.overflow ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [current, open, projects]);
  // The narrowest header names the open project in the menu button's label and tooltip.
  const projectOf = (id: string): Project => projects.find(p => p.id === id) ?? { id, title: id };
  const currentTitle = current ? projectOf(current).title : "";
  const menuLabel = fit.overflow === "all" ? (currentTitle ? `${currentTitle} — open projects` : "Open projects") : "Other open projects";
  if (!visible) return null;
  return <nav className="editor-chrome workspace-tabs" aria-label="Open workspaces" data-desktop-mac={desktopMac || undefined}>
    <Link href="/" className="workspace-brand" aria-label="DreamCut home" title="DreamCut home" aria-current={!current ? "page" : undefined}><Image src={logo} alt="" width={24} height={24}/></Link>
    <div className="workspace-tabs-list" ref={tabsList} data-active-shrinks={fit.activeShrinks || undefined}>
    {open.filter(id => fit.overflow === "none" || (fit.overflow === "others" && id === current)).map(id => {
      const project = projectOf(id);
      return <div key={id} className="workspace-project-tab" data-active={id === current || undefined}>
        {id === current
          ? <div className="workspace-tab">{project.cover && <ProjectFrame project={project}/>}<EditableProjectTitle key={id} projectId={id} title={project.title}/></div>
          : <Link className="workspace-tab" href={`/p/${id}`} aria-label={project.title} title={project.title}><ProjectFrame project={project}/></Link>}
        <Button variant="ghost" size="icon-sm" className="workspace-tab-close" aria-label={`Close ${project.title} tab`} title="Close tab" onClick={() => close(id)}><X size={id === current ? 14 : 10}/></Button>
      </div>;
    })}
    {fit.overflow !== "none" && <ActionMenu align="start" trigger={<Button variant="ghost" size="icon-sm" className="workspace-tabs-more" aria-label={menuLabel} title={menuLabel}>{fit.overflow === "all" && current ? <ProjectFrame project={projectOf(current)}/> : null}<ChevronDown size={12}/></Button>}>
      {/* Each project switches on its name and closes on its X, both reachable with the arrow keys. */}
      {open.filter(id => fit.overflow === "all" || id !== current).map(id => <div key={id} className="workspace-tabs-menu-row">
        <ActionMenuItem className="min-w-0 flex-1" icon={id === current ? <Check/> : <ProjectFrame project={projectOf(id)}/>} onClick={() => { if (id !== current) router.push(`/p/${encodeURIComponent(id)}`); }}>
          {projectOf(id).title}
        </ActionMenuItem>
        <ActionMenuItem className="workspace-tabs-menu-close" aria-label={`Close ${projectOf(id).title} tab`} title="Close tab" icon={<X/>} onClick={() => close(id)} />
      </div>)}
    </ActionMenu>}
    </div>
    <UpdateButton/>
    <BugReportButton projectId={current}/>
    <div id="workspace-project-actions" ref={setProjectActions}/>
  </nav>;
}

/** A project's first picture as a small frame, or its initial while it has none. */
function ProjectFrame({ project }: { project: Project }) {
  const [failed, setFailed] = useState(false);
  const initial = project.title.trim().match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "";
  return <span className="workspace-tab-frame" aria-hidden="true">
    {project.cover && !failed ? <img src={thumbnailUrl(project.cover.url, 160)} alt="" decoding="async" onError={() => setFailed(true)}/> : initial || <Film size={12}/>}
  </span>;
}
