import { notFound } from "next/navigation";

import { GuideCatalog } from "@/components/studio/timeline/GuideCatalog";
import { projectExists } from "@/lib/local-store/paths";
import { readMetadata } from "@/lib/local-store/store";


export async function GuidePageContent({ params, dashboard = false }: { params: Promise<{ projectId: string }>; dashboard?: boolean }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) notFound();

  const metadata = readMetadata(projectId);
  const projectTitle = metadata.title ?? projectId;

  return <>
    <section className="editor-chrome memory-page" aria-labelledby="guide-title">
      <GuideCatalog dashboard={dashboard} projectId={projectId} projectTitle={projectTitle} />
    </section>
  </>;
}
