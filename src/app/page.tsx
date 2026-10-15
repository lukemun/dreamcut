import fs from "node:fs";
import { memoryAttentionCount } from "@/lib/local-store/editing-memory";
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

  const view = query.view === "guide" || query.view === "user" || query.view === "projects" ? query.view : "dashboard";
  const project = projects.find(project => project.id === query.project) ?? projects[0];
  return <ProjectsDashboard projects={projects} view={view} projectId={project?.id} attentionCount={project ? memoryAttentionCount(project.id) : 0}>
    {(view === "guide" || view === "user") && !project ? <div className="dashboard-empty"><h1>{view === "guide" ? "Guide" : "User"}</h1><p>No projects yet.</p></div> : null}
    {view === "user" && project && <EditingMemoryPage key={project.id} projectId={project.id} projectTitle={project.title} dashboard />}
    {view === "guide" && project && <GuidePageContent params={Promise.resolve({ projectId: project.id })} dashboard />}
  </ProjectsDashboard>;
}
