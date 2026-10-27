import fs from "node:fs";
import { galleryTemplates } from "@/lib/effects/gallery";
import { TemplatesCatalog } from "./HomeTemplates";
import { ProjectsDashboard } from "./ProjectsDashboard";
import { EditingMemoryPage } from "@/components/studio/timeline/EditingMemory";
import { GuidePageContent } from "@/components/studio/timeline/GuidePageContent";

import {
  listProjectIds,
  projectDir,
  projectMetadataPath,
  projectTimelinePath,
} from "@/lib/local-store/paths";
import { readProjectListMetadata } from "@/lib/local-store/project-list-metadata";
import { projectCover } from "@/lib/local-store/project-cover";
import { listTemplateDrafts } from "@/lib/local-store/template-drafts";

import { type ProjectSummary } from "./ProjectList";


export const dynamic = "force-dynamic";

/** Best-effort last-touched time: the timeline is rewritten on every edit, so its
 *  mtime tracks real activity. Fall back to metadata, then the folder itself. */
function projectUpdatedAt(id: string): number {
  for (const p of [projectTimelinePath(id), projectMetadataPath(id), projectDir(id)]) {
    try {
      return fs.statSync(p).mtimeMs;
    } catch {
      // try the next candidate
    }
  }
  return 0;
}

/** Unreadable drafts never block the home page. */
function readDrafts() {
  try { return listTemplateDrafts(); } catch { return []; }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string; project?: string }> }) {
  const query = await searchParams;
  const projects: ProjectSummary[] = listProjectIds()
    .filter(id => fs.existsSync(projectTimelinePath(id)))
    .map((id) => {
      const meta = readProjectListMetadata(id);
      return {
        id,
        title: meta.title,
        updatedAt: projectUpdatedAt(id),
        versionLabel: meta.versionLabel,
        cover: projectCover(id),
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const view = query.view === "templates" || query.view === "guide" || query.view === "user" || query.view === "projects" ? query.view : "dashboard";
  const catalog = view === "templates" ? await galleryTemplates() : null;
  const project = projects.find(project => project.id === query.project) ?? projects[0];
  return <ProjectsDashboard projects={projects} drafts={view === "dashboard" ? readDrafts() : []} view={view} projectId={project?.id}>
    {(view === "guide" || view === "user") && !project ? <div className="dashboard-empty"><h1>{view === "guide" ? "Guide" : "User"}</h1><p>No projects yet.</p></div> : null}
    {catalog && <section className="editor-chrome memory-page" aria-labelledby="templates-title"><div className="memory-body memory-page-body guide-page-body"><div className="guide-catalog-shell"><TemplatesCatalog effects={catalog.effects} warning={catalog.warning} homeHref={project ? `/?project=${encodeURIComponent(project.id)}` : "/"}/></div></div></section>}
    {view === "user" && project && <EditingMemoryPage key={project.id} projectId={project.id} projectTitle={project.title} dashboard />}
    {view === "guide" && project && <GuidePageContent params={Promise.resolve({ projectId: project.id })} dashboard />}
  </ProjectsDashboard>;
}
