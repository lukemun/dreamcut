import { notFound } from "next/navigation";
import { projectExists } from "@/lib/local-store/paths";
import { readMetadata } from "@/lib/local-store/store";
import { listProjectVersionFamily } from "@/lib/local-store/project-versions";
import { memoryAttentionCount } from "@/lib/local-store/editing-memory";
import { ProjectShell } from "./ProjectShell";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!projectExists(projectId)) notFound();
  return <ProjectShell currentProjectId={projectId}
    projectTitle={readMetadata(projectId).title ?? projectId}
    versions={listProjectVersionFamily(projectId)}
    memoryAttentionCount={memoryAttentionCount(projectId)}
  >{children}</ProjectShell>;
}
