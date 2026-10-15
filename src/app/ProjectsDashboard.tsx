"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { BookOpen, FolderOpen, Search, UserRound, LayoutGrid, ArrowUp, Paperclip, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NewProjectForm } from "./NewProjectForm";
import { ProjectList, type ProjectSummary } from "./ProjectList";

export function ProjectsDashboard({ projects, view, projectId, attentionCount = 0, children }: {
  projects: ProjectSummary[]; view: "dashboard" | "projects" | "guide" | "user"; projectId?: string; attentionCount?: number; children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const context = projectId ? `&project=${encodeURIComponent(projectId)}` : "";
  const collection = view === "projects" || view === "dashboard";
  const searching = Boolean(query.trim());
  const shown = view === "dashboard" && !searching ? projects.slice(0, 6) : projects;
  return <main className="editor-chrome projects-page dashboard-shell">
    <aside className="dashboard-sidebar" aria-label="Dashboard">
      <label className="dashboard-search"><Search size={15} aria-hidden="true"/><Input aria-label="Search projects" placeholder="Search projects…" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <nav className="dashboard-nav" aria-label="Dashboard navigation">
        <Link href={`/?${context.slice(1)}`} aria-current={view === "dashboard" ? "page" : undefined}><LayoutGrid size={16}/>Dashboard</Link>
        <Link href={`/?view=projects${context}`} aria-current={view === "projects" ? "page" : undefined}><FolderOpen size={16}/>Projects</Link>
      </nav>
      {!collection && searching && <nav className="dashboard-projects" aria-label="Matching projects">
        {projects.filter(p => `${p.title} ${p.id}`.toLowerCase().includes(query.trim().toLowerCase())).map(p => <Link key={p.id} href={`/?view=${view}&project=${encodeURIComponent(p.id)}`}><FolderOpen size={15}/><span>{p.title}</span></Link>)}
      </nav>}
      <nav className="dashboard-nav dashboard-utilities" aria-label="Resources and preferences">
        <Link href={`/?view=guide${context}`} aria-current={view === "guide" ? "page" : undefined}><BookOpen size={16}/>Guide</Link>
        <Link href={`/?view=user${context}`} aria-current={view === "user" ? "page" : undefined}><UserRound size={16}/>User{attentionCount > 0 && <span className="proposal-count-badge" aria-label={`${attentionCount} skill improvements to review`}>{attentionCount}</span>}</Link>
      </nav>
    </aside>
    <div className="dashboard-main">
      {collection ? <>
        {view === "dashboard" && !searching && <section className="dashboard-start" aria-label="Start an edit">
          <h1>What are we editing today?</h1>
          <div className="dashboard-composer">
            <label className="sr-only" htmlFor="dashboard-prompt">Describe your new project</label>
            <textarea id="dashboard-prompt" value={draft} maxLength={16000} onChange={event => setDraft(event.target.value)} placeholder="Describe your video…"/>
            {files.length > 0 && <ul className="dashboard-attachments" aria-label="Attached media">{files.map((file, index) => <li key={`${file.name}-${index}`}><span title={file.name}>{file.name}</span><Button variant="ghost" size="icon-xs" aria-label={`Remove ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, i) => i !== index))}><X size={12}/></Button></li>)}</ul>}
            <input ref={fileInput} className="hidden" type="file" multiple accept="image/*,video/*,audio/*" aria-label="Choose media files" onChange={event => { const selected = Array.from(event.target.files ?? []); setFiles(previous => [...previous, ...selected]); event.target.value = ""; }}/>
            <div className="dashboard-composer-actions"><Button variant="ghost" size="icon" aria-label="Attach media files" title="Attach images, videos or audio" onClick={() => fileInput.current?.click()}><Paperclip size={17}/></Button><NewProjectForm draft={draft} files={files} trigger={<Button size="icon" aria-label="Start project" title="Start project"><ArrowUp size={17}/></Button>}/></div>
          </div>
        </section>}
        <div className="dashboard-collection">
          <ProjectList headerAction={view === "dashboard" && !searching ? <Link className="dashboard-view-all" href={`/?view=projects${context}`}>View all projects</Link> : view === "projects" ? <NewProjectForm trigger={<Button size="sm"><Plus size={14} aria-hidden="true"/>New project</Button>}/> : undefined} recent={view === "dashboard" && !searching} projects={shown} searchQuery={query} showSearch={false} grouped={false}/>
        </div>
      </> : <>
        {children}
      </>}
    </div>
  </main>;
}
