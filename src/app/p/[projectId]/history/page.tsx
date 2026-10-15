import { notFound } from "next/navigation";

import { EditingMemoryPage } from "@/components/studio/timeline/EditingMemory";
import { projectExists } from "@/lib/local-store/paths";
import { readMetadata } from "@/lib/local-store/store";

export const dynamic = "force-dynamic";

export default async function ProjectEditingMemoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) notFound();

  const metadata = readMetadata(projectId);
  const projectTitle = metadata.title ?? projectId;

  return <EditingMemoryPage projectId={projectId} projectTitle={projectTitle} history />;
}
