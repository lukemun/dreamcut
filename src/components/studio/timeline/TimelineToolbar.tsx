"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOptionalWorkspaceChrome } from "@/app/WorkspaceChrome";
import { ClipboardCheckIcon, ImagesIcon, MagnetIcon, ScissorsIcon, SearchIcon, Rows3Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { PreviewAspectRatio, TimelineElement } from "./types";

export function nextScrubPercentValue(
  currentValue: number,
  requestedValue: number,
  min: number,
  max: number,
  precision = 0,
) {
  if (!Number.isFinite(requestedValue)) return null;
  // Match the displayed precision so subpixel movement does not repeatedly
  // commit hidden changes. Percentages use integers; seconds use tenths.
  const factor = 10 ** precision;
  const nextValue = Math.min(max, Math.max(min, Math.round(requestedValue * factor) / factor));
  return Object.is(currentValue, nextValue) ? null : nextValue;
}

export function scrubPercentValueFromVerticalDrag(
  startValue: number,
  deltaY: number,
  step: number,
  decreaseMultiplier = 1,
  reverse = false,
) {
  // Match the physical pull gesture: down moves toward the + cue and raises
  // the value; up moves toward the - cue and lowers it. A control can make
  // the upward gesture more sensitive when screen space is constrained.
  const directionalMultiplier = deltaY < 0 ? decreaseMultiplier : 1;
  return startValue + deltaY * step * directionalMultiplier * (reverse ? -1 : 1);
}

// Share the lane-height pull handle; only the unit and precision differ.
function TimelineVisibleSecondsControl({value, min, max, onChange}: {
  value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  return <ScrubPercentControl label="Seconds visible across timeline"
    icon={<SearchIcon size={16} />} value={value} min={min} max={max}
    step={0.1} precision={1} unit="seconds" joined="start" onChange={onChange} />;
}

export function formatZoomPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function ScrubPercentControl({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  decreaseMultiplier = 1,
  roomy = false,
  joined,
  unit = "percent",
  precision = 0,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  decreaseMultiplier?: number;
  roomy?: boolean;
  joined?: "start" | "end";
  unit?: "percent" | "seconds";
  precision?: number;
  onChange: (next: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const lastCommittedValueRef = useRef(value);
  const pendingValueRef = useRef<number | null>(null);
  const changeFrameRef = useRef<number | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const clamp = useCallback((next: number) => Math.min(max, Math.max(min, next)), [max, min]);
  const display = unit === "seconds" ? `${Number(value.toFixed(precision))}s` : formatZoomPercent(value);
  const gestureHelp = unit === "seconds"
    ? "Seconds across the timeline: fewer seconds zooms in. Pull down to zoom in (fewer seconds); push up to zoom out. Arrow keys also work."
    : `Pull down to increase ${label.toLowerCase()}; push up to decrease. Arrow keys also work.`;
  const borderColor = focused ? "var(--chrome-focus-ring)" : "var(--chrome-line)";

  onChangeRef.current = onChange;

  useEffect(() => {
    lastCommittedValueRef.current = value;
  }, [value]);

  const commitChange = useCallback((requestedValue: number) => {
    const nextValue = nextScrubPercentValue(
      lastCommittedValueRef.current,
      requestedValue,
      min,
      max,
      precision,
    );
    if (nextValue == null) return;
    lastCommittedValueRef.current = nextValue;
    onChangeRef.current(nextValue);
  }, [max, min, precision]);

  const scheduleChange = useCallback((requestedValue: number) => {
    pendingValueRef.current = clamp(requestedValue);
    if (changeFrameRef.current != null) return;
    changeFrameRef.current = window.requestAnimationFrame(() => {
      changeFrameRef.current = null;
      const pendingValue = pendingValueRef.current;
      pendingValueRef.current = null;
      if (pendingValue != null) commitChange(pendingValue);
    });
  }, [clamp, commitChange]);

  const flushChange = useCallback((requestedValue: number) => {
    if (changeFrameRef.current != null) {
      window.cancelAnimationFrame(changeFrameRef.current);
      changeFrameRef.current = null;
    }
    pendingValueRef.current = null;
    commitChange(requestedValue);
  }, [commitChange]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const node = rootRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        setFocused(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => () => {
    dragCleanupRef.current?.();
    if (changeFrameRef.current != null) {
      window.cancelAnimationFrame(changeFrameRef.current);
    }
  }, []);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${label}: ${display}. ${gestureHelp}`}
      style={{ display: "flex", alignItems: "center", gap: "0.3rem", minWidth: 0, height: 32 }}
    >
      {!icon && <span style={{ fontSize: "var(--ui-text-small)", fontWeight: 500, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
        {label}
      </span>}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: icon ? "28px minmax(0, 1fr) 24px" : "minmax(0, 1fr) 24px",
          alignItems: "center",
          width: icon ? 100 : roomy ? 82 : 74,
          flex: icon ? "0 0 100px" : undefined,
          boxSizing: "border-box",
          height: 32,
          borderRadius: joined === "start" ? "6px 0 0 6px" : joined === "end" ? "0 6px 6px 0" : 6,
          overflow: "hidden",
          background: focused ? "var(--chrome-raised)" : "var(--chrome-panel)",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor,
          borderLeftWidth: joined === "end" ? 0 : 1,
          boxShadow: focused ? "0 0 0 1px var(--chrome-raised)" : "none",
          transition: "border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
        }}
      >
        {icon && <span aria-hidden="true" className="grid h-full place-items-center text-[var(--ink-secondary)]">{icon}</span>}
        <span
          style={{
            width: "auto",
            height: "100%",
            display: "grid",
            placeItems: "center",
            padding: 0,
            fontSize: roomy ? "0.875rem" : "0.85rem",
            lineHeight: 1,
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--ink)",
            userSelect: "none",
          }}
        >
          {display}
        </span>
        <button
          type="button"
          aria-label={`Adjust ${label.toLowerCase()}`}
              onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const direction = event.key === "ArrowUp" ? 1 : -1;
            flushChange(value + direction * step * (unit === "seconds" ? -1 : 1));
          }}
          style={{
            width: 24,
            height: "100%",
            border: "none",
            borderLeft: `1px solid ${focused ? "var(--chrome-raised)" : "var(--chrome-raised)"}`,
            background: focused ? "var(--chrome-raised)" : "var(--chrome-deep)",
            color: focused ? "var(--ink)" : "var(--ink-muted)",
            cursor: "ns-resize",
            display: "grid",
            placeItems: "center",
            padding: 0,
            flexShrink: 0,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            dragCleanupRef.current?.();
            const startY = event.clientY;
            const startValue = value;
            const pointerId = event.pointerId;
            const handle = event.currentTarget;
            let active = true;
            try {
              handle.setPointerCapture(pointerId);
            } catch {
              // Window listeners remain the fallback when capture is unavailable.
            }

            const onMove = (moveEvent: PointerEvent) => {
              if (!active || moveEvent.pointerId !== pointerId) return;
              const delta = moveEvent.clientY - startY;
              scheduleChange(scrubPercentValueFromVerticalDrag(startValue, delta, step, decreaseMultiplier, unit === "seconds"));
            };

            const onUp = (upEvent: PointerEvent) => {
              if (!active || upEvent.pointerId !== pointerId) return;
              const delta = upEvent.clientY - startY;
              cleanup();
              flushChange(scrubPercentValueFromVerticalDrag(startValue, delta, step, decreaseMultiplier, unit === "seconds"));
            };

            const finishInterruptedDrag = () => {
              if (!active) return;
              cleanup();
              const pendingValue = pendingValueRef.current;
              if (pendingValue != null) flushChange(pendingValue);
            };

            const cleanup = () => {
              if (!active) return;
              active = false;
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              window.removeEventListener("pointercancel", finishInterruptedDrag);
              window.removeEventListener("blur", finishInterruptedDrag);
              document.removeEventListener("visibilitychange", onVisibilityChange);
              handle.removeEventListener("lostpointercapture", finishInterruptedDrag);
              try {
                if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
              } catch {
                // The browser may already have released capture during cancellation.
              }
              dragCleanupRef.current = null;
            };

            const onVisibilityChange = () => {
              if (document.visibilityState !== "visible") finishInterruptedDrag();
            };

            dragCleanupRef.current = cleanup;
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", finishInterruptedDrag);
            window.addEventListener("blur", finishInterruptedDrag);
            document.addEventListener("visibilitychange", onVisibilityChange);
            handle.addEventListener("lostpointercapture", finishInterruptedDrag);
          }}
        >
          <svg width="12" height="26" viewBox="0 0 12 26" fill="none" aria-hidden="true">
            <path d="M3 3H9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            <circle cx="2" cy="11" r="0.75" fill="currentColor" />
            <circle cx="6" cy="11" r="0.75" fill="currentColor" />
            <circle cx="10" cy="11" r="0.75" fill="currentColor" />
            <circle cx="2" cy="15" r="0.75" fill="currentColor" />
            <circle cx="6" cy="15" r="0.75" fill="currentColor" />
            <circle cx="10" cy="15" r="0.75" fill="currentColor" />
            <path d="M3 23H9M6 20V26" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type Props = {
  selectedElement: TimelineElement | null;
  selectedBeatLabel: string | null;
  onSplitSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  backwardSelectionCount: number;
  onSelectBackward: () => void;
  forwardSelectionCount: number;
  onSelectForward: () => void;
  previewAspectRatio: PreviewAspectRatio;
  /** Rearranges the EDITOR workspace only. The project's output aspect ratio lives in the export flow. */
  onPreviewAspectRatioChange: (value: PreviewAspectRatio) => void;
  /** Items shown in the shared take-and-agent review drawer. */
  pendingProposalCount?: number;
  proposalsOpen?: boolean;
  proposalPreviewActive?: boolean;
  onReviewProposals: () => void;
  showProposals?: boolean;
  onOpenMedia?: () => void;
  /** Whether the Library drawer is open (pressed state, matching Proposals). */
  mediaOpen?: boolean;
  libraryShortcut?: string;
  proposalsShortcut?: string;
  showEditorLayoutSwitcher?: boolean;
  visibleSeconds: number;
  minVisibleSeconds: number;
  maxVisibleSeconds: number;
  onVisibleSecondsChange: (value: number) => void;
  laneHeightPercent: number;
  minLaneHeightPercent: number;
  maxLaneHeightPercent: number;
  onLaneHeightPercentChange: (value: number) => void;
  outlineButtonClassName: string;
  ghostButtonClassName: string;
  onFitTime?: () => void;
  historyControls?: React.ReactNode;
  /** Review marks; stays with the timeline when Undo/History/Redo move to the header. */
  reviewControls?: React.ReactNode;
  headerAccessory?: React.ReactNode;
};

export function TimelineToolbar({
  selectedElement,
  onSplitSelected,
  snapEnabled,
  onToggleSnap,
  backwardSelectionCount,
  onSelectBackward,
  forwardSelectionCount,
  onSelectForward,
  previewAspectRatio,
  onPreviewAspectRatioChange,
  pendingProposalCount = 0,
  proposalsOpen = false,
  proposalPreviewActive = false,
  onReviewProposals,
  showProposals = true,
  onOpenMedia,
  mediaOpen = false,
  libraryShortcut = "L",
  proposalsShortcut = "P",
  showEditorLayoutSwitcher = true,
  visibleSeconds,
  minVisibleSeconds,
  maxVisibleSeconds,
  onVisibleSecondsChange,
  laneHeightPercent,
  minLaneHeightPercent,
  maxLaneHeightPercent,
  onLaneHeightPercentChange,
  outlineButtonClassName,
  ghostButtonClassName,
  onFitTime,
  historyControls,
  reviewControls,
  headerAccessory,
}: Props) {
  const isTallLayout = previewAspectRatio === "9:16";

  const editingControls = (
    <div
      aria-label="Timeline editing"
      role="group"
      className="timeline-editing-controls flex shrink-0 items-stretch gap-0.5 overflow-hidden rounded-lg"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleSnap}
        title={snapEnabled ? "Snapping on · N · Option bypasses" : "Snapping off · N"}
        aria-label={snapEnabled ? "Turn snapping off" : "Turn snapping on"}
        aria-pressed={snapEnabled}
        aria-keyshortcuts="N"
        className={snapEnabled ? outlineButtonClassName : ghostButtonClassName}
        style={{
          height: 32,
          width: 36,
          paddingInline: 0,
          flexShrink: 0,
          border: "none",
          borderRadius: 6,
          fontSize: "var(--ui-text-small)",
          background: snapEnabled ? "var(--chrome-selected-bg)" : undefined,
        }}
      >
        <MagnetIcon size={16} strokeWidth={2} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSplitSelected}
        disabled={!selectedElement}
        title={selectedElement ? "Split at playhead · S" : "Select a clip to split · S"}
        aria-label="Split selected clip at playhead"
        aria-keyshortcuts="S"
        className={ghostButtonClassName}
        style={{
          height: 32,
          width: 36,
          paddingInline: 0,
          flexShrink: 0,
          border: "none",
          borderRadius: 6,
          fontSize: "var(--ui-text-small)",
        }}
      >
        <ScissorsIcon size={16} strokeWidth={2} />
      </Button>
    </div>
  );

  const chrome = useOptionalWorkspaceChrome();
  const showPanelControls = showProposals || !!onOpenMedia;
  // Grouped like Undo/History/Redo beside them in the header (and in the tall toolbar, icon-only).
  const compactPanels = isTallLayout || Boolean(chrome?.editActions);
  // Library and Proposals share the header's bordered button look (workspace-panel-button);
  // aria-pressed follows the drawer's real open state, so the selected look clears however it closes.
  const proposalsNeedAttention = !proposalsOpen && (pendingProposalCount > 0 || proposalPreviewActive);
  const panelButtonStyle = { height: "var(--header-control-height, 32px)", minWidth: compactPanels ? 36 : undefined, paddingInline: compactPanels ? "0.5rem" : "0.45rem", gap: "0.35rem", flexShrink: 0 };
  // Each panel button names its drawer in words (the header hides the word, keeping it for screen
  // readers, only when the window is too narrow); the shortcut key lives in the tooltip.
  const withShortcut = (label: string, shortcut: string) => shortcut === "Off" ? label : `${label} · ${shortcut}`;
  const panelLabelClass = compactPanels ? (chrome?.editActions ? "workspace-panel-label" : "sr-only") : undefined;
  const panelControls = showPanelControls ? (
    // In the header the two share one bordered group, like Undo/History/Redo beside them.
    <div aria-label="Panels" role="group" className={compactPanels ? "timeline-history-controls workspace-panel-group" : undefined}
      style={{ display: "flex", alignItems: "center", gap: compactPanels ? 0 : "0.35rem", flexShrink: 0 }}>
      {onOpenMedia && <Button
        variant="outline"
        size="sm"
        onClick={onOpenMedia}
        aria-pressed={mediaOpen}
        aria-label="Open Library"
        aria-keyshortcuts={libraryShortcut === "Off" ? undefined : libraryShortcut}
        // "panel", so it reads apart from the header's Library page link beside it.
        title={withShortcut("Library panel", libraryShortcut)}
        className="workspace-panel-button"
        style={panelButtonStyle}
      ><ImagesIcon size={14} strokeWidth={2} aria-hidden="true" /><span className={panelLabelClass}>Library</span></Button>}
      {showProposals ? <Button
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onReviewProposals();
        }}
        aria-pressed={proposalsOpen}
        aria-label={`Open Proposals${pendingProposalCount > 0 ? `, ${pendingProposalCount} to review` : ""}${proposalPreviewActive ? ". Temporary proposal preview active." : ""}`}
        aria-keyshortcuts={proposalsShortcut === "Off" ? undefined : proposalsShortcut}
        title={proposalPreviewActive
          ? withShortcut("Temporary proposal preview active", proposalsShortcut)
          : withShortcut(pendingProposalCount > 0 ? `Proposals: ${pendingProposalCount} to review` : "Proposals", proposalsShortcut)}
        // Closed with work waiting, the ring alone asks for attention; open adds the selected fill.
        data-attention={proposalsNeedAttention || undefined}
        className="workspace-panel-button"
        style={panelButtonStyle}
      >
        <ClipboardCheckIcon size={14} strokeWidth={2} aria-hidden="true" />
        <span className={panelLabelClass}>Proposals</span>
        {pendingProposalCount > 0
          ? <span className="workspace-panel-count" aria-hidden="true">{pendingProposalCount}</span>
          : null}
      </Button> : null}
    </div>
  ) : null;

  // The layout switch reshapes the whole workspace, so it lives in the header when the
  // workspace provides that slot; capture frame takes its place beside the timeline.
  const layoutSwitcher = showEditorLayoutSwitcher ? (
<div
        aria-label="Editor layout"
        role="group"
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          gap: 2,
          height: 32,
          padding: 2,
          borderRadius: "0.625rem",
          background: "var(--chrome-deep)",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {(["9:16", "16:9"] as const).map((ratio) => {
          const active = previewAspectRatio === ratio;
          const isVertical = ratio === "9:16";
          return (
            <button
              key={ratio}
              type="button"
              onClick={() => onPreviewAspectRatioChange(ratio)}
              title={isVertical ? "Tall layout" : "Wide layout"}
              aria-label={isVertical ? "Use tall editor layout" : "Use wide editor layout"}
              aria-pressed={active}
              className="workspace-layout-option focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
              style={{
                border: "none",
                borderRadius: "0.5rem",
                background: active ? "var(--chrome-raised)" : undefined,
                color: active ? "var(--ink)" : "var(--ink-muted)",
                cursor: "pointer",
                padding: 0,
                width: 30,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                alignSelf: "stretch",
                justifyContent: "center",
                gap: "0.35rem",
                opacity: active ? 1 : 0.72,
                fontSize: isTallLayout ? "0.875rem" : "0.82rem",
                fontWeight: 800,
                transition: "opacity 150ms ease, background 150ms ease",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "block",
                  width: isVertical ? 8 : 13,
                  height: isVertical ? 13 : 8,
                  borderRadius: 2,
                  border: `1.5px solid ${active ? "var(--ink)" : "var(--ink-muted)"}`,
                  background: active ? "var(--chrome-line-strong)" : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>
  ) : null;
  const layoutInHeader = Boolean(chrome?.layoutActions);
  const editActionsInHeader = Boolean(chrome?.editActions);
  // Rendered only with content: an empty group still takes a slot in the toolbar's spacing.
  const previewViewControls = headerAccessory || (!layoutInHeader && layoutSwitcher) ? (
    <div
      aria-label="Preview view"
      role="group"
      style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}
    >
      {headerAccessory}
      {layoutInHeader ? null : layoutSwitcher}
    </div>
  ) : null;
  const headerLayoutSwitcher = layoutInHeader && layoutSwitcher ? createPortal(layoutSwitcher, chrome!.layoutActions!) : null;

  const timelineViewControls = (
    <div aria-label="Timeline view" role="group" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      <TimelineVisibleSecondsControl
        value={visibleSeconds}
        min={minVisibleSeconds}
        max={maxVisibleSeconds}
        onChange={onVisibleSecondsChange}
      />
      <ScrubPercentControl
        label="Lane height"
        icon={<Rows3Icon size={16} />}
        joined="end"
        value={laneHeightPercent}
        min={minLaneHeightPercent}
        max={maxLaneHeightPercent}
        step={5}
        decreaseMultiplier={2}
        onChange={onLaneHeightPercentChange}
      />
    </div>
  );

  // Tall packs groups tightly with small gaps; wide spreads them (space-between), where a
  // spacer would count as one more group and pull the view controls off the right edge.
  const toolbarGroupDivider = isTallLayout ? (
    <div aria-hidden="true" style={{ width: 4, height: 22, flexShrink: 0 }} />
  ) : null;

  if (!editingControls && !panelControls && !timelineViewControls && !previewViewControls) {
    return null;
  }

  return (
    <div
      data-testid="timeline-toolbar"
      style={{
        background: "var(--glass-bar)",
        boxShadow: "var(--glass-shadow)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "nowrap",
        overflowX: "auto",
        gap: isTallLayout ? "0.125rem" : "0.35rem",
        padding: isTallLayout ? "0.3rem 0.375rem" : "0.3rem 0.5rem",
        flexShrink: 0,
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        minWidth: 0,
      }}
    >
      {editActionsInHeader ? createPortal(<div role="group" aria-label="Edit and panels" className="workspace-edit-actions-group">{historyControls}{panelControls}</div>, chrome!.editActions!) : <>{historyControls}{historyControls ? toolbarGroupDivider : null}</>}
      {/* Marks stay boxed and sit nearest the preview: first in tall (preview to the left); in wide they sit
          just left of the zoom controls, under the preview. Snap and split lead the wide row. */}
      {isTallLayout ? <>
        {reviewControls}
        {reviewControls ? toolbarGroupDivider : null}
        {editingControls}
        {toolbarGroupDivider}
        {editActionsInHeader ? null : <>{panelControls}{panelControls ? toolbarGroupDivider : null}</>}
        <div role="presentation" style={{ marginLeft: "auto", display: "flex", alignItems: "center", flexShrink: 0 }}>{timelineViewControls}</div>
      </> : <>
        {editingControls}
        {editActionsInHeader ? null : panelControls}
        <div role="presentation" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto", flexShrink: 0 }}>
          {reviewControls}
          {timelineViewControls}
        </div>
      </>}



      {onFitTime && <div role="group" aria-label="Fit timeline" className="flex shrink-0 items-center gap-1">
        {onFitTime && <Button variant="ghost" size="sm" style={{ height: 32, minWidth: 48, paddingInline: 12 }} onClick={onFitTime} title="Fit timeline · Shift+Z" className={ghostButtonClassName}>Fit</Button>}

      </div>}
      {previewViewControls}
      {headerLayoutSwitcher}
    </div>
  );
}
