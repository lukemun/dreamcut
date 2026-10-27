"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { CaptionsIcon, ChevronsDownIcon, SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { inspectorQuietButtonClassName } from "./InspectorHierarchy";

import { SelectedClipActions } from "./SelectedClipActions";
import { PropertiesSelectionTitle } from "./PropertiesSelectionTitle";
import { TimelineInspectorPanel, type TimelineInspectorPanelProps } from "./TimelineInspectorPanel";

type Props = TimelineInspectorPanelProps & {
  assetShelfNode?: ReactNode;
  panelMode?: "tabs" | "inspector";
  /** Take auditions and agent proposals awaiting review. */
  pendingProposalCount?: number;
  /** Open the shared review drawer. */
  onReviewProposals?: () => void;
  showProposals?: boolean;
  onSplitSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onSelectCaptionLane: () => void;
  onCloseProperties: () => void;
  /** Expand, in the header's top-right corner where every panel keeps it. */
  headerAction?: ReactNode;
};

type RightPanelTab = "library" | "inspector";

/** Shared inspector body; the parent owns fixed tool navigation in inspector mode. */
export function LandscapeRightPanel(props: Props) {
  const {
    selectedElement,
    selectedTransition,
    assetShelfNode,
    panelMode = "tabs",
    pendingProposalCount = 0,
    onReviewProposals,
    showProposals = true,
    onSplitSelected,
    onDuplicateSelected,
    onDeleteSelected,
    onSelectCaptionLane,
    onCloseProperties,
    headerAction,
  } = props;

  const hasInspectorContent = !!selectedElement || !!selectedTransition || !!props.transitionCreateCandidate;

  // What the timeline currently has selected. Any change to it re-applies the
  // automatic tab, which is also what releases a manually pinned tab.
  const selectionKey = [
    selectedElement?.id ?? "",
    props.selectedElementCount,
    selectedTransition?.id ?? "",
    props.transitionCreateCandidate
      ? `${props.transitionCreateCandidate.fromElementId}>${props.transitionCreateCandidate.toElementId}`
      : "",
  ].join("|");

  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { inspectorScrollRef.current?.scrollTo({ top: 0 }); }, [selectionKey]);

  const [activeTab, setActiveTab] = useState<RightPanelTab>(hasInspectorContent ? "inspector" : "library");
  const [appliedSelectionKey, setAppliedSelectionKey] = useState(selectionKey);

  // Adjust state during render rather than in an effect, so the panel never
  // paints one frame of the previous tab after the selection moved.
  if (selectionKey !== appliedSelectionKey) {
    setAppliedSelectionKey(selectionKey);
    setActiveTab(hasInspectorContent ? "inspector" : "library");
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setActiveTab((current) => (current === "library" ? "inspector" : "library"));
  };

  const reviewBanner = panelMode === "tabs" && showProposals && pendingProposalCount > 0 ? (
    <button
      type="button"
      onClick={onReviewProposals}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        width: "100%",
        padding: "0.55rem 0.85rem",
        border: "none",
        background: "var(--chrome-raised)",
        color: "var(--ink)",
        fontSize: "var(--ui-text-small)",
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        cursor: "pointer",
        textAlign: "left",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "rgb(52, 211, 153)",
          flexShrink: 0,
        }}
      />
      <span style={{ flex: "1 1 auto" }}>
        {pendingProposalCount === 1
          ? "1 item ready to review"
          : `${pendingProposalCount} items ready to review`}
      </span>
      <span style={{ color: "var(--ink-muted)", fontWeight: 700 }}>Review →</span>
    </button>
  ) : null;

  const tabs: ReadonlyArray<readonly [RightPanelTab, string]> = [
    ["library", "Media"],
    ["inspector", "Properties"],
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        background: "var(--chrome-panel)",
      }}
    >
      {reviewBanner}

      {(panelMode === "tabs" || hasInspectorContent || headerAction) && <div
        role={panelMode === "tabs" ? "tablist" : undefined}
        aria-label={panelMode === "tabs" ? "Media and Properties" : "Properties"}
        aria-orientation={panelMode === "tabs" ? "horizontal" : undefined}
        data-testid={panelMode === "tabs" ? "right-panel-tabs" : "properties-panel-header"}
        onKeyDown={panelMode === "tabs" ? handleTabKeyDown : undefined}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.35rem 0.5rem",
          background: "var(--chrome-deep)",
          flexShrink: 0,
        }}
      >
        {panelMode === "inspector" ? (
          <PropertiesSelectionTitle showSectionLabel={false} element={selectedElement} count={props.selectedElementCount} transition={!!selectedTransition || !!props.transitionCreateCandidate} onRename={props.patchSelectedElementProps} />
        ) : tabs.map(([id, label]) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`right-panel-tab-${id}`}
              aria-controls={`right-panel-view-${id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(id)}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chrome-focus-ring)]"
              style={{
                minHeight: 30,
                padding: "0 0.8rem",
                borderRadius: "var(--edge-control-inner)",
                border: `1px solid ${active ? "var(--chrome-selected-ring)" : "transparent"}`,
                background: active ? "var(--chrome-raised)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-secondary, var(--ink-muted))",
                fontSize: "var(--ui-text-small)",
                fontWeight: 700,
                cursor: "pointer",
                transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
              }}
            >
              {label}
            </button>
          );
        })}

        {(panelMode === "tabs" && activeTab === "inspector") ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Collapse Properties"
            title={panelMode === "tabs" ? "Collapse Properties and return to Media" : "Collapse Properties"}
            className={inspectorQuietButtonClassName}
            onClick={() => {
              if (panelMode === "tabs") setActiveTab("library");
              else onCloseProperties();
            }}
            style={{
              flexShrink: 0,
              width: 30,
              minWidth: 30,
              height: 30,
            }}
          >
            <ChevronsDownIcon size={18} style={{ width: 18, height: 18 }} preserveAspectRatio="none" strokeWidth={1.8} />
          </Button>
        ) : null}

        {panelMode === "inspector" && selectedElement ? <div className="flex shrink-0 items-center gap-1">              <SelectedClipActions
                selectedElement={selectedElement}
                onSplitSelected={onSplitSelected}
                onDuplicateSelected={onDuplicateSelected}
                onDeleteSelected={onDeleteSelected}
              />
              {selectedElement?.type === "caption_text" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onSelectCaptionLane}
                  aria-label="Select all captions in this lane"
                  title="Select every caption in this lane"
                  className={inspectorQuietButtonClassName}
                >
                  <CaptionsIcon size={16} strokeWidth={2} />
                </Button>
              ) : null}</div> : <div style={{ flex: "1 1 auto" }} />}
        {panelMode === "inspector" && headerAction}
      </div>}

      {/* Both views stay mounted so the Library keeps its tab, search, scroll
          position, and width when a selection sends focus to the Inspector. */}
      {panelMode === "tabs" ? <div
        role="tabpanel"
        id="right-panel-view-library"
        aria-labelledby="right-panel-tab-library"
        style={{
          display: activeTab === "library" ? "flex" : "none",
          flex: "1 1 0%",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {assetShelfNode}
      </div> : null}

      <div
        role="tabpanel"
        id="right-panel-view-inspector"
        aria-labelledby="right-panel-tab-inspector"
        style={{
          display: panelMode === "inspector" || activeTab === "inspector" ? "flex" : "none",
          flex: "1 1 0%",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {hasInspectorContent ? (
          <div ref={inspectorScrollRef} style={{ display: "flex", flexDirection: "column", flex: "1 1 0%", minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
            {panelMode === "tabs" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "12px 12px 6px 14px",
                background: "var(--chrome-panel)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: "1 1 auto" }}>
                <span style={{ fontSize: "var(--ui-text-small)", fontWeight: 500, color: "var(--ink-secondary, var(--ink-muted))" }}>
                  {selectedTransition && !selectedElement
                    ? "Transition"
                    : props.selectedElementCount > 1
                      ? `${props.selectedElementCount} selected clips`
                      : "Selected clip"}
                </span>
                <span style={{ fontSize: "0.98rem", fontWeight: 700, color: "var(--ink)", textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedElement?.type.replaceAll("_", " ")
                    ?? (selectedTransition ? `${props.transitionFromLabel} to ${props.transitionToLabel}` : "New transition")}
                  {selectedElement ? (
                    <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--ui-text-small)", color: "var(--ink-muted)", marginLeft: "0.4rem", fontWeight: 600, textTransform: "none" }}>
                      {selectedElement.duration.toFixed(2)}s
                    </span>
                  ) : null}
                </span>
              </div>
              <SelectedClipActions
                selectedElement={selectedElement}
                onSplitSelected={onSplitSelected}
                onDuplicateSelected={onDuplicateSelected}
                onDeleteSelected={onDeleteSelected}
              />
              {selectedElement?.type === "caption_text" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onSelectCaptionLane}
                  aria-label="Select all captions in this lane"
                  title="Select every caption in this lane"
                  className={inspectorQuietButtonClassName}
                >
                  <CaptionsIcon size={16} strokeWidth={2} />
                </Button>
              ) : null}
            </div>
            ) : null}
            <TimelineInspectorPanel {...props} layout="vertical" />
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              padding: "2rem 1.25rem",
              color: "var(--ink-muted)",
              textAlign: "center",
            }}
          >
            <div style={{ display: "grid", justifyItems: "center", gap: 8, maxWidth: 260 }}>
              <SlidersHorizontalIcon size={22} strokeWidth={1.7} aria-hidden="true" />
              <strong style={{ color: "var(--ink)", fontSize: 15, fontWeight: 500 }}>Select a clip to edit it</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
