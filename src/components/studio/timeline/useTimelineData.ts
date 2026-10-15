"use client";
import { projectFrameRate, type ProjectFrameRate } from "@/lib/timeline/frame-quantization";
import { currentFrameRate, setEditorFrameRate } from "@/lib/timeline/frame-rate-scope";

import { PREVIEW_QUALITY_EVENT, PREVIEW_QUALITY_KEY } from "@/lib/preview-quality";
import { useCallback, useEffect, useRef, useState } from "react";

import { clampElementsToActualSourceDuration } from "./source-duration";
import { isAspectRatioValue } from "@/lib/aspect-ratios";
import { mergeRuntimePreviewProps } from "@/lib/timeline/runtime-preview-props";
import type {
  CharactersResponse,
  TimelineClient,
  TimelineResponse,
} from "./timeline-client";
import type {
  LaneDefaultsMap,
  LaneOrderKeys,
  TimelineAspectRatio,
  TimelineElement,
  TimelineTransition,
} from "./types";

type CharacterMap = Map<string, string>;
type ToastType = "success" | "error" | "warning";

export type SanitizedTimelineData = {
  elements: TimelineElement[];
  transitions: TimelineTransition[];
  beats: TimelineResponse["beats"] extends infer T ? NonNullable<T> : never;
  laneDefaults: LaneDefaultsMap;
  laneOrderKeys: LaneOrderKeys;
  mutedLaneKeys: string[];
  hiddenLaneKeys: string[];
  extraLaneKeys: Set<string>;
  hasAutoplaced: boolean;
  aspectRatio: TimelineAspectRatio;
  frameRate: ProjectFrameRate;
  characters: CharacterMap;
};

const DEFAULT_ASPECT_RATIO: TimelineAspectRatio = "9:16";

function isTimelineAspectRatio(value: string | undefined): value is TimelineAspectRatio {
  return isAspectRatioValue(value);
}

export function sanitizeTimelineLoadResult(
  timelineData: TimelineResponse,
  charData: CharactersResponse | Array<{ id?: string; name?: string }>,
): SanitizedTimelineData {
  const laneOrderKeys = Array.isArray(timelineData.lane_order_keys)
    ? [...new Set(timelineData.lane_order_keys.filter((value): value is string => typeof value === "string"))]
    : [];

  const characterMap: CharacterMap = new Map();
  const characterList = Array.isArray(charData)
    ? charData
    : Array.isArray(charData.characters)
      ? charData.characters
      : [];

  for (const character of characterList) {
    if (character.id && character.name) characterMap.set(character.id, character.name);
  }

  return {
    elements: clampElementsToActualSourceDuration(timelineData.elements ?? []),
    transitions: timelineData.transitions ?? [],
    beats: timelineData.beats ?? [],
    laneDefaults:
      timelineData.lane_defaults && typeof timelineData.lane_defaults === "object"
        ? timelineData.lane_defaults as LaneDefaultsMap
        : {},
    laneOrderKeys,
    mutedLaneKeys: Array.isArray(timelineData.muted_lane_keys)
      ? [...new Set(timelineData.muted_lane_keys.filter((value): value is string => typeof value === "string"))]
      : [],
    hiddenLaneKeys: Array.isArray(timelineData.hidden_lane_keys)
      ? [...new Set(timelineData.hidden_lane_keys.filter((value): value is string => typeof value === "string"))]
      : [],
    extraLaneKeys: new Set(laneOrderKeys),
    hasAutoplaced: timelineData.has_autoplaced ?? false,
    aspectRatio: isTimelineAspectRatio(timelineData.aspect_ratio) ? timelineData.aspect_ratio : DEFAULT_ASPECT_RATIO,
    frameRate: projectFrameRate({ frame_rate: timelineData.frame_rate }),
    characters: characterMap,
  };
}

type UseTimelineDataArgs = {
  timelineClient: TimelineClient;
  addToast: (message: string, type?: ToastType) => void;
};

export function useTimelineData({ timelineClient, addToast }: UseTimelineDataArgs) {
  const [elements, setElements] = useState<TimelineElement[]>([]);
  const [transitions, setTransitions] = useState<TimelineTransition[]>([]);
  const [beats, setBeats] = useState<SanitizedTimelineData["beats"]>([]);
  const [characters, setCharacters] = useState<CharacterMap>(new Map());
  const [laneDefaults, setLaneDefaults] = useState<LaneDefaultsMap>({});
  const [laneOrderKeys, setLaneOrderKeys] = useState<LaneOrderKeys>([]);
  const [mutedLaneKeys, setMutedLaneKeys] = useState<string[]>([]);
  const [hiddenLaneKeys, setHiddenLaneKeys] = useState<string[]>([]);
  const [extraLaneKeys, setExtraLaneKeys] = useState<Set<string>>(new Set());
  const [hasAutoplaced, setHasAutoplaced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [autoplacing, setAutoplacing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<TimelineAspectRatio>(DEFAULT_ASPECT_RATIO);
  const [frameRate, setFrameRateState] = useState<ProjectFrameRate>(currentFrameRate() as ProjectFrameRate);
  /** Frame helpers read the scoped rate during render, so apply it before React re-renders. */
  const applyFrameRate = useCallback((next: ProjectFrameRate) => { setEditorFrameRate(next); setFrameRateState(next); }, []);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (event: Event) => {
      if (event instanceof StorageEvent && event.key !== PREVIEW_QUALITY_KEY) return;
      try {
        const payload = await timelineClient.getTimeline();
        if (!cancelled) setElements(current => mergeRuntimePreviewProps(current, payload.elements ?? []));
      } catch { addToast("Could not change preview quality", "error"); }
    };
    window.addEventListener(PREVIEW_QUALITY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { cancelled = true; window.removeEventListener(PREVIEW_QUALITY_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, [timelineClient, addToast]);

  const preparingPreview = elements.some(element => {
    const preparation = element.props?.runtime_preview_preparation as { state?: string; upgrade_state?: string } | undefined;
    return preparation?.state === "preparing" || preparation?.upgrade_state === "preparing";
  });
  useEffect(() => {
    if (!preparingPreview) return;
    let cancelled = false;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const payload = await timelineClient.getTimeline();
        if (!cancelled) setElements(current => mergeRuntimePreviewProps(current, payload.elements ?? []));
      } catch { /* Preserve the mounted editor and retry next tick. */ }
      finally { pending = false; }
    }, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [preparingPreview, timelineClient]);

  // A clip just switched to Reverse needs its backward preview sound, prepared when the timeline is read.
  const awaitingReverseAudio = elements.filter(element => element.props?.playback_reverse === true
    && element.props?.runtime_source_has_audio !== false && !element.props?.runtime_preview_audio_reverse_source_url)
    .map(element => element.id).sort().join(",");
  const requestedReverseAudio = useRef(new Set<string>());
  useEffect(() => {
    const ids = awaitingReverseAudio ? awaitingReverseAudio.split(",").filter(id => !requestedReverseAudio.current.has(id)) : [];
    if (!ids.length) return;
    for (const id of ids) requestedReverseAudio.current.add(id);
    let cancelled = false;
    void timelineClient.getTimeline()
      .then(payload => { if (!cancelled) setElements(current => mergeRuntimePreviewProps(current, payload.elements ?? [])); })
      .catch(() => { /* Preview stays silent for this clip until the next timeline read. */ });
    return () => { cancelled = true; };
  }, [awaitingReverseAudio, timelineClient]);

  useEffect(() => {
    let cancelled = false;
    // Initial load owns the full-screen loading state. Later reconciliations
    // keep the mounted Player and warmed media alive while fresh data arrives.
    if (!hasLoadedRef.current) setLoading(true);

    const hasLoaded = hasLoadedRef.current;
    const load = hasLoaded
      ? timelineClient.getTimeline().then((timelineData) => [timelineData, null] as const)
      : Promise.all([timelineClient.getTimeline(), timelineClient.getCharacters()]);

    load
      .then(([timelineData, charData]) => {
        if (cancelled) return;
        const next = sanitizeTimelineLoadResult(timelineData, charData ?? []);
        setElements(next.elements);
        setTransitions(next.transitions);
        setBeats(next.beats);
        setLaneDefaults(next.laneDefaults);
        setLaneOrderKeys(next.laneOrderKeys);
        setMutedLaneKeys(next.mutedLaneKeys);
        setHiddenLaneKeys(next.hiddenLaneKeys);
        setExtraLaneKeys(next.extraLaneKeys);
        setHasAutoplaced(next.hasAutoplaced);
        setAspectRatio(next.aspectRatio);
        applyFrameRate(next.frameRate);
        // Character labels are project-static during ordinary timeline
        // reconciliation. Avoid refetching and rebuilding the map for every
        // agent-authored edit; a fresh mount still loads the current list.
        if (charData) setCharacters(next.characters);
        hasLoadedRef.current = true;
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        addToast("Failed to load timeline data", "error");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [timelineClient, refreshToken, addToast]);

  const requestRefresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  return {
    elements,
    setElements,
    transitions,
    setTransitions,
    beats,
    setBeats,
    characters,
    laneDefaults,
    setLaneDefaults,
    laneOrderKeys,
    setLaneOrderKeys,
    mutedLaneKeys,
    setMutedLaneKeys,
    hiddenLaneKeys,
    setHiddenLaneKeys,
    extraLaneKeys,
    setExtraLaneKeys,
    hasAutoplaced,
    setHasAutoplaced,
    loading,
    autoplacing,
    setAutoplacing,
    aspectRatio,
    setAspectRatio,
    frameRate,
    applyFrameRate,
    requestRefresh,
  };
}
