"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageHeader } from "@/components/ui/page-header";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GuideEffects } from "./GuideEffects";
import { GuideOverview } from "./GuideOverview";

import type { GuideEffect } from "@/lib/effects/guide";

export function GuideCatalog({ dashboard = false, projectId, effects, warning }: { dashboard?: boolean; projectId: string; projectTitle: string; effects: GuideEffect[]; warning?: string }) {
  const sections = ["overview", "templates"] as const;
  const router = useRouter();
  const [section, setSection] = useState<(typeof sections)[number]>("overview");
  return <>
    <PageHeader id="guide-title" title="Guide">
      <SegmentedControl className="guide-section-tabs" role="tablist" aria-label="Guide sections">
        {sections.map(value => <button
          key={value} id={`guide-tab-${value}`} type="button" role="tab"
          aria-selected={section === value} aria-controls="guide-section-panel"
          tabIndex={section === value ? 0 : -1}
          onClick={() => setSection(value)}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = sections.indexOf(value);
            const next = event.key === "Home" ? sections[0] : event.key === "End" ? sections[sections.length - 1] : sections[(index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length];
            setSection(next);
            document.getElementById(`guide-tab-${next}`)?.focus();
          }}
        >{value === "overview" ? "Overview" : "Templates"}</button>)}
      </SegmentedControl>
    </PageHeader>
    <div key={section} id="guide-section-panel" role="tabpanel" aria-labelledby={`guide-tab-${section}`} className="memory-body memory-page-body guide-page-body">
    <div className="guide-catalog-shell">
    {section === "overview" ? <GuideOverview projectId={projectId} onShowEffects={() => setSection("templates")} onShowSkills={() => router.push(dashboard ? `/?view=user&project=${encodeURIComponent(projectId)}&tab=skills` : `/p/${projectId}/user?tab=skills`)} /> : <GuideEffects effects={effects} warning={warning} />}

    </div>
  </div></>;
}
