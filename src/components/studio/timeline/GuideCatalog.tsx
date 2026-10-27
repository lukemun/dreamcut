"use client";

import { PageHeader } from "@/components/ui/page-header";
import { useRouter } from "next/navigation";
import { GuideOverview } from "./GuideOverview";

export function GuideCatalog({ dashboard = false, projectId }: { dashboard?: boolean; projectId: string; projectTitle: string; }) {
  const router = useRouter();
  return <>
    <PageHeader id="guide-title" title="Guide" />
    <div className="memory-body memory-page-body guide-page-body"><div className="guide-catalog-shell">
      <GuideOverview projectId={projectId}
        onShowEffects={() => router.push(`/?view=templates&project=${encodeURIComponent(projectId)}`)}
        onShowSkills={() => router.push(dashboard ? `/?view=user&project=${encodeURIComponent(projectId)}&tab=skills` : `/p/${projectId}/user?tab=skills`)} />
    </div></div>
  </>;
}
