import { notFound } from "next/navigation";

import { LibraryCatalog } from "@/components/studio/timeline/LibraryCatalog";
import { projectExists } from "@/lib/local-store/paths";
import { readMetadata } from "@/lib/local-store/store";

export const dynamic = "force-dynamic";

export default async function ProjectLibraryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) notFound();
  const metadata = readMetadata(projectId);
  const projectTitle = metadata.title ?? projectId;

  return <LibraryCatalog projectId={projectId} projectTitle={projectTitle} />;
}
