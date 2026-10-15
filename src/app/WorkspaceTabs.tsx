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

import { useWorkspaceChrome } from "./WorkspaceChrome";
import { UpdateButton } from "./UpdateButton";

// Only the most recently used projects stay open as tabs.
const MAX_OPEN_TABS = 3;
// Saved in the profile, not browser storage: the desktop app starts each launch with empty storage.
const saveOpenTabs = (open: string[]) => {
  void fetch("/api/workspace-tabs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open }) }).catch(() => {});
};
export function WorkspaceTabs({ projects }: { projects: { id: string; title: string }[] }) {
  const { setProjectActions } = useWorkspaceChrome();
  const [desktopMac, setDesktopMac] = useState(false);
  useEffect(() => { setDesktopMac(window.dreamcutDesktop?.platform === "darwin"); }, []);
  const pathname = usePathname();
  const search = useSearchParams();
  const visible = (pathname === "/" || pathname.startsWith("/p/")) && search.get("embed") !== "1";
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
    fetch("/api/workspace-tabs").then(response => response.ok ? response.json() : { open: [] })
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
  // Tabs show full names while the header has room. When background tabs would be squeezed
  // below a readable width they fall back to their first word; the current project's tab
  // shrinks only when even that does not fit. Past that, other projects move into a menu
  // beside the current tab, and in the narrowest header the menu alone holds every open project.
  type Fit = { short: string[]; activeShrinks: boolean; floor: Record<string, number>; overflow: "none" | "others" | "all" };
  const [fit, setFit] = useState<Fit>({ short: [], activeShrinks: false, floor: {}, overflow: "none" });
  useEffect(() => {
    const list = tabsList.current;
    if (!list) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    const titleOf = (id: string) => projects.find(p => p.id === id)?.title ?? id;
    const measure = () => {
      const style = getComputedStyle(list.querySelector(".workspace-tab") ?? list);
      const width = (text: string, weight: number) => { context.font = `${weight} ${style.fontSize} ${style.fontFamily}`; return context.measureText(text).width; };
      const background = open.filter(id => id !== current);
      // Text plus each tab's padding and close button (and, for the current project, its icon). Other
      // projects' names cap at 240px; the current project's at 360px, so its name reads in full.
      const tabWidth = (id: string) => Math.min(272, width(titleOf(id), 400) + 52);
      const active = current && open.includes(current) ? Math.min(392, width(titleOf(current), 600) + 82) : 0;
      const room = list.clientWidth - active - 6 * Math.max(0, open.length - 1);
      const full = background.reduce((sum, id) => sum + tabWidth(id), 0);
      const short = full <= room ? [] : background.filter(id => room / background.length < Math.min(180, tabWidth(id)));
      // A first word stays whole (up to a point); longer single words still ellipsize.
      const floor = Object.fromEntries(short.map(id => [id, Math.min(112, Math.ceil(width(shortTitle(titleOf(id)), 400) + 52))]));
      const shortWidth = background.reduce((sum, id) => sum + (short.includes(id) ? floor[id] : 180), 0);
      // The current tab needs its icon and a few letters (76px); the menu button is 28px.
      const squeezed = shortWidth > room;
      const overflow: Fit["overflow"] = list.clientWidth < 76 + 6 + 28 ? "all" : squeezed && background.length ? "others" : "none";
      const next: Fit = { short: overflow === "none" ? short : [], activeShrinks: squeezed, floor: overflow === "none" ? floor : {}, overflow };
      setFit(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [current, open, projects]);
  // The narrowest header names the open project in the menu button's label and tooltip.
  const currentTitle = current ? projects.find(p => p.id === current)?.title ?? current : "";
  const menuLabel = fit.overflow === "all" ? (currentTitle ? `${currentTitle} — open projects` : "Open projects") : "Other open projects";
  if (!visible) return null;
  return <nav className="editor-chrome workspace-tabs" aria-label="Open workspaces" data-desktop-mac={desktopMac || undefined}>
    <Link href="/" className="workspace-brand" aria-label="DreamCut home" aria-current={!current ? "page" : undefined}><Image src={logo} alt="" width={24} height={24}/>DreamCut</Link>
    <div className="workspace-tabs-list" ref={tabsList} data-active-shrinks={fit.activeShrinks || undefined}>
    {open.filter(id => fit.overflow === "none" || (fit.overflow === "others" && id === current)).map(id => <div key={id} className="workspace-project-tab" data-active={id === current || undefined} data-short={fit.short.includes(id) || undefined} style={fit.floor[id] ? { minWidth: fit.floor[id] } : undefined}>
      {id === current ? <div className="workspace-tab"><Film size={14}/><EditableProjectTitle key={id} projectId={id} title={projects.find(p => p.id === id)?.title ?? id}/></div> : <Link className="workspace-tab" href={`/p/${id}`} title={projects.find(p => p.id === id)?.title ?? id}><span className="workspace-tab-full">{projects.find(p => p.id === id)?.title ?? id}</span><span className="workspace-tab-short" aria-hidden="true">{shortTitle(projects.find(p => p.id === id)?.title ?? id)}</span></Link>}
      <Button variant="ghost" size="icon-sm" aria-label={`Close ${projects.find(p => p.id === id)?.title ?? id} tab`} title="Close tab" onClick={() => close(id)}><X size={14}/></Button>
    </div>)}
    {fit.overflow !== "none" && <ActionMenu align="start" trigger={<Button variant="ghost" size="icon-sm" className="workspace-tabs-more" aria-label={menuLabel} title={menuLabel}>{fit.overflow === "all" ? <Film size={14}/> : null}<ChevronDown size={12}/></Button>}>
      {/* Each project switches on its name and closes on its X, both reachable with the arrow keys. */}
      {open.filter(id => fit.overflow === "all" || id !== current).map(id => <div key={id} className="workspace-tabs-menu-row">
        <ActionMenuItem className="min-w-0 flex-1" icon={id === current ? <Check/> : <Film/>} onClick={() => { if (id !== current) router.push(`/p/${encodeURIComponent(id)}`); }}>
          {projects.find(p => p.id === id)?.title ?? id}
        </ActionMenuItem>
        <ActionMenuItem className="workspace-tabs-menu-close" aria-label={`Close ${projects.find(p => p.id === id)?.title ?? id} tab`} title="Close tab" icon={<X/>} onClick={() => close(id)} />
      </div>)}
    </ActionMenu>}
    </div>
    <UpdateButton/>
    <div id="workspace-project-actions" ref={setProjectActions}/>
  </nav>;
}

/** First word of a project title, for tabs squeezed to their minimum width. */
function shortTitle(title: string) {
  return title.trim().split(/\s+/)[0]?.replace(/[—–\-:·,]+$/, "") || title;
}
