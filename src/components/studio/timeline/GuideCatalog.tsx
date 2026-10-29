"use client";

import { PageHeader } from "@/components/ui/page-header";
import { GuideOverview } from "./GuideOverview";

/** Guide, with or without a project open: the tour makes its own practice project. */
export function GuideCatalog({ dashboard = false, projectId }: { dashboard?: boolean; projectId?: string }) {
  const project = projectId ? `&project=${encodeURIComponent(projectId)}` : "";
  return <>
    <PageHeader id="guide-title" title="Guide" />
    <div className="memory-body memory-page-body guide-page-body"><div className="guide-catalog-shell">
      <GuideOverview templatesHref={`/?view=templates${project}`}
        skillsHref={projectId ? dashboard ? `/?view=user${project}&tab=skills` : `/p/${projectId}/user?tab=skills` : undefined} />
    </div></div>
  </>;
}
