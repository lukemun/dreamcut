"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ChatSelection } from "@/components/desktop/ProjectReviewDock";

/**
 * Everything selected across the editor (clips, Library media, looks, layouts, sounds), beside Marks.
 * It keeps its slot while nothing is selected (hidden, not unmounted) so the toolbar never shifts.
 * The agent reads the same list; removing an item here deselects it where it was chosen.
 * Shares the Marks group look (timeline-review-controls-group, from FrameTagControls).
 */
export function SelectionTray({ selections, onRemove, onClear, ghostButtonClassName, placement = "above", reserveSpace = true }: {
  selections: ChatSelection[];
  /** Keep the empty tray's width so nothing beside it shifts; false where it can grow into free space. */
  reserveSpace?: boolean;
  /** "below" for a toolbar at the top of a page (Storyboard); the editor's toolbar opens it above. */
  placement?: "above" | "below";
  onRemove: (id: string) => void;
  onClear: () => void;
  ghostButtonClassName: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; width: number; bottom?: number; top?: number }>({ left: 8, bottom: 68, width: 340 });
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = groupRef.current?.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 24);
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect?.left ?? 12));
      setPlace(placement === "below" ? { width, left, top: (rect?.bottom ?? 60) + 8 }
        : { width, left, bottom: Math.max(8, window.innerHeight - (rect?.top ?? window.innerHeight - 60) + 8) });
    };
    update(); window.addEventListener("resize", update);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("resize", update); document.removeEventListener("keydown", onKeyDown); };
  }, [open, placement]);
  useEffect(() => { if (selections.length === 0) setOpen(false); }, [selections.length]);
  const empty = selections.length === 0;

  return <>
    <div ref={groupRef} className="timeline-review-controls-group" role="group" aria-label="Selected for the agent"
      data-empty={empty || undefined} style={{ display: empty && !reserveSpace ? "none" : "flex", alignItems: "center", ...(empty ? { visibility: "hidden" } : {}) }}>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={panelId}
        aria-label={`Selected (${selections.length})`} title="Show what is selected"
        className={`${ghostButtonClassName} timeline-marks-button`} style={{ height: "calc(var(--control-height) - 2px)", fontSize: "var(--ui-text-body)", paddingInline: "0.65rem" }}>
        <span className="timeline-marks-label">Selected</span>
        <span className="timeline-selection-count" aria-hidden="true">{selections.length}</span>
        <ChevronUp className="timeline-marks-chevron" aria-hidden="true" style={{ transform: open !== (placement === "below") ? "rotate(180deg)" : undefined }} />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => { onClear(); setOpen(false); }} aria-label="Clear selection" title="Clear selection"
        className={ghostButtonClassName} style={{ width: 28, height: 28 }}><X aria-hidden="true" size={14} /></Button>
    </div>
    {open ? createPortal(
      <section className="editor-chrome timeline-selection-panel" id={panelId} aria-label="Selected items"
        style={{ left: place.left, bottom: place.bottom, top: place.top, width: place.width, maxHeight: `min(460px, calc(100vh - ${(place.bottom ?? place.top ?? 0) + 16}px))` }}>
        <header className="timeline-selection-panel-header"><span>Selected</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} title="Close" aria-label="Close selected items" className={ghostButtonClassName}><X aria-hidden="true" /></Button>
        </header>
        <ul className="timeline-selection-list">
          {selections.map(item => <li key={item.id}>
            <span className="timeline-selection-kind">{item.kind}</span>
            <span className="timeline-selection-label" title={item.label}>{item.label}</span>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(item.id)} aria-label={`Deselect ${item.label}`} title="Deselect"
              className={ghostButtonClassName} style={{ width: 28, height: 28 }}><X aria-hidden="true" size={14} /></Button>
          </li>)}
        </ul>
      </section>, document.body) : null}
  </>;
}
