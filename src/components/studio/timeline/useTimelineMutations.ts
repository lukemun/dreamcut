"use client";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import { DEFAULT_ELEMENT_ANIMATION } from "@/lib/timeline/animation-presets";
import type { AudioEffectAction } from "@/lib/timeline/audio-effects";
import type {
  VideoStabilizationAction,
  VideoStabilizationMode,
} from "@/lib/timeline/video-stabilization";
import { composeCaptionProps } from "@/lib/timeline/captions";
import { logTimelineShelf } from "@/lib/debug/timeline-shelf";
import {
  COMPOSITION_FPS,
  isVisualElementType,
  minTimelineDurationSeconds,
  quantizeVisualTrimValue,
  quantizeVisualFrameSpan,
} from "@/lib/timeline/frame-quantization";
import { getSourceDurationSeconds, supportsOverflowHold, supportsPlaybackRate } from "@/lib/timeline/media";
import { applyElementPatch } from "@/lib/local-store/element-patch";
import {
  deriveSpeechClockDependentPatches,
  speechClockDependentIds,
  touchesTimelineTiming,
} from "@/lib/timeline/speech-sync-contract";
import {
  adjustEnvelopeForDuration,
  normalizeVolumeEnvelope,
  type EnvelopePoint,
} from "@/lib/timeline/volume-envelope";
import {
  readVideoClipTimingMetadata,
  writeVideoClipTimingMetadata,
} from "@/lib/timeline/video-clip-metadata";
import {
  readVisualAssetMetadata,
  stripVisualAssetMetadata,
} from "@/lib/timeline/visual-asset-metadata";
import {
  mergeElementListPreservingRuntimePreview,
  mergeElementPreservingRuntimePreview,
} from "@/lib/timeline/runtime-preview-props";
import {
  CAPTIONS_LANE_KEY,
  laneFamilyKey,
  laneStackIndex,
  stackedLaneKey,
  visualLaneKey,
} from "@/lib/timeline/lanes";

import {
  insertTimelineElement,
  mergePatchesIntoElementList,
  mergePatchIntoElementList,
  pickElementPatchBeforeState,
  replaceAndInsertTimelineElements,
} from "./editor-helpers";
import {
  applyBeatDurationUpdates,
  calculateBeatBoundaryDurationUpdates,
  calculateFitBeatToVisualContentUpdates,
  calculateResizeElementPatch,
  calculateResolvedGroupMovePatches,
  calculateResolvedMoveElementPatch,
  expandSpeechClockMovePatches,
  calculateMoveBeatVisualsToStart,
  resolveTimingEditPreview,
} from "./timeline-actions";
import type { TimelineClient } from "./timeline-client";
import { historyEntryLabel } from "./history-entry-label";
import { runHistoryReplay } from "./history-replay-request";
import type { TimelineNormalizedState } from "./timeline-selectors";
import type { BeatMarker, LaneDef, TimelineBeatBand, TimelineElement, TimelineTransition, TimelineTransitionType } from "./types";
import type {
  BeatDurationsHistoryEntry,
  CaptionLaneStyleHistoryEntry,
  HistoryEntry,
  LaneStructureHistoryEntry,
  LaneStructureSnapshot,
  SplitHistoryEntry,
  TransitionMutationHistoryEntry,
} from "./useTimelineHistory";

type ToastType = "success" | "error" | "warning";

type MutableRefObjectLike<T> = { current: T };

function hasNumberProp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVisualLaneKey(value: unknown): value is string {
  return typeof value === "string" && /^visual_\d+$/.test(value);
}

function cloneLaneManualDeltaByKey(value: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, delta]) => Number.isFinite(delta)),
  );
}

export function normalizeElementPatch(
  element: TimelineElement,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const nextPatch: Record<string, unknown> = { ...patch };
  if (hasNumberProp(nextPatch.timeline_start)) {
    nextPatch.timeline_start = Math.max(0, nextPatch.timeline_start);
  }
  if (hasNumberProp(nextPatch.duration)) {
    nextPatch.duration = Math.max(minTimelineDurationSeconds(), nextPatch.duration);
  }

  const affectsSpan = hasNumberProp(nextPatch.timeline_start) || hasNumberProp(nextPatch.duration);
  if (isVisualElementType(element.type) && affectsSpan) {
    const nextStart = hasNumberProp(nextPatch.timeline_start) ? nextPatch.timeline_start : element.timeline_start;
    const nextDuration = hasNumberProp(nextPatch.duration) ? nextPatch.duration : element.duration;
    const quantized = quantizeVisualFrameSpan(nextStart, nextDuration);
    nextPatch.timeline_start = quantized.timeline_start;
    nextPatch.duration = quantized.duration;
  }

  if (element.type === "video_clip") {
    if (hasNumberProp(nextPatch.trim_start)) {
      nextPatch.trim_start = Math.max(0, quantizeVisualTrimValue(nextPatch.trim_start));
    }
    if (hasNumberProp(nextPatch.trim_end)) {
      nextPatch.trim_end = Math.max(0, quantizeVisualTrimValue(nextPatch.trim_end));
    }
  }

  if (element.type === "music" || element.type === "vo_segment" || element.type === "vo_full" || element.type === "sound_effect" || element.type === "video_clip") {
    const finalDuration = hasNumberProp(nextPatch.duration) ? nextPatch.duration : element.duration;
    const patchProps = nextPatch.props as Record<string, unknown> | undefined;
    const patchEnvelope = patchProps?.volume_envelope as EnvelopePoint[] | undefined;
    const patchHasEnvelope = patchProps
      ? Object.prototype.hasOwnProperty.call(patchProps, "volume_envelope")
      : false;
    const elementEnvelope = (element.props as Record<string, unknown> | null)?.volume_envelope as EnvelopePoint[] | undefined;
    const durationChanged = hasNumberProp(nextPatch.duration) && nextPatch.duration !== element.duration;
    const mergedProps = { ...(element.props ?? {}), ...(patchProps ?? {}) };

    if (patchEnvelope && Array.isArray(patchEnvelope) && durationChanged) {
      const adjusted = adjustEnvelopeForDuration(patchEnvelope, finalDuration);
      nextPatch.props = { ...mergedProps, volume_envelope: adjusted };
    } else if (patchEnvelope && Array.isArray(patchEnvelope)) {
      const normalized = normalizeVolumeEnvelope(patchEnvelope, finalDuration);
      nextPatch.props = { ...mergedProps, volume_envelope: normalized };
    } else if (!patchHasEnvelope && durationChanged && elementEnvelope && Array.isArray(elementEnvelope)) {
      const adjusted = adjustEnvelopeForDuration(elementEnvelope, finalDuration);
      nextPatch.props = { ...mergedProps, volume_envelope: adjusted };
    }
  }

  return nextPatch;
}

export function resolveDefaultTransitionTargetId(
  fromElementId: string,
  laneKey: string,
  elements: TimelineElement[],
) {
  const laneElements = elements
    .filter((element) => element.lane_key === laneKey)
    .sort((a, b) => a.timeline_start - b.timeline_start);
  const fromIndex = laneElements.findIndex((element) => element.id === fromElementId);
  return fromIndex >= 0 ? laneElements[fromIndex + 1]?.id ?? null : null;
}

export function buildPasteElementPayload(clip: TimelineElement, atSec: number) {
  const quantizedPasteSpan = isVisualElementType(clip.type)
    ? quantizeVisualFrameSpan(atSec, clip.duration)
    : null;

  return {
    type: clip.type,
    source_url: clip.source_url,
    beat_id: clip.beat_id,
    voice_clip_id: clip.voice_clip_id,
    character_id: clip.character_id,
    timeline_start: quantizedPasteSpan ? quantizedPasteSpan.timeline_start : Number(atSec.toFixed(3)),
    duration: quantizedPasteSpan
      ? quantizedPasteSpan.duration
      : Math.max(minTimelineDurationSeconds(), clip.duration),
    lane_key: clip.lane_key,
    lane_index: clip.lane_index,
    trim_start: clip.type === "video_clip" ? quantizeVisualTrimValue(clip.trim_start) : clip.trim_start,
    trim_end:
      clip.type === "video_clip" && typeof clip.trim_end === "number"
        ? quantizeVisualTrimValue(clip.trim_end)
        : clip.trim_end,
    volume: clip.volume,
    fade_in: clip.fade_in,
    fade_out: clip.fade_out,
    playback_rate: clip.playback_rate ?? 1,
    props: { ...(clip.props ?? {}), pasted_from_id: clip.id },
  };
}

export function buildCreateElementPayload(payload: Record<string, unknown>) {
  return { ...payload };
}

function stripMediaResetProps(props: Record<string, unknown>) {
  const nextProps = stripVisualAssetMetadata(props);
  delete nextProps.leading_hold_duration_seconds;
  delete nextProps.media_limit_duration_seconds;
  return nextProps;
}

export function buildResetElementPatch(element: TimelineElement): Record<string, unknown> {
  const baseProps = { ...(element.props ?? {}) };
  const patch: Record<string, unknown> = {
    volume: 1,
    fade_in: 0,
    fade_out: 0,
  };
  const visualAssetMetadata = readVisualAssetMetadata(baseProps);
  const isStillVideoWrapper =
    element.type === "still"
    && visualAssetMetadata.renderAssetType === "still_video"
    && typeof visualAssetMetadata.sourceStillVideoUrl === "string"
    && visualAssetMetadata.sourceStillVideoUrl.length > 0;

  if (element.type === "caption_text") {
    const text = typeof baseProps.text === "string" ? baseProps.text : "";
    patch.props = {
      ...baseProps,
      ...composeCaptionProps(text),
      volume_envelope: null,
    };
    return patch;
  }

  if (isStillVideoWrapper) {
    const sourceStillVideoUrl = visualAssetMetadata.sourceStillVideoUrl as string;
    const sourceStillVideoDuration = visualAssetMetadata.sourceStillVideoDurationSeconds;
    const restProps = stripMediaResetProps(baseProps);
    patch.type = "video_clip";
    patch.source_url = sourceStillVideoUrl;
    patch.playback_rate = 1;
    patch.trim_start = 0;
    patch.trim_end = null;
    if (sourceStillVideoDuration != null) {
      patch.duration = sourceStillVideoDuration;
    }
    patch.props = writeVideoClipTimingMetadata({
      ...restProps,
      ...DEFAULT_ELEMENT_ANIMATION,
      volume_envelope: null,
    }, {
      sourceDurationSeconds: sourceStillVideoDuration,
    });
    return patch;
  }

  if (supportsPlaybackRate(element.type)) {
    patch.playback_rate = 1;
  }

  if (element.type !== "still") {
    patch.trim_start = 0;
    patch.trim_end = null;
  }

  const sourceDurationSeconds = getSourceDurationSeconds({
    type: element.type,
    duration: element.duration,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    props: baseProps,
    _source_duration: element._source_duration,
  });
  if (sourceDurationSeconds != null && (element.type !== "still" || supportsPlaybackRate(element.type))) {
    patch.duration = sourceDurationSeconds;
  }

  const sanitizedProps = supportsOverflowHold(element.type)
    ? stripMediaResetProps(baseProps)
    : baseProps;

  let nextProps: Record<string, unknown> = {
    ...sanitizedProps,
    ...DEFAULT_ELEMENT_ANIMATION,
    volume_envelope: null,
  };
  if (element.type === "video_clip") {
    const existingTiming = readVideoClipTimingMetadata(baseProps);
    nextProps = writeVideoClipTimingMetadata(nextProps, {
      sourceDurationSeconds: sourceDurationSeconds ?? existingTiming.sourceDurationSeconds,
      playableWindowDurationSeconds: null,
      leadingHoldDurationSeconds: 0,
    });
  }

  patch.props = nextProps;

  return patch;
}

export function buildResolvedResetElementPatch(
  element: TimelineElement,
  allElements: TimelineElement[],
): Record<string, unknown> {
  const basePatch = buildResetElementPatch(element);

  if (!("duration" in basePatch) || typeof basePatch.duration !== "number") {
    return basePatch;
  }

  const resizedElement: TimelineElement = {
    ...element,
    type: typeof basePatch.type === "string" ? basePatch.type : element.type,
    source_url:
      "source_url" in basePatch ? (basePatch.source_url as string | null) : element.source_url,
    trim_start: typeof basePatch.trim_start === "number" ? basePatch.trim_start : element.trim_start,
    trim_end: "trim_end" in basePatch ? (basePatch.trim_end as number | null) : element.trim_end,
    playback_rate:
      typeof basePatch.playback_rate === "number" ? basePatch.playback_rate : element.playback_rate,
    volume: typeof basePatch.volume === "number" ? basePatch.volume : element.volume,
    fade_in: typeof basePatch.fade_in === "number" ? basePatch.fade_in : element.fade_in,
    fade_out: typeof basePatch.fade_out === "number" ? basePatch.fade_out : element.fade_out,
    props: (basePatch.props as Record<string, unknown> | undefined) ?? element.props,
  };

  const resolvedResizePatch = calculateResizeElementPatch(
    resizedElement,
    { duration: basePatch.duration },
    allElements.map((candidate) => (candidate.id === element.id ? resizedElement : candidate)),
  );

  const normalizedResizePatch =
    basePatch.trim_end === null && resolvedResizePatch.trim_end === 0
      ? { ...resolvedResizePatch, trim_end: null }
      : resolvedResizePatch;

  return {
    ...basePatch,
    ...normalizedResizePatch,
    props:
      basePatch.props || normalizedResizePatch.props
        ? {
          ...(basePatch.props as Record<string, unknown> | undefined ?? {}),
          ...(normalizedResizePatch.props as Record<string, unknown> | undefined ?? {}),
        }
        : undefined,
  };
}

type UseTimelineMutationsArgs = {
  timelineClient: TimelineClient;
  addToast: (message: string, type?: ToastType) => void;
  elements: TimelineElement[];
  elementsRef: MutableRefObjectLike<TimelineElement[]>;
  timelineState: TimelineNormalizedState;
  beatMarkers: TimelineBeatBand[];
  beats: BeatMarker[];
  setElements: Dispatch<SetStateAction<TimelineElement[]>>;
  setTransitions: Dispatch<SetStateAction<TimelineTransition[]>>;
  transitions: TimelineTransition[];
  setBeats: Dispatch<SetStateAction<BeatMarker[]>>;
  setSelectedId: (elementId: string | null) => void;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSelectedBeatId: Dispatch<SetStateAction<string | null>>;
  setSelectedTransitionId: Dispatch<SetStateAction<string | null>>;
  laneOrderKeys: string[];
  setLaneOrderKeys: Dispatch<SetStateAction<string[]>>;
  extraLaneKeys: Set<string>;
  setExtraLaneKeys: Dispatch<SetStateAction<Set<string>>>;
  lanes: LaneDef[];
  laneManualDeltaByKey: Record<string, number>;
  setLaneManualDeltaByKey: Dispatch<SetStateAction<Record<string, number>>>;
  clipboardRef: MutableRefObjectLike<TimelineElement | null>;
  setClipboardTick: Dispatch<SetStateAction<number>>;
  requestRefresh: () => void;
  recordHistoryEntry: (entry: HistoryEntry) => void;
  moveHistoryEntry: (source: "undo" | "redo", entry: HistoryEntry) => void;
  undoStackRef: MutableRefObjectLike<HistoryEntry[]>;
  redoStackRef: MutableRefObjectLike<HistoryEntry[]>;
  historyActionInFlightRef: MutableRefObjectLike<boolean>;
  setHistoryBusy: Dispatch<SetStateAction<boolean>>;
};

export function useTimelineMutations({
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
}: UseTimelineMutationsArgs) {
  const latestPatchRequestIdByElementRef = useRef<Map<string, number>>(new Map());
  const laneStructureSnapshot = useCallback(
    (nextLaneOrderKeys: string[], nextLaneManualDeltaByKey: Record<string, number>): LaneStructureSnapshot => ({
      laneOrderKeys: [...nextLaneOrderKeys],
      laneManualDeltaByKey: cloneLaneManualDeltaByKey(nextLaneManualDeltaByKey),
    }),
    [],
  );

  const persistLaneOrderKeys = useCallback(
    async (nextKeys: string[], fallbackMessage: string) => {
      const { response, body } = await timelineClient.saveLaneOrderKeys(nextKeys);
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : fallbackMessage);
      }
      return Array.isArray(body.lane_order_keys)
        ? [...new Set(body.lane_order_keys.filter((value): value is string => typeof value === "string"))]
        : nextKeys;
    },
    [timelineClient],
  );

  const apiPatch = useCallback(
    async (elementId: string, patch: Record<string, unknown>) => {
      const snapshot = elementsRef.current.find((e) => e.id === elementId);
      const normalizedPatch = snapshot ? normalizeElementPatch(snapshot, patch) : patch;
      const nextRequestId = (latestPatchRequestIdByElementRef.current.get(elementId) ?? 0) + 1;
      latestPatchRequestIdByElementRef.current.set(elementId, nextRequestId);
      try {
        const { response: res, body: data } = await timelineClient.patchElement(elementId, normalizedPatch);
        const isLatest = latestPatchRequestIdByElementRef.current.get(elementId) === nextRequestId;
        if (!res.ok) {
          if (!isLatest) return false;
          addToast(data.error ?? "Update failed", "error");
          if (snapshot) {
            setElements((prev) =>
              prev.map((element) => (element.id === elementId ? snapshot : element)),
            );
          }
          return false;
        }
        if (!isLatest) return true;
        setElements((prev) => data.caption_follow_elements
          ? mergeElementListPreservingRuntimePreview(prev, data.caption_follow_elements)
          : prev.map((element) => (
            element.id === elementId && data.element
              ? mergeElementPreservingRuntimePreview(element, data.element)
              : element
          )));
        if (data.transitions) {
          setTransitions(data.transitions);
        }
        return true;
      } catch {
        const isLatest = latestPatchRequestIdByElementRef.current.get(elementId) === nextRequestId;
        if (!isLatest) return false;
        addToast("Update request failed", "error");
        if (snapshot) {
          setElements((prev) =>
            prev.map((element) => (element.id === elementId ? snapshot : element)),
          );
        }
        return false;
      }
    },
    [timelineClient, addToast, elementsRef, setElements, setTransitions],
  );

  const apiPatchElements = useCallback(
    async (patches: Array<{ elementId: string; patch: Record<string, unknown> }>, historyEntry?: HistoryEntry) => {
      if (patches.length === 0) return true;
      const normalizedPatches = patches.map(({ elementId, patch }) => {
        const currentElement = elementsRef.current.find((entry) => entry.id === elementId) ?? null;
        return {
          elementId,
          patch: currentElement ? normalizeElementPatch(currentElement, patch) : patch,
        };
      });
      const snapshots = new Map(
        normalizedPatches
          .map(({ elementId }) => {
            const element = elementsRef.current.find((entry) => entry.id === elementId);
            return element ? [elementId, element] : null;
          })
          .filter((entry): entry is [string, TimelineElement] => entry !== null),
      );
      try {
        const { response: res, body: data } = await timelineClient.patchElements(normalizedPatches);
        if (!res.ok) {
          addToast(data.error ?? "Update failed", "error");
          setElements((prev) => prev.map((element) => snapshots.get(element.id) ?? element));
          return false;
        }
        if (historyEntry) {
          recordHistoryEntry(data.history ? {
            type: "snapshot", label: "audio and captions", beforeSnapshotId: data.history.before.id, afterSnapshotId: data.history.after.id,
          } : historyEntry);
        }
        const updatedElements = new Map(
          (data.elements ?? []).filter((element): element is TimelineElement => element != null).map((element) => [element.id, element]),
        );
        setElements((prev) => {
          if (data.caption_follow_elements) {
            return mergeElementListPreservingRuntimePreview(prev, data.caption_follow_elements);
          }
          return prev.map((element) => {
            const updated = updatedElements.get(element.id);
            return updated ? mergeElementPreservingRuntimePreview(element, updated) : element;
          });
        });
        if (data.transitions) setTransitions(data.transitions);
        return true;
      } catch {
        addToast("Update request failed", "error");
        setElements((prev) => prev.map((element) => snapshots.get(element.id) ?? element));
        return false;
      }
    },
    [timelineClient, addToast, elementsRef, setElements, setTransitions, recordHistoryEntry],
  );

  const patchElements = useCallback(
    async (patches: Array<{ elementId: string; patch: Record<string, unknown> }>) => {
      if (patches.length === 0) return true;
      const normalizedPatches = patches.map(({ elementId, patch }) => {
        const element = elementsRef.current.find((entry) => entry.id === elementId) ?? null;
        return {
          elementId,
          patch: element ? normalizeElementPatch(element, patch) : patch,
        };
      });
      const historyPatches = patches
        .map(({ elementId }, index) => {
          const patch = normalizedPatches[index]?.patch ?? {};
          const element = elementsRef.current.find((entry) => entry.id === elementId);
          if (!element) return null;
          return {
            elementId,
            before: pickElementPatchBeforeState(element, patch),
            after: { ...patch },
          };
        })
        .filter((entry): entry is { elementId: string; before: Record<string, unknown>; after: Record<string, unknown> } => entry !== null);
      if (historyPatches.length === 0) return true;
      // Effect versions are server-verified before selection; never optimistically
      // render a requested source version that has not been prepared yet.
      if (!normalizedPatches.some(({ patch }) => (patch.props as Record<string, unknown> | undefined)?.cutout_effects !== undefined)) {
        setElements((prev) => mergePatchesIntoElementList(prev, normalizedPatches));
      }
      return await apiPatchElements(normalizedPatches, { type: "batch_patch", patches: historyPatches });
    },
    [apiPatchElements, elementsRef, recordHistoryEntry, setElements],
  );

  const patchElement = useCallback(
    async (elementId: string, patch: Record<string, unknown>) => {
      const element = elementsRef.current.find((e) => e.id === elementId);
      const normalizedPatch = element ? normalizeElementPatch(element, patch) : patch;
      if (element && touchesTimelineTiming(normalizedPatch)
        && (["video_clip", "vo_segment", "vo_full"].includes(element.type) || speechClockDependentIds(elementsRef.current, elementId).length > 0)) {
        const sourceAfter = structuredClone(element);
        applyElementPatch(sourceAfter, normalizedPatch);
        const linkedPatches = deriveSpeechClockDependentPatches(elementsRef.current, element, sourceAfter, false);
        return patchElements([
          { elementId, patch: normalizedPatch },
          ...[...linkedPatches.entries()].map(([linkedElementId, linkedPatch]) => ({ elementId: linkedElementId, patch: linkedPatch })),
        ]);
      }
      if (element) {
        const before = pickElementPatchBeforeState(element, normalizedPatch);
        recordHistoryEntry({ type: "patch", elementId, before, after: { ...normalizedPatch } });
      }
      setElements((prev) => mergePatchIntoElementList(prev, elementId, normalizedPatch));
      return apiPatch(elementId, normalizedPatch);
    },
    [apiPatch, elementsRef, patchElements, recordHistoryEntry, setElements],
  );

  const restoreElement = useCallback(
    async (
      elementId: string,
      options?: { selectRestored?: boolean; toastLabel?: string },
    ) => {
      try {
        const { response: res, body: data } = await timelineClient.restoreElement(elementId);
        if (!res.ok) {
          addToast(typeof data.error === "string" ? data.error : "Restore failed", "error");
          return false;
        }
        if (!data.element) {
          addToast("Restore succeeded without returned element data", "warning");
          return false;
        }
        const restoredElement = data.element;
        setElements((prev) => data.caption_follow_elements
          ? mergeElementListPreservingRuntimePreview(prev, data.caption_follow_elements)
          : insertTimelineElement(prev, restoredElement));
        if (data.transitions) {
          setTransitions(data.transitions);
        }
        if (options?.selectRestored ?? true) setSelectedId(restoredElement.id ?? elementId);
        addToast(options?.toastLabel ?? "Restored clip", "success");
        return true;
      } catch {
        addToast("Restore request failed", "error");
        return false;
      }
    },
    [timelineClient, addToast, setElements, setTransitions, setSelectedId],
  );

  const normalizeElementLoudness = useCallback(
    async (elementId: string) => {
      try {
        const previousVolume = elementsRef.current.find((element) => element.id === elementId)?.volume;
        const { response: res, body: data } = await timelineClient.normalizeElement(elementId);
        if (!res.ok) {
          addToast(typeof data.error === "string" ? data.error : "Normalize failed", "error");
          return false;
        }
        if (!data.element) {
          addToast("Normalize succeeded without returned element data", "warning");
          return false;
        }
        const normalizedElement = data.element;
        setElements((prev) =>
          prev.map((element) => (element.id === elementId ? { ...element, ...normalizedElement } : element)),
        );
        if (data.transitions) {
          setTransitions(data.transitions);
        }
        // Normalize is a gain change; the measured props.source_lufs cache stays either way.
        if (typeof previousVolume === "number" && previousVolume !== normalizedElement.volume) {
          recordHistoryEntry({
            type: "patch",
            elementId,
            before: { volume: previousVolume },
            after: { volume: normalizedElement.volume },
          });
        }
        addToast("Leveled to reference", "success");
        return true;
      } catch {
        addToast("Normalize request failed", "error");
        return false;
      }
    },
    [timelineClient, addToast, elementsRef, recordHistoryEntry, setElements, setTransitions],
  );

  const applyAudioEffect = useCallback(
    async (
      elementId: string,
      action: AudioEffectAction,
      options?: { strength?: number },
    ) => {
      const labels: Record<AudioEffectAction, string> = {
        enhance_voice: "Voice enhanced",
        toggle_voice_enhancement: "Voice comparison changed",
        reduce_background_noise: "Background noise reduced",
        restore_original: "Original audio restored",
        detach_audio: "Audio detached to its own lane",
        reattach_audio: "Audio reattached to video",
      };
      try {
        const { response, body } = await timelineClient.applyAudioEffect(elementId, action, options);
        if (!response.ok) {
          addToast(typeof body.error === "string" ? body.error : "Audio effect failed", "error");
          return false;
        }
        if (!body.elements) {
          addToast("Audio effect succeeded without updated timeline data", "warning");
          requestRefresh();
          return false;
        }
        setElements(body.elements);
        if (body.transitions) setTransitions(body.transitions);
        addToast(labels[action], "success");
        return true;
      } catch {
        addToast("Audio effect request failed", "error");
        return false;
      }
    },
    [timelineClient, addToast, requestRefresh, setElements, setTransitions],
  );

  const applyVideoStabilization = useCallback(
    async (
      elementId: string,
      action: VideoStabilizationAction,
      options?: { mode?: VideoStabilizationMode; strength?: number },
    ) => {
      const labels: Record<VideoStabilizationAction, string> = {
        apply: "Video stabilized",
        toggle_comparison: "Stabilization comparison changed",
        remove: "Stabilization removed",
      };
      try {
        const { response, body } = await timelineClient.applyVideoStabilization(
          elementId,
          action,
          options,
        );
        if (!response.ok) {
          addToast(typeof body.error === "string" ? body.error : "Video stabilization failed", "error");
          return false;
        }
        if (!body.elements) {
          addToast("Stabilization succeeded without updated timeline data", "warning");
          requestRefresh();
          return false;
        }
        setElements(body.elements);
        if (body.transitions) setTransitions(body.transitions);
        addToast(labels[action], "success");
        return true;
      } catch {
        addToast("Video stabilization request failed", "error");
        return false;
      }
    },
    [timelineClient, addToast, requestRefresh, setElements, setTransitions],
  );

  const createElement = useCallback(
    async (
      payload: Record<string, unknown>,
      options?: { selectCreated?: boolean; toastLabel?: string; suppressToast?: boolean },
    ) => {
      try {
        const { response: res, body: data } = await timelineClient.createElement(buildCreateElementPayload(payload));
        if (!res.ok) {
          if (!(options?.suppressToast ?? false)) {
            addToast(typeof data.error === "string" ? data.error : "Failed to add element", "error");
          }
          return null;
        }
        if (!data.element) {
          if (!(options?.suppressToast ?? false)) {
            addToast("Add succeeded without returned element data", "warning");
          }
          return null;
        }
        const createdElement = data.element;
        setElements((prev) => insertTimelineElement(prev, createdElement));
        if (options?.selectCreated ?? true) {
          setSelectedId(createdElement.id ?? null);
        }
        recordHistoryEntry({ type: "create", element: createdElement });
        if (!(options?.suppressToast ?? false)) {
          addToast(options?.toastLabel ?? "Added to timeline", "success");
        }
        return createdElement.id ?? null;
      } catch {
        if (!(options?.suppressToast ?? false)) {
          addToast("Failed to add element", "error");
        }
        return null;
      }
    },
    [timelineClient, addToast, setElements, setSelectedId, recordHistoryEntry],
  );

  const deleteElement = useCallback(
    async (
      elementId: string,
      options?: { recordHistory?: boolean; toastLabel?: string },
    ) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element) return false;
      if (element.position_locked) {
        addToast("This clip is locked. Unlock it before removing it from the timeline.", "warning");
        return false;
      }
      try {
        const { response: res, body: data } = await timelineClient.deleteElement(elementId);
        if (!res.ok) {
          addToast(typeof data.error === "string" ? data.error : "Delete failed", "error");
          return false;
        }
        if (options?.recordHistory ?? true) {
          recordHistoryEntry(data.history ? {
            type: "snapshot", label: "delete audio and captions", beforeSnapshotId: data.history.before.id, afterSnapshotId: data.history.after.id,
          } : { type: "delete", element: { ...element } });
        }
        setElements((prev) => data.caption_follow_elements
          ? mergeElementListPreservingRuntimePreview(prev, data.caption_follow_elements)
          : prev.filter((candidate) => candidate.id !== elementId));
        if (data.transitions) {
          setTransitions(data.transitions);
        }
        setSelectedIds((prev) => prev.filter((id) => id !== elementId));
        addToast(options?.toastLabel ?? "Removed from timeline", "success");
        return true;
      } catch {
        addToast("Delete request failed", "error");
        return false;
      }
    },
    [timelineState.elementsById, timelineClient, addToast, recordHistoryEntry, setElements, setTransitions, setSelectedIds],
  );

  const replaySplitHistoryEntry = useCallback(
    async (
      entry: SplitHistoryEntry,
      direction: "undo" | "redo",
    ) => {
      const originalElement = elementsRef.current.find((element) => element.id === entry.originalId) ?? null;
      const baseFirstPatch = direction === "undo" ? entry.beforePatch : entry.afterPatch;
      const baseCompensationPatch = direction === "undo" ? entry.afterPatch : entry.beforePatch;
      const firstPatch = originalElement ? normalizeElementPatch(originalElement, baseFirstPatch) : baseFirstPatch;
      const compensationPatch = originalElement ? normalizeElementPatch(originalElement, baseCompensationPatch) : baseCompensationPatch;
      const firstFailureMessage = direction === "undo" ? "Failed to undo split" : "Failed to redo split";
      const secondFailureMessage = direction === "undo" ? "Failed to remove split segment" : "Failed to restore split segment";

      try {
        const { response: patchResponse, body: patchBody } = await timelineClient.patchElement(entry.originalId, firstPatch);
        if (!patchResponse.ok || !patchBody.element) {
          addToast(typeof patchBody.error === "string" ? patchBody.error : firstFailureMessage, patchResponse.ok ? "warning" : "error");
          return false;
        }

        setElements((prev) =>
          prev.map((element) => (element.id === entry.originalId ? { ...element, ...patchBody.element } : element)),
        );
        if (patchBody.transitions) {
          setTransitions(patchBody.transitions);
        }

        if (direction === "undo") {
          const { response: deleteResponse, body: deleteBody } = await timelineClient.deleteElement(entry.insertedElement.id);
          if (!deleteResponse.ok) {
            const { response: compensationResponse, body: compensationBody } = await timelineClient.patchElement(entry.originalId, compensationPatch);
            if (compensationResponse.ok && compensationBody.element) {
              setElements((prev) =>
                prev.map((element) => (element.id === entry.originalId ? { ...element, ...compensationBody.element } : element)),
              );
              addToast(typeof deleteBody.error === "string" ? deleteBody.error : secondFailureMessage, "error");
              return false;
            }
            requestRefresh();
            addToast("Split undo failed and timeline was reloaded", "error");
            return false;
          }

          setElements((prev) => prev.filter((element) => element.id !== entry.insertedElement.id));
          if (deleteBody.transitions) {
            setTransitions(deleteBody.transitions);
          }
          setSelectedIds((prev) => [
            ...prev.filter((id) => id !== entry.insertedElement.id && id !== entry.originalId),
            entry.originalId,
          ]);
          addToast("Undo split", "success");
          return true;
        }

        const { response: restoreResponse, body: restoreBody } = await timelineClient.restoreElement(entry.insertedElement.id);
        if (!restoreResponse.ok || !restoreBody.element) {
          const { response: compensationResponse, body: compensationBody } = await timelineClient.patchElement(entry.originalId, compensationPatch);
          if (compensationResponse.ok && compensationBody.element) {
            setElements((prev) =>
              prev.map((element) => (element.id === entry.originalId ? { ...element, ...compensationBody.element } : element)),
            );
            addToast(typeof restoreBody.error === "string" ? restoreBody.error : secondFailureMessage, restoreResponse.ok ? "warning" : "error");
            return false;
          }
          requestRefresh();
          addToast("Split redo failed and timeline was reloaded", "error");
          return false;
        }

        const restoredElement = restoreBody.element;
        setElements((prev) => insertTimelineElement(prev, restoredElement));
        if (restoreBody.transitions) {
          setTransitions(restoreBody.transitions);
        }
        setSelectedId(restoredElement.id ?? entry.insertedElement.id);
        addToast("Redo split", "success");
        return true;
      } catch {
        requestRefresh();
        addToast(direction === "undo" ? "Split undo request failed" : "Split redo request failed", "error");
        return false;
      }
    },
    [timelineClient, addToast, elementsRef, requestRefresh, setElements, setTransitions, setSelectedId, setSelectedIds],
  );

  const replayLaneStructureHistoryEntry = useCallback(
    async (
      entry: LaneStructureHistoryEntry,
      direction: "undo" | "redo",
    ) => {
      const target = direction === "undo" ? entry.before : entry.after;
      const deletedElements = entry.deletedElements ?? [];

      try {
        let latestTransitions: TimelineTransition[] | null = null;

        if (direction === "undo") {
          for (const element of deletedElements) {
            const { response, body } = await timelineClient.restoreElement(element.id);
            if (!response.ok || !body.element) {
              throw new Error(typeof body.error === "string" ? body.error : "Failed to restore deleted lane contents");
            }
            setElements((prev) => insertTimelineElement(prev, body.element!));
            if (body.transitions) latestTransitions = body.transitions;
          }
        } else {
          for (const element of deletedElements) {
            const { response, body } = await timelineClient.deleteElement(element.id);
            if (!response.ok) {
              throw new Error(typeof body.error === "string" ? body.error : "Failed to remove lane contents");
            }
            if (body.transitions) latestTransitions = body.transitions;
          }
          const deletedIds = new Set(deletedElements.map((element) => element.id));
          setElements((prev) => prev.filter((element) => !deletedIds.has(element.id)));
          setSelectedIds((prev) => prev.filter((id) => !deletedIds.has(id)));
        }

        setLaneOrderKeys(target.laneOrderKeys);
        setExtraLaneKeys(new Set(target.laneOrderKeys));
        setLaneManualDeltaByKey(target.laneManualDeltaByKey);

        const persistedKeys = await persistLaneOrderKeys(
          target.laneOrderKeys,
          direction === "undo" ? "Failed to undo lane change" : "Failed to redo lane change",
        );
        setLaneOrderKeys(persistedKeys);
        setExtraLaneKeys(new Set(persistedKeys));
        setLaneManualDeltaByKey(target.laneManualDeltaByKey);
        if (latestTransitions) setTransitions(latestTransitions);
        return true;
      } catch {
        requestRefresh();
        addToast(direction === "undo" ? "Undo lane change failed" : "Redo lane change failed", "error");
        return false;
      }
    },
    [timelineClient, setElements, setSelectedIds, setLaneOrderKeys, setExtraLaneKeys, setLaneManualDeltaByKey, persistLaneOrderKeys, setTransitions, requestRefresh, addToast],
  );

  const replayTransitionMutationHistoryEntry = useCallback(
    async (
      entry: TransitionMutationHistoryEntry,
      direction: "undo" | "redo",
    ) => {
      const target = direction === "undo" ? entry.before : entry.after;
      const source = direction === "undo" ? entry.after : entry.before;

      try {
        if (!source && target) {
          const { response, body } = await timelineClient.createTransition({
            from_element_id: target.from_element_id,
            to_element_id: target.to_element_id,
            type: target.type,
            duration_seconds: target.duration_seconds,
            params: target.params ?? {},
          });
          if (!response.ok || !body.transition) {
            throw new Error(typeof body.error === "string" ? body.error : "Failed to create transition");
          }
          setTransitions((prev) => [...prev, body.transition!]);
          if (direction === "undo") entry.before = body.transition;
          else entry.after = body.transition;
          return true;
        }

        if (source && !target) {
          const { response, body } = await timelineClient.deleteTransition(source.id);
          if (!response.ok) {
            throw new Error(typeof body.error === "string" ? body.error : "Failed to delete transition");
          }
          setTransitions((prev) => prev.filter((transition) => transition.id !== source.id));
          setSelectedTransitionId((prev) => (prev === source.id ? null : prev));
          return true;
        }

        if (!source || !target) return true;

        const { response, body } = await timelineClient.patchTransition(source.id, {
          type: target.type,
          duration_seconds: target.duration_seconds,
          params: target.params ?? {},
        });
        if (!response.ok || !body.transition) {
          throw new Error(typeof body.error === "string" ? body.error : "Failed to update transition");
        }
        setTransitions((prev) => prev.map((transition) => (transition.id === source.id ? body.transition! : transition)));
        return true;
      } catch {
        requestRefresh();
        addToast(direction === "undo" ? "Undo transition change failed" : "Redo transition change failed", "error");
        return false;
      }
    },
    [timelineClient, setTransitions, setSelectedTransitionId, requestRefresh, addToast],
  );

  const replayBeatDurationsHistoryEntry = useCallback(
    async (
      entry: BeatDurationsHistoryEntry,
      direction: "undo" | "redo",
    ) => {
      const durationByBeatId = new Map(
        entry.updates.map((update) => [
          update.beatId,
          direction === "undo" ? update.before : update.after,
        ]),
      );
      const previousBeats = beats;
      const nextBeats = beats.map((beat) =>
        durationByBeatId.has(beat.id)
          ? { ...beat, duration_seconds: durationByBeatId.get(beat.id) ?? null }
          : beat,
      );

      setBeats(nextBeats);
      try {
        await Promise.all(
          entry.updates.map(async (update) => {
            const durationSeconds = direction === "undo" ? update.before : update.after;
            await timelineClient.patchBeatDuration(
              update.beatId,
              durationSeconds,
              direction === "undo" ? "Failed to undo beat timing change" : "Failed to redo beat timing change",
            );
          }),
        );
        return true;
      } catch (error) {
        setBeats(previousBeats);
        addToast(error instanceof Error ? error.message : "Failed to replay beat timing change", "error");
        return false;
      }
    },
    [beats, setBeats, timelineClient, addToast],
  );

  const replayCaptionLaneStyleHistoryEntry = useCallback(
    async (
      entry: CaptionLaneStyleHistoryEntry,
      direction: "undo" | "redo",
    ) => {
      const patches = entry.updates.map((update) => ({
        elementId: update.elementId,
        patch: {
          props: direction === "undo" ? update.beforeProps : update.afterProps,
        },
      }));
      return apiPatchElements(patches);
    },
    [apiPatchElements],
  );

  const replayHistoryEntry = useCallback(
    async (entry: HistoryEntry, direction: "undo" | "redo") => {
      if (entry.type === "snapshot") {
        const snapshotId = direction === "undo" ? entry.beforeSnapshotId : entry.afterSnapshotId;
        const { response, body } = await timelineClient.restoreHistorySnapshot(snapshotId);
        if (!response.ok) {
          addToast(typeof body.error === "string" ? body.error : `Failed to ${direction} ${entry.label}`, "error");
          return false;
        }
        if (body.timeline_changed !== false) requestRefresh();
        window.dispatchEvent(new Event("timeline-editor:project-restored"));
        addToast(`${direction === "undo" ? "Undid" : "Redid"} ${entry.label}`, "success");
        return true;
      }
      if (entry.type === "patch") {
        return direction === "undo"
          ? apiPatch(entry.elementId, entry.before)
          : apiPatch(entry.elementId, entry.after);
      }
      if (entry.type === "batch_patch") {
        return direction === "undo"
          ? apiPatchElements(entry.patches.map(({ elementId, before }) => ({ elementId, patch: before })))
          : apiPatchElements(entry.patches.map(({ elementId, after }) => ({ elementId, patch: after })));
      }
      if (entry.type === "delete") {
        return direction === "undo"
          ? restoreElement(entry.element.id, { selectRestored: false, toastLabel: "Undo delete" })
          : deleteElement(entry.element.id, { recordHistory: false, toastLabel: "Redo delete" });
      }
      if (entry.type === "create") {
        return direction === "undo"
          ? deleteElement(entry.element.id, { recordHistory: false, toastLabel: "Undo create" })
          : restoreElement(entry.element.id, { selectRestored: false, toastLabel: "Redo create" });
      }
      if (entry.type === "split") {
        return replaySplitHistoryEntry(entry, direction);
      }
      if (entry.type === "lane_structure") {
        return replayLaneStructureHistoryEntry(entry, direction);
      }
      if (entry.type === "transition_mutation") {
        return replayTransitionMutationHistoryEntry(entry, direction);
      }
      if (entry.type === "beat_durations") {
        return replayBeatDurationsHistoryEntry(entry, direction);
      }
      if (entry.type === "caption_lane_style") {
        return replayCaptionLaneStyleHistoryEntry(entry, direction);
      }
      return replayLaneStructureHistoryEntry(entry, direction);
    },
    [timelineClient, addToast, requestRefresh, apiPatch, apiPatchElements, restoreElement, deleteElement, replaySplitHistoryEntry, replayLaneStructureHistoryEntry, replayTransitionMutationHistoryEntry, replayBeatDurationsHistoryEntry, replayCaptionLaneStyleHistoryEntry],
  );

  const undo = useCallback(async () => {
    if (historyActionInFlightRef.current) return;
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    historyActionInFlightRef.current = true;
    setHistoryBusy(true);
    try {
      const replayed = await runHistoryReplay("undo", historyEntryLabel(entry), () => replayHistoryEntry(entry, "undo"));
      if (replayed) moveHistoryEntry("undo", entry);
    } finally {
      historyActionInFlightRef.current = false;
      setHistoryBusy(false);
    }
  }, [historyActionInFlightRef, moveHistoryEntry, replayHistoryEntry, setHistoryBusy, undoStackRef]);

  const redo = useCallback(async () => {
    if (historyActionInFlightRef.current) return;
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    historyActionInFlightRef.current = true;
    setHistoryBusy(true);
    try {
      const replayed = await runHistoryReplay("redo", historyEntryLabel(entry), () => replayHistoryEntry(entry, "redo"));
      if (replayed) moveHistoryEntry("redo", entry);
    } finally {
      historyActionInFlightRef.current = false;
      setHistoryBusy(false);
    }
  }, [historyActionInFlightRef, moveHistoryEntry, redoStackRef, replayHistoryEntry, setHistoryBusy]);

  const performSplit = useCallback(
    async (elementId: string, splitAt: number, successToastLabel: string) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element) return null;
      if (splitAt <= element.timeline_start || splitAt >= element.timeline_start + element.duration) {
        addToast("Playhead must be within the clip to split", "warning");
        return null;
      }

      const beforePatch = {
        duration: element.duration,
        fade_out: element.fade_out,
        props: { ...(element.props ?? {}) },
      };

      try {
        const { response: res, body: data } = await timelineClient.splitElement(elementId, splitAt);
        if (!res.ok) {
          addToast(typeof data.error === "string" ? data.error : "Split failed", "error");
          return null;
        }
        if (!data.updated || !data.inserted) {
          addToast("Split succeeded without returned element data", "warning");
          return null;
        }

        const updatedElement = data.updated;
        const insertedElement = data.inserted;
        const afterPatch = {
          duration: updatedElement.duration,
          fade_out: updatedElement.fade_out,
          props: { ...(updatedElement.props ?? {}) },
        };

        setElements((prev) => data.caption_follow_elements
          ? mergeElementListPreservingRuntimePreview(prev, data.caption_follow_elements)
          : replaceAndInsertTimelineElements(prev, elementId, updatedElement, insertedElement));
        if (data.transitions) {
          setTransitions(data.transitions);
        }
        setSelectedId(insertedElement.id ?? elementId);
        recordHistoryEntry(data.history ? {
          type: "snapshot", label: "split audio and captions", beforeSnapshotId: data.history.before.id, afterSnapshotId: data.history.after.id,
        } : {
          type: "split",
          originalId: elementId,
          beforePatch,
          afterPatch,
          insertedElement,
        });
        addToast(successToastLabel, "success");
        return insertedElement.id ?? null;
      } catch {
        addToast("Split request failed", "error");
        return null;
      }
    },
    [timelineState.elementsById, timelineClient, addToast, setElements, setTransitions, setSelectedId, recordHistoryEntry],
  );

  const splitElement = useCallback(
    async (elementId: string, splitAt: number) => performSplit(elementId, splitAt, "Split clip"),
    [performSplit],
  );

  const splitCaptionElement = useCallback(
    async (elementId: string, splitAt: number) => performSplit(elementId, splitAt, "Caption split"),
    [performSplit],
  );

  const duplicateElement = useCallback(
    async (elementId: string) => {
      try {
        const { response: res, body: data } = await timelineClient.duplicateElement(elementId);
        if (!res.ok) {
          addToast(typeof data.error === "string" ? data.error : "Duplicate failed", "error");
          return null;
        }
        if (!data.element) {
          addToast("Duplicate succeeded without returned element data", "warning");
          return null;
        }
        const duplicatedElement = data.element;
        setElements((prev) => insertTimelineElement(prev, duplicatedElement));
        setSelectedId(duplicatedElement.id ?? elementId);
        recordHistoryEntry({ type: "create", element: duplicatedElement });
        addToast("Duplicated clip", "success");
        return duplicatedElement.id ?? null;
      } catch {
        addToast("Duplicate request failed", "error");
        return null;
      }
    },
    [timelineClient, addToast, setElements, setSelectedId, recordHistoryEntry],
  );

  const copyElement = useCallback(
    (elementId: string) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element) return;
      if (element.position_locked) {
        addToast("Locked clips cannot be copied", "warning");
        return;
      }
      clipboardRef.current = { ...element };
      setClipboardTick((v) => v + 1);
      addToast("Copied", "success");
    },
    [timelineState.elementsById, addToast, clipboardRef, setClipboardTick],
  );

  const cutElement = useCallback(
    async (elementId: string) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element) return;
      if (element.position_locked) {
        addToast("Locked clips cannot be cut", "warning");
        return;
      }
      const deleted = await deleteElement(elementId);
      if (!deleted) return;
      clipboardRef.current = { ...element };
      setClipboardTick((v) => v + 1);
    },
    [timelineState.elementsById, addToast, deleteElement, clipboardRef, setClipboardTick],
  );

  const pasteElement = useCallback(
    async (atSec: number) => {
      const clip = clipboardRef.current;
      if (!clip) return;
      if (clip.position_locked) {
        clipboardRef.current = null;
        setClipboardTick((v) => v + 1);
        addToast("Locked clips cannot be pasted", "warning");
        return;
      }
      try {
        const { response: res, body: data } = await timelineClient.createElement(buildPasteElementPayload(clip, atSec));
        if (!res.ok) {
          addToast(typeof data.error === "string" ? data.error : "Paste failed", "error");
          return;
        }
        if (!data.element) {
          addToast("Paste succeeded without returned element data", "warning");
          return;
        }
        const createdElement = data.element;
        setElements((prev) => insertTimelineElement(prev, createdElement));
        setSelectedId(createdElement.id ?? null);
        recordHistoryEntry({ type: "create", element: createdElement });
        addToast("Pasted", "success");
      } catch {
        addToast("Paste request failed", "error");
      }
    },
    [clipboardRef, timelineClient, addToast, setClipboardTick, setElements, setSelectedId, recordHistoryEntry],
  );

  const toggleDisableElement = useCallback(
    (elementId: string) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element) return;
      const isDisabled = !!element.props?.disabled;
      void patchElement(elementId, {
        props: { ...(element.props ?? {}), disabled: !isDisabled },
      });
    },
    [timelineState.elementsById, patchElement],
  );

  const resetElement = useCallback(
    (elementId: string) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element) return;
      void patchElement(elementId, buildResolvedResetElementPatch(element, elementsRef.current));
    },
    [timelineState.elementsById, patchElement, elementsRef],
  );

  const createTransition = useCallback(
    async (fromElementId: string, toElementId?: string, type: TimelineTransitionType = "fade") => {
      const fromElement = timelineState.elementsById[fromElementId] ?? null;
      if (!fromElement) return false;
      const defaultToElementId = resolveDefaultTransitionTargetId(fromElementId, fromElement.lane_key, elements);
      const targetId = toElementId ?? defaultToElementId;
      const toElement = targetId ? timelineState.elementsById[targetId] ?? null : null;
      if (!toElement) {
        addToast("No adjacent clip available for a transition.", "warning");
        return false;
      }
      try {
        const { response, body } = await timelineClient.createTransition({
          from_element_id: fromElementId,
          to_element_id: toElement.id,
          type,
          duration_seconds: 15 / currentFrameRate(),
        });
        if (!response.ok || !body.transition) {
          addToast(typeof body.error === "string" ? body.error : "Failed to add transition", "error");
          return false;
        }
        setTransitions((prev) => [...prev, body.transition!]);
        setSelectedTransitionId(body.transition.id);
        setSelectedIds([]);
        setSelectedBeatId(null);
        recordHistoryEntry({
          type: "transition_mutation",
          before: null,
          after: body.transition,
        });
        addToast("Transition added", "success");
        return true;
      } catch {
        addToast("Failed to add transition", "error");
        return false;
      }
    },
    [timelineState.elementsById, elements, addToast, timelineClient, setTransitions, setSelectedTransitionId, setSelectedIds, setSelectedBeatId, recordHistoryEntry],
  );

  const patchTransition = useCallback(
    async (transitionId: string, patch: Record<string, unknown>) => {
      const existingTransition = transitions.find((transition) => transition.id === transitionId) ?? null;
      if (!existingTransition) return false;
      try {
        const { response, body } = await timelineClient.patchTransition(transitionId, patch);
        if (!response.ok || !body.transition) {
          addToast(typeof body.error === "string" ? body.error : "Failed to update transition", "error");
          return false;
        }
        setTransitions((prev) => prev.map((transition) => (transition.id === transitionId ? body.transition! : transition)));
        recordHistoryEntry({
          type: "transition_mutation",
          before: { ...existingTransition },
          after: body.transition,
        });
        return true;
      } catch {
        addToast("Failed to update transition", "error");
        return false;
      }
    },
    [transitions, timelineClient, addToast, setTransitions, recordHistoryEntry],
  );

  const deleteTransition = useCallback(
    async (transitionId: string) => {
      const existingTransition = transitions.find((transition) => transition.id === transitionId) ?? null;
      if (!existingTransition) return false;
      try {
        const { response, body } = await timelineClient.deleteTransition(transitionId);
        if (!response.ok) {
          addToast(typeof body.error === "string" ? body.error : "Failed to remove transition", "error");
          return false;
        }
        setTransitions((prev) => prev.filter((transition) => transition.id !== transitionId));
        setSelectedTransitionId((prev) => (prev === transitionId ? null : prev));
        recordHistoryEntry({
          type: "transition_mutation",
          before: { ...existingTransition },
          after: null,
        });
        addToast("Transition removed", "success");
        return true;
      } catch {
        addToast("Failed to remove transition", "error");
        return false;
      }
    },
    [transitions, timelineClient, addToast, setTransitions, setSelectedTransitionId, recordHistoryEntry],
  );

  const moveElement = useCallback(
    (elementId: string, next: { timelineStart?: number; laneKey?: string }) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element || element.position_locked) return;
      const persistedNext = { ...next };
      const patch = calculateResolvedMoveElementPatch(element, persistedNext, elements);
      logTimelineShelf("Timeline move resolve", {
        elementId,
        currentStart: element.timeline_start,
        currentLaneKey: element.lane_key,
        requestedStart: persistedNext.timelineStart ?? null,
        requestedLaneKey: next.laneKey ?? null,
        resolvedPatch: patch,
      });

      if (Object.keys(patch).length > 0) {
        const linkedPatches = expandSpeechClockMovePatches(element, patch, elements);
        if (linkedPatches.size > 1) {
          void patchElements([...linkedPatches.entries()].map(([linkedElementId, linkedPatch]) => ({
            elementId: linkedElementId,
            patch: linkedPatch,
          })));
        } else {
          void patchElement(elementId, patch);
        }
      }
    },
    [timelineState.elementsById, elements, patchElement, patchElements],
  );

  const resizeElement = useCallback(
    (elementId: string, next: { timelineStart?: number; duration?: number }) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element || element.position_locked) return;
      const preview = resolveTimingEditPreview(element, next, elements);
      if (preview.patch) {
        void patchElement(elementId, preview.patch);
      }
    },
    [timelineState.elementsById, elements, patchElement],
  );

  const updatePlaybackRate = useCallback(
    (elementId: string, nextPlaybackRate: number) => {
      const element = timelineState.elementsById[elementId] ?? null;
      if (!element || element.position_locked) return null;
      const preview = resolveTimingEditPreview(
        element,
        { playbackRate: nextPlaybackRate },
        elementsRef.current,
      );
      if (preview.patch) {
        void patchElement(elementId, preview.patch);
      }
      return { duration: preview.previewDurationSec, laneChanged: preview.laneChanged };
    },
    [timelineState.elementsById, elementsRef, patchElement],
  );

  const moveElements = useCallback(
    (elementIds: string[], deltaSec: number, laneDelta = 0) => {
      if (elementIds.length === 0 || (Math.abs(deltaSec) < 0.001 && laneDelta === 0)) return;
      const movableIds = elementIds.filter((elementId) => {
        const element = timelineState.elementsById[elementId] ?? null;
        return !!element && !element.position_locked;
      });
      if (movableIds.length === 0) return;
      const patches = calculateResolvedGroupMovePatches({
        elementIds: movableIds,
        deltaSec,
        laneDelta,
        orderedVisualLaneKeys: lanes.filter((lane) => lane.type === "visual").map((lane) => lane.key),
      }, elements);
      void patchElements([...patches.entries()].map(([elementId, patch]) => ({ elementId, patch })));
    },
    [timelineState.elementsById, lanes, elements, patchElements],
  );

  const resizeLane = useCallback(
    (laneKey: string, nextHeight: number) => {
      const lane = lanes.find((entry) => entry.key === laneKey);
      if (!lane) return;
      const clampedHeight = Math.min(lane.maxHeight, Math.max(lane.minHeight, nextHeight));
      const scaledBaseHeight = lane.height - (laneManualDeltaByKey[laneKey] ?? 0);
      const nextDelta = Math.round((clampedHeight - scaledBaseHeight) * 100) / 100;
      setLaneManualDeltaByKey((prev) => {
        if (Math.abs(nextDelta) < 0.5) {
          if (!(laneKey in prev)) return prev;
          const next = { ...prev };
          delete next[laneKey];
          return next;
        }
        return { ...prev, [laneKey]: nextDelta };
      });
    },
    [lanes, laneManualDeltaByKey, setLaneManualDeltaByKey],
  );

  const resizeBeatBoundary = useCallback(
    async (beatId: string, edge: "start" | "end", boundarySec: number) => {
      const updates = calculateBeatBoundaryDurationUpdates(beatMarkers, beatId, edge, boundarySec);
      if (!updates || updates.size === 0) return;
      const historyUpdates = [...updates.entries()].map(([id, durationSeconds]) => {
        const currentBeat = beats.find((beat) => beat.id === id) ?? null;
        return {
          beatId: id,
          before: currentBeat?.duration_seconds ?? 3,
          after: durationSeconds,
        };
      });

      const nextBeats = applyBeatDurationUpdates(beats, updates);
      setBeats(nextBeats);

      try {
        await Promise.all(
          [...updates.entries()].map(async ([id, durationSeconds]) => {
            await timelineClient.patchBeatDuration(id, durationSeconds, "Failed to update beat timing");
          }),
        );
        recordHistoryEntry({ type: "beat_durations", updates: historyUpdates });
      } catch (error) {
        setBeats(beats);
        addToast(error instanceof Error ? error.message : "Failed to update beat timing", "error");
      }
    },
    [beatMarkers, beats, setBeats, timelineClient, addToast, recordHistoryEntry],
  );

  const fitBeatToVisualContent = useCallback(
    async (beatId: string) => {
      const result = calculateFitBeatToVisualContentUpdates(beatMarkers, elements, beatId);
      if (result.reason === "missing_beat") return;
      if (result.reason === "no_visuals" || !result.updates) {
        addToast("No visual timeline elements found for this beat", "warning");
        return;
      }
      const nextBeats = applyBeatDurationUpdates(beats, result.updates);
      const historyUpdates = [...result.updates.entries()].map(([id, durationSeconds]) => {
        const currentBeat = beats.find((beat) => beat.id === id) ?? null;
        return {
          beatId: id,
          before: currentBeat?.duration_seconds ?? 3,
          after: durationSeconds,
        };
      });
      setBeats(nextBeats);

      try {
        await Promise.all(
          [...result.updates.entries()].map(async ([id, durationSeconds]) => {
            await timelineClient.patchBeatDuration(id, durationSeconds, "Failed to fit beat to visual content");
          }),
        );
        setSelectedBeatId(beatId);
        recordHistoryEntry({ type: "beat_durations", updates: historyUpdates });
      } catch (error) {
        setBeats(beats);
        addToast(error instanceof Error ? error.message : "Failed to fit beat to visual content", "error");
      }
    },
    [beatMarkers, elements, beats, setBeats, timelineClient, addToast, setSelectedBeatId, recordHistoryEntry],
  );

  const moveBeatVisualsToBeatStart = useCallback(
    async (beatId: string) => {
      const result = calculateMoveBeatVisualsToStart(beatMarkers, elements, beatId);
      if (result.reason === "missing_beat") return;
      if (result.reason === "no_visuals") {
        addToast("No visual timeline elements found for this beat", "warning");
        return;
      }
      if (result.reason === "already_aligned" || !result.shiftedElements || !result.originalStarts || result.delta == null) {
        addToast("Visuals already start at the beat boundary", "warning");
        return;
      }
      const shiftedVisuals = elements.filter((element) => result.originalStarts.has(element.id));
      const patches = shiftedVisuals.map((element) => ({
        elementId: element.id,
        patch: { timeline_start: Number((element.timeline_start + result.delta!).toFixed(3)) },
      }));

      try {
        const updated = await patchElements(patches);
        if (!updated) return;
        addToast("Moved beat visuals to beat start", "success");
      } catch {
        addToast("Failed to move visuals to beat start", "error");
      }
    },
    [beatMarkers, elements, patchElements, addToast],
  );

  const addLane = useCallback(async (options?: { prepend?: boolean; sourceLaneKey?: string }) => {
    const allKeys = new Set<string>([...Object.keys(timelineState.laneElementIds), ...extraLaneKeys]);
    const sourceLaneKey = options?.sourceLaneKey ?? visualLaneKey(0);
    const beforeSnapshot = laneStructureSnapshot(laneOrderKeys, laneManualDeltaByKey);
    const key = isVisualLaneKey(sourceLaneKey)
      ? (() => {
        const numericKeys = [...allKeys]
          .filter(isVisualLaneKey)
          .map((laneKey) => laneStackIndex(laneKey));
        const nextIndex = numericKeys.length > 0 ? Math.max(...numericKeys) + 1 : 0;
        return visualLaneKey(nextIndex);
      })()
      : (() => {
        const familyKey = laneFamilyKey(sourceLaneKey);
        const familyKeys = [...allKeys].filter((laneKey) => laneFamilyKey(laneKey) === familyKey);
        const nextIndex = familyKeys.length > 0
          ? Math.max(...familyKeys.map((laneKey) => laneStackIndex(laneKey))) + 1
          : 1;
        return stackedLaneKey(sourceLaneKey, nextIndex);
      })();
    const nextKeys = options?.prepend
      ? [...new Set([key, ...laneOrderKeys])]
      : [...new Set([...laneOrderKeys, key])];

    setLaneOrderKeys(nextKeys);
    setExtraLaneKeys(new Set(nextKeys));

    try {
      const persistedKeys = await persistLaneOrderKeys(nextKeys, "Failed to save visual lane");
      setLaneOrderKeys(persistedKeys);
      setExtraLaneKeys(new Set(persistedKeys));
      recordHistoryEntry({
        type: "lane_structure",
        before: beforeSnapshot,
        after: laneStructureSnapshot(persistedKeys, laneManualDeltaByKey),
      });
      return key;
    } catch (error) {
      setLaneOrderKeys((prev) => prev.filter((existingKey) => existingKey !== key));
      setExtraLaneKeys((prev) => {
        const rollback = new Set(prev);
        rollback.delete(key);
        return rollback;
      });
      addToast(error instanceof Error ? error.message : "Failed to save visual lane", "error");
      return null;
    }
  }, [timelineState.laneElementIds, extraLaneKeys, laneOrderKeys, laneManualDeltaByKey, setLaneOrderKeys, setExtraLaneKeys, persistLaneOrderKeys, recordHistoryEntry, laneStructureSnapshot, addToast]);

  const deleteLane = useCallback(async (laneKey: string, options?: { deleteContents?: boolean }) => {
    if (laneKey === CAPTIONS_LANE_KEY) {
      addToast("The primary captions lane can't be deleted", "warning");
      return false;
    }

    const laneElementIds = [...(timelineState.laneElementIds[laneKey] ?? [])];
    if (laneElementIds.length > 0 && !(options?.deleteContents ?? false)) {
      addToast("Confirm lane deletion to remove its contents", "warning");
      return false;
    }

    const nextKeys = laneOrderKeys.filter((key) => key !== laneKey);
    const laneElements = elementsRef.current.filter((element) => element.lane_key === laneKey);
    const beforeSnapshot = laneStructureSnapshot(laneOrderKeys, laneManualDeltaByKey);
    const nextLaneManualDeltaByKey = Object.fromEntries(
      Object.entries(laneManualDeltaByKey).filter(([key, value]) => key !== laneKey && Number.isFinite(value)),
    );

    try {
      let latestTransitions: TimelineTransition[] | null = null;
      for (const element of laneElements) {
        const { response, body } = await timelineClient.deleteElement(element.id);
        if (!response.ok) {
          throw new Error(typeof body.error === "string" ? body.error : "Failed to delete lane contents");
        }
        if (body.transitions) latestTransitions = body.transitions;
      }

      setElements((prev) => prev.filter((element) => element.lane_key !== laneKey));
      setSelectedIds((prev) => prev.filter((id) => !laneElementIds.includes(id)));
      setLaneOrderKeys(nextKeys);
      setExtraLaneKeys(new Set(nextKeys));
      setLaneManualDeltaByKey(nextLaneManualDeltaByKey);
      if (latestTransitions) setTransitions(latestTransitions);

      const persistedKeys = await persistLaneOrderKeys(nextKeys, "Failed to delete lane");
      setLaneOrderKeys(persistedKeys);
      setExtraLaneKeys(new Set(persistedKeys));
      setLaneManualDeltaByKey(nextLaneManualDeltaByKey);
      recordHistoryEntry({
        type: "lane_structure",
        before: beforeSnapshot,
        after: laneStructureSnapshot(persistedKeys, nextLaneManualDeltaByKey),
        deletedElements: laneElements.map((element) => ({ ...element })),
      });
      addToast(
        laneElementIds.length > 0
          ? `Deleted lane and ${laneElementIds.length} clip${laneElementIds.length === 1 ? "" : "s"}`
          : "Deleted lane",
        "success",
      );
      return true;
    } catch (error) {
      requestRefresh();
      addToast(error instanceof Error ? error.message : "Failed to delete lane", "error");
      return false;
    }
  }, [timelineState.laneElementIds, laneOrderKeys, laneManualDeltaByKey, elementsRef, persistLaneOrderKeys, laneStructureSnapshot, recordHistoryEntry, setElements, setSelectedIds, setLaneOrderKeys, setExtraLaneKeys, setLaneManualDeltaByKey, setTransitions, requestRefresh, addToast]);

  const reorderLanes = useCallback((orderedLaneKeys: string[]) => {
    const nextKeys = [...new Set(orderedLaneKeys.filter((value): value is string => typeof value === "string"))];
    if (nextKeys.length === 0) return;
    if (nextKeys.join("|") === laneOrderKeys.join("|")) return;

    const previousKeys = laneOrderKeys;
    const beforeSnapshot = laneStructureSnapshot(previousKeys, laneManualDeltaByKey);
    setLaneOrderKeys(nextKeys);
    setExtraLaneKeys(new Set(nextKeys));

    void (async () => {
      try {
        const persistedKeys = await persistLaneOrderKeys(nextKeys, "Failed to reorder lanes");
        setLaneOrderKeys(persistedKeys);
        setExtraLaneKeys(new Set(persistedKeys));
        recordHistoryEntry({
          type: "lane_structure",
          before: beforeSnapshot,
          after: laneStructureSnapshot(persistedKeys, laneManualDeltaByKey),
        });
      } catch (error) {
        setLaneOrderKeys(previousKeys);
        setExtraLaneKeys(new Set(previousKeys));
        addToast(error instanceof Error ? error.message : "Failed to reorder lanes", "error");
      }
    })();
  }, [laneOrderKeys, laneManualDeltaByKey, setLaneOrderKeys, setExtraLaneKeys, persistLaneOrderKeys, laneStructureSnapshot, recordHistoryEntry, addToast]);

  const applyCaptionLaneStyleToLane = useCallback(
    async (laneKey: string, styleProps: Record<string, unknown>) => {
      const laneCaptionElements = elementsRef.current.filter(
        (element) => element.type === "caption_text" && element.lane_key === laneKey,
      );
      try {
        const { response, body } = await timelineClient.applyLaneDefaults(laneKey, styleProps);
        if (!response.ok) {
          addToast(typeof body.error === "string" ? body.error : "Failed to apply caption lane style", "error");
          return false;
        }
        const historyUpdates = laneCaptionElements.map((element) => {
          const currentProps = element.props && typeof element.props === "object" ? element.props : {};
          const currentText = typeof currentProps.text === "string" ? currentProps.text : "";
          return {
            elementId: element.id,
            beforeProps: { ...currentProps },
            afterProps: {
              ...currentProps,
              ...composeCaptionProps(currentText, {
                ...currentProps,
                ...styleProps,
              }),
            },
          };
        });
        setElements((prev) =>
          prev.map((element) => {
            if (element.type !== "caption_text" || element.lane_key !== laneKey) return element;
            const currentProps = element.props && typeof element.props === "object" ? element.props : {};
            const currentText = typeof currentProps.text === "string" ? currentProps.text : "";
            return {
              ...element,
              props: {
                ...currentProps,
                ...composeCaptionProps(currentText, {
                  ...currentProps,
                  ...styleProps,
                }),
              },
            };
          }),
        );
        if (historyUpdates.length > 0) {
          recordHistoryEntry({
            type: "caption_lane_style",
            laneKey,
            updates: historyUpdates,
          });
        }
        const updatedCount = typeof body.updated_count === "number" && Number.isFinite(body.updated_count) ? body.updated_count : 0;
        addToast(
          updatedCount === 0 ? "No captions on this lane to update" : `Applied lane style to ${updatedCount} caption${updatedCount === 1 ? "" : "s"}`,
          updatedCount === 0 ? "warning" : "success",
        );
        return true;
      } catch {
        addToast("Failed to apply caption lane style", "error");
        return false;
      }
    },
    [timelineClient, addToast, elementsRef, setElements, recordHistoryEntry],
  );

  return {
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
  };
}
