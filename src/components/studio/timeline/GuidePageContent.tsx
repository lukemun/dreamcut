import { notFound } from "next/navigation";

import { GuideCatalog } from "@/components/studio/timeline/GuideCatalog";
import { projectExists } from "@/lib/local-store/paths";


export async function GuidePageContent({ params, dashboard = false }: { params: Promise<{ projectId?: string }>; dashboard?: boolean }) {
  const { projectId } = await params;
  if (projectId && !projectExists(projectId)) notFound();

  return <>
    <section className="editor-chrome memory-page" aria-labelledby="guide-title">
      <GuideCatalog dashboard={dashboard} projectId={projectId} />
    </section>
  </>;
}
