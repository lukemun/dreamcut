"use client";
import { validateTransitionAdjacency } from "@/lib/timeline/transitions";

import type { CSSProperties, ReactNode, RefObject } from "react";

import { CAPTIONS_LANE_KEY, isVisualLane, isCaptionsLane, isMusicLane, isSoundEffectLane } from "@/lib/timeline/lanes";
import { compoundClipId } from "@/lib/timeline/compound-clips";

import type { LaneDef, TimelineElement, TimelineTransitionChip } from "./types";
import type { ContextMenuState } from "./timeline-hit-regions";
import { chrome } from "./theme";

type Props = {
  menu: ContextMenuState;
  menuRef: RefObject<HTMLDivElement | null>;
  position: { left: number; top: number } | null;
  elements: TimelineElement[];
  selectedIds: string[];
  lanes: LaneDef[];
  mutedLanes: Set<string>;
  hiddenLanes?: Set<string>;
  onToggleLaneHidden?: (laneKey: string) => void;
  playheadSec: number;
  selectedBeatId: string | null;
  hasClipboard: boolean;
  transitionChips?: TimelineTransitionChip[];
  onCreateTransition?: (fromId: string, toId: string) => void | Promise<unknown>;
  onSelectTransition?: (id: string | null) => void;
  onClose: () => void;
  onSelectBeat: (beatId: string | null) => void;
  onFitBeatToVisualContent: (beatId: string) => void;
  onMoveBeatVisualsToBeatStart: (beatId: string) => void;
  onToggleMute: (laneKey: string) => void;
  onDeleteElement: (elementId: string) => void;
  onToggleLock: (elementId: string, locked: boolean) => void;
  onSoloLane: (laneKey: string) => void;
  /** Batch position_locked across the lane's active clips (one undoable batch). */
  onToggleLaneLock: (laneKey: string, locked: boolean) => void;
  onSelectLaneElements: (laneKey: string) => void;
  onSplitElement: (elementId: string, splitAtSec: number) => void;
  onDuplicateElement: (elementId: string) => void;
  onCopyElement: (elementId: string) => void;
  onCutElement: (elementId: string) => void;
  onPasteElement: (atSec: number) => void;
  onToggleDisable: (elementId: string) => void;
  /** Select the clip and show its Properties tab (Timing, Layout); the controls keep one canonical home. */
  onOpenClipProperties?: (elementId: string, domain: "timing" | "position") => void;
  onCombineElements: (elementIds: string[]) => void;
  onPreparePresenterCompound?: (elementId: string) => void;
  onBreakApartCompoundClip: (elementId: string) => void;
  onAddLane: (sourceLaneKey?: string) => void;
  onCreateCaptionsLaneAbove: (laneKey: string) => void | Promise<unknown>;
  onDeleteLane: (laneKey: string) => void;
  onMoveLaneUp: (laneKey: string) => void;
  onMoveLaneDown: (laneKey: string) => void;
  onAddCaptionElement: (laneKey: string, atSec: number) => void;
};

export function TimelineContextMenu({
  menu,
  menuRef,
  position,
  elements,
  selectedIds,
  lanes,
  mutedLanes,
  hiddenLanes,
  onToggleLaneHidden,
  playheadSec,
  selectedBeatId,
  hasClipboard,
  transitionChips = [],
  onCreateTransition,
  onSelectTransition,
  onClose,
  onSelectBeat,
  onFitBeatToVisualContent,
  onMoveBeatVisualsToBeatStart,
  onToggleMute,
  onDeleteElement,
  onToggleLock,
  onSoloLane,
  onToggleLaneLock,
  onSelectLaneElements,
  onSplitElement,
  onOpenClipProperties,
  onDuplicateElement,
  onCopyElement,
  onCutElement,
  onPasteElement,
  onToggleDisable,
  onCombineElements,
  onPreparePresenterCompound,
  onBreakApartCompoundClip,
  onAddLane,
  onCreateCaptionsLaneAbove,
  onDeleteLane,
  onMoveLaneUp,
  onMoveLaneDown,
  onAddCaptionElement,
}: Props) {
  const getAddLaneLabel = (lane: LaneDef) => {
    if (lane.type === "visual") return "Add visual lane";
    if (isMusicLane(lane.key)) return "Add music lane";
    if (isSoundEffectLane(lane.key)) return "Add SFX lane";
    if (isCaptionsLane(lane.key)) return "Add captions lane";
    return lane.key.startsWith("audio_narrator:") || lane.key === "audio_narrator"
      ? "Add narrator lane"
      : "Add character lane";
  };

  const menuItemStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    padding: "0.45rem 0.75rem",
    border: "none",
    background: "none",
    color: chrome.ink,
    fontSize: "var(--ui-text-small)",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
    borderRadius: "var(--edge-control-inner)",
  };

  const dangerStyle: CSSProperties = { ...menuItemStyle, color: "var(--editor-destructive-ink)" };
  const disabledStyle: CSSProperties = {
    ...menuItemStyle,
    color: chrome.inkMuted,
    cursor: "default",
    pointerEvents: "none",
  };

  const separator = (
    <div
      style={{ height: 1, background: chrome.line, margin: "0.2rem 0" }}
    />
  );

  const wrap = (children: ReactNode) => (
    <div
      ref={menuRef}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        left: position?.left ?? menu.x,
        top: position?.top ?? menu.y,
        zIndex: "var(--layer-popover)",
        minWidth: 160,
        background: chrome.panel,
        border: `1px solid ${chrome.lineStrong}`,
        borderRadius: "var(--edge-control)",
        padding: "0.3rem",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {children}
    </div>
  );

  if (menu.target === "clip") {
    const element = elements.find((entry) => entry.id === menu.elementId);
    if (!element) return null;
    const singleSelectedElement =
      selectedIds.length === 1
        ? elements.find((entry) => entry.id === selectedIds[0]) ?? null
        : null;
    const splitTarget = singleSelectedElement ?? element;

    const playheadInClip =
      playheadSec >= splitTarget.timeline_start
      && playheadSec < splitTarget.timeline_start + splitTarget.duration;
    const canDuplicate = !element.position_locked;
    const canCopyOrCut = !element.position_locked;
    const clickedSelection = selectedIds.includes(element.id)
      ? selectedIds
      : [element.id];
    const canBreakApart = compoundClipId(element) != null;
    const canCombine = clickedSelection.length > 1 && !canBreakApart;
    const canEditIndividualBoundaries = !canBreakApart;
    const neighbors = elements.filter(e => !e.removed_at && e.lane_key === element.lane_key && e.id !== element.id);
    const before = neighbors.find(e => validateTransitionAdjacency(elements, e.id, element.id, 0.5).ok);
    const after = neighbors.find(e => validateTransitionAdjacency(elements, element.id, e.id, 0.5).ok);
    const transitionActions = isVisualLane(element.lane_key) && canEditIndividualBoundaries
      ? [{ side: "before", from: before, to: element }, { side: "after", from: element, to: after }]
        .filter(pair => pair.from && pair.to && !pair.from.position_locked && !pair.to.position_locked)
      : [];


    return wrap(
      <>
        {onCreateTransition && transitionActions.map(({ side, from, to }) => {
          const existing = transitionChips.find(t => t.from_element_id === from!.id && t.to_element_id === to!.id);
          return <button key={side} type="button" style={menuItemStyle}
            onPointerDown={event => event.stopPropagation()}
            onClick={() => {
              if (existing) onSelectTransition?.(existing.id);
              else void onCreateTransition(from!.id, to!.id);
              onClose();
            }}>
            {existing ? "Edit" : "Add"} transition {side}
          </button>;
        })}

        <button
          type="button"
          style={playheadInClip && canEditIndividualBoundaries ? menuItemStyle : disabledStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (playheadInClip && canEditIndividualBoundaries) onSplitElement(splitTarget.id, playheadSec);
            onClose();
          }}
        >
          Split at playhead
        </button>
        <button
          type="button"
          style={canDuplicate && canEditIndividualBoundaries ? menuItemStyle : disabledStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (canDuplicate && canEditIndividualBoundaries) onDuplicateElement(element.id);
            onClose();
          }}
        >
          Duplicate
        </button>
        <button
          type="button"
          style={canCopyOrCut && canEditIndividualBoundaries ? menuItemStyle : disabledStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (canCopyOrCut && canEditIndividualBoundaries) onCopyElement(element.id);
            onClose();
          }}
        >
          Copy
        </button>
        <button
          type="button"
          style={canCopyOrCut && canEditIndividualBoundaries ? menuItemStyle : disabledStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (canCopyOrCut && canEditIndividualBoundaries) void onCutElement(element.id);
            onClose();
          }}
        >
          Cut
        </button>
        {onOpenClipProperties && (element.type === "video_clip" || element.type === "still") ? <>
          {separator}
          {element.type === "video_clip" ? <button type="button" style={menuItemStyle} onPointerDown={event => event.stopPropagation()}
            onClick={() => { onOpenClipProperties(element.id, "timing"); onClose(); }}>
            Speed & direction…
          </button> : null}
          <button type="button" style={menuItemStyle} onPointerDown={event => event.stopPropagation()}
            onClick={() => { onOpenClipProperties(element.id, "position"); onClose(); }}>
            Flip & rotate…
          </button>
        </> : null}
        {element.props?.speech_sync_binding && onPreparePresenterCompound ? (
          <button type="button" style={menuItemStyle} onPointerDown={event => event.stopPropagation()}
            onClick={() => { onPreparePresenterCompound(element.id); onClose(); }}>
            Prepare seamless presenter compound…
          </button>
        ) : null}
        {canCombine ? (
          <button
            type="button"
            style={menuItemStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onCombineElements(clickedSelection);
              onClose();
            }}
          >
            Combine into compound clip
          </button>
        ) : null}
        {canBreakApart ? (
          <button
            type="button"
            style={menuItemStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onBreakApartCompoundClip(element.id);
              onClose();
            }}
          >
            Break apart compound clip
          </button>
        ) : null}
        {separator}
        <button
          type="button"
          style={menuItemStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onToggleLock(element.id, !element.position_locked);
            onClose();
          }}
        >
          {element.position_locked ? "Unlock position" : "Lock position"}
        </button>
        <button
          type="button"
          style={menuItemStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onToggleDisable(element.id);
            onClose();
          }}
        >
          {element.props?.disabled ? "Enable" : "Disable"}
        </button>
        {separator}
        <button
          type="button"
          style={dangerStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onDeleteElement(element.id);
            onClose();
          }}
        >
          Remove
        </button>
      </>,
    );
  }

  if (menu.target === "beat") {
    return wrap(
      <>
        <button
          type="button"
          style={menuItemStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onSelectBeat(selectedBeatId === menu.beatId ? null : menu.beatId);
            onClose();
          }}
        >
          {selectedBeatId === menu.beatId ? "Deselect beat" : "Select beat"}
        </button>
        <button
          type="button"
          style={menuItemStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onFitBeatToVisualContent(menu.beatId);
            onClose();
          }}
        >
          Fit beat to visuals
        </button>
        <button
          type="button"
          style={menuItemStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onMoveBeatVisualsToBeatStart(menu.beatId);
            onClose();
          }}
        >
          Move visuals to beat start
        </button>
      </>,
    );
  }

  if (menu.target === "lane") {
    const lane = lanes.find((entry) => entry.key === menu.laneKey);
    if (!lane) return null;

    const isMuted = mutedLanes.has(lane.key);
    const isHidden = hiddenLanes?.has(lane.key) ?? false;
    const laneHasSound = lane.type !== "captions";
    const laneHasPicture = lane.type === "visual" || lane.type === "captions";
    const laneElements = elements.filter((element) => element.lane_key === lane.key && element.removed_at == null);
    const laneHasElements = laneElements.length > 0;
    const laneFullyLocked = laneHasElements && laneElements.every((element) => element.position_locked);
    const canDeleteLane = lane.key !== CAPTIONS_LANE_KEY;
    const laneKeys = lanes.map((entry) => entry.key);
    const laneIndex = laneKeys.indexOf(lane.key);
    const canMoveLaneUp = laneIndex > 0;
    const canMoveLaneDown = laneIndex >= 0 && laneIndex < laneKeys.length - 1;

    return wrap(
      <>
        {laneHasSound ? <>
          <button
            type="button"
            style={menuItemStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onToggleMute(lane.key);
              onClose();
            }}
          >
            {isMuted ? "Unmute sound" : "Mute sound"}
          </button>
          <button
            type="button"
            style={menuItemStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onSoloLane(lane.key);
              onClose();
            }}
          >
            Play only this lane's sound
          </button>
        </> : null}
        {laneHasPicture && onToggleLaneHidden ? (
          <button
            type="button"
            style={menuItemStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onToggleLaneHidden(lane.key);
              onClose();
            }}
          >
            {isHidden ? "Show lane" : "Hide lane"}
          </button>
        ) : null}
        <button
          type="button"
          style={laneHasElements ? menuItemStyle : disabledStyle}
          disabled={!laneHasElements}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onToggleLaneLock(lane.key, !laneFullyLocked);
            onClose();
          }}
        >
          {laneFullyLocked ? "Unlock all clips" : "Lock all clips"}
        </button>
        <button
          type="button"
          style={laneHasElements ? menuItemStyle : disabledStyle}
          disabled={!laneHasElements}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (laneHasElements) onSelectLaneElements(lane.key);
            onClose();
          }}
        >
          {isCaptionsLane(lane.key) ? "Select all captions" : "Select all clips"}
        </button>
        <div style={{ height: 1, background: chrome.line, margin: "2px 0" }} />
        <button
          type="button"
          style={menuItemStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            onAddLane(lane.key);
            onClose();
          }}
        >
          {getAddLaneLabel(lane)}
        </button>
        {lane.type === "audio" ? (
          <button
            type="button"
            style={menuItemStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              void onCreateCaptionsLaneAbove(lane.key);
              onClose();
            }}
          >
            Create captions lane above
          </button>
        ) : null}
        {isCaptionsLane(lane.key) ? (
          <button
            type="button"
            style={menuItemStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              onAddCaptionElement(lane.key, playheadSec);
              onClose();
            }}
          >
            Add caption at playhead
          </button>
        ) : null}
        {separator}
        <button
          type="button"
          style={canMoveLaneUp ? menuItemStyle : disabledStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (canMoveLaneUp) onMoveLaneUp(lane.key);
            onClose();
          }}
        >
          Move up
        </button>
        <button
          type="button"
          style={canMoveLaneDown ? menuItemStyle : disabledStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            if (canMoveLaneDown) onMoveLaneDown(lane.key);
            onClose();
          }}
        >
          Move down
        </button>
        {canDeleteLane ? (
          <>
            {separator}
            <button
              type="button"
              style={dangerStyle}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                onDeleteLane(lane.key);
                onClose();
              }}
            >
              {laneHasElements ? "Delete lane and contents" : "Delete lane"}
            </button>
          </>
        ) : null}
      </>,
    );
  }

  if (menu.target === "lane_body" && isCaptionsLane(menu.laneKey)) {
    return wrap(
      <button
        type="button"
        style={menuItemStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          onAddCaptionElement(menu.laneKey, menu.atSec);
          onClose();
        }}
      >
        Add caption
      </button>,
    );
  }

  return wrap(
    <button
      type="button"
      style={hasClipboard ? menuItemStyle : disabledStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => {
        if (hasClipboard) onPasteElement(playheadSec);
        onClose();
      }}
    >
      Paste at playhead
    </button>,
  );
}
