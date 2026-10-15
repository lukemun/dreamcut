"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";
import { isTimelineAspectRatioValue } from "@/lib/aspect-ratios";
import { isProjectFrameRate, type ProjectFrameRate } from "@/lib/timeline/frame-quantization";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  minTimelineDurationSeconds,
} from "@/lib/timeline/frame-quantization";
import {
  resolveMediaTiming,
  supportsOverflowHold,
} from "@/lib/timeline/media";
import { AUDIO_PEAK_ELEMENT_TYPES } from "@/lib/timeline/peaks";
import { readVideoClipTimingMetadata } from "@/lib/timeline/video-clip-metadata";

import {
  buildBeatMarkers,
  buildLaneDefs,
  getCompositionDimensions,
  resolveFitLaneScale,
} from "./adapters";
import {
  collectSecondarySnapTargets,
  collectSnapTargets,
  getSnapReleasePx,
  getSnapThresholdPx,
  snapBoundaryToRuler,
  snapBoundaryToSecondaryTargets,
  snapBoundaryToTargets,
} from "./canvas-helpers";
import { computeAndPersistMissingPeaks } from "./computeClientPeaks";
import { buildExternalSnapshotHistoryEntry } from "./external-history";
import { buildPreviewWarmupPlan } from "./preview-warmup-plan";
import { capturePreviewHold } from "./capture-preview-hold";
import { resolveVideoPlaybackSource } from "@/lib/remotion/video-preview-source";
import { clampElementToActualSourceDuration } from "./source-duration";
import {
  resolveTimingEditPreview,
} from "./timeline-actions";
import {
  buildRenderedTimelineElements,
  buildTimelineCompositionElements,
  buildTimelineNormalizedState,
} from "./timeline-selectors";
import { createTimelineClient } from "./timeline-client";
import { useTimelineData } from "./useTimelineData";
import {
  useTimelineHistory,
  type HistoryEntry,
} from "./useTimelineHistory";
import { useTimelineMutations } from "./useTimelineMutations";
import { useTimelineSelection } from "./useTimelineSelection";
import {
  buildTimelineTransitionState,
  selectElementTransitions,
  selectTransitionCreateCandidate,
} from "./useTimelineTransitions";
import { useTimelineViewport } from "./useTimelineViewport";
import type { ResizeState, SnapGuide } from "./timeline-canvas-model";
import type { LaneDef, PreviewAspectRatio, TimelineElement, TimelineTransitionParams } from "./types";

type ToastType = "success" | "error" | "warning";

type UseTimelineEditorArgs = {
  projectId: string;
  addToast: (message: string, type?: ToastType) => void;
  initialHistoryEntries?: HistoryEntry[];
  previewDurationSeconds?: number | null;
  warmMediaInDom?: boolean;
};

export function useTimelineEditor({ projectId, addToast, initialHistoryEntries, previewDurationSeconds, warmMediaInDom = true }: UseTimelineEditorArgs) {
  const timelineClient = useMemo(() => createTimelineClient(projectId), [projectId]);
  const {
    elements,
    setElements,
    transitions,
    setTransitions,
    beats,
    setBeats,
    characters,
    laneDefaults,
    laneOrderKeys,
    setLaneOrderKeys,
    mutedLaneKeys,
    setMutedLaneKeys,
    hiddenLaneKeys,
    setHiddenLaneKeys,
    extraLaneKeys,
    setExtraLaneKeys,
    hasAutoplaced,
    loading,
    autoplacing,
    setAutoplacing,
    aspectRatio,
    setAspectRatio,
    frameRate,
    applyFrameRate,
    requestRefresh,
  } = useTimelineData({ timelineClient, addToast });
  const [mutedLanes, setMutedLanes] = useState<Set<string>>(() => new Set(mutedLaneKeys));
  const [hiddenLanes, setHiddenLanes] = useState<Set<string>>(() => new Set(hiddenLaneKeys));
  const [overflowHoldStartFrameByElementId, setOverflowHoldStartFrameByElementId] = useState<Record<string, string>>({});
  const [overflowHoldEndFrameByElementId, setOverflowHoldEndFrameByElementId] = useState<Record<string, string>>({});
  const [inspectorResizePreviewState, setInspectorResizePreviewState] = useState<ResizeState | null>(null);
  const [inspectorSnapGuide, setInspectorSnapGuide] = useState<SnapGuide | null>(null);
  // Read only inside drag callbacks; a ref avoids a second full editor render on every zoom.
  const timelinePxPerSecRef = useRef(0);
  const setTimelinePxPerSec = useCallback((pxPerSec: number) => { timelinePxPerSecRef.current = pxPerSec; }, []);
  const [outputFormatSaving, setOutputFormatSaving] = useState(false);
  const [outputFormatError, setOutputFormatError] = useState<string | null>(null);
  const playheadSecRef = useRef(0);
  const snapEnabledRef = useRef(false);
  const inspectorStickySnapRef = useRef<{
    elementId: string;
    targetSec: number;
    kind: SnapGuide["kind"];
  } | null>(null);
  const elementsRef = useRef<TimelineElement[]>([]);
  elementsRef.current = elements;
  const clipboardRef = useRef<TimelineElement | null>(null);
  const preloadedMediaUrlsRef = useRef<Set<string>>(new Set());
  const preloadedMediaNodesRef = useRef<Array<{
    preloadKey: string;
    node: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  }>>([]);
  // One peaks compute/persist attempt per source per editor session — a source
  // that fails to decode or persist must not be retried on every elements change.
  const attemptedPeakSourcesRef = useRef<Set<string>>(new Set());
  const peakProjectRef = useRef(projectId);
  if (peakProjectRef.current !== projectId) {
    peakProjectRef.current = projectId;
    attemptedPeakSourcesRef.current = new Set();
  }
  const [, setClipboardTick] = useState(0);
  const {
    undoStackRef,
    redoStackRef,
    historyActionInFlightRef,
    historyBusy,
    setHistoryBusy,
    recordHistoryEntry,
    moveHistoryEntry,
    canUndo,
    canRedo,
  } = useTimelineHistory({
    storageKey: `timeline-history:${projectId}`,
    initialEntries: initialHistoryEntries,
  });
  const missingPeakSourcesKey = useMemo(
    () =>
      elements
        .filter(
          (el) =>
            // AUDIO_PEAK_ELEMENT_TYPES, not WAVEFORM_SUPPORTED_TYPES: video_clip
            // waveforms render when peaks exist, but the client extractor cannot
            // compute them — counting them "missing" re-fires the effect forever.
            AUDIO_PEAK_ELEMENT_TYPES.has(el.type)
            && typeof el.source_url === "string"
            && el.source_url.length > 0
            && !el._peaks,
        )
        .map((el) => el.source_url as string)
        .sort()
        .join("|"),
    [elements],
  );
  const missingVideoDurationSourcesKey = useMemo(
    () =>
      elements
        .filter((el) => {
          if (el.type !== "video_clip") return false;
          if (typeof el.source_url !== "string" || el.source_url.length === 0) return false;
          if (typeof el._source_duration === "number" && Number.isFinite(el._source_duration) && el._source_duration > 0) {
            return false;
          }
          return readVideoClipTimingMetadata(el.props).sourceDurationSeconds == null;
        })
        .map((el) => el.source_url as string)
        .sort()
        .join("|"),
    [elements],
  );
  const beatMarkers = useMemo(() => buildBeatMarkers(beats), [beats]);
  const timelineState = useMemo(
    () => buildTimelineNormalizedState(elements, beats),
    [beats, elements],
  );

  useEffect(() => {
    setMutedLanes(new Set(mutedLaneKeys));
  }, [mutedLaneKeys]);

  useEffect(() => {
    setHiddenLanes(new Set(hiddenLaneKeys));
  }, [hiddenLaneKeys]);

  const persistHiddenLanes = useCallback(async (nextHiddenLanes: Set<string>) => {
    const { response, body } = await timelineClient.saveHiddenLaneKeys([...nextHiddenLanes]);
    if (!response.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "Failed to save hidden lanes");
    }
    setHiddenLaneKeys(
      Array.isArray(body.hidden_lane_keys)
        ? [...new Set(body.hidden_lane_keys.filter((value): value is string => typeof value === "string"))]
        : [],
    );
    const historyEntry = body.history
      ? buildExternalSnapshotHistoryEntry(body.history.before, body.history.after)
      : null;
    if (historyEntry) recordHistoryEntry(historyEntry);
  }, [recordHistoryEntry, setHiddenLaneKeys, timelineClient]);

  const persistMutedLanes = useCallback(async (nextMutedLanes: Set<string>) => {
    const { response, body } = await timelineClient.saveMutedLaneKeys([...nextMutedLanes]);
    if (!response.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "Failed to save muted lanes");
    }
    setMutedLaneKeys(
      Array.isArray(body.muted_lane_keys)
        ? [...new Set(body.muted_lane_keys.filter((value): value is string => typeof value === "string"))]
        : [],
    );
    const historyEntry = body.history
      ? buildExternalSnapshotHistoryEntry(body.history.before, body.history.after)
      : null;
    if (historyEntry) recordHistoryEntry(historyEntry);
  }, [recordHistoryEntry, setMutedLaneKeys, timelineClient]);

  useEffect(() => {
    const validIds = new Set(elements.map((element) => element.id));
    setInspectorResizePreviewState((prev) => {
      if (prev && !validIds.has(prev.elementId)) {
        setInspectorSnapGuide(null);
        return null;
      }
      return prev;
    });
  }, [elements]);

  const elementsWithOverflowFrames = useMemo(
    () => buildRenderedTimelineElements(elements, overflowHoldStartFrameByElementId, overflowHoldEndFrameByElementId),
    [elements, overflowHoldEndFrameByElementId, overflowHoldStartFrameByElementId],
  );

  const [transitionPreview, setTransitionPreview] = useState<{id: string; params: TimelineTransitionParams} | null>(null);
  const previewTransition = useCallback((id: string, params: TimelineTransitionParams | null) => {
    setTransitionPreview(params ? {id, params} : null);
  }, []);
  const transitionState = useMemo(
    () => buildTimelineTransitionState(elementsWithOverflowFrames, transitionPreview ? transitions.map(item => item.id === transitionPreview.id ? {...item, params: transitionPreview.params} : item) : transitions),
    [elementsWithOverflowFrames, transitions, transitionPreview],
  );

  const renderedElements = transitionState.renderedElements;
  const transitionChips = transitionState.transitionChips;

  const {
    selectedIds,
    setSelectedIds,
    selectedId,
    setSelectedId,
    selectedBeatId,
    setSelectedBeatId,
    selectedTransitionId,
    setSelectedTransitionId,
    selectedTransition,
    selectTransition,
    selectedElement,
    selectedBeatLabel,
  } = useTimelineSelection({
    elements,
    transitions,
    timelineState,
    activeTransitionIds: transitionState.activeTransitionIds,
  });

  useEffect(() => setTransitionPreview(null), [transitions, selectedTransitionId]);

  const {
    selectedElementOutgoingTransition,
    selectedElementIncomingTransition,
  } = useMemo(
    () => selectElementTransitions(selectedElement, transitions, transitionState.activeTransitionIds),
    [selectedElement, transitionState.activeTransitionIds, transitions],
  );

  const selectedElementOutgoingCandidate = useMemo(
    () =>
      selectTransitionCreateCandidate(
        selectedElement,
        selectedElementOutgoingTransition,
        elements,
        beatMarkers,
      ),
    [beatMarkers, elements, selectedElement, selectedElementOutgoingTransition],
  );

  // Compute waveform peaks for audio elements that don't have them yet
  useEffect(() => {
    if (loading || elementsRef.current.length === 0 || missingPeakSourcesKey.length === 0) return;

    void computeAndPersistMissingPeaks(projectId, elementsRef.current, attemptedPeakSourcesRef.current).then((results) => {
      if (peakProjectRef.current !== projectId || results.length === 0) return;
      const peaksByUrl = new Map(results.map((r) => [r.source_url, r]));
      setElements((prev) =>
        prev.map((el) => {
          if (!el.source_url || el._peaks) return el;
          const peakData = peaksByUrl.get(el.source_url);
          if (!peakData) return el;
          return clampElementToActualSourceDuration({
            ...el,
            _peaks: peakData.peaks,
            _source_duration: peakData.source_duration_seconds,
          });
        }),
      );
    });

  }, [loading, missingPeakSourcesKey, projectId]);

  useEffect(() => {
    if (loading || elements.length === 0 || missingVideoDurationSourcesKey.length === 0) return;
    let cancelled = false;

    const discoverMissingVideoDurations = async () => {
      const candidates = elements.filter((el) => {
        if (el.type !== "video_clip") return false;
        if (typeof el.source_url !== "string" || el.source_url.length === 0) return false;
        if (typeof el._source_duration === "number" && Number.isFinite(el._source_duration) && el._source_duration > 0) {
          return false;
        }
        return readVideoClipTimingMetadata(el.props).sourceDurationSeconds == null;
      });
      if (candidates.length === 0) return;

      const durations = await Promise.all(candidates.map(async (element) => {
        const previewSource = resolveVideoPlaybackSource(element, element.source_url, false);
        if (!previewSource) return null;
        const duration = await new Promise<number | null>((resolve) => {
          const video = document.createElement("video");
          const cleanup = () => {
            video.removeAttribute("src");
            video.load();
          };
          video.preload = "metadata";
          video.onloadedmetadata = () => {
            const nextDuration = Number.isFinite(video.duration) && video.duration > 0
              ? Number(video.duration.toFixed(3))
              : null;
            cleanup();
            resolve(nextDuration);
          };
          video.onerror = () => {
            cleanup();
            resolve(null);
          };
          video.src = previewSource;
        });
        return duration != null ? [element.id, duration] as const : null;
      }));

      if (cancelled) return;
      const durationById = new Map(
        durations.filter((entry): entry is readonly [string, number] => entry !== null),
      );
      if (durationById.size === 0) return;

      setElements((prev) =>
        prev.map((element) => {
          const duration = durationById.get(element.id);
          if (duration == null) return element;
          return {
            ...element,
            _source_duration: duration,
          };
        }),
      );
    };

    void discoverMissingVideoDurations();

    return () => {
      cancelled = true;
    };
  }, [elements, loading, missingVideoDurationSourcesKey, setElements]);

  const runAutoplace = useCallback(async () => {
    setAutoplacing(true);
    try {
      const { response: res, body: data } = await timelineClient.autoplace();
      if (!res.ok) {
        addToast(
          typeof data.error === "string" ? data.error : "Auto-place failed",
          "error",
        );
        return;
      }
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        for (const warning of data.warnings) {
          const message = typeof warning === "string"
            ? warning
            : (
              warning
              && typeof warning === "object"
              && "message" in warning
              && typeof warning.message === "string"
            )
              ? warning.message
              : "Auto-place warning";
          addToast(message, "warning");
        }
      }
      const insertedCount =
        typeof data.insertedCount === "number" && Number.isFinite(data.insertedCount)
          ? data.insertedCount
          : 0;
      if (insertedCount === 0) {
        addToast("Auto-place found no eligible assets to place", "warning");
      } else {
        addToast(`Placed ${insertedCount} element${insertedCount === 1 ? "" : "s"}`, "success");
      }
      requestRefresh();
    } catch {
      addToast("Auto-place request failed", "error");
    } finally {
      setAutoplacing(false);
    }
  }, [timelineClient, addToast, requestRefresh, setAutoplacing]);

  useEffect(() => {
    // Exact-frame GPU decoding already owns holds; a hidden HTML decoder would
    // compete for the same hardware and cannot improve its presentation.
    if (!warmMediaInDom) return;
    const pending = elements.filter((element) => {
      if (!supportsOverflowHold(element.type) || !element.source_url) return false;
      const timing = resolveMediaTiming(element);
      const leadingHoldDuration = timing.leadingHoldDuration;
      const trailingHoldDuration = timing.trailingHoldDuration;
      const needsStartFrame = leadingHoldDuration > 0.001 && !overflowHoldStartFrameByElementId[element.id];
      const needsEndFrame = trailingHoldDuration > 0.001 && !overflowHoldEndFrameByElementId[element.id];
      return needsStartFrame || needsEndFrame;
    });
    if (pending.length === 0) return;

    const abort=new AbortController();
    // Serialize optional captures and publish one batch. Per-image state updates
    // used to restart every unfinished decoder on each completed frame.
    void (async()=>{
      const starts:Record<string,string>={},ends:Record<string,string>={};
      for(const element of pending){
        const source=resolveVideoPlaybackSource(element,element.source_url,false);
        if(!source)continue;
        const timing=resolveMediaTiming(element);
        for(const edge of ['start','end'] as const){
          if(abort.signal.aborted)return;
          if(edge==='start'?(timing.leadingHoldDuration<=.001||overflowHoldStartFrameByElementId[element.id]):(timing.trailingHoldDuration<=.001||overflowHoldEndFrameByElementId[element.id]))continue;
          const time=edge==='start'?Math.max(0,timing.trimStart):Math.max(0,timing.trimStart+timing.visibleSourceDuration-1/currentFrameRate());
          try{const url=await capturePreviewHold(source,time,abort.signal);(edge==='start'?starts:ends)[element.id]=url;}
          catch{if(abort.signal.aborted)return;/* Live-frame hold remains available. */}
        }
      }
      if(abort.signal.aborted)return;
      if(Object.keys(starts).length)setOverflowHoldStartFrameByElementId(prev=>({...starts,...prev}));
      if(Object.keys(ends).length)setOverflowHoldEndFrameByElementId(prev=>({...ends,...prev}));
    })();
    return()=>abort.abort();
  }, [elements, overflowHoldEndFrameByElementId, overflowHoldStartFrameByElementId, warmMediaInDom]);

  const totalDuration = useMemo(() => {
    if (previewDurationSeconds != null) return Math.max(1, previewDurationSeconds) + 5;
    const contentEnd = transitionState.effectiveDurationSeconds;
    let beatEnd = 0;
    for (const beat of beats) beatEnd += beat.duration_seconds ?? 3;
    const base = Math.max(contentEnd, beatEnd, 1);
    return base + 5;
  }, [beats, transitionState.effectiveDurationSeconds, previewDurationSeconds]);

  const playbackDurationSeconds = useMemo(
    () => Math.max(1, transitionState.effectiveDurationSeconds),
    [transitionState.effectiveDurationSeconds],
  );

  const {
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
    setLaneScale,
    laneManualDeltaByKey,
    setLaneManualDeltaByKey,
    timelineViewportHeight,
    setTimelineViewportHeight,
    applyFitLaneScale,
    fitTimeToView,
    hasSavedViewport,
    viewportRestored,
  } = useTimelineViewport({ projectId, totalDuration, outputAspectRatio: aspectRatio, ready: !loading });

  // The workspace layout (previewAspectRatio) follows the project's output canvas (aspectRatio)
  // one way only: a new video shape picks Tall or Wide, but flipping the layout never writes the
  // output. Syncing the other direction is how flipping the editor layout once silently changed
  // the delivered video's aspect ratio.

  /** Changing the project frame rate re-snaps picture clips on the server in one undoable step. */
  const persistOutputFrameRate = useCallback(async (nextFrameRate: ProjectFrameRate) => {
    if (nextFrameRate === frameRate) return true;
    setOutputFormatSaving(true);
    setOutputFormatError(null);
    try {
      const { response, body } = await timelineClient.saveOutputFrameRate(nextFrameRate);
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Failed to save frame rate");
      applyFrameRate(isProjectFrameRate(body.frame_rate) ? body.frame_rate : nextFrameRate);
      const historyEntry = body.history ? buildExternalSnapshotHistoryEntry(body.history.before, body.history.after) : null;
      if (historyEntry) recordHistoryEntry(historyEntry);
      requestRefresh();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save frame rate";
      setOutputFormatError(message);
      addToast(message, "error");
      return false;
    } finally {
      setOutputFormatSaving(false);
    }
  }, [addToast, applyFrameRate, frameRate, recordHistoryEntry, requestRefresh, timelineClient]);

  const persistOutputAspectRatio = useCallback(async (nextAspectRatio: PreviewAspectRatio) => {
    if (nextAspectRatio === aspectRatio) {
      return true;
    }
    setOutputFormatSaving(true);
    setOutputFormatError(null);
    try {
      const { response, body } = await timelineClient.saveOutputAspectRatio(nextAspectRatio);
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : "Failed to save output aspect ratio");
      }
      const savedAspectRatio = isTimelineAspectRatioValue(body.aspect_ratio) ? body.aspect_ratio : nextAspectRatio;
      setAspectRatio(savedAspectRatio);
      const historyEntry = body.history
        ? buildExternalSnapshotHistoryEntry(body.history.before, body.history.after)
        : null;
      if (historyEntry) recordHistoryEntry(historyEntry);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save output aspect ratio";
      setOutputFormatError(message);
      addToast(message, "error");
      return false;
    } finally {
      setOutputFormatSaving(false);
    }
  }, [addToast, aspectRatio, recordHistoryEntry, setAspectRatio, timelineClient]);

  useEffect(() => {
    playheadSecRef.current = playheadSec;
    snapEnabledRef.current = snapEnabled;
  }, [playheadSec, snapEnabled]);

  const lanes = useMemo<LaneDef[]>(
    () => buildLaneDefs(elements, characters, laneScale, laneManualDeltaByKey, laneOrderKeys),
    [elements, characters, laneManualDeltaByKey, laneScale, laneOrderKeys],
  );

  // Shift+Z follows the common NLE convention: fit the complete time range
  // horizontally without unexpectedly changing track heights.
  const fitViewportToTimeline = useCallback(() => {
    fitTimeToView();
  }, [fitTimeToView]);

  // First load may fit both axes once, before the user establishes a preferred
  // timeline view. Later horizontal fits preserve that preference.
  const fitInitialViewportToTimeline = useCallback(() => {
    applyFitLaneScale(resolveFitLaneScale({
      laneTypes: lanes.map((lane) => lane.type),
      availableHeight: timelineViewportHeight,
    }));
  }, [applyFitLaneScale, lanes, timelineViewportHeight]);

  // Default load fits lane heights while preserving the 10-second time view. Runs once per project, after the canvas has
  // reported a real height and project data finished loading; later edits never re-fit.
  // Gate on `loading`, not `lanes.length` — buildLaneDefs always includes the captions
  // lane, so a length check would fit against the placeholder before real lanes arrive.
  const fittedProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (fittedProjectIdRef.current === projectId) return;
    if (loading || !viewportRestored || timelineViewportHeight <= 0) return;
    fittedProjectIdRef.current = projectId;
    if (!hasSavedViewport) fitInitialViewportToTimeline();
  }, [fitInitialViewportToTimeline, loading, timelineViewportHeight, projectId, viewportRestored, hasSavedViewport]);

  const {
    apiPatch,
    apiPatchElements,
    createElement,
    patchElement,
    patchElements,
    restoreElement,
    normalizeElementLoudness,
    applyAudioEffect,
    applyVideoStabilization,
    deleteElement,
    undo,
    redo,
    splitElement,
    splitCaptionElement,
    duplicateElement,
    copyElement,
    cutElement,
    pasteElement,
    toggleDisableElement,
    resetElement,
    createTransition,
    patchTransition,
    deleteTransition,
    moveElement,
    resizeElement,
    updatePlaybackRate,
    moveElements,
    resizeLane,
    resizeBeatBoundary,
    fitBeatToVisualContent,
    moveBeatVisualsToBeatStart,
    addLane,
    deleteLane,
    reorderLanes,
    applyCaptionLaneStyleToLane,
  } = useTimelineMutations({
    timelineClient,
    addToast,
    elements,
    elementsRef,
    timelineState,
    beatMarkers,
    beats,
    setElements,
    setTransitions,
    transitions,
    setBeats,
    setSelectedId,
    setSelectedIds,
    setSelectedBeatId,
    setSelectedTransitionId,
    laneOrderKeys,
    setLaneOrderKeys,
    extraLaneKeys,
    setExtraLaneKeys,
    lanes,
    laneManualDeltaByKey,
    setLaneManualDeltaByKey,
    clipboardRef,
    setClipboardTick,
    requestRefresh,
    recordHistoryEntry,
    moveHistoryEntry,
    undoStackRef,
    redoStackRef,
    historyActionInFlightRef,
    setHistoryBusy,
  });

  const clearInspectorResizePreview = useCallback(() => {
    setInspectorResizePreviewState(null);
    setInspectorSnapGuide(null);
    inspectorStickySnapRef.current = null;
  }, []);

  const previewInspectorDuration = useCallback(
    (
      elementId: string,
      nextDuration: number,
      options?: { playbackRate?: number },
    ) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element || element.position_locked) {
        clearInspectorResizePreview();
        return;
      }
      const boundarySec = element.timeline_start + Math.max(minTimelineDurationSeconds(), nextDuration);
      let snappedBoundarySec = boundarySec;
      let nextSnapGuide: SnapGuide | null = null;
      if (snapEnabledRef.current && timelinePxPerSecRef.current > 0) {
        const primaryEntryThreshold = getSnapThresholdPx("primary") / timelinePxPerSecRef.current;
        const primaryReleaseThreshold = (getSnapReleasePx("primary") ?? 20) / timelinePxPerSecRef.current;
        const secondaryEntryThreshold = getSnapThresholdPx("secondary") / timelinePxPerSecRef.current;
        const secondaryReleaseThreshold = (getSnapReleasePx("secondary") ?? 10) / timelinePxPerSecRef.current;
        const targets = collectSnapTargets(element.id, beatMarkers, elementsRef.current, { playheadSec: playheadSecRef.current });
        const secondaryTargets = collectSecondarySnapTargets(element.id, elementsRef.current);
        const stickySnap = inspectorStickySnapRef.current;

        if (
          stickySnap
          && stickySnap.elementId === elementId
          && Math.abs(
            boundarySec - stickySnap.targetSec,
          ) <= (
            stickySnap.kind === "primary"
              ? primaryReleaseThreshold
              : secondaryReleaseThreshold
          )
        ) {
          snappedBoundarySec = stickySnap.targetSec;
          nextSnapGuide = { sec: stickySnap.targetSec, kind: stickySnap.kind };
        } else {
          if (stickySnap?.elementId === elementId) {
            inspectorStickySnapRef.current = null;
          }
          const snapped = snapBoundaryToTargets(boundarySec, timelinePxPerSecRef.current, targets);
          snappedBoundarySec = snapped.boundarySec;
          if (snapped.snapLine != null) {
            nextSnapGuide = { sec: snapped.snapLine, kind: "primary" };
          } else {
            const secondarySnapped = snapBoundaryToSecondaryTargets(boundarySec, timelinePxPerSecRef.current, secondaryTargets);
            snappedBoundarySec = secondarySnapped.boundarySec;
            if (secondarySnapped.snapLine != null) {
              nextSnapGuide = { sec: secondarySnapped.snapLine, kind: "secondary" };
            } else {
              const rulerSnapped = snapBoundaryToRuler(boundarySec, timelinePxPerSecRef.current);
              snappedBoundarySec = rulerSnapped.boundarySec;
              if (rulerSnapped.snapLine != null) {
                nextSnapGuide = { sec: rulerSnapped.snapLine, kind: "ruler" };
              }
            }
          }

          if (snapped.snapLine != null && Math.abs(boundarySec - snapped.snapLine) <= primaryEntryThreshold) {
            inspectorStickySnapRef.current = {
              elementId,
              targetSec: snapped.snapLine,
              kind: "primary",
            };
          } else {
            const secondarySnapped = snapBoundaryToSecondaryTargets(boundarySec, timelinePxPerSecRef.current, secondaryTargets);
            if (
              secondarySnapped.snapLine != null
              && Math.abs(boundarySec - secondarySnapped.snapLine) <= secondaryEntryThreshold
            ) {
              inspectorStickySnapRef.current = {
                elementId,
                targetSec: secondarySnapped.snapLine,
                kind: "secondary",
              };
            }
          }
        }
      }
      const preview = resolveTimingEditPreview(
        element,
        {
          duration: Math.max(minTimelineDurationSeconds(), snappedBoundarySec - element.timeline_start),
          ...(typeof options?.playbackRate === "number" ? { playbackRate: options.playbackRate } : {}),
        },
        elementsRef.current,
      );
      setInspectorResizePreviewState({
        elementId,
        edge: "end",
        originalStartSec: element.timeline_start,
        originalDurationSec: element.duration,
        previewStartSec: preview.previewStartSec,
        previewDurationSec: preview.previewDurationSec,
        previewLaneKey: preview.previewLaneKey,
        previewPlaybackRate: preview.previewPlaybackRate,
        previewProps: preview.previewProps,
      });
      setInspectorSnapGuide(nextSnapGuide);
    },
    [beatMarkers, clearInspectorResizePreview, timelineState.elementsById],
  );

  const previewInspectorPlaybackRate = useCallback(
    (elementId: string, nextPlaybackRate: number) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element || element.position_locked) {
        clearInspectorResizePreview();
        return;
      }
      const preview = resolveTimingEditPreview(
        element,
        { playbackRate: nextPlaybackRate },
        elementsRef.current,
      );
      setInspectorResizePreviewState({
        elementId,
        edge: "end",
        originalStartSec: element.timeline_start,
        originalDurationSec: element.duration,
        previewStartSec: preview.previewStartSec,
        previewDurationSec: preview.previewDurationSec,
        previewLaneKey: preview.previewLaneKey,
        previewPlaybackRate: preview.previewPlaybackRate,
        previewProps: preview.previewProps,
      });
      setInspectorSnapGuide(null);
    },
    [clearInspectorResizePreview, timelineState.elementsById],
  );

  const commitPlaybackRateFromInspector = useCallback(
    (elementId: string, nextPlaybackRate: number) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element || element.position_locked) return null;
      const result = resolveTimingEditPreview(
        element,
        { playbackRate: nextPlaybackRate },
        elementsRef.current,
      );
      const patch = result.patch ? { ...result.patch } : null;
      if (!patch) {
        clearInspectorResizePreview();
        return { duration: element.duration, laneChanged: false };
      }
      clearInspectorResizePreview();
      void patchElement(elementId, patch);
      return {
        duration: result.previewDurationSec,
        laneChanged: result.laneChanged,
      };
    },
    [clearInspectorResizePreview, patchElement, timelineState.elementsById],
  );

  useEffect(() => {
    clearInspectorResizePreview();
  }, [clearInspectorResizePreview, selectedId]);

  useEffect(() => {
    setLaneManualDeltaByKey((prev) => {
      const validKeys = new Set(lanes.map((lane) => lane.key));
      const next = Object.fromEntries(
        Object.entries(prev).filter(([key, value]) => validKeys.has(key) && Number.isFinite(value)),
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [lanes, setLaneManualDeltaByKey]);

  const compositionElements = useMemo(
    () => buildTimelineCompositionElements(renderedElements, mutedLanes, hiddenLanes),
    [hiddenLanes, mutedLanes, renderedElements],
  );

  const playerInputProps = useMemo(
    () => ({
      elements: compositionElements,
      laneOrderKeys,
    }),
    [compositionElements, laneOrderKeys],
  );

  const durationInFrames = Math.max(1, Math.round(playbackDurationSeconds * currentFrameRate()));
  const compositionDimensions = useMemo(
    () => getCompositionDimensions(aspectRatio),
    [aspectRatio],
  );

  // Reconsider the forward cache twice a second, rather than on every Player
  // frame. The upcoming-cut window is measured in seconds, so per-frame
  // planning only adds work to the very playback path we are trying to warm.
  const warmupPlayhead = Math.max(0, Math.floor(playheadSec * 2) / 2);
  const preloadCandidates = useMemo(
    () => warmMediaInDom ? buildPreviewWarmupPlan(compositionElements, warmupPlayhead) : [],
    [compositionElements, warmupPlayhead, warmMediaInDom],
  );

  useEffect(() => {
    // Preload only media that can actually reach the Player. renderedElements
    // also contains disabled audition takes, which otherwise compete with the
    // selected clip for decoder and network resources. The plan resolves the
    // same preview picture and independent narration clock that Remotion mounts.
    const releaseNode = (node: HTMLImageElement | HTMLVideoElement | HTMLAudioElement) => {
      if (node instanceof HTMLVideoElement || node instanceof HTMLAudioElement) {
        node.pause();
        node.removeAttribute("src");
        node.load();
        return;
      }
      node.removeAttribute("src");
    };
    const wantedKeys = new Set(preloadCandidates.map((candidate) => candidate.preloadKey));
    preloadedMediaNodesRef.current = preloadedMediaNodesRef.current.filter(({ preloadKey, node }) => {
      if (wantedKeys.has(preloadKey)) return true;
      preloadedMediaUrlsRef.current.delete(preloadKey);
      releaseNode(node);
      return false;
    });
    if (preloadCandidates.length === 0) return;
    const registerNode = (
      preloadKey: string,
      node: HTMLImageElement | HTMLVideoElement | HTMLAudioElement,
    ) => {
      preloadedMediaNodesRef.current.push({ preloadKey, node });
      // Warmup is a small rolling window, not a session-long decoder cache.
      // Keeping every sought media node alive eventually starves Player playback
      // during a long editing session.
      while (preloadedMediaNodesRef.current.length > 12) {
        const stale = preloadedMediaNodesRef.current.shift();
        if (!stale) break;
        preloadedMediaUrlsRef.current.delete(stale.preloadKey);
        releaseNode(stale.node);
      }
    };

    for (const candidate of preloadCandidates) {
      const { sourceUrl, preloadKey } = candidate;
      if (preloadedMediaUrlsRef.current.has(preloadKey)) continue;
      preloadedMediaUrlsRef.current.add(preloadKey);

      if (candidate.kind === "image") {
        const image = new window.Image();
        image.decoding = "async";
        image.loading = "eager";
        image.fetchPriority = candidate.activeAtPlayhead ? "high" : "low";
        image.src = sourceUrl;
        // Fetching alone leaves decode work for the first Play. Decode while
        // the project is idle and retain this bounded warm image instance.
        void image.decode().catch(() => {
          // A failed/cancelled warmer must remain retryable; mounted media
          // owns the visible error and readiness gate.
          if (image.getAttribute("src") === sourceUrl) preloadedMediaUrlsRef.current.delete(preloadKey);
        });
        registerNode(preloadKey, image);
        continue;
      }

      if (candidate.kind === "video") {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = sourceUrl;
        video.addEventListener("loadedmetadata", () => {
          if (!Number.isFinite(video.duration)) return;
          // A metadata-only load is not useful at a cut. Force a bounded seek
          // so the browser requests and decodes the GOP containing the exact
          // incoming source frame. A tiny non-zero seek also warms trim=0 clips.
          const target = Math.min(
            Math.max(0.001, candidate.sourceTimeSeconds),
            Math.max(0, video.duration - 0.05),
          );
          video.currentTime = target;
        }, { once: true });
        video.addEventListener("error", () => {
          preloadedMediaUrlsRef.current.delete(preloadKey);
        }, { once: true });
        video.load();
        registerNode(preloadKey, video);
        continue;
      }

      const audio = document.createElement("audio");
      audio.preload = "auto";
      audio.muted = true;
      audio.src = sourceUrl;
      audio.addEventListener("loadedmetadata", () => {
        if (candidate.sourceTimeSeconds <= 0 || !Number.isFinite(audio.duration)) return;
        audio.currentTime = Math.min(candidate.sourceTimeSeconds, Math.max(0, audio.duration - 0.05));
      }, { once: true });
      audio.addEventListener("error", () => {
        preloadedMediaUrlsRef.current.delete(preloadKey);
      }, { once: true });
      audio.load();
      registerNode(preloadKey, audio);
    }

    return undefined;
  }, [preloadCandidates]);

  useEffect(() => {
    return () => {
      for (const { node } of preloadedMediaNodesRef.current) {
        if (node instanceof HTMLVideoElement || node instanceof HTMLAudioElement) {
          node.pause();
        }
        node.removeAttribute("src");
        if (node instanceof HTMLVideoElement || node instanceof HTMLAudioElement) {
          node.load();
        }
      }
      preloadedMediaNodesRef.current = [];
      preloadedMediaUrlsRef.current.clear();
    };
  }, []);

  return {
    elements: renderedElements,
    previewTransition,
    transitions,
    transitionChips,
    setElements,
    beats,
    laneDefaults,
    lanes,
    addLane,
    deleteLane,
    reorderLanes,
    loading,
    hasAutoplaced,
    autoplacing,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    selectedBeatId,
    setSelectedBeatId,
    selectedTransitionId,
    setSelectedTransitionId,
    selectedTransition,
    selectTransition,
    selectedElement,
    selectedBeatLabel,
    selectedElementOutgoingTransition,
    selectedElementIncomingTransition,
    selectedElementOutgoingCandidate,
    mutedLanes,
    setMutedLanes,
    persistMutedLanes,
    hiddenLanes,
    setHiddenLanes,
    persistHiddenLanes,
    aspectRatio,
    previewAspectRatio,
    setPreviewAspectRatio,
    persistOutputAspectRatio,
    frameRate,
    persistOutputFrameRate,
    outputFormatSaving,
    outputFormatError,
    zoomLevel,
    visibleDuration,
    scrollSec,
    setScrollSec,
    zoomIn,
    zoomOut,
    zoomTo,
    resetZoom,
    fitViewportToTimeline,
    fitTracksToViewport: fitInitialViewportToTimeline,
    setTimelineViewportHeight,
    playheadSec,
    setPlayheadSec,
    totalDuration,
    playbackDurationSeconds,
    beatMarkers,
    durationInFrames,
    compositionDimensions,
    compositionElements,
    playerInputProps,
    runAutoplace,
    createElement,
    patchElement,
    patchElements,
    createTransition,
    patchTransition,
    deleteTransition,
    moveElement,
    moveElements,
    resizeElement,
    updatePlaybackRate,
    commitPlaybackRateFromInspector,
    previewInspectorDuration,
    previewInspectorPlaybackRate,
    clearInspectorResizePreview,
    inspectorResizePreviewState,
    inspectorSnapGuide,
    setTimelinePxPerSec,
    splitElement,
    duplicateElement,
    copyElement,
    cutElement,
    pasteElement,
    hasClipboard: clipboardRef.current !== null,
    toggleDisableElement,
    resetElement,
    normalizeElementLoudness,
    applyAudioEffect,
    applyVideoStabilization,
    splitCaptionElement,
    deleteElement,
    undo,
    redo,
    canUndo,
    canRedo,
    undoEntries: undoStackRef.current,
    redoEntries: redoStackRef.current,
    historyBusy,
    recordHistoryEntry,
    requestRefresh,
    snapEnabled,
    setSnapEnabled,
    laneScale,
    setLaneScale,
    resizeLane,
    resizeBeatBoundary,
    fitBeatToVisualContent,
    moveBeatVisualsToBeatStart,
    applyCaptionLaneStyleToLane,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
