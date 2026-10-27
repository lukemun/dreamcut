"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BookOpen, FolderOpen, UserRound, LayoutGrid, LayoutList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewProjectForm } from "./NewProjectForm";
import { ProjectList, type ProjectSummary } from "./ProjectList";
import { HomeTemplates } from "./HomeTemplates";
import { HomeChat, useHomeSelection } from "./HomeChat";
import { AgentSelectionProvider } from "@/components/desktop/ProjectReviewDock";
import type { TemplateDraft } from "@/lib/local-store/template-drafts";

export function ProjectsDashboard({ projects, drafts = [], view, projectId, children }: {
  projects: ProjectSummary[]; drafts?: TemplateDraft[]; view: "dashboard" | "projects" | "guide" | "templates" | "user"; projectId?: string; children?: ReactNode;
}) {
  const [templateOpen, setTemplateOpen] = useState(false);
  // Templates picked here or on Templates land in Home's chat box.
  const selection = useHomeSelection();
  const newProject = <>
    <NewProjectForm trigger={<Button size="sm" variant="ghost"><Plus size={14} aria-hidden="true"/>New project</Button>}/>
    <NewProjectForm open="storyboard" trigger={<Button size="sm" variant="ghost"><LayoutList size={14} aria-hidden="true"/>Start in Storyboard</Button>}/>
  </>;
  const context = projectId ? `&project=${encodeURIComponent(projectId)}` : "";
  const collection = view === "projects" || view === "dashboard";
  const shown = view === "dashboard" ? projects.slice(0, 6) : projects;
  return <AgentSelectionProvider value={selection}><main className="editor-chrome projects-page dashboard-shell">
    <aside className="dashboard-sidebar" aria-label="Dashboard">
      <nav className="dashboard-nav" aria-label="Dashboard navigation">
        <Link href={`/?${context.slice(1)}`} aria-current={view === "dashboard" ? "page" : undefined}><LayoutGrid size={16}/>Dashboard</Link>
        <Link href={`/?view=projects${context}`} aria-current={view === "projects" ? "page" : undefined}><FolderOpen size={16}/>Projects</Link>
        <Link href={`/?view=templates${context}`} aria-current={view === "templates" ? "page" : undefined}><LayoutGrid size={16}/>Templates</Link>
      </nav>
      <nav className="dashboard-nav dashboard-utilities" aria-label="Resources and preferences">
        <Link href={`/?view=guide${context}`} aria-current={view === "guide" ? "page" : undefined}><BookOpen size={16}/>Guide</Link>
        <Link href={`/?view=user${context}`} aria-current={view === "user" ? "page" : undefined}><UserRound size={16}/>User</Link>
      </nav>
    </aside>
    <div className="dashboard-main">
      {collection ? <>
        {/* Home opens on chat. An open template hides the projects; its Back returns here. */}
        {view === "dashboard" && <HomeChat selection={selection} onTryTemplate={() => document.getElementById("home-templates-title")?.scrollIntoView({ behavior: "smooth", block: "start" })} />}
        {!(templateOpen && view === "dashboard") && <div className="dashboard-collection">
          {/* Home keeps one way onward; creating, Storyboard and search live on Projects. */}
          <ProjectList headerAction={view === "dashboard" ? <Link className="dashboard-view-all" href={`/?view=projects${context}`}>View all</Link> : view === "projects" ? newProject : undefined} recent={view === "dashboard"} projects={shown} showSearch={view !== "dashboard"} grouped={false}/>
        </div>}
        {view === "dashboard" && <HomeTemplates drafts={drafts} allHref={`/?view=templates${context}`} onDetailChange={setTemplateOpen} />}

      </> : <>
        {children}
      </>}
    </div>
  </main></AgentSelectionProvider>;
}
