"use client";
import { useId, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Quiet action button for Properties, proposal cards and panel headers: use with
 * `variant="ghost"`. Idle it is plain labelled text or a glyph; hover and keyboard
 * focus draw the fill/ring, and `aria-pressed` toggles keep a selected fill. Do not
 * pair it with an outline class — open space over lines (editor-visual-system.md).
 */
export const inspectorQuietButtonClassName =
  "text-[var(--ink-secondary)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)] aria-pressed:bg-[var(--chrome-selected-bg)] aria-pressed:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]";

/** Section > item > property. Typography belongs here, not at each call site. */
export function InspectorHeading({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-[length:var(--ui-text-heading)] font-semibold leading-[1.3] text-[var(--ink)]">{children}</h3>;
}
export function InspectorItemHeader({ title, enabled, onEnabledChange, actions }: {
  title: string; enabled?: boolean; onEnabledChange?: (enabled: boolean) => void; actions?: ReactNode;
}) {
  const id = useId();
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    {onEnabledChange && <input id={id} type="checkbox" aria-label={`Enable ${title}`} checked={enabled} onChange={event => onEnabledChange(event.target.checked)} />}
    <h4 className="m-0 mr-auto text-[length:var(--ui-text-body)] font-medium leading-[1.35] text-[var(--ink-secondary)]">{onEnabledChange ? <label htmlFor={id}>{title}</label> : title}</h4>
    {actions && <div className="flex items-center gap-1">{actions}</div>}
  </div>;
}
export function InspectorDisclosure({ title, open, onOpenChange, children, actions, keepMounted = false }: {
  title: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; actions?: ReactNode; keepMounted?: boolean;
}) {
  const id = useId();
  return <div className="grid min-w-0 gap-2">
    <div className="flex min-w-0 items-center justify-between gap-2">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => onOpenChange(!open)}
      className="flex w-fit items-center gap-1 rounded px-1 py-1 text-[length:var(--ui-text-body)] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]">
      <ChevronRight aria-hidden="true" className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />{title}
    </button>
    {actions && <div className="flex min-w-0 items-center gap-1">{actions}</div>}
    </div>
    <div id={id} hidden={!open}>{open || keepMounted ? children : null}</div>
  </div>;
}
