"use client";

import type { KeyboardEvent } from "react";

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

  return (
    <nav
      role="tablist"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      className={`${sticky ? "sticky top-0 z-20 " : ""}inspector-panel-tabs flex shrink-0 flex-wrap gap-1 bg-[var(--chrome-panel)] px-3 py-1.5`}
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
            // The open tab is a filled pill (not a thin underline), so it reads as selected at a glance.
            className="inspector-panel-tab min-h-8 min-w-max flex-1 rounded-lg px-2 py-1 text-center text-[13px] font-medium transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--chrome-focus-ring)] disabled:cursor-not-allowed disabled:opacity-35"
            data-active={active || undefined}
            style={{
              background: active ? "var(--chrome-selected-bg)" : "transparent",
              boxShadow: active ? "inset 0 0 0 1px var(--chrome-selected-ring)" : "none",
              color: active ? "var(--ink)" : "var(--ink-secondary)",
            }}
          >
            <span className="block whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
