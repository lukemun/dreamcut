import { notFound } from "next/navigation";

import { EditingMemoryPage } from "@/components/studio/timeline/EditingMemory";
import { projectExists } from "@/lib/local-store/paths";
import { readMetadata } from "@/lib/local-store/store";

export const dynamic = "force-dynamic";

/** User inside a project keeps the project header, so the section switcher stays in place. */
export default async function ProjectUserPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) notFound();
  return <EditingMemoryPage projectId={projectId} projectTitle={readMetadata(projectId).title ?? projectId} />;
}
