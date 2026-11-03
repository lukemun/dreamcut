"use client";
import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { CollapsibleRows } from '@/components/ui/collapsible-rows';
import type { InspectorSectionId } from './inspector-sections';
import { InspectorHeading, InspectorDisclosure } from './InspectorHierarchy';
export const InspectorSectionFilterContext = createContext<Set<InspectorSectionId> | null>(null);

export function InspectorSection({
  sectionId,
  title,
  headerAction,
  defaultOpen = true,
  disclosure = false,
  collapsible = true,
  children,
}: {
  sectionId: InspectorSectionId;
  title: string;
  headerAction?: ReactNode;
  defaultOpen?: boolean;
  disclosure?: boolean;
  collapsible?: boolean;
  children?: ReactNode;
}) {
  const visibleSections = useContext(InspectorSectionFilterContext);
  const [open, setOpen] = useState(defaultOpen);
  const instanceId = useId();
  const contentId = `inspector-${sectionId}-${instanceId}`;
  if (visibleSections && !visibleSections.has(sectionId)) return null;

  // A panel section that is always open: the collapsible header's spacing, without a chevron.
  if (!collapsible) return (
    <section className="inspector-section" aria-label={title} style={{ containerType: "inline-size" }}>
      <div className="flex min-h-11 items-center justify-between gap-2 px-3.5 py-2.5">
        <InspectorHeading>{title}</InspectorHeading>
        {headerAction}
      </div>
      {children && <div className="grid min-w-0 gap-3 px-3.5 pb-3.5">{children}</div>}
    </section>
  );

  if (disclosure) return (
    <section style={{ containerType: "inline-size" }} className="inspector-section px-3.5 py-2">
      <InspectorDisclosure title={title} open={open} onOpenChange={setOpen}>
        <div className="grid min-w-0 gap-2">
          {children}
        </div>
      </InspectorDisclosure>
    </section>
  );

  // In the vertical Properties panel, the domain tabs already provide the
  // navigation/disclosure. Repeating every active domain as a large accordion
  // made the panel read as two navigation systems stacked on top of each
  // other. Keep group labels only when a tab genuinely contains multiple
  // sections; a single-section tab goes straight to its controls.
  if (visibleSections) {
    const showGroupLabel = visibleSections.size > 1;
    return (
      <section className="inspector-section" style={{ containerType: "inline-size" }}>
        {showGroupLabel || headerAction ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "14px 14px 0" }}>
            <InspectorHeading>{title}</InspectorHeading>
            {headerAction}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px 14px" }}>
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="inspector-section" style={{ containerType: "inline-size" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
          className="group/inspector-section focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chrome-focus-ring)]"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            border: 0,
            background: "transparent",
            color: "var(--ink)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ display: "flex", minWidth: 0, flexDirection: "column" }}>
            <InspectorHeading>{title}</InspectorHeading>
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="text-[var(--ink-muted)] group-hover/inspector-section:text-[var(--ink)]"
            style={{ flexShrink: 0, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 140ms ease" }}
          />
        </button>
        {headerAction ? <span style={{ flexShrink: 0, paddingRight: 14 }}>{headerAction}</span> : null}
      </div>
      <CollapsibleRows expanded={open} id={contentId} durationMs={180} opacityDurationMs={120}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 14px 18px" }}>
          {children}
        </div>
      </CollapsibleRows>
    </section>
  );
}
