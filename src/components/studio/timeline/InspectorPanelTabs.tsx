"use client";

import type { KeyboardEvent } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type InspectorPanelTab<T extends string> = {
  id: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function InspectorPanelTabs<T extends string>({
  ariaLabel,
  tabs,
  value,
  onValueChange,
  sticky = false,
}: {
  ariaLabel: string;
  tabs: readonly InspectorPanelTab<T>[];
  value: T;
  onValueChange: (value: T) => void;
  sticky?: boolean;
}) {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const availableIndexes = tabs.flatMap((tab, index) => tab.disabled ? [] : [index]);
    if (availableIndexes.length === 0) return;
    const availablePosition = availableIndexes.indexOf(currentIndex);
    const nextIndex = event.key === "Home"
      ? availableIndexes[0]!
      : event.key === "End"
        ? availableIndexes.at(-1)!
        : availableIndexes[(availablePosition + (event.key === "ArrowRight" ? 1 : -1) + availableIndexes.length) % availableIndexes.length]!;
    const next = tabs[nextIndex];
    if (!next) return;
    onValueChange(next.id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
  };

  const columns = tabs.length <= 4 ? tabs.length : Math.ceil(tabs.length / 2);
  // The tab row is a full-width SegmentedControl track, edge to edge across the panel: a visible, contained switcher whose selected tab is
  // the raised segment, so it never reads as loose section headings (creator report 2026-10-24).
  return (
    <div className={`${sticky ? "sticky top-0 z-20 " : ""}shrink-0 bg-[var(--chrome-panel)]`}>
      <SegmentedControl
        as="nav"
        size="sm"
        role="tablist"
        aria-orientation="horizontal"
        aria-label={ariaLabel}
        className="inspector-panel-tabs w-full"
        // Equal cells in at most two even rows: six tabs read as a 3 × 2 switcher, not a ragged wrap.
        style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 3, height: "auto", borderRadius: 0 }}
      >
        {tabs.map((tab, index) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={tab.description ? `${tab.label}: ${tab.description}` : tab.label}
              tabIndex={active ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onValueChange(tab.id)}
              onFocus={event => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
              onKeyDown={(event) => moveFocus(event, index)}
              className="inspector-panel-tab"
              data-active={active || undefined}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </SegmentedControl>
    </div>
  );
}
