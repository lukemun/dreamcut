"use client";

import { findTransitionRegion, transitionHoverId } from "./transition-hover";
import { trimGestureActivated, trimEdgeScrollPosition, trimEdgeScrollVelocity } from "./timeline-edge-scroll";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

import { getVideoHoldSegments, supportsOverflowHold } from "@/lib/timeline/media";
import { minTimelineDurationSeconds } from "@/lib/timeline/frame-quantization";
import { isCaptionsLane, isMusicLane, isVisualLane } from "@/lib/timeline/lanes";
import { logTimelineShelf } from "@/lib/debug/timeline-shelf";
import {
  MAX_VOLUME,
  insertEnvelopePoint,
  moveEnvelopePoint,
  moveEnvelopeSegment,
  readVolumeEnvelopePoints,
  writeVolumeEnvelopePatch,
} from "@/lib/timeline/volume-envelope";

import {
  clamp,
  collectSecondarySnapTargets,
  collectSnapTargets,
  computeSecondarySnap,
  computeSnap,
  computeRulerSnap,
  findRectRegion,
  findSquareRegion,
  getSnapReleasePx,
  getSnapThresholdPx,
  getGainLineGeometry,
  pointInCircle,
  snapBoundaryToRuler,
  snapBoundaryToSecondaryTargets,
  snapBoundaryToTargets,
} from "./canvas-helpers";
import { buildLeftEdgeResizeInput, resolveTimingEditPreview } from "./timeline-actions";
import {
  resolveClipPointerSelection,
  resolvePointerDownTarget,
  TIMELINE_RULER_HEIGHT as RULER_HEIGHT,
} from "./timeline-interaction-targets";
import type {
  BeatMenuBtnHitRegion,
  BeatResizeHitRegion,
  ClipHitRegion,
  ContextMenuState,
  EnvelopePointHitRegion,
  EnvelopeSegmentHitRegion,
  GainHitRegion,
  GainKeyframeHitRegion,
  LaneMenuBtnHitRegion,
  LaneResizeHitRegion,
  MenuBtnHitRegion,
  MuteHitRegion,
  ResizeHitRegion,
  SoloHitRegion,
  HideHitRegion,
  TransitionHitRegion,
  VisualKeyframeHitRegion,
} from "./timeline-hit-regions";
import type {
  BeatResizeState,
  DragState,
  EnvelopePointDragState,
  EnvelopeSegmentDragState,
  HoverCursor,
  LaneLayout,
  LaneResizeState,
  MarqueeState,
  Rect,
  ResizeState,
  SelectedEnvelopePoint,
  SnapGuide,
} from "./timeline-canvas-model";
import type { LaneDef, TimelineBeatBand, TimelineElement } from "./types";

type ValueRef<T> = {
  current: T;
};

type UseCanvasTimelineInteractionsArgs = {
  canvasRef: ValueRef<HTMLCanvasElement | null>;
  addLaneBtnRef: ValueRef<Rect | null>;
  clipRegionsRef: ValueRef<ClipHitRegion[]>;
  resizeRegionsRef: ValueRef<ResizeHitRegion[]>;
  transitionRegionsRef: ValueRef<TransitionHitRegion[]>;
  muteRegionsRef: ValueRef<MuteHitRegion[]>;
  soloRegionsRef: ValueRef<SoloHitRegion[]>;
  hideRegionsRef?: ValueRef<HideHitRegion[]>;
  laneResizeRegionsRef: ValueRef<LaneResizeHitRegion[]>;
  laneMenuBtnRegionsRef: ValueRef<LaneMenuBtnHitRegion[]>;
  menuBtnRegionsRef: ValueRef<MenuBtnHitRegion[]>;
  beatMenuBtnRegionsRef: ValueRef<BeatMenuBtnHitRegion[]>;
  beatResizeRegionsRef: ValueRef<BeatResizeHitRegion[]>;
  gainRegionsRef: ValueRef<GainHitRegion[]>;
  gainKeyframeRegionsRef: ValueRef<GainKeyframeHitRegion[]>;
  visualKeyframeRegionsRef: ValueRef<VisualKeyframeHitRegion[]>;
  envelopePointRegionsRef: ValueRef<EnvelopePointHitRegion[]>;
  envelopeSegmentRegionsRef: ValueRef<EnvelopeSegmentHitRegion[]>;
  musicalBeatTimes?: number[];
  musicalBeatReferenceId?: string;
  beatMarkers: TimelineBeatBand[];
  elements: TimelineElement[];
  elementById: Map<string, TimelineElement>;
  lanes: LaneDef[];
  laneLayouts: LaneLayout[];
  selectedIds: string[];
  selectedBeatId: string | null;
  playheadSec: number;
  pxPerSec: number;
  scrollSec: number;
  onTrimScroll: (seconds: number) => void;
  totalDuration: number;
  snapEnabled: boolean;
  isOverPlayhead: (x: number, y: number) => boolean;
  seekFromClientX: (clientX: number) => void;
  onSeek: (seconds: number) => void;
  onSelect: (
    elementId: string,
    options?: { additive?: boolean; toggle?: boolean; replace?: boolean },
  ) => void;
  onClearSelection: () => void;
  onSetSelection: (elementIds: string[]) => void;
  onSelectTransition: (transitionId: string | null) => void;
  onCreateTransition: (fromElementId: string, toElementId: string) => void | Promise<unknown>;
  onSelectBeat: (beatId: string | null) => void;
  onToggleMute: (laneKey: string) => void;
  onSoloLane: (laneKey: string) => void;
  onToggleLaneHidden?: (laneKey: string) => void;
  onMoveElement: (elementId: string, next: { timelineStart?: number; laneKey?: string }) => void;
  onMoveElements: (elementIds: string[], deltaSec: number, laneDelta?: number) => void;
  onResizeElement: (elementId: string, next: { timelineStart?: number; duration?: number }) => void;
  onResizeBeatBoundary: (beatId: string, edge: "start" | "end", boundarySec: number) => void;
  onAddLane: (sourceLaneKey?: string) => void;
  onResizeLane: (laneKey: string, nextHeight: number) => void;
  onPatchElement: (elementId: string, patch: Record<string, unknown>) => void;
  setSnapGuide: Dispatch<SetStateAction<SnapGuide | null>>;
  setCtxMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  sidebarWidth: number;
  laneResizeState: LaneResizeState | null;
  setLaneResizeState: Dispatch<SetStateAction<LaneResizeState | null>>;
  /**
   * Proposal-preview mode: the canvas shows a DRAFT timeline while every
   * mutation callback still targets the live one by element id. Only playhead
   * and ruler scrubbing stay interactive; drags, selection, menus, and lane
   * controls are inert so no pointer interaction can write.
   */
  readOnly?: boolean;
};

function supportsTrimResize(type: string) {
  return type !== "still";
}

function pointerPositionFromEvent(
  event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    rect,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function useCanvasTimelineInteractions({
  canvasRef,
  addLaneBtnRef,
  clipRegionsRef,
  resizeRegionsRef,
  transitionRegionsRef,
  muteRegionsRef,
  soloRegionsRef,
  hideRegionsRef,
  laneResizeRegionsRef,
  laneMenuBtnRegionsRef,
  menuBtnRegionsRef,
  beatMenuBtnRegionsRef,
  beatResizeRegionsRef,
  gainRegionsRef,
  gainKeyframeRegionsRef,
  visualKeyframeRegionsRef,
  envelopePointRegionsRef,
  envelopeSegmentRegionsRef,
  musicalBeatTimes = [],
  musicalBeatReferenceId,
  beatMarkers,
  elements,
  elementById,
  lanes,
  laneLayouts,
  selectedIds,
  selectedBeatId,
  playheadSec,
  pxPerSec,
  scrollSec,
  onTrimScroll,
  totalDuration,
  snapEnabled,
  isOverPlayhead,
  seekFromClientX,
  onSeek,
  onSelect,
  onClearSelection,
  onSetSelection,
  onSelectTransition,
  onCreateTransition,
  onSelectBeat,
  onToggleMute,
  onSoloLane,
  onToggleLaneHidden,
  onMoveElement,
  onMoveElements,
  onResizeElement,
  onResizeBeatBoundary,
  onAddLane,
  onResizeLane,
  onPatchElement,
  setSnapGuide,
  setCtxMenu,
  sidebarWidth: SIDEBAR_WIDTH,
  laneResizeState,
  setLaneResizeState,
  readOnly = false,
}: UseCanvasTimelineInteractionsArgs) {
  const [scrubbing, setScrubbing] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const resizeStateRef = useRef(resizeState);
  resizeStateRef.current = resizeState;
  const trimScrollRef = useRef(scrollSec);
  trimScrollRef.current = scrollSec;
  const trimStartXRef = useRef<number | null>(null);
  const trimActivatedRef = useRef(false);
  const trimPointerRef = useRef<{ clientX: number; altKey: boolean } | null>(null);
  const [beatResizeState, setBeatResizeState] = useState<BeatResizeState | null>(null);
  const [envelopePointDragState, setEnvelopePointDragState] = useState<EnvelopePointDragState | null>(null);
  const [envelopeSegmentDragState, setEnvelopeSegmentDragState] = useState<EnvelopeSegmentDragState | null>(null);
  const [selectedEnvelopePoint, setSelectedEnvelopePoint] = useState<SelectedEnvelopePoint | null>(null);
  const [hoverCursor, setHoverCursor] = useState<HoverCursor>("default");
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [hoveredTransitionId, setHoveredTransitionId] = useState<string | null>(null);
  const [marqueeState, setMarqueeState] = useState<MarqueeState | null>(null);
  const resizeStickySnapRef = useRef<{
    elementId: string;
    edge: "start" | "end";
    targetSec: number;
  } | null>(null);
  const selectedIdsRef = useRef(selectedIds);

  const snapEnabledRef = useRef(snapEnabled);
  const lastDragSnapDebugRef = useRef<string | null>(null);
  const musicalBeatsRef = useRef({ times: musicalBeatTimes, referenceId: musicalBeatReferenceId });
  musicalBeatsRef.current = { times: musicalBeatTimes, referenceId: musicalBeatReferenceId };
  const beatMarkersRef = useRef(beatMarkers);
  const elementsRef = useRef(elements);
  const elementByIdRef = useRef(elementById);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
  }, [snapEnabled]);

  useEffect(() => {
    beatMarkersRef.current = beatMarkers;
  }, [beatMarkers]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    elementByIdRef.current = elementById;
  }, [elementById]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    if (!marqueeState) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setMarqueeState((prev) =>
        prev
          ? {
              ...prev,
              currentX: event.clientX - rect.left,
              currentY: event.clientY - rect.top,
            }
          : prev,
      );
    };
    const onUp = () => {
      const prev = marqueeState;
      setMarqueeState(null);
      if (!prev) return;
      const left = Math.min(prev.startX, prev.currentX);
      const right = Math.max(prev.startX, prev.currentX);
      const top = Math.min(prev.startY, prev.currentY);
      const bottom = Math.max(prev.startY, prev.currentY);
      const intersectedIds = clipRegionsRef.current
        .filter((region) =>
          region.x < right
          && region.x + region.width > left
          && region.y < bottom
          && region.y + region.height > top,
        )
        .map((region) => region.elementId);
      const nextSelection = prev.additive
        ? [...new Set([...selectedIdsRef.current, ...intersectedIds])]
        : [...new Set(intersectedIds)];
      onSetSelection(nextSelection);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvasRef, clipRegionsRef, marqueeState, onSetSelection]);

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (event: PointerEvent) => seekFromClientX(event.clientX);
    const onUp = () => setScrubbing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, seekFromClientX]);

  useEffect(() => {
    if (!dragState) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let timelineStart = clamp(
        scrollSec + (x - SIDEBAR_WIDTH) / pxPerSec - dragState.pointerOffsetSec,
        0,
        totalDuration,
      );

      let newSnapGuide: SnapGuide | null = null;
      if (snapEnabledRef.current && !event.altKey) {
        const unsnappedStart = timelineStart;
        const draggedElement = elementByIdRef.current.get(dragState.elementId);
        const primarySnap = computeSnap(
          timelineStart,
          dragState.originalDuration,
          dragState.elementId,
          beatMarkersRef.current,
          elementsRef.current,
          pxPerSec,
          {
            musicalBeatTimes: (dragState.elementId === musicalBeatsRef.current.referenceId || selectedIdsRef.current.includes(musicalBeatsRef.current.referenceId ?? "")) ? [] : musicalBeatsRef.current.times,
            includeOverflowTargets: draggedElement?.type === "caption_text",
            playheadSec,
          },
        );
        timelineStart = primarySnap.position;
        if (primarySnap.snapLine != null) {
          newSnapGuide = { sec: primarySnap.snapLine, kind: "primary" };
        } else {
          const secondaryTargets = collectSecondarySnapTargets(
            dragState.elementId,
            elementsRef.current,
          );
          const secondarySnap = computeSecondarySnap(
            timelineStart,
            dragState.originalDuration,
            pxPerSec,
            secondaryTargets,
          );
          timelineStart = secondarySnap.position;
          if (secondarySnap.snapLine != null) {
            newSnapGuide = { sec: secondarySnap.snapLine, kind: "secondary" };
          }
          if (newSnapGuide == null) {
            const rulerSnap = computeRulerSnap(timelineStart, dragState.originalDuration, pxPerSec);
            timelineStart = rulerSnap.position;
            if (rulerSnap.snapLine != null) {
              newSnapGuide = { sec: rulerSnap.snapLine, kind: "ruler" };
            }
          }
        }
        const nextSignature = newSnapGuide == null
          ? null
          : `${dragState.elementId}:${newSnapGuide.kind}:${newSnapGuide.sec}:${timelineStart}`;
        if (nextSignature !== lastDragSnapDebugRef.current) {
          if (newSnapGuide != null) {
            logTimelineShelf("Timeline drag snap", {
              elementId: dragState.elementId,
              unsnappedStart,
              snappedStart: timelineStart,
              snapLine: newSnapGuide.sec,
              snapKind: newSnapGuide.kind,
              duration: dragState.originalDuration,
            });
          } else if (lastDragSnapDebugRef.current != null) {
            logTimelineShelf("Timeline drag snap cleared", {
              elementId: dragState.elementId,
              unsnappedStart,
            });
          }
          lastDragSnapDebugRef.current = nextSignature;
        }
      }
      setSnapGuide(newSnapGuide);

      const candidateLane = laneLayouts.find((layout) => y >= layout.top && y <= layout.bottom)?.lane;
      const orderedVisualLaneKeys = lanes.filter((lane) => lane.type === "visual").map((lane) => lane.key);
      setDragState((prev) => {
        if (!prev) return prev;
        if (prev.draggedElementIds.length > 1) {
          const previewLaneById = { ...prev.previewLaneById };
          const visualDraggedIds = prev.draggedElementIds.filter((elementId) =>
            isVisualLane(prev.originalLaneById[elementId] ?? ""),
          );
          const allDraggedVisual = visualDraggedIds.length === prev.draggedElementIds.length;
          if (candidateLane && allDraggedVisual && isVisualLane(candidateLane.key)) {
            const draggedOriginalIndex = orderedVisualLaneKeys.indexOf(prev.originalLaneKey);
            const candidateIndex = orderedVisualLaneKeys.indexOf(candidateLane.key);
            if (draggedOriginalIndex >= 0 && candidateIndex >= 0) {
              const desiredDelta = candidateIndex - draggedOriginalIndex;
              const originalIndices = visualDraggedIds
                .map((elementId) => orderedVisualLaneKeys.indexOf(prev.originalLaneById[elementId]))
                .filter((index) => index >= 0);
              const minAllowedDelta = originalIndices.length > 0 ? Math.max(...originalIndices.map((index) => -index)) : 0;
              const maxAllowedDelta = originalIndices.length > 0
                ? Math.min(...originalIndices.map((index) => orderedVisualLaneKeys.length - 1 - index))
                : 0;
              const clampedDelta = clamp(desiredDelta, minAllowedDelta, maxAllowedDelta);
              for (const elementId of visualDraggedIds) {
                const originalIndex = orderedVisualLaneKeys.indexOf(prev.originalLaneById[elementId]);
                if (originalIndex < 0) continue;
                const nextKey = orderedVisualLaneKeys[originalIndex + clampedDelta];
                if (nextKey) previewLaneById[elementId] = nextKey;
              }
            }
          }
          return {
            ...prev,
            previewStartSec: timelineStart,
            previewLaneById,
          };
        }
        const canMoveAcrossLaneFamily =
          (isVisualLane(prev.originalLaneKey) && candidateLane && isVisualLane(candidateLane.key))
          || (isMusicLane(prev.originalLaneKey) && candidateLane && isMusicLane(candidateLane.key))
          || (isCaptionsLane(prev.originalLaneKey) && candidateLane && isCaptionsLane(candidateLane.key));
        const previewLaneKey =
          canMoveAcrossLaneFamily
            ? candidateLane.key
            : prev.previewLaneKey;
        return { ...prev, previewStartSec: timelineStart, previewLaneKey };
      });
    };
    const onUp = () => {
      setSnapGuide(null);
      lastDragSnapDebugRef.current = null;
      const prev = dragState;
      setDragState(null);
      if (!prev) return;
      logTimelineShelf("Timeline drag drop", {
        elementId: prev.elementId,
        originalStart: prev.originalStartSec,
        previewStart: prev.previewStartSec,
        originalLaneKey: prev.originalLaneKey,
        previewLaneKey: prev.previewLaneKey,
        duration: prev.originalDuration,
      });
      const startChanged = Math.abs(prev.previewStartSec - prev.originalStartSec) >= 0.001;
      const laneChanged = prev.previewLaneKey !== prev.originalLaneKey;
      if (prev.draggedElementIds.length > 1) {
        const draggedLaneKey = prev.previewLaneById[prev.elementId] ?? prev.originalLaneKey;
        const orderedVisualLaneKeys = lanes.filter((lane) => lane.type === "visual").map((lane) => lane.key);
        const laneDelta = isVisualLane(prev.originalLaneKey) && isVisualLane(draggedLaneKey)
          ? orderedVisualLaneKeys.indexOf(draggedLaneKey) - orderedVisualLaneKeys.indexOf(prev.originalLaneKey)
          : 0;
        if (startChanged || laneDelta !== 0) {
          onMoveElements(prev.draggedElementIds, prev.previewStartSec - prev.originalStartSec, laneDelta);
        }
        return;
      }
      if (startChanged || laneChanged) {
        onMoveElement(prev.elementId, {
          timelineStart: prev.previewStartSec,
          ...(laneChanged ? { laneKey: prev.previewLaneKey } : {}),
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvasRef, dragState, laneLayouts, lanes, onMoveElement, onMoveElements, pxPerSec, scrollSec, setSnapGuide, totalDuration]);

  useEffect(() => {
    if (!resizeState) return;
    const updateFromPointer = (clientX: number, altKey: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clamp(clientX - rect.left, SIDEBAR_WIDTH, rect.width);
      let seconds = clamp(trimScrollRef.current + (x - SIDEBAR_WIDTH) / pxPerSec, 0, totalDuration);
      const activeElement = elementsRef.current.find((entry) => entry.id === resizeState.elementId) ?? null;

      let newSnapGuide: SnapGuide | null = null;
      if (snapEnabledRef.current && !altKey) {
        const entryThreshold = getSnapThresholdPx("secondary") / pxPerSec;
        const releaseThreshold = (getSnapReleasePx("secondary") ?? 10) / pxPerSec;
        const activeVideoTransitionTarget = activeElement && supportsOverflowHold(activeElement.type)
          ? (() => {
            const { leadingHoldDuration, visiblePlayableDuration, trailingHoldDuration } = getVideoHoldSegments(activeElement);
            if (resizeState.edge === "start") {
              return leadingHoldDuration > 0.001
                ? Number((activeElement.timeline_start + leadingHoldDuration).toFixed(3))
                : null;
            }
            return trailingHoldDuration > 0.001
              ? Number((activeElement.timeline_start + leadingHoldDuration + visiblePlayableDuration).toFixed(3))
              : null;
          })()
          : null;
        const stickySnap = resizeStickySnapRef.current;
        if (
          activeVideoTransitionTarget != null
          && stickySnap?.elementId === resizeState.elementId
          && stickySnap.edge === resizeState.edge
          && Math.abs(stickySnap.targetSec - activeVideoTransitionTarget) < 0.001
        ) {
          if (Math.abs(seconds - activeVideoTransitionTarget) <= releaseThreshold) {
            seconds = activeVideoTransitionTarget;
            newSnapGuide = { sec: activeVideoTransitionTarget, kind: "secondary" };
          } else {
            resizeStickySnapRef.current = null;
          }
        }
        if (newSnapGuide === null && activeVideoTransitionTarget != null && Math.abs(seconds - activeVideoTransitionTarget) <= entryThreshold) {
          resizeStickySnapRef.current = {
            elementId: resizeState.elementId,
            edge: resizeState.edge,
            targetSec: activeVideoTransitionTarget,
          };
          seconds = activeVideoTransitionTarget;
          newSnapGuide = { sec: activeVideoTransitionTarget, kind: "secondary" };
        }
      }
      if (snapEnabledRef.current && !altKey && newSnapGuide === null) {
        const targets = collectSnapTargets(
          resizeState.elementId,
          beatMarkersRef.current,
          elementsRef.current,
          { playheadSec, musicalBeatTimes: resizeState.elementId === musicalBeatsRef.current.referenceId ? [] : musicalBeatsRef.current.times },
        );
        const primarySnap = snapBoundaryToTargets(seconds, pxPerSec, targets);
        seconds = primarySnap.boundarySec;
        if (primarySnap.snapLine != null) {
          newSnapGuide = { sec: primarySnap.snapLine, kind: "primary" };
        } else {
          const secondaryTargets = collectSecondarySnapTargets(
            resizeState.elementId,
            elementsRef.current,
          );
          const secondarySnap = snapBoundaryToSecondaryTargets(seconds, pxPerSec, secondaryTargets);
          seconds = secondarySnap.boundarySec;
          if (secondarySnap.snapLine != null) {
            newSnapGuide = { sec: secondarySnap.snapLine, kind: "secondary" };
          } else {
            const rulerSnap = snapBoundaryToRuler(seconds, pxPerSec);
            seconds = rulerSnap.boundarySec;
            if (rulerSnap.snapLine != null) {
              newSnapGuide = { sec: rulerSnap.snapLine, kind: "ruler" };
            }
          }
        }
      }
      setSnapGuide(newSnapGuide);

      setResizeState((prev) => {
        if (!prev) return prev;
        const element = elementsRef.current.find((entry) => entry.id === prev.elementId);
        if (!element) return prev;
        const playbackRate = element.playback_rate ?? 1;

        if (prev.edge === "start") {
          const resizeInput = buildLeftEdgeResizeInput(element, seconds);
          const preview = resolveTimingEditPreview(
            element,
            resizeInput,
            elementsRef.current,
          );
          return {
            ...prev,
            previewStartSec: preview.previewStartSec,
            previewDurationSec: preview.previewDurationSec,
            previewLaneKey: preview.previewLaneKey,
            previewPlaybackRate: preview.previewPlaybackRate,
            previewProps: preview.previewProps,
          };
        }

        const nextDuration = Math.max(minTimelineDurationSeconds(), seconds - prev.originalStartSec);
        const preview = resolveTimingEditPreview(
          element,
          { duration: nextDuration },
          elementsRef.current,
        );
        return {
          ...prev,
          previewDurationSec: preview.previewDurationSec,
          previewLaneKey: preview.previewLaneKey,
          previewPlaybackRate: preview.previewPlaybackRate,
          previewProps: preview.previewProps,
        };
      });
    };
    const onMove = (event: PointerEvent) => {
      trimActivatedRef.current = trimGestureActivated(trimStartXRef.current, event.clientX, trimActivatedRef.current);
      if (!trimActivatedRef.current) return;
      trimPointerRef.current = { clientX: event.clientX, altKey: event.altKey };
      updateFromPointer(event.clientX, event.altKey);
    };
    let frame: number;
    let finished = false;
    let previousTime = performance.now();
    const scrollAtEdge = (now: number) => {
      const canvas = canvasRef.current;
      const pointer = trimPointerRef.current;
      if (canvas && pointer && trimActivatedRef.current) {
        const rect = canvas.getBoundingClientRect();
        const maxScroll = Math.max(0, totalDuration - (rect.width - SIDEBAR_WIDTH) / pxPerSec);
        const velocity = trimEdgeScrollVelocity(pointer.clientX, rect.left + SIDEBAR_WIDTH, rect.right);
        const next = trimEdgeScrollPosition(trimScrollRef.current, velocity, now - previousTime, pxPerSec, maxScroll);
        if (next !== trimScrollRef.current) {
          trimScrollRef.current = next;
          onTrimScroll(next);
          // A stationary pointer still trims as the viewport moves underneath it.
          updateFromPointer(pointer.clientX, pointer.altKey);
        }
      }
      previousTime = now;
      frame = requestAnimationFrame(scrollAtEdge);
    };
    frame = requestAnimationFrame(scrollAtEdge);
    const cancel = () => {
      finished = true;
      cancelAnimationFrame(frame);
      trimPointerRef.current = null;
      resizeStickySnapRef.current = null;
      setSnapGuide(null);
      setResizeState(null);
    };
    const onUp = () => {
      if (finished) return;
      const prev = resizeStateRef.current;
      const activated = trimActivatedRef.current;
      cancel();
      if (!prev || !activated) return;
      const nextStart = Number(prev.previewStartSec.toFixed(3));
      const nextDuration = Number(prev.previewDurationSec.toFixed(3));
      const startChanged = Math.abs(nextStart - prev.originalStartSec) >= 0.001;
      const durationChanged = Math.abs(nextDuration - prev.originalDurationSec) >= 0.001;
      if (startChanged || durationChanged) {
        onResizeElement(prev.elementId, {
          ...(startChanged ? { timelineStart: nextStart } : {}),
          ...(durationChanged ? { duration: nextDuration } : {}),
        });
      }
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canvasRef, onResizeElement, onTrimScroll, pxPerSec, resizeState?.elementId, resizeState?.edge, setSnapGuide, totalDuration]);

  useEffect(() => {
    if (!beatResizeState) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const seconds = scrollSec + (x - SIDEBAR_WIDTH) / pxPerSec;
      setBeatResizeState((prev) => {
        if (!prev) return prev;
        const clampedBoundary = Number.isFinite(prev.maxBoundarySec)
          ? clamp(seconds, prev.minBoundarySec, prev.maxBoundarySec)
          : Math.max(prev.minBoundarySec, seconds);
        return {
          ...prev,
          previewBoundarySec: Number(clampedBoundary.toFixed(3)),
        };
      });
    };
    const onUp = () => {
      const prev = beatResizeState;
      setBeatResizeState(null);
      if (!prev) return;
      if (Math.abs(prev.previewBoundarySec - prev.originalBoundarySec) < 0.001) return;
      onResizeBeatBoundary(prev.beatId, prev.edge, prev.previewBoundarySec);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [beatResizeState, canvasRef, onResizeBeatBoundary, pxPerSec, scrollSec]);

  useEffect(() => {
    if (!laneResizeState) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const layout = laneLayouts.find((entry) => entry.lane.key === laneResizeState.laneKey);
      if (!layout) return;
      const nextHeight = y - layout.top;
      setLaneResizeState((prev) => (prev ? { ...prev, previewHeight: nextHeight } : prev));
    };
    const onUp = () => {
      const previewHeight = laneResizeState.previewHeight;
      const laneKey = laneResizeState.laneKey;
      setLaneResizeState(null);
      onResizeLane(laneKey, previewHeight);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvasRef, laneLayouts, laneResizeState, onResizeLane, setLaneResizeState]);

  // ── Envelope point drag ───────────────────────────────────────────────────
  useEffect(() => {
    if (!envelopePointDragState) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const { lineTop, lineBottom, lineStartX, lineEndX } = getGainLineGeometry({
        clipX: envelopePointDragState.clipX,
        clipY: envelopePointDragState.clipY,
        clipWidth: envelopePointDragState.clipWidth,
        clipHeight: envelopePointDragState.clipHeight,
      });
      const nextTime = clamp(
        ((x - lineStartX) / Math.max(1, lineEndX - lineStartX)) * envelopePointDragState.effectiveDuration,
        0,
        envelopePointDragState.effectiveDuration,
      );
      const nextVolume = clamp(
        ((lineBottom - y) / Math.max(1, lineBottom - lineTop)) * MAX_VOLUME,
        0,
        MAX_VOLUME,
      );
      setEnvelopePointDragState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          previewEnvelope: moveEnvelopePoint(prev.previewEnvelope, prev.pointIndex, nextTime, nextVolume),
        };
      });
    };
    const onUp = () => {
      const prev = envelopePointDragState;
      setEnvelopePointDragState(null);
      if (!prev) return;
      setSelectedEnvelopePoint({ elementId: prev.elementId, pointIndex: prev.pointIndex });
      const element = elementById.get(prev.elementId);
      if (!element) return;
      const patch = writeVolumeEnvelopePatch(element, prev.previewEnvelope, prev.effectiveDuration);
      onPatchElement(prev.elementId, patch);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvasRef, elementById, envelopePointDragState, onPatchElement]);

  // ── Envelope segment drag ─────────────────────────────────────────────────
  useEffect(() => {
    if (!envelopeSegmentDragState) return;
    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const { lineTop, lineBottom } = getGainLineGeometry({
        clipX: 0,
        clipY: envelopeSegmentDragState.clipY,
        clipWidth: 100,
        clipHeight: envelopeSegmentDragState.clipHeight,
      });
      // Convert y delta to volume delta
      const volumeRange = MAX_VOLUME;
      const pixelRange = Math.max(1, lineBottom - lineTop);
      const leftPt = envelopeSegmentDragState.originalEnvelope[envelopeSegmentDragState.leftIndex];
      const rightPt = envelopeSegmentDragState.originalEnvelope[envelopeSegmentDragState.rightIndex];
      if (!leftPt || !rightPt) return;
      const deltaVolume = ((envelopeSegmentDragState.startPointerY - y) / pixelRange) * volumeRange;
      const moved = moveEnvelopeSegment(
        envelopeSegmentDragState.originalEnvelope,
        envelopeSegmentDragState.leftIndex,
        envelopeSegmentDragState.rightIndex,
        deltaVolume,
      );
      setEnvelopeSegmentDragState((prev) => (prev ? { ...prev, previewEnvelope: moved } : prev));
    };
    const onUp = () => {
      const prev = envelopeSegmentDragState;
      setEnvelopeSegmentDragState(null);
      if (!prev) return;
      const element = elementById.get(prev.elementId);
      if (!element) return;
      const patch = writeVolumeEnvelopePatch(element, prev.previewEnvelope, element.duration);
      onPatchElement(prev.elementId, patch);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvasRef, elementById, envelopeSegmentDragState, onPatchElement]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const { rect, x, y } = pointerPositionFromEvent(event);
      const target = resolvePointerDownTarget({
        x,
        y,
        isOverPlayhead: isOverPlayhead(x, y),
        addLaneButtonRect: addLaneBtnRef.current,
        clipRegions: clipRegionsRef.current,
        resizeRegions: resizeRegionsRef.current,
        transitionRegions: transitionRegionsRef.current,
        muteRegions: muteRegionsRef.current,
        soloRegions: soloRegionsRef.current,
        hideRegions: hideRegionsRef?.current ?? [],
        laneResizeRegions: laneResizeRegionsRef.current,
        laneMenuBtnRegions: laneMenuBtnRegionsRef.current,
        menuBtnRegions: menuBtnRegionsRef.current,
        beatMenuBtnRegions: beatMenuBtnRegionsRef.current,
        beatResizeRegions: beatResizeRegionsRef.current,
        gainRegions: gainRegionsRef.current,
        gainKeyframeRegions: gainKeyframeRegionsRef.current,
        visualKeyframeRegions: visualKeyframeRegionsRef.current,
        envelopePointRegions: envelopePointRegionsRef.current,
        envelopeSegmentRegions: envelopeSegmentRegionsRef.current,
        sidebarWidth: SIDEBAR_WIDTH,
      });

      if (target.kind === "playhead_scrub" || target.kind === "ruler_scrub") {
        setScrubbing(true);
        if (target.kind === "ruler_scrub" && selectedBeatId !== null) onSelectBeat(null);
        seekFromClientX(event.clientX);
        return;
      }

      // Draft preview: transport stays live, everything else is inert.
      if (readOnly) return;

      if (target.kind === "add_lane") {
        onAddLane();
        return;
      }

      if (target.kind === "visual_keyframe") {
        if (selectedBeatId !== null) onSelectBeat(null);
        onSelectTransition(null);
        onSelect(target.elementId);
        onSeek(target.timeSec);
        return;
      }

      if (target.kind === "mute_lane") {
        if (selectedBeatId !== null) onSelectBeat(null);
        onSelectTransition(null);
        onToggleMute(target.laneKey);
        return;
      }

      if (target.kind === "solo_lane") {
        if (selectedBeatId !== null) onSelectBeat(null);
        onSelectTransition(null);
        onSoloLane(target.laneKey);
        return;
      }

      if (target.kind === "hide_lane") {
        if (selectedBeatId !== null) onSelectBeat(null);
        onSelectTransition(null);
        onToggleLaneHidden?.(target.laneKey);
        return;
      }

      if (target.kind === "transition_chip") {
        onClearSelection();
        if (selectedBeatId !== null) onSelectBeat(null);
        onSelectTransition(target.transitionId);
        return;
      }

      if (target.kind === "transition_create") {
        onClearSelection();
        if (selectedBeatId !== null) onSelectBeat(null);
        void onCreateTransition(target.fromElementId, target.toElementId);
        return;
      }

      if (target.kind === "beat_menu") {
        setCtxMenu({
          x: rect.left + x,
          y: rect.top + y,
          target: "beat",
          beatId: target.beatId,
        });
        return;
      }

      if (target.kind === "beat_resize") {
        const beatIndex = beatMarkers.findIndex((beat) => beat.id === target.beatId);
        const beat = beatIndex >= 0 ? beatMarkers[beatIndex] : null;
        if (!beat) return;
        const previousBeat = beatMarkers[beatIndex - 1] ?? null;
        const nextBeat = beatMarkers[beatIndex + 1] ?? null;
        const minBoundarySec = target.edge === "start"
          ? (previousBeat?.startSec ?? 0) + 0.5
          : beat.startSec + 0.5;
        const maxBoundarySec = target.edge === "start"
          ? beat.endSec - 0.5
          : nextBeat
            ? nextBeat.endSec - 0.5
            : Number.POSITIVE_INFINITY;
        setBeatResizeState({
          beatId: beat.id,
          edge: target.edge,
          originalBoundarySec: target.edge === "start" ? beat.startSec : beat.endSec,
          previewBoundarySec: target.edge === "start" ? beat.startSec : beat.endSec,
          minBoundarySec,
          maxBoundarySec,
        });
        return;
      }

      if (target.kind === "lane_resize") {
        const lane = lanes.find((entry) => entry.key === target.laneKey);
        if (!lane) return;
        if (selectedBeatId !== null) onSelectBeat(null);
        setLaneResizeState({
          laneKey: lane.key,
          previewHeight: lane.height,
        });
        return;
      }

      if (target.kind === "lane_menu") {
        if (selectedBeatId !== null) onSelectBeat(null);
        setCtxMenu({
          laneKey: target.laneKey,
          x: rect.left + x,
          y: rect.top + y,
          target: "lane",
        });
        return;
      }

      if (target.kind === "clip_menu") {
        if (selectedBeatId !== null) onSelectBeat(null);
        setCtxMenu({
          x: rect.left + x,
          y: rect.top + y,
          target: "clip",
          elementId: target.elementId,
        });
        return;
      }

      if (target.kind === "clip_resize") {
        const element = elements.find((entry) => entry.id === target.elementId);
        if (!element || element.position_locked) return;
        if (selectedBeatId !== null) onSelectBeat(null);
        onSelect(target.elementId);
        resizeStickySnapRef.current = null;
        trimStartXRef.current = event.clientX;
        trimActivatedRef.current = false;
        trimPointerRef.current = { clientX: event.clientX, altKey: event.altKey };
        setResizeState({
          elementId: target.elementId,
          edge: target.edge,
          originalStartSec: element.timeline_start,
          originalDurationSec: element.duration,
          previewStartSec: element.timeline_start,
          previewDurationSec: element.duration,
          previewLaneKey: element.lane_key,
          previewPlaybackRate: element.playback_rate,
          previewProps: element.props,
        });
        return;
      }

      // ── New envelope point/segment targets ────────────────────────────────
      if (target.kind === "gain_point") {
        const element = elements.find((entry) => entry.id === target.elementId);
        const clipRegionForGain = clipRegionsRef.current.find((region) => region.elementId === target.elementId);
        if (!element || !clipRegionForGain) return;
        if (selectedBeatId !== null) onSelectBeat(null);
        setSelectedEnvelopePoint({ elementId: target.elementId, pointIndex: target.pointIndex });
        setEnvelopePointDragState({
          elementId: target.elementId,
          pointIndex: target.pointIndex,
          clipX: clipRegionForGain.x,
          clipY: clipRegionForGain.y,
          clipWidth: clipRegionForGain.width,
          clipHeight: clipRegionForGain.height,
          effectiveDuration: element.duration,
          previewEnvelope: readVolumeEnvelopePoints(element, element.duration),
        });
        return;
      }

      if (target.kind === "gain_segment") {
        const element = elements.find((entry) => entry.id === target.elementId);
        const clipRegionForGain = clipRegionsRef.current.find((region) => region.elementId === target.elementId);
        if (!element || !clipRegionForGain) return;
        if (selectedBeatId !== null) onSelectBeat(null);

        // Alt+click on segment: insert a new point
        if (event.altKey) {
          const { lineStartX, lineEndX } = getGainLineGeometry({
            clipX: clipRegionForGain.x,
            clipY: clipRegionForGain.y,
            clipWidth: clipRegionForGain.width,
            clipHeight: clipRegionForGain.height,
          });
          const insertTime = clamp(
            ((x - lineStartX) / Math.max(1, lineEndX - lineStartX)) * element.duration,
            0,
            element.duration,
          );
          const currentEnvelope = readVolumeEnvelopePoints(element, element.duration);
          const nextEnvelope = insertEnvelopePoint(currentEnvelope, insertTime);
          const insertedIndex = nextEnvelope.findIndex(
            (pt) => Math.abs(pt.time_seconds - Number(insertTime.toFixed(3))) < 0.001,
          );
          setSelectedEnvelopePoint({ elementId: target.elementId, pointIndex: Math.max(0, insertedIndex) });
          setEnvelopePointDragState({
            elementId: target.elementId,
            pointIndex: Math.max(0, insertedIndex),
            clipX: clipRegionForGain.x,
            clipY: clipRegionForGain.y,
            clipWidth: clipRegionForGain.width,
            clipHeight: clipRegionForGain.height,
            effectiveDuration: element.duration,
            previewEnvelope: nextEnvelope,
          });
          return;
        }

        // Normal segment drag: move both adjacent points vertically
        setSelectedEnvelopePoint(null);
        const originalEnvelope = readVolumeEnvelopePoints(element, element.duration);
        setEnvelopeSegmentDragState({
          elementId: target.elementId,
          leftIndex: target.leftIndex,
          rightIndex: target.rightIndex,
          clipY: clipRegionForGain.y,
          clipHeight: clipRegionForGain.height,
          startPointerY: y,
          originalEnvelope,
          previewEnvelope: originalEnvelope,
        });
        return;
      }

      if (target.kind === "clip_body") {
        const element = elements.find((entry) => entry.id === target.elementId);
        if (!element) return;
        if (selectedBeatId !== null) onSelectBeat(null);
        const pointerSelection = resolveClipPointerSelection(
          target.elementId,
          selectedIdsRef.current,
          event.shiftKey,
        );
        onSelect(
          target.elementId,
          pointerSelection.selectionMode === "add"
            ? { additive: true, toggle: false }
            : pointerSelection.selectionMode === "toggle_off"
              ? { additive: false, toggle: true }
              : { replace: true },
        );
        if (pointerSelection.beginDragElementIds.length === 0) return;
        if (element.position_locked) return;
        const pointerSec = scrollSec + (x - SIDEBAR_WIDTH) / pxPerSec;
        const pointerOffsetSec = clamp(pointerSec - element.timeline_start, 0, element.duration);
        const draggedElementIds = pointerSelection.beginDragElementIds.filter((elementId) => {
          const entry = elementByIdRef.current.get(elementId);
          return !!entry && !entry.position_locked;
        });
        const originalStartById = Object.fromEntries(
          elements
            .filter((entry) => draggedElementIds.includes(entry.id))
            .map((entry) => [entry.id, entry.timeline_start]),
        );
        const originalLaneById = Object.fromEntries(
          elements
            .filter((entry) => draggedElementIds.includes(entry.id))
            .map((entry) => [entry.id, entry.lane_key]),
        );
        setDragState({
          elementId: target.elementId,
          draggedElementIds,
          originalStartById,
          originalLaneById,
          previewLaneById: { ...originalLaneById },
          pointerOffsetSec,
          originalStartSec: element.timeline_start,
          originalDuration: element.duration,
          originalLaneKey: element.lane_key,
          previewStartSec: element.timeline_start,
          previewLaneKey: element.lane_key,
        });
        return;
      }

      setSelectedEnvelopePoint(null);
      if (selectedBeatId !== null) onSelectBeat(null);
      if (target.kind === "marquee") {
        setMarqueeState({
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          additive: event.shiftKey,
        });
        return;
      }
      onClearSelection();
    },
    [
      addLaneBtnRef,
      beatMarkers,
      beatMenuBtnRegionsRef,
      beatResizeRegionsRef,
      clipRegionsRef,
      envelopePointRegionsRef,
      envelopeSegmentRegionsRef,
      elements,
      gainKeyframeRegionsRef,
      gainRegionsRef,
      visualKeyframeRegionsRef,
      isOverPlayhead,
      laneMenuBtnRegionsRef,
      laneResizeRegionsRef,
      lanes,
      menuBtnRegionsRef,
      muteRegionsRef,
      soloRegionsRef,
      hideRegionsRef,
      onAddLane,
      onClearSelection,
      onCreateTransition,
      onSelect,
      onSelectTransition,
      onSelectBeat,
      onSeek,
      onToggleMute,
      onSoloLane,
      onToggleLaneHidden,
      pxPerSec,
      readOnly,
      resizeRegionsRef,
      transitionRegionsRef,
      scrollSec,
      seekFromClientX,
      selectedBeatId,
      setCtxMenu,
      setLaneResizeState,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (scrubbing || dragState || resizeState || beatResizeState || laneResizeState || marqueeState) {
        if (hoverCursor !== "default") setHoverCursor("default");
        return;
      }
      const { x, y } = pointerPositionFromEvent(event);
      if (readOnly) {
        // Only the transport affordances read as interactive in a draft preview;
        // clip/transition hover highlights would suggest editability.
        if (hoveredClipId !== null) setHoveredClipId(null);
        if (hoveredTransitionId !== null) setHoveredTransitionId(null);
        const previewCursor = isOverPlayhead(x, y) || (y <= RULER_HEIGHT && x >= SIDEBAR_WIDTH)
          ? "col-resize"
          : "default";
        if (previewCursor !== hoverCursor) setHoverCursor(previewCursor);
        return;
      }
      const hoveringMenuButton = !!findSquareRegion(menuBtnRegionsRef.current, x, y);
      const hoveringLaneMenuButton = !!findSquareRegion(laneMenuBtnRegionsRef.current, x, y);
      const hoveringLaneResize = !!findRectRegion(laneResizeRegionsRef.current, x, y);
      const hoveringBeatResize = !!findRectRegion(beatResizeRegionsRef.current, x, y);
      const hoveringBeatMenuButton = !!findSquareRegion(beatMenuBtnRegionsRef.current, x, y);
      const transitionRegion = findTransitionRegion(transitionRegionsRef.current, x, y);
      const hoveringCreateTransition = transitionRegion?.kind === "create";
      const hoveringExistingTransition = transitionRegion?.kind === "existing";
      let nextHoveredTransitionId = transitionHoverId(transitionRegion);
      const hoveringClipResize = !!findRectRegion(resizeRegionsRef.current, x, y);
      const hoveringClip = findRectRegion(clipRegionsRef.current, x, y);
      const hoveringClipElement = hoveringClip
        ? elementByIdRef.current.get(hoveringClip.elementId)
        : null;
      const hoveringEnvelopePoint = envelopePointRegionsRef.current.some((region) => pointInCircle(x, y, region));
      const hoveringVisualKeyframe = visualKeyframeRegionsRef.current.some((region) => pointInCircle(x, y, region));
      const selectingShortClip = !!hoveringClip && hoveringClip.width <= 32
        && y >= hoveringClip.y + hoveringClip.height / 2
        && !hoveringVisualKeyframe && !hoveringEnvelopePoint;
      if (selectingShortClip) nextHoveredTransitionId = null;
      const hoveringEnvelopeSegment = envelopeSegmentRegionsRef.current.length > 0
        && envelopeSegmentRegionsRef.current.some((region) => {
          const dx = region.x2 - region.x1;
          const dy = region.y2 - region.y1;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) return false;
          const t = Math.max(0, Math.min(1, ((x - region.x1) * dx + (y - region.y1) * dy) / lenSq));
          const projX = region.x1 + t * dx;
          const projY = region.y1 + t * dy;
          return Math.sqrt((x - projX) ** 2 + (y - projY) ** 2) <= 8;
        });
      // A transition button owns hover at the join; do not reveal the clip menu underneath.
      const nextHoveredClipId = nextHoveredTransitionId ? null : hoveringClip?.elementId ?? null;
      if (nextHoveredClipId !== hoveredClipId) setHoveredClipId(nextHoveredClipId);
      if (nextHoveredTransitionId !== hoveredTransitionId) setHoveredTransitionId(nextHoveredTransitionId);
      const hoveringPlayhead = isOverPlayhead(x, y) && !hoveringClip;
      const hoveringDivider = Math.abs(x - SIDEBAR_WIDTH) <= 4;
      const hoveringRuler = y <= RULER_HEIGHT && x >= SIDEBAR_WIDTH;
      const addBtn = addLaneBtnRef.current;
      const hoveringAddLane = addBtn != null && x >= addBtn.x && x <= addBtn.x + addBtn.width && y >= addBtn.y && y <= addBtn.y + addBtn.height;
      const nextCursor = selectingShortClip
        ? "grab"
        : hoveringPlayhead
        ? "col-resize"
        : hoveringDivider && !hoveringPlayhead
        ? "col-resize"
        : hoveringCreateTransition
          ? "copy"
        : hoveringExistingTransition
          ? "pointer"
        : hoveringVisualKeyframe
          ? "pointer"
        : hoveringEnvelopePoint || hoveringEnvelopeSegment
          ? "ns-resize"
        : hoveringClipResize
          ? "ew-resize"
        : hoveringBeatResize
          ? "ew-resize"
        : hoveringLaneResize
          ? "ns-resize"
        : hoveringAddLane || hoveringLaneMenuButton || hoveringMenuButton || hoveringBeatMenuButton
          ? "pointer"
        : hoveringClip
          ? hoveringClipElement?.position_locked ? "not-allowed" : "grab"
        : hoveringRuler
          ? "col-resize"
        : "default";
      if (nextCursor !== hoverCursor) setHoverCursor(nextCursor);
    },
    [
      addLaneBtnRef,
      beatMenuBtnRegionsRef,
      beatResizeState,
      beatResizeRegionsRef,
      clipRegionsRef,
      dragState,
      envelopePointRegionsRef,
      envelopeSegmentRegionsRef,
      hoveredClipId,
      hoveredTransitionId,
      hoverCursor,
      isOverPlayhead,
      laneMenuBtnRegionsRef,
      laneResizeRegionsRef,
      laneResizeState,
      menuBtnRegionsRef,
      resizeRegionsRef,
      transitionRegionsRef,
      visualKeyframeRegionsRef,
      readOnly,
      resizeState,
      scrubbing,
      marqueeState,
    ],
  );

  const handlePointerLeave = useCallback(() => {
    if (hoverCursor !== "default") setHoverCursor("default");
    if (hoveredClipId !== null) setHoveredClipId(null);
    if (hoveredTransitionId !== null) setHoveredTransitionId(null);
  }, [hoverCursor, hoveredClipId, hoveredTransitionId]);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      if (readOnly) return;
      const { x, y } = pointerPositionFromEvent(event);

      // Right-clicking a beat in the ruler opens the beat menu (the beat ⋮ button was removed).
      if (y <= RULER_HEIGHT && x >= SIDEBAR_WIDTH) {
        const atSec = scrollSec + (x - SIDEBAR_WIDTH) / pxPerSec;
        const beat = beatMarkersRef.current.find((band) => atSec >= band.startSec && atSec < band.endSec);
        if (beat) {
          setCtxMenu({ x: event.clientX, y: event.clientY, target: "beat", beatId: beat.id });
          return;
        }
      }

      const clipRegion = findRectRegion(clipRegionsRef.current, x, y);
      if (clipRegion) {
        onSelect(clipRegion.elementId);
        setCtxMenu({ x: event.clientX, y: event.clientY, target: "clip", elementId: clipRegion.elementId });
        return;
      }

      if (x < SIDEBAR_WIDTH && y > RULER_HEIGHT) {
        const lane = laneLayouts.find((layout) => y >= layout.top && y <= layout.bottom)?.lane;
        if (lane) {
          setCtxMenu({ x: event.clientX, y: event.clientY, target: "lane", laneKey: lane.key });
          return;
        }
      }

      // Empty space in the lane body area (right of sidebar)
      if (x >= SIDEBAR_WIDTH && y > RULER_HEIGHT) {
        const lane = laneLayouts.find((layout) => y >= layout.top && y <= layout.bottom)?.lane;
        if (lane) {
          const atSec = scrollSec + (x - SIDEBAR_WIDTH) / pxPerSec;
          setCtxMenu({ x: event.clientX, y: event.clientY, target: "lane_body", laneKey: lane.key, atSec });
          return;
        }
      }

      setCtxMenu({ x: event.clientX, y: event.clientY, target: "empty" });
    },
    [clipRegionsRef, laneLayouts, onSelect, pxPerSec, readOnly, scrollSec, setCtxMenu],
  );

  return {
    beatResizeState,
    dragState,
    handleContextMenu,
    handlePointerDown,
    handlePointerLeave,
    handlePointerMove,
    hoverCursor,
    hoveredClipId,
    hoveredTransitionId,
    setTransitionHover: (id: string | null) => { setHoveredClipId(null); setHoveredTransitionId(id); },
    laneResizeState,
    marqueeState,
    resizeState,
    scrubbing,
    envelopePointDragState,
    envelopeSegmentDragState,
    selectedEnvelopePoint,
    setSelectedEnvelopePoint,
  };
}
