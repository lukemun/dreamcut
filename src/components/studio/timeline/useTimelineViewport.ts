"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_LANE_SCALE,
  DEFAULT_ZOOM_LEVEL,
  MAX_LANE_SCALE,
  timelineMaxZoom,
  MIN_VISIBLE_DURATION,
  MIN_ZOOM_LEVEL,
  MIN_LANE_SCALE,
  PREVIEW_ASPECT_RATIO_STORAGE_KEY_PREFIX,
  isPreviewAspectRatio,
} from "./adapters";
import type { PreviewAspectRatio, TimelineAspectRatio } from "./types";
import { getStoredItem } from "@/lib/persisted-key";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const TIMELINE_VIEWPORT_STORAGE_PREFIX = "dreamcut:timeline-viewport:";
export function defaultTimelineZoom(totalDuration: number) {
  return clamp(totalDuration / Math.min(10, Math.max(MIN_VISIBLE_DURATION, totalDuration)), MIN_ZOOM_LEVEL, timelineMaxZoom(totalDuration));
}

export function readTimelineViewport(raw: string | null, totalDuration = 10) {
  const defaults = {zoomLevel: defaultTimelineZoom(totalDuration), laneScale: DEFAULT_LANE_SCALE, scrollSec: 0, laneManualDeltaByKey: {} as Record<string, number>};
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.version !== 1) return defaults;
    const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? clamp(v,min,max) : fallback;
    return {
      zoomLevel: number(value.zoomLevel, defaults.zoomLevel, MIN_ZOOM_LEVEL, timelineMaxZoom(totalDuration)),
      laneScale: number(value.laneScale, defaults.laneScale, MIN_LANE_SCALE, MAX_LANE_SCALE),
      scrollSec: number(value.scrollSec, 0, 0, Number.MAX_SAFE_INTEGER),
      laneManualDeltaByKey: Object.fromEntries(Object.entries(value.laneManualDeltaByKey ?? {}).filter(([,v]) => typeof v === "number" && Number.isFinite(v))) as Record<string,number>,
    };
  } catch { return defaults; }
}

/**
 * The workspace layout that suits a video shape: vertical, portrait and square shapes edit in
 * Tall (full-height viewer beside the editing column), landscape in Wide.
 */
export function workspaceLayoutForShape(shape: TimelineAspectRatio): PreviewAspectRatio {
  return shape === "16:9" ? "16:9" : "9:16";
}

/**
 * A manual Tall/Wide choice, remembered with the video shape it was made for. The layout is
 * a per-project view preference only; it never changes the project's output shape.
 */
export function serializeWorkspaceLayoutChoice(layout: PreviewAspectRatio, shape: TimelineAspectRatio) {
  return JSON.stringify({ version: 2, layout, shape });
}

/**
 * Layout follows the video shape unless the creator flipped it for this same shape.
 * Older stored values carry no shape, so they no longer override the shape's layout.
 */
export function resolveWorkspaceLayout(storedValue: string | null, shape: TimelineAspectRatio): PreviewAspectRatio {
  try {
    const stored = JSON.parse(storedValue ?? "null") as { version?: unknown; layout?: unknown; shape?: unknown } | null;
    if (stored?.version === 2 && stored.shape === shape && isPreviewAspectRatio(typeof stored.layout === "string" ? stored.layout : null)) {
      return stored.layout as PreviewAspectRatio;
    }
  } catch { /* Legacy or damaged values fall back to the shape's layout. */ }
  return workspaceLayoutForShape(shape);
}

export function clampScrollSecWithinBounds(
  scrollSec: number,
  totalDuration: number,
  visibleDuration: number,
) {
  return Math.min(Math.max(0, scrollSec), Math.max(0, totalDuration - visibleDuration));
}

export function resolveAnchoredZoomScroll({
  anchorSec,
  currentScrollSec,
  currentVisibleDuration,
  nextVisibleDuration,
  totalDuration,
}: {
  anchorSec: number;
  currentScrollSec: number;
  currentVisibleDuration: number;
  nextVisibleDuration: number;
  totalDuration: number;
}) {
  const anchorRatio = currentVisibleDuration > 0
    ? clamp((anchorSec - currentScrollSec) / currentVisibleDuration, 0, 1)
    : 0.5;
  return clampScrollSecWithinBounds(
    anchorSec - anchorRatio * nextVisibleDuration,
    totalDuration,
    nextVisibleDuration,
  );
}

type UseTimelineViewportArgs = {
  projectId: string;
  totalDuration: number;
  /** The project's video shape; the workspace layout follows it unless manually flipped. */
  outputAspectRatio: TimelineAspectRatio;
  ready?: boolean;
};

export function useTimelineViewport({
  projectId,
  totalDuration,
  outputAspectRatio,
  ready = true,
}: UseTimelineViewportArgs) {
  const [playheadSec, setPlayheadSec] = useState(0);
  // Workspace layout is a view preference, separate from the project's output canvas. It
  // follows the video shape by default; a manual Tall/Wide flip is remembered per project
  // until the shape changes again.
  const [previewAspectRatio, setLayoutState] = useState<PreviewAspectRatio>("9:16");
  const followedShapeRef = useRef<TimelineAspectRatio | null>(null);
  const [restoredLayoutProject, setRestoredLayoutProject] = useState<string | null>(null);
  const [hasSavedViewport, setHasSavedViewport] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM_LEVEL);
  const [scrollSec, setScrollSec] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [laneScale, setLaneScale] = useState(DEFAULT_LANE_SCALE);
  const [laneManualDeltaByKey, setLaneManualDeltaByKey] = useState<Record<string, number>>({});
  // Measured height of the timeline canvas viewport, reported by CanvasTimeline's
  // ResizeObserver. 0 until the canvas mounts; fit-to-view waits for a real value.
  const [timelineViewportHeight, setTimelineViewportHeight] = useState(0);

  const visibleDuration = useMemo(
    () => Math.max(MIN_VISIBLE_DURATION, totalDuration / zoomLevel),
    [totalDuration, zoomLevel],
  );

  useEffect(() => {
    if (!ready || restoredLayoutProject === projectId) return;
    try {
      followedShapeRef.current = outputAspectRatio;
      const stored = window.localStorage.getItem(
        `${PREVIEW_ASPECT_RATIO_STORAGE_KEY_PREFIX}${projectId}`,
      );
      setLayoutState(resolveWorkspaceLayout(stored, outputAspectRatio));
      const savedViewport = getStoredItem(window.localStorage, `${TIMELINE_VIEWPORT_STORAGE_PREFIX}${projectId}`);
      let saved = false;
      try { saved = JSON.parse(savedViewport ?? "null")?.version === 1; } catch {}
      setHasSavedViewport(saved);
      const viewport = readTimelineViewport(savedViewport, totalDuration);
      setZoomLevel(viewport.zoomLevel);
      setLaneScale(viewport.laneScale);
      setScrollSec(viewport.scrollSec);
      setLaneManualDeltaByKey(viewport.laneManualDeltaByKey);
    } catch {
      // Storage can be disabled; still initialize this project's useful view.
      setLayoutState(workspaceLayoutForShape(outputAspectRatio));
      setHasSavedViewport(false);
      setZoomLevel(defaultTimelineZoom(totalDuration));
      setScrollSec(0);
      setLaneScale(DEFAULT_LANE_SCALE);
      setLaneManualDeltaByKey({});
    }
    setRestoredLayoutProject(projectId);
  }, [projectId, ready, restoredLayoutProject, totalDuration, outputAspectRatio]);

  // A new video shape (from Shape, Export, Undo/Redo or an agent) resets the layout to suit
  // it and forgets the manual flip made for the previous shape.
  useEffect(() => {
    if (restoredLayoutProject !== projectId || !ready) return;
    if (followedShapeRef.current === outputAspectRatio) return;
    followedShapeRef.current = outputAspectRatio;
    setLayoutState(workspaceLayoutForShape(outputAspectRatio));
    try { window.localStorage.removeItem(`${PREVIEW_ASPECT_RATIO_STORAGE_KEY_PREFIX}${projectId}`); }
    catch { /* Storage is optional; the layout still follows the shape. */ }
  }, [outputAspectRatio, projectId, ready, restoredLayoutProject]);

  /** The creator's manual Tall/Wide choice, remembered for this project and shape. */
  const setPreviewAspectRatio = useCallback((layout: PreviewAspectRatio) => {
    setLayoutState(layout);
    // Before this project's view is restored the shape is not known yet; don't record a choice.
    if (restoredLayoutProject !== projectId) return;
    try { window.localStorage.setItem(
      `${PREVIEW_ASPECT_RATIO_STORAGE_KEY_PREFIX}${projectId}`,
      serializeWorkspaceLayoutChoice(layout, outputAspectRatio),
    ); } catch { /* Saving a workspace preference is best effort. */ }
  }, [outputAspectRatio, projectId, restoredLayoutProject]);

  useEffect(() => {
    // Never overwrite another project's saved view with pre-restoration defaults.
    if (restoredLayoutProject !== projectId || !ready) return;
    try { window.localStorage.setItem(`${TIMELINE_VIEWPORT_STORAGE_PREFIX}${projectId}`,
      JSON.stringify({version: 1, zoomLevel, laneScale, scrollSec, laneManualDeltaByKey}));
    } catch { /* Storage is optional; editing remains available. */ }
  }, [projectId, restoredLayoutProject, ready, zoomLevel, laneScale, scrollSec, laneManualDeltaByKey]);

  useEffect(() => {
    if (restoredLayoutProject !== projectId || !ready) return;
    const boundedScrollSec = clampScrollSecWithinBounds(scrollSec, totalDuration, visibleDuration);
    // Zoom already anchors scroll in the input handler. Do not schedule a
    // second React update from this effect unless bounds actually changed.
    if (!Object.is(scrollSec, boundedScrollSec)) setScrollSec(boundedScrollSec);
  }, [scrollSec, totalDuration, visibleDuration, projectId, restoredLayoutProject, ready]);

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(timelineMaxZoom(totalDuration), Number((prev * 1.5).toFixed(3))));
  }, [totalDuration]);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(MIN_ZOOM_LEVEL, Number((prev / 1.5).toFixed(3))));
  }, []);

  const resetZoom = useCallback(() => {
    setZoomLevel(defaultTimelineZoom(totalDuration));
    setScrollSec(0);
    setLaneScale(DEFAULT_LANE_SCALE);
    setLaneManualDeltaByKey({});
  }, [totalDuration]);

  // Initial vertical fit preserves the default time span. Explicit Fit all
  // uses fitTimeToView and does not change lane heights.
  const applyFitLaneScale = useCallback((nextLaneScale: number) => {
    setLaneScale(clamp(nextLaneScale, MIN_LANE_SCALE, MAX_LANE_SCALE));
    setLaneManualDeltaByKey({});
  }, []);

  const fitTimeToView = useCallback(() => {
    setZoomLevel(DEFAULT_ZOOM_LEVEL);
    setScrollSec(0);
  }, []);

  const zoomTo = useCallback((nextZoomLevel: number) => {
    setZoomLevel(clamp(nextZoomLevel, MIN_ZOOM_LEVEL, timelineMaxZoom(totalDuration)));
  }, [totalDuration]);

  const setGlobalLaneScale = useCallback((nextLaneScale: number) => {
    setLaneScale(clamp(nextLaneScale, MIN_LANE_SCALE, MAX_LANE_SCALE));
  }, []);

  return {
    hasSavedViewport,
    viewportRestored: restoredLayoutProject === projectId,
    playheadSec,
    setPlayheadSec,
    previewAspectRatio,
    setPreviewAspectRatio,
    zoomLevel,
    visibleDuration,
    scrollSec,
    setScrollSec,
    zoomIn,
    zoomOut,
    zoomTo,
    resetZoom,
    snapEnabled,
    setSnapEnabled,
    laneScale,
    setLaneScale: setGlobalLaneScale,
    laneManualDeltaByKey,
    setLaneManualDeltaByKey,
    timelineViewportHeight,
    setTimelineViewportHeight,
    applyFitLaneScale,
    fitTimeToView,
  };
}
