"use client";
import { hasShelfDragPayload, readShelfDragPayload } from "./shelf-drag";
import type { ElementCreatePayload } from "./asset-shelf-payloads";
import { TIMELINE_RULER_HEIGHT as RULER_HEIGHT } from "./timeline-geometry";
import {OverlayScrollbar} from "@/components/ui/overlay-scrollbar";
import { transitionJoinAvailability } from "./useTimelineTransitions";
import { speechLinkSourceId } from "./speech-sync-status";
import { videoAudioStatus } from "./video-audio-status";
import { TimelineRhythmRows, type TimelineRhythmView } from "./TimelineRhythmRows";
import { RHYTHM_ROWS_HEIGHT } from "./timeline-rhythm-rows";
import { resolveVideoPlaybackSource } from "@/lib/remotion/video-preview-source";

import { useId, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { timelineMaxZoom, MIN_ZOOM_LEVEL } from "./adapters";
import { clamp, resolveLaneHeightAnchoredScrollTop } from "./canvas-helpers";
import { drawTimelineRuler, drawTimelineScene } from "./draw-timeline-scene";
import { TimelineContextMenu } from "./TimelineContextMenu";
import {
  type BeatMenuBtnHitRegion,
  type BeatResizeHitRegion,
  type ClipHitRegion,
  type ContextMenuState,
  type EnvelopePointHitRegion,
  type EnvelopeSegmentHitRegion,
  type GainHitRegion,
  type GainKeyframeHitRegion,
  type LaneMenuBtnHitRegion,
  type LaneResizeHitRegion,
  type MenuBtnHitRegion,
  type MuteHitRegion,
  type SoloHitRegion,
  type HideHitRegion,
  type ResizeHitRegion,
  type TransitionHitRegion,
  type VisualKeyframeHitRegion,
} from "./timeline-hit-regions";
import {
  readVolumeEnvelopePoints,
  writeVolumeEnvelopePatch,
} from "@/lib/timeline/volume-envelope";
import {
  buildVideoPreviewFrameCacheKey,
  getVideoPreviewFrameCount,
  type ImageCacheEntry,
  type ResizeState,
  type SnapGuide,
  type ThemeColors,
} from "./timeline-canvas-model";
import { useCanvasTimelineInteractions } from "./use-canvas-timeline-interactions";
import type { LaneDef, TimelineBeatBand, TimelineElement, TimelineTransitionChip } from "./types";
import { getVideoHoldSegments } from "@/lib/timeline/media";
import { AUDIO_LANE_NARRATOR, CAPTIONS_LANE_KEY, MUSIC_LANE_KEY, SOUND_EFFECT_LANE_KEY } from "@/lib/timeline/lanes";
import { TimelineMarks } from "./TimelineMarks";
import type { FrameTag } from "@/lib/review/frame-tag-types";
import { compoundClipPresentationElements } from "@/lib/timeline/compound-clips";

import type { MusicalBeat, MusicalHit } from "@/lib/timeline/beat-annotations";
import { useKeyboardShortcuts } from "@/components/studio/hooks/useKeyboardShortcuts";
import { bindingMatches } from "@/lib/keyboard-shortcuts";
import { mediaTransportUrl } from "@/lib/loopback-transport";
import { thumbnailWorkKey, visibleThumbnailElements } from "./timeline-thumbnail-work";

const DEFAULT_SIDEBAR_WIDTH = 196;
const MIN_SIDEBAR_WIDTH = 120;
const MAX_SIDEBAR_WIDTH = 300;

const DIVIDER_HIT_HALF = 4;
/** Pixels a lane header must travel before a press becomes a lane drag. */
const LANE_DRAG_THRESHOLD = 4;
const CONTEXT_MENU_VIEWPORT_MARGIN = 8;
const HORIZONTAL_SCROLL_EPSILON_PX = 6;
const SCROLL_COMMIT_DELAY_MS = 120;
const VIDEO_PREVIEW_GENERATION_DELAY_MS = 200;

type Props = {
  rhythmView?: TimelineRhythmView;
  musicalBeats?: { markers: Array<MusicalBeat | MusicalHit>; snapTimes: number[]; referenceId?: string };
  lanes: LaneDef[];
  elements: TimelineElement[];
  transitionChips: TimelineTransitionChip[];
  beatMarkers: TimelineBeatBand[];
  mutedLanes: Set<string>;
  /** Tracks whose pictures/text are hidden from preview and export (eye toggle). */
  hiddenLanes?: Set<string>;
  onToggleLaneHidden?: (laneKey: string) => void;
  playheadSec: number;
  isPlaying?: boolean;
  reviewMarkers?: FrameTag[];
  totalDuration: number;
  playbackDuration?: number;
  visibleDuration: number;
  scrollSec: number;
  selectedIds: string[];
  selectedBeatId: string | null;
  selectedTransitionId: string | null;
  onSeek: (seconds: number) => void;
  onScrollSec: (seconds: number) => void;
  onZoomAt: (
    nextZoomLevel: number,
    anchorSec?: number,
    viewportScrollSec?: number,
  ) => void;
  /** Net wheel notches since the last frame: positive makes lanes taller. */
  onLaneZoom: (steps: number) => void;
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
  onMoveElement: (
    elementId: string,
    next: { timelineStart?: number; laneKey?: string },
  ) => void;
  onMoveElements: (elementIds: string[], deltaSec: number, laneDelta?: number) => void;
  onResizeElement: (
    elementId: string,
    next: { timelineStart?: number; duration?: number },
  ) => void;
  onResizeBeatBoundary: (beatId: string, edge: "start" | "end", boundarySec: number) => void;
  onFitBeatToVisualContent: (beatId: string) => void;
  onMoveBeatVisualsToBeatStart: (beatId: string) => void;
  snapEnabled: boolean;
  onResizeLane: (laneKey: string, nextHeight: number) => void;
  onDeleteElement: (elementId: string) => void;
  onToggleLock: (elementId: string, locked: boolean) => void;
  onSoloLane: (laneKey: string) => void;
  onToggleLaneLock: (laneKey: string, locked: boolean) => void;
  onSplitElement: (elementId: string, splitAtSec: number) => void;
  onDuplicateElement: (elementId: string) => void;
  onCopyElement: (elementId: string) => void;
  onCutElement: (elementId: string) => void;
  onPasteElement: (atSec: number) => void;
  hasClipboard: boolean;
  onToggleDisable: (elementId: string) => void;
  onOpenClipProperties?: (elementId: string, domain: "timing" | "position") => void;
  onCombineElements: (elementIds: string[]) => void;
  onPreparePresenterCompound?: (elementId: string) => void;
  onBreakApartCompoundClip: (elementId: string) => void;
  onPatchElement: (elementId: string, patch: Record<string, unknown>) => void;
  onAddLane: (sourceLaneKey?: string) => void;
  onCreateCaptionsLaneAbove: (laneKey: string) => void | Promise<unknown>;
  onDeleteLane: (laneKey: string) => void;
  onReorderLanes: (orderedLaneKeys: string[]) => void;
  onAddCaptionElement: (laneKey: string, atSec: number) => void;
  /** A Library, Music, Sounds, Captions or Text item dropped at a timeline time. */
  onDropElement?: (payload: ElementCreatePayload, atSec: number) => void;
  bottomInset?: number;
  externalResizeState?: ResizeState | null;
  externalSnapGuide?: SnapGuide | null;
  onPxPerSecChange?: (pxPerSec: number) => void;
  onViewportHeightChange?: (height: number) => void;
  /** Elements touched by the proposal option being previewed — tinted for review. */
  previewHighlightIds?: Set<string> | null;
  /** Clips checked proposals would add (drawn faint, not selectable) and live clips they would replace. */
  pendingElementIds?: ReadonlySet<string> | null;
  outgoingElementIds?: ReadonlySet<string> | null;
  /**
   * Draft-preview mode: the canvas shows a proposal's draft timeline while the
   * mutation callbacks still target the LIVE timeline by id. Blocks every
   * mutating pointer interaction (drag, resize, menus, selection); transport
   * scrubbing stays live.
   */
  readOnly?: boolean;
};

/**
 * The canvas reads its colours from CSS, so it follows the theme for free — but it was
 * reading the APP's tokens (`--color-bg-primary`, a warm cream/brown), which is why the
 * timeline stayed warm while the rest of the editor went neutral.
 *
 * It now reads the editor chrome ramp first and falls back to the app tokens, so the canvas
 * and the DOM chrome can never disagree about what colour the editor is.
 */
function readThemeColors(element?: Element | null): ThemeColors {
  const style = getComputedStyle(element ?? document.documentElement);
  const token = (name: string, legacy: string, fallback: string) =>
    style.getPropertyValue(name).trim() || style.getPropertyValue(legacy).trim() || fallback;

  return {
    background: token("--chrome-deep", "--color-bg-primary", "#212121"),
    raised: token("--chrome-raised", "--color-bg-secondary", "#424242"),
    border: token("--chrome-line", "--color-border", "rgba(255,255,255,0.10)"),
    divider: token("--timeline-lane-divider", "--chrome-line", "rgba(255,255,255,0.045)"),
    textPrimary: token("--ink", "--color-text-primary", "#f2f2f2"),
    textMuted: token("--ink-muted", "--color-text-muted", "#b2b2b2"),
    textLight: token("--ink-muted", "--color-text-light", "#b2b2b2"),
    selectedBg: token("--chrome-selected-bg", "--color-bg-secondary", "#424242"),
    selectedRing: token("--chrome-selected-ring", "--color-border", "rgba(255,255,255,0.32)"),
    clipInk: style.getPropertyValue("--timeline-clip-ink").trim() || "#fff",
    clipShade: Number.parseFloat(style.getPropertyValue("--timeline-clip-shade").trim() || "0.30"),
    pendingAlpha: Number.parseFloat(style.getPropertyValue("--timeline-pending-alpha").trim() || "0.45"),
    clipVisual: token("--timeline-clip-visual", "--chrome-raised", "#121e2a"),
    clipAudio: token("--timeline-clip-audio", "--chrome-raised", "#102522"),
    clipText: token("--timeline-clip-text", "--chrome-raised", "#211d2e"),
    // Without the token a camera clip falls back to the picture colour.
    clipCamera: style.getPropertyValue("--timeline-clip-camera").trim() || undefined,
    clipBorder: token("--timeline-clip-border", "--chrome-line-strong", "rgba(210,225,240,0.42)"),
    position: style.getPropertyValue("--timeline-position-color").trim() || "#e86550",
    reviewMarker: style.getPropertyValue("--timeline-review-marker-color").trim() || "#f4c95d",
  };
}

export function CanvasTimeline({
  rhythmView,
  musicalBeats = { markers: [], snapTimes: [] },
  lanes,
  elements,
  transitionChips,
  beatMarkers,
  mutedLanes,
  hiddenLanes,
  onToggleLaneHidden,
  playheadSec,
  isPlaying = false,
  reviewMarkers = [],
  totalDuration,
  playbackDuration = totalDuration,
  visibleDuration,
  scrollSec,
  selectedIds,
  selectedBeatId,
  selectedTransitionId,
  onSeek,
  onScrollSec,
  onZoomAt,
  onLaneZoom,
  onSelect,
  onClearSelection,
  onSetSelection,
  onSelectTransition,
  onCreateTransition,
  onSelectBeat,
  onToggleMute,
  onMoveElement,
  onMoveElements,
  onResizeElement,
  onResizeBeatBoundary,
  onFitBeatToVisualContent,
  onMoveBeatVisualsToBeatStart,
  snapEnabled,
  onResizeLane,
  onDeleteElement,
  onToggleLock,
  onSoloLane,
  onToggleLaneLock,
  onSplitElement,
  onDuplicateElement,
  onCopyElement,
  onCutElement,
  onPasteElement,
  hasClipboard,
  onToggleDisable,
  onOpenClipProperties,
  onCombineElements,
  onPreparePresenterCompound,
  onBreakApartCompoundClip,
  onPatchElement,
  onAddLane,
  onCreateCaptionsLaneAbove,
  onDeleteLane,
  onReorderLanes,
  onAddCaptionElement,
  onDropElement,
  bottomInset = 0,
  onViewportHeightChange,
  previewHighlightIds = null,
  pendingElementIds = null,
  outgoingElementIds = null,
  readOnly = false,
  externalResizeState = null,
  externalSnapGuide = null,
  onPxPerSecChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollSecRef = useRef(scrollSec);
  const scrollRafRef = useRef<number | null>(null);
  // Trackpad zoom emits far more events than frames. Accumulate them and commit once per
  // frame; each commit re-renders the editor, and stale per-event props would drop steps.
  const zoomTargetRef = useRef<number | null>(null);
  const zoomRafRef = useRef<number | null>(null);
  const laneStepsRef = useRef(0);
  const laneRafRef = useRef<number | null>(null);
  const scrollCommitTimerRef = useRef<number | null>(null);
  const [renderedScrollSec, setRenderedScrollSec] = useState(scrollSec);
  const wheelCallbacksRef = useRef({ onLaneZoom, onScrollSec, onZoomAt });
  const wheelMetricsRef = useRef({
    pxPerSec: 1,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    totalDuration,
    visibleDuration,
    playheadSec,
  });
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [ctxMenuPosition, setCtxMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [snapGuide, setSnapGuide] = useState<SnapGuide | null>(null);
  const [laneOrderOverride, setLaneOrderOverride] = useState<string[] | null>(null);
  const clipRegionsRef = useRef<ClipHitRegion[]>([]);
  const resizeRegionsRef = useRef<ResizeHitRegion[]>([]);
  const transitionRegionsRef = useRef<TransitionHitRegion[]>([]);
  const muteRegionsRef = useRef<MuteHitRegion[]>([]);
  const soloRegionsRef = useRef<SoloHitRegion[]>([]);
  const hideRegionsRef = useRef<HideHitRegion[]>([]);
  const laneResizeRegionsRef = useRef<LaneResizeHitRegion[]>([]);
  const laneMenuBtnRegionsRef = useRef<LaneMenuBtnHitRegion[]>([]);
  const menuBtnRegionsRef = useRef<MenuBtnHitRegion[]>([]);
  const beatMenuBtnRegionsRef = useRef<BeatMenuBtnHitRegion[]>([]);
  const beatResizeRegionsRef = useRef<BeatResizeHitRegion[]>([]);
  const gainRegionsRef = useRef<GainHitRegion[]>([]);
  const gainKeyframeRegionsRef = useRef<GainKeyframeHitRegion[]>([]);
  const visualKeyframeRegionsRef = useRef<VisualKeyframeHitRegion[]>([]);
  const envelopePointRegionsRef = useRef<EnvelopePointHitRegion[]>([]);
  const envelopeSegmentRegionsRef = useRef<EnvelopeSegmentHitRegion[]>([]);
  const playheadRegionRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const addLaneBtnRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [addLanePickerOpen, setAddLanePickerOpen] = useState(false);
  const addLanePickerRef = useRef<HTMLDivElement>(null);
  const [laneResizeState, setLaneResizeState] = useState<{
    laneKey: string;
    previewHeight: number;
  } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const themeRef = useRef<ThemeColors | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const imageCacheRef = useRef<Map<string, ImageCacheEntry>>(new Map());
  const previousLaneScrollLayoutsRef = useRef<Array<{ key: string; top: number; height: number }>>([]);

  wheelCallbacksRef.current = { onLaneZoom, onScrollSec, onZoomAt };

  useEffect(() => {
    // Parent-owned changes (zoom anchoring, reset, project load) still control
    // the viewport. Wheel panning itself stays local until the gesture settles
    // so it does not rerender the entire editor on every trackpad sample.
    if (scrollCommitTimerRef.current !== null) return;
    scrollSecRef.current = scrollSec;
    setRenderedScrollSec((current) => (
      Object.is(current, scrollSec) ? current : scrollSec
    ));
  }, [scrollSec]);

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    if (zoomRafRef.current !== null) cancelAnimationFrame(zoomRafRef.current);
    if (laneRafRef.current !== null) cancelAnimationFrame(laneRafRef.current);
    if (scrollCommitTimerRef.current !== null) {
      window.clearTimeout(scrollCommitTimerRef.current);
    }
  }, []);
  const [, setImageVersion] = useState(0);
  const orderedLanes = useMemo(() => {
    if (!laneOrderOverride || laneOrderOverride.length === 0) return lanes;
    const byKey = new Map(lanes.map((lane) => [lane.key, lane]));
    const ordered: LaneDef[] = [];
    for (const key of laneOrderOverride) {
      const lane = byKey.get(key);
      if (lane) ordered.push(lane);
    }
    for (const lane of lanes) {
      if (!laneOrderOverride.includes(lane.key)) ordered.push(lane);
    }
    return ordered;
  }, [laneOrderOverride, lanes]);

  // Lanes are layers: dragging a lane header up or down changes what draws in front.
  const [laneDrag, setLaneDrag] = useState<{ laneKey: string; startY: number; y: number } | null>(null);
  const laneDragRef = useRef(laneDrag);
  laneDragRef.current = laneDrag;
  const moveLaneTo = useCallback((laneKey: string, dropIndex: number) => {
    const laneKeys = orderedLanes.map((lane) => lane.key);
    const from = laneKeys.indexOf(laneKey);
    if (from < 0) return;
    const to = dropIndex > from ? dropIndex - 1 : dropIndex;
    if (to === from) return;
    const nextLaneKeys = laneKeys.filter((key) => key !== laneKey);
    nextLaneKeys.splice(to, 0, laneKey);
    setLaneOrderOverride(nextLaneKeys);
    onReorderLanes(nextLaneKeys);
  }, [onReorderLanes, orderedLanes]);

  const moveLane = useCallback((laneKey: string, direction: -1 | 1) => {
    const laneKeys = orderedLanes.map((lane) => lane.key);
    const laneIndex = laneKeys.indexOf(laneKey);
    const swapIndex = laneIndex + direction;
    if (laneIndex < 0 || swapIndex < 0 || swapIndex >= laneKeys.length) return;

    const nextLaneKeys = [...laneKeys];
    [nextLaneKeys[laneIndex], nextLaneKeys[swapIndex]] = [nextLaneKeys[swapIndex], nextLaneKeys[laneIndex]];
    setLaneOrderOverride(nextLaneKeys);

    onReorderLanes(nextLaneKeys);
  }, [onReorderLanes, orderedLanes]);

  // Cache theme colors — read from container so inherited/inline CSS vars are picked up
  useEffect(() => {
    const node = containerRef.current;
    const refreshTheme = () => {
      const next = readThemeColors(node);
      if (JSON.stringify(next) === JSON.stringify(themeRef.current)) return;
      themeRef.current = next;
      setThemeRevision((revision) => revision + 1);
    };
    refreshTheme();
    const observer = new MutationObserver(refreshTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-editor-theme"] });
    if (node) {
      observer.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
    }
    // Stylesheet updates can change inherited tokens without changing the theme
    // attribute. Refresh the canvas too, including other open editor tabs.
    let themeFrame: number | undefined;
    const scheduleThemeRefresh = () => {
      if (themeFrame !== undefined) cancelAnimationFrame(themeFrame);
      themeFrame = requestAnimationFrame(() => {
        themeFrame = undefined;
        refreshTheme();
      });
    };
    const stylesheetObserver = new MutationObserver(scheduleThemeRefresh);
    stylesheetObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "media", "disabled"],
    });
    document.head.addEventListener("load", scheduleThemeRefresh, true);
    return () => {
      observer.disconnect();
      stylesheetObserver.disconnect();
      document.head.removeEventListener("load", scheduleThemeRefresh, true);
      if (themeFrame !== undefined) cancelAnimationFrame(themeFrame);
    };
  }, []);

  const draggingIdsRef = useRef<Set<string>>(new Set());

  const thumbnailElements = useMemo(
    () => visibleThumbnailElements(elements, Math.max(0, renderedScrollSec - 2), renderedScrollSec + visibleDuration + 2),
    [elements, renderedScrollSec, visibleDuration],
  );
  const thumbnailKey = useMemo(() => thumbnailWorkKey(thumbnailElements), [thumbnailElements]);
  const thumbnailElementsRef = useRef(thumbnailElements);
  thumbnailElementsRef.current = thumbnailElements;

  useEffect(() => {
    // Thumbnail extraction seeks its own video decoders. On a media-heavy edit
    // those decoders compete with the Player and can stop its frame clock.
    // Keep this work to the visible timeline and do it only while paused.
    if (isPlaying) return;
    let cancelled = false;
    let activeVideo: HTMLVideoElement | null = null;
    const pendingKeys = new Set<string>();
    const visibleElements = thumbnailElementsRef.current;
    const timeoutId = window.setTimeout(() => {
    const loadStill = (url: string) => {
      if (imageCacheRef.current.has(url)) return;
      imageCacheRef.current.set(url, { status: "loading", drawable: null });
      const image = new Image();
      image.onload = () => {
        imageCacheRef.current.set(url, { status: "ready", drawable: image });
        setImageVersion((value) => value + 1);
      };
      image.onerror = () => {
        imageCacheRef.current.set(url, { status: "error", drawable: null });
      };
      image.src = url;
    };

    const loadVideoPreviewFrames = (element: TimelineElement, done: () => void) => {
      if (!element.source_url || cancelled) { done(); return; }
      const previewSource = resolveVideoPlaybackSource(element, element.source_url, false);
      if (!previewSource || draggingIdsRef.current.has(element.id)) { done(); return; }
      const previewFrameCount = getVideoPreviewFrameCount(element.duration);
      const previewKeys = Array.from({ length: previewFrameCount }, (_, index) =>
        buildVideoPreviewFrameCacheKey(element.source_url!, index, {
          trimStart: element.trim_start,
          trimEnd: element.trim_end,
          playbackRate: element.playback_rate,
          duration: element.duration,
        }),
      );
      const missingKeys = previewKeys.filter((key) => !imageCacheRef.current.has(key));
      if (missingKeys.length === 0) { done(); return; }
      for (const key of missingKeys) {
        imageCacheRef.current.set(key, { status: "loading", drawable: null });
        pendingKeys.add(key);
      }

      const video = document.createElement("video");
      activeVideo = video;
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";

      const { playableDuration } = getVideoHoldSegments(element);
      const playbackRate = element.playback_rate > 0 ? element.playback_rate : 1;
      const playableSourceDuration = Math.max(0.001, playableDuration * playbackRate);
      const sampleTimes = Array.from({ length: previewFrameCount }, (_, index) => {
        const fraction = (index + 0.5) / previewFrameCount;
        return Number((element.trim_start + playableSourceDuration * fraction).toFixed(3));
      });

      const captureAtIndex = (sampleIndex: number) => {
        if (cancelled) return;
        if (sampleIndex >= sampleTimes.length) {
          activeVideo = null;
          video.removeAttribute("src");
          video.load();
          done();
          return;
        }
        const time = sampleTimes[sampleIndex]!;
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          if (cancelled) return;
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (width <= 0 || height <= 0) {
            imageCacheRef.current.set(previewKeys[sampleIndex]!, { status: "error", drawable: null });
            captureAtIndex(sampleIndex + 1);
            return;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            imageCacheRef.current.set(previewKeys[sampleIndex]!, { status: "error", drawable: null });
            captureAtIndex(sampleIndex + 1);
            return;
          }
          ctx.drawImage(video, 0, 0, width, height);
          imageCacheRef.current.set(previewKeys[sampleIndex]!, { status: "ready", drawable: canvas });
          pendingKeys.delete(previewKeys[sampleIndex]!);
          setImageVersion((value) => value + 1);
          captureAtIndex(sampleIndex + 1);
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        const mediaDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : time;
        video.currentTime = Math.min(Math.max(0, time), Math.max(0, mediaDuration - 0.001));
      };

      video.addEventListener(
        "loadedmetadata",
        () => {
          captureAtIndex(0);
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          if (cancelled) return;
          for (const key of previewKeys) {
            imageCacheRef.current.set(key, { status: "error", drawable: null });
            pendingKeys.delete(key);
          }
          activeVideo = null;
          done();
        },
        { once: true },
      );
      video.src = mediaTransportUrl(previewSource);
      video.load();
    };

    for (const element of visibleElements) {
      if (element.type === "still" && typeof element.source_url === "string" && element.source_url.length > 0) {
        loadStill(element.source_url);
      }
      if (typeof element.props?.overflow_hold_frame_url === "string" && element.props.overflow_hold_frame_url.length > 0) {
        loadStill(element.props.overflow_hold_frame_url);
      }
      if (typeof element.props?.overflow_hold_start_frame_url === "string" && element.props.overflow_hold_start_frame_url.length > 0) {
        loadStill(element.props.overflow_hold_start_frame_url);
      }
    }
    const videos = visibleElements.filter((element) => element.type === "video_clip"
      && typeof element.source_url === "string" && element.source_url.length > 0);
    const loadNextVideo = (index: number) => {
      if (cancelled || index >= videos.length) return;
      loadVideoPreviewFrames(videos[index]!, () => loadNextVideo(index + 1));
    };
    loadNextVideo(0);
    }, VIDEO_PREVIEW_GENERATION_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (activeVideo) {
        activeVideo.pause();
        activeVideo.removeAttribute("src");
        activeVideo.load();
      }
      for (const key of pendingKeys) {
        if (imageCacheRef.current.get(key)?.status === "loading") imageCacheRef.current.delete(key);
      }
    };
    // Keyed on what would be fetched, not on each new elements array (see thumbnailWorkKey).
  }, [isPlaying, thumbnailKey]);

  const presentationElements = useMemo(
    () => compoundClipPresentationElements(elements),
    [elements],
  );

  const itemsByLane = useMemo(() => {
    const map = new Map<string, TimelineElement[]>();
    for (const element of presentationElements) {
      const laneElements = map.get(element.lane_key) ?? [];
      laneElements.push(element);
      map.set(element.lane_key, laneElements);
    }
    for (const [key, laneElements] of map) {
      laneElements.sort((a, b) => a.timeline_start - b.timeline_start);
      map.set(key, laneElements);
    }
    return map;
  }, [presentationElements]);

  const elementById = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );

  const beatLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const beat of beatMarkers) {
      map.set(beat.id, beat.beat_label);
    }
    return map;
  }, [beatMarkers]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const nextWidth = Math.round(width);
      const nextHeight = Math.round(height);
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const contentWidth = Math.max(1, size.width - sidebarWidth);
  const pxPerSec = contentWidth / Math.max(visibleDuration, 1);
  const viewportEndSec = renderedScrollSec + visibleDuration;

  wheelMetricsRef.current = {
    pxPerSec,
    sidebarWidth,
    totalDuration,
    visibleDuration,
    playheadSec,
  };

  useEffect(() => {
    onPxPerSecChange?.(pxPerSec);
  }, [onPxPerSecChange, pxPerSec]);

  useEffect(() => {
    onViewportHeightChange?.(size.height);
  }, [onViewportHeightChange, size.height]);
  const [rhythmHeight, setRhythmHeight] = useState(RHYTHM_ROWS_HEIGHT);
  useEffect(() => setRhythmHeight(RHYTHM_ROWS_HEIGHT), [rhythmView?.clip.id]);
  const laneLayouts = useMemo(
    () =>
      orderedLanes.reduce<Array<{ lane: LaneDef; top: number; bottom: number; height: number }>>(
        (layouts, lane) => {
          const previous = layouts.at(-1);
          const top = (previous?.bottom ?? RULER_HEIGHT) + (rhythmView && previous?.lane.key === rhythmView.clip.lane_key ? rhythmHeight : 0);
          const height =
            laneResizeState?.laneKey === lane.key
              ? clamp(laneResizeState.previewHeight, lane.minHeight, lane.maxHeight)
              : lane.height;
          layouts.push({
            lane,
            top,
            bottom: top + height,
            height,
          });
          return layouts;
        },
        [],
      ),
    [laneResizeState, orderedLanes, rhythmView?.clip.lane_key, rhythmHeight],
  );

  // Where a dragged lane would land: before the lane whose middle is below the pointer. Picture
  // lanes and sound lanes are separate groups, so a lane only moves within its own group.
  const laneDropIndex = useMemo(() => {
    if (!laneDrag || Math.abs(laneDrag.y - laneDrag.startY) < LANE_DRAG_THRESHOLD) return null;
    const isPicture = (lane: LaneDef) => lane.type === "visual" || lane.type === "captions";
    const dragged = laneLayouts.find((layout) => layout.lane.key === laneDrag.laneKey);
    if (!dragged) return null;
    const group = laneLayouts.map((layout, index) => ({ layout, index })).filter(({ layout }) => isPicture(layout.lane) === isPicture(dragged.lane));
    const target = group.find(({ layout }) => laneDrag.y < layout.top + layout.height / 2);
    return target ? target.index : group.at(-1)!.index + 1;
  }, [laneDrag, laneLayouts]);
  const laneDropIndexRef = useRef(laneDropIndex);
  laneDropIndexRef.current = laneDropIndex;
  const laneDropY = laneDropIndex == null ? null : (laneLayouts[laneDropIndex]?.top ?? laneLayouts[laneDropIndex - 1]?.bottom ?? null);

  const rhythmLayout = rhythmView ? laneLayouts.find(layout => layout.lane.key === rhythmView.clip.lane_key) : undefined;
  const laneFooterGap = rhythmLayout && rhythmLayout === laneLayouts.at(-1) ? rhythmHeight : 0;
  const canvasContentHeight =
    (laneLayouts.at(-1)?.bottom ?? RULER_HEIGHT) + laneFooterGap
    + 42
    + Math.max(0, bottomInset);
  const canvasHeight = Math.max(canvasContentHeight, size.height);

  useLayoutEffect(() => {
    const nextLayouts = laneLayouts.map((layout) => ({
      key: layout.lane.key,
      top: layout.top,
      height: layout.height,
    }));
    const container = containerRef.current;
    if (container) {
      const nextScrollTop = resolveLaneHeightAnchoredScrollTop({
        scrollTop: container.scrollTop,
        viewportHeight: container.clientHeight,
        rulerHeight: RULER_HEIGHT,
        contentHeight: canvasHeight,
        previousLayouts: previousLaneScrollLayoutsRef.current,
        nextLayouts,
      });
      if (Math.abs(nextScrollTop - container.scrollTop) >= 0.5) {
        container.scrollTop = nextScrollTop;
      }
    }
    previousLaneScrollLayoutsRef.current = nextLayouts;
  }, [canvasHeight, laneLayouts]);

  const isOverPlayhead = useCallback((x: number, y: number) => {
    const region = playheadRegionRef.current;
    if (!region) return false;
    const centerX = region.x + region.width / 2;
    // Top 24px: wide grab zone (±14px around center for the triangle head)
    if (y <= 24) return Math.abs(x - centerX) <= 14;
    // Below: narrower grab zone (±6px around the line)
    return Math.abs(x - centerX) <= 6;
  }, []);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const seconds = clamp(renderedScrollSec + (x - sidebarWidth) / pxPerSec, 0, totalDuration);
      onSeek(seconds);
    },
    [onSeek, pxPerSec, renderedScrollSec, totalDuration],
  );

  // A committed zoom (or a toolbar change) becomes the new base for the next wheel gesture.
  useEffect(() => { if (zoomRafRef.current === null) zoomTargetRef.current = null; }, [visibleDuration, totalDuration]);
  const [dropSec, setDropSec] = useState<number | null>(null);
  const secondsFromClientX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const x = clientX - canvas.getBoundingClientRect().left;
    if (x < sidebarWidth) return null;
    return clamp(renderedScrollSec + (x - sidebarWidth) / pxPerSec, 0, Math.max(totalDuration, renderedScrollSec + visibleDuration));
  }, [pxPerSec, renderedScrollSec, sidebarWidth, totalDuration, visibleDuration]);
  const dropHandlers = onDropElement ? {
    onDragOver: (event: React.DragEvent) => {
      if (!hasShelfDragPayload(event)) return;
      const seconds = secondsFromClientX(event.clientX);
      if (seconds == null) { setDropSec(null); return; }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDropSec(seconds);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropSec(null);
    },
    onDrop: (event: React.DragEvent) => {
      setDropSec(null);
      const payload = hasShelfDragPayload(event) ? readShelfDragPayload(event) : null;
      const seconds = secondsFromClientX(event.clientX);
      if (!payload || seconds == null) return;
      event.preventDefault();
      onDropElement(payload, Number(seconds.toFixed(3)));
    },
  } : {};

  // Wheel handler attached as a non-passive native listener so that
  // preventDefault() actually works — React onWheel is passive by default,
  // which lets macOS horizontal-swipe-to-navigate fire before we can stop it.
  const handleWheel = useCallback((event: WheelEvent) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;
    const {
      totalDuration: currentTotalDuration,
      visibleDuration: currentVisibleDuration,
    } = wheelMetricsRef.current;
    const { onScrollSec: currentOnScrollSec } = wheelCallbacksRef.current;
    const currentScrollSec = scrollSecRef.current;

    // Ctrl/Cmd + wheel = zoom (always intercept)
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const currentZoom = zoomTargetRef.current ?? currentTotalDuration / Math.max(currentVisibleDuration, 1);
      const nextZoomLevel = event.deltaY < 0 ? currentZoom * 1.08 : currentZoom / 1.08;
      zoomTargetRef.current = Number(clamp(nextZoomLevel, MIN_ZOOM_LEVEL, timelineMaxZoom(currentTotalDuration)).toFixed(3));
      if (zoomRafRef.current === null) {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = null;
          const target = zoomTargetRef.current;
          if (target != null) wheelCallbacksRef.current.onZoomAt(target, wheelMetricsRef.current.playheadSec, scrollSecRef.current);
        });
      }
      return;
    }

    // Alt/Option + wheel = global lane height zoom.
    if (event.altKey) {
      event.preventDefault();
      if (event.deltaY !== 0) laneStepsRef.current += event.deltaY > 0 ? -1 : 1;
      if (laneRafRef.current === null) {
        laneRafRef.current = requestAnimationFrame(() => {
          laneRafRef.current = null;
          const steps = laneStepsRef.current;
          laneStepsRef.current = 0;
          if (steps !== 0) wheelCallbacksRef.current.onLaneZoom(steps);
        });
      }
      return;
    }

    // Shift + wheel or horizontal scroll = timeline pan (intercept)
    const absDeltaX = Math.abs(event.deltaX);
    const absDeltaY = Math.abs(event.deltaY);
    const hasVerticalOverflow = container
      ? container.scrollHeight > container.clientHeight + 1
      : false;
    const shouldUseVerticalForHorizontalPan =
      !hasVerticalOverflow && !event.shiftKey && absDeltaY > HORIZONTAL_SCROLL_EPSILON_PX && absDeltaY >= absDeltaX;
    const isHorizontal =
      event.shiftKey
      || (absDeltaX > HORIZONTAL_SCROLL_EPSILON_PX && absDeltaX > absDeltaY)
      || shouldUseVerticalForHorizontalPan;
    if (isHorizontal) {
      event.preventDefault();
      const delta = shouldUseVerticalForHorizontalPan
        ? event.deltaY
        : event.shiftKey
          ? (absDeltaY >= absDeltaX ? event.deltaY : event.deltaX)
          : event.deltaX;
      const deltaSec = (delta / 120) * Math.max(0.5, currentVisibleDuration * 0.08);
      const nextScrollSec = clamp(
        currentScrollSec + deltaSec,
        0,
        Math.max(0, currentTotalDuration - currentVisibleDuration),
      );
      // Track wheel deltas synchronously. React may batch several high-frequency
      // trackpad events before the scrollSec prop rerenders; reading only the
      // closed-over prop makes those events overwrite one another and produces
      // a resistant/jittery horizontal pan.
      scrollSecRef.current = nextScrollSec;
      // Commit at most once per animation frame. A trackpad can emit wheel
      // events much faster than the canvas can redraw; rerendering the whole
      // editor for every raw event also starves Remotion's playback clock.
      if (scrollRafRef.current === null) {
        scrollRafRef.current = requestAnimationFrame(() => {
          scrollRafRef.current = null;
          setRenderedScrollSec((current) => (
            Object.is(current, scrollSecRef.current) ? current : scrollSecRef.current
          ));
        });
      }
      if (scrollCommitTimerRef.current !== null) {
        window.clearTimeout(scrollCommitTimerRef.current);
      }
      scrollCommitTimerRef.current = window.setTimeout(() => {
        scrollCommitTimerRef.current = null;
        currentOnScrollSec(scrollSecRef.current);
      }, SCROLL_COMMIT_DELAY_MS);
      return;
    }
  }, []);

  const handleTrimScroll = useCallback((seconds: number) => {
    scrollSecRef.current = seconds;
    setRenderedScrollSec(seconds);
    if (scrollCommitTimerRef.current !== null) window.clearTimeout(scrollCommitTimerRef.current);
    scrollCommitTimerRef.current = window.setTimeout(() => {
      scrollCommitTimerRef.current = null;
      wheelCallbacksRef.current.onScrollSec(scrollSecRef.current);
    }, SCROLL_COMMIT_DELAY_MS);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const {
    beatResizeState,
    dragState,
    handleContextMenu,
    handlePointerDown,
    handlePointerLeave,
    handlePointerMove,
    hoverCursor,
    hoveredClipId,
    hoveredTransitionId,
    setTransitionHover,
    marqueeState,
    resizeState,
    scrubbing,
    envelopePointDragState,
    envelopeSegmentDragState,
    selectedEnvelopePoint,
    setSelectedEnvelopePoint,
  } = useCanvasTimelineInteractions({
    musicalBeatTimes: musicalBeats.snapTimes,
    musicalBeatReferenceId: musicalBeats.referenceId,
    canvasRef,
    addLaneBtnRef,
    clipRegionsRef,
    resizeRegionsRef,
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
    transitionRegionsRef,
    beatMarkers,
    elements,
    elementById,
    lanes: orderedLanes,
    laneLayouts,
    playheadSec,
    selectedBeatId,
    pxPerSec,
    scrollSec: renderedScrollSec,
    onTrimScroll: handleTrimScroll,
    totalDuration,
    snapEnabled,
    isOverPlayhead,
    seekFromClientX,
    onSeek,
    selectedIds,
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
    onAddLane: useCallback(() => setAddLanePickerOpen(true), []),
    onResizeLane,
    onPatchElement,
    setSnapGuide,
    setCtxMenu,
    sidebarWidth,
    laneResizeState,
    setLaneResizeState,
    readOnly,
  });
  const effectiveResizeState = externalResizeState ?? resizeState;
  const effectiveSnapGuide = externalSnapGuide ?? snapGuide;

  // Sync dragging IDs ref so the image-loading effect (above) can skip
  // video-frame extraction for clips that are actively being dragged/resized.
  useEffect(() => {
    const ids = new Set<string>();
    if (dragState) for (const id of dragState.draggedElementIds) ids.add(id);
    if (resizeState) ids.add(resizeState.elementId);
    draggingIdsRef.current = ids;
  }, [dragState, resizeState]);

  useEffect(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas || size.width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(RULER_HEIGHT * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${RULER_HEIGHT}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, RULER_HEIGHT);

    const theme = themeRef.current ?? readThemeColors(containerRef.current);
    drawTimelineRuler({
      ctx,
      size: {
        width: size.width,
        height: RULER_HEIGHT,
      },
      theme,
      beatMarkers,
      selectedBeatId,
      beatResizeState,
      beatMenuBtnRegions: beatMenuBtnRegionsRef.current,
      beatResizeRegions: beatResizeRegionsRef.current,
      scrollSec: renderedScrollSec,
      viewportEndSec,
      pxPerSec,
      playheadSec,
      sidebarWidth,
      collectRegions: false,
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(sidebarWidth, 0, Math.max(0, size.width - sidebarWidth), RULER_HEIGHT);
    ctx.clip();
    const markerStyles = {
      beat: { color: "#59d6cf", height: 12, width: 1.5 },
      drum: { color: "#f59e0b", height: 10, width: 2 },
      synth: { color: "#c084fc", height: 8, width: 2 },
      other: { color: "#94a3b8", height: 6, width: 1.5 },
      bass: { color: "#5eead4", height: 10, width: 2 },
      accompaniment: { color: "#c4b5fd", height: 10, width: 2 },
      vocal: { color: "#f9a8d4", height: 10, width: 2 },
    } as const;
    const lastXByKind = new Map<string, number>();
    for (const beat of musicalBeats.markers) {
      if (beat.time < renderedScrollSec || beat.time > viewportEndSec) continue;
      const x = sidebarWidth + (beat.time - renderedScrollSec) * pxPerSec;
      if (x - (lastXByKind.get(beat.kind) ?? -Infinity) < 3) continue;
      const style = markerStyles[beat.kind];
      ctx.fillStyle = style.color;
      ctx.globalAlpha = beat.kind === "beat" ? 1 : 0.5 + beat.confidence * 0.5;
      ctx.fillRect(x - style.width / 2, RULER_HEIGHT - style.height - 2, style.width, style.height);
      ctx.globalAlpha = 1;
      lastXByKind.set(beat.kind, x);
    }
    ctx.restore();
  }, [
    beatMarkers,
    beatResizeState,
    playheadSec,
    pxPerSec,
    reviewMarkers,
    musicalBeats.markers,
    themeRevision,
    renderedScrollSec,
    selectedBeatId,
    sidebarWidth,
    size.width,
    viewportEndSec,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${canvasHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, canvasHeight);

    const theme = themeRef.current ?? readThemeColors(containerRef.current);
      drawTimelineScene({
        ctx,
        size: {
          width: size.width,
          height: canvasHeight,
        },
        theme,
        elementById,
        beatMarkers,
      transitionChips,
      mutedLanes,
      hiddenLanes,
      previewHighlightIds,
      pendingElementIds,
      outgoingElementIds,
      playheadSec,
      scrollSec: renderedScrollSec,
      pxPerSec,
      viewportEndSec,
      contentWidth,
      laneLayouts,
      laneFooterGap,
      itemsByLane,
      beatLabelById,
      selectedIds,
      selectedBeatId,
      selectedTransitionId,
      selectedEnvelopePoint,
      dragState,
      resizeState: effectiveResizeState,
      beatResizeState,
      envelopePointDragState,
      envelopeSegmentDragState,
      marqueeState,
      hoveredClipId,
      hoveredTransitionId,
      snapGuide: effectiveSnapGuide,
      imageCache: imageCacheRef.current,
      clipRegions: clipRegionsRef.current,
      resizeRegions: resizeRegionsRef.current,
      transitionRegions: transitionRegionsRef.current,
      muteRegions: muteRegionsRef.current,
      soloRegions: soloRegionsRef.current,
      hideRegions: hideRegionsRef.current,
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
      addLaneButtonRectRef: addLaneBtnRef,
      playheadRegionRef,
      sidebarWidth,
    });
  }, [
    beatLabelById,
    beatMarkers,
    beatResizeState,
    canvasHeight,
    contentWidth,
    themeRevision,
    dragState,
    elementById,
    elements,
    sidebarWidth,
    transitionChips,
    envelopePointDragState,
    envelopeSegmentDragState,
    selectedEnvelopePoint,
    marqueeState,
    hoveredClipId,
    hoveredTransitionId,
    itemsByLane,
    laneLayouts,
    mutedLanes,
    hiddenLanes,
    previewHighlightIds,
    pendingElementIds,
    outgoingElementIds,
    playheadSec,
    pxPerSec,
    effectiveResizeState,
    renderedScrollSec,
    selectedBeatId,
    selectedTransitionId,
    selectedIds,
    size.height,
    size.width,
    effectiveSnapGuide,
    viewportEndSec,
  ]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (selectedIds.length !== 1) return;

    const selectedRegion = clipRegionsRef.current.find((region) => region.elementId === selectedIds[0]);
    if (!selectedRegion) return;

    const topMargin = RULER_HEIGHT + 12;
    const bottomMargin = Math.max(16, bottomInset + 12);
    const viewportTop = container.scrollTop + topMargin;
    const viewportBottom = container.scrollTop + container.clientHeight - bottomMargin;
    const regionTop = selectedRegion.y;
    const regionBottom = selectedRegion.y + selectedRegion.height;

    if (regionBottom > viewportBottom) {
      const nextScrollTop = regionBottom - container.clientHeight + bottomMargin;
      container.scrollTo({ top: Math.max(0, nextScrollTop), behavior: "smooth" });
      return;
    }

    if (regionTop < viewportTop) {
      const nextScrollTop = regionTop - topMargin;
      container.scrollTo({ top: Math.max(0, nextScrollTop), behavior: "smooth" });
    }
  }, [bottomInset, selectedIds, size.height, size.width]);

  // Delete handler for selected envelope point (new model). Capture phase: the point is deleted, not
  // also the clip it sits on (TimelineStep's delete handler skips a prevented event).
  const deleteKey = useKeyboardShortcuts().delete;
  useEffect(() => {
    if (!selectedEnvelopePoint) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!bindingMatches(event, deleteKey)) return;
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (event.target.isContentEditable) return;
      }
      const element = elementById.get(selectedEnvelopePoint.elementId);
      if (!element) return;
      const envelope = readVolumeEnvelopePoints(element, element.duration);
      // Endpoints (first/last) are not deletable
      if (selectedEnvelopePoint.pointIndex === 0 || selectedEnvelopePoint.pointIndex >= envelope.length - 1) return;
      event.preventDefault();
      const nextEnvelope = envelope.filter((_, index) => index !== selectedEnvelopePoint.pointIndex);
      const patch = writeVolumeEnvelopePatch(element, nextEnvelope, element.duration);
      onPatchElement(element.id, patch);
      setSelectedEnvelopePoint(null);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [deleteKey, elementById, onPatchElement, selectedEnvelopePoint, setSelectedEnvelopePoint]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCtxMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const menu = ctxMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) {
        return;
      }
      setCtxMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [ctxMenu]);

  useLayoutEffect(() => {
    if (!ctxMenu) return;

    const updatePosition = () => {
      const menu = ctxMenuRef.current;
      if (!menu) return;
      const maxLeft = Math.max(
        CONTEXT_MENU_VIEWPORT_MARGIN,
        window.innerWidth - menu.offsetWidth - CONTEXT_MENU_VIEWPORT_MARGIN,
      );
      const maxTop = Math.max(
        CONTEXT_MENU_VIEWPORT_MARGIN,
        window.innerHeight - menu.offsetHeight - CONTEXT_MENU_VIEWPORT_MARGIN,
      );
      setCtxMenuPosition({
        left: clamp(ctxMenu.x, CONTEXT_MENU_VIEWPORT_MARGIN, maxLeft),
        top: clamp(ctxMenu.y, CONTEXT_MENU_VIEWPORT_MARGIN, maxTop),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [ctxMenu]);

  // ── Sidebar divider drag ──────────────────────────────────────────────────

  const isNearDivider = useCallback(
    (x: number) => Math.abs(x - sidebarWidth) <= DIVIDER_HIT_HALF,
    [sidebarWidth],
  );

  /** The lane whose header is under the pointer, unless a header button or resize edge is. */
  const laneHeaderAt = useCallback((x: number, y: number) => {
    if (readOnly || x >= sidebarWidth || isOverPlayhead(x, y)) return undefined;
    const inSquare = (region: { x: number; y: number; size: number }) => x >= region.x && x <= region.x + region.size && y >= region.y && y <= region.y + region.size;
    const onControl = [...muteRegionsRef.current, ...soloRegionsRef.current, ...hideRegionsRef.current, ...laneMenuBtnRegionsRef.current].some(inSquare)
      || laneResizeRegionsRef.current.some((region) => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height);
    return onControl ? undefined : laneLayouts.find((layout) => y >= layout.top && y < layout.bottom);
  }, [isOverPlayhead, laneLayouts, readOnly, sidebarWidth]);
  const [overLaneHeader, setOverLaneHeader] = useState(false);

  const wrappedPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (isNearDivider(x) && !isOverPlayhead(x, y)) {
        event.preventDefault();
        event.stopPropagation();
        sidebarDragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
        const onMove = (moveEvent: PointerEvent) => {
          const drag = sidebarDragRef.current;
          if (!drag) return;
          const delta = moveEvent.clientX - drag.startX;
          setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, drag.startWidth + delta)));
        };
        const onUp = () => {
          sidebarDragRef.current = null;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }
      // A press on a lane header, away from its buttons, picks the lane up to reorder it.
      const header = event.currentTarget === canvasRef.current ? laneHeaderAt(x, y) : undefined;
      if (header) {
        event.preventDefault();
        const canvas = event.currentTarget;
        setLaneDrag({ laneKey: header.lane.key, startY: y, y });
        const onMove = (moveEvent: PointerEvent) => {
          const top = canvas.getBoundingClientRect().top;
          setLaneDrag((current) => current ? { ...current, y: moveEvent.clientY - top } : current);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          const drag = laneDragRef.current;
          const dropIndex = laneDropIndexRef.current;
          setLaneDrag(null);
          if (drag && dropIndex != null) moveLaneTo(drag.laneKey, dropIndex);
          if (drag && Math.abs(drag.y - drag.startY) < LANE_DRAG_THRESHOLD) onClearSelection();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }
      handlePointerDown(event);
    },
    [handlePointerDown, isNearDivider, isOverPlayhead, laneHeaderAt, moveLaneTo, onClearSelection, sidebarWidth],
  );

  const wrappedPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (sidebarDragRef.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const over = event.currentTarget === canvasRef.current && !!laneHeaderAt(event.clientX - rect.left, event.clientY - rect.top);
      if (over !== overLaneHeader) setOverLaneHeader(over);
      handlePointerMove(event);
    },
    [handlePointerMove, laneHeaderAt, overLaneHeader],
  );

  const dividerDragging = sidebarDragRef.current !== null;

  const getCursor = () => {
    if (dividerDragging) return "col-resize";
    if (scrubbing || dragState || effectiveResizeState || beatResizeState || envelopePointDragState || envelopeSegmentDragState) return "grabbing";
    if (laneResizeState) return "ns-resize";
    return hoverCursor;
  };

  const getMainCursor = () => {
    if (dividerDragging) return "col-resize";
    if (scrubbing || dragState || effectiveResizeState || beatResizeState || envelopePointDragState || envelopeSegmentDragState) return "grabbing";
    if (marqueeState) return "crosshair";
    if (laneDrag) return "grabbing";
    if (laneResizeState) return "ns-resize";
    if (overLaneHeader) return "grab";
    return hoverCursor;
  };

  // Close add-lane picker on click outside
  useEffect(() => {
    if (!addLanePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (addLanePickerRef.current && !addLanePickerRef.current.contains(e.target as Node)) {
        setAddLanePickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [addLanePickerOpen]);

  const [addLanePickerPosition, setAddLanePickerPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!addLanePickerOpen) {
      setAddLanePickerPosition(null);
      return;
    }
    const btn = addLaneBtnRef.current;
    const picker = addLanePickerRef.current;
    const container = containerRef.current;
    if (!btn || !picker || !container) return;
    const containerRect = container.getBoundingClientRect();
    const pickerHeight = picker.offsetHeight;
    // Convert canvas-space button coords to fixed screen coords
    const btnScreenX = containerRect.left + btn.x + btn.width + 6;
    const btnScreenY = containerRect.top + btn.y - container.scrollTop;
    // Position above the button so it clears the timeline area
    const top = btnScreenY - pickerHeight - 6;
    setAddLanePickerPosition({ left: btnScreenX, top: Math.max(8, top) });
  }, [addLanePickerOpen]);

  const handlePickLaneType = useCallback(
    (sourceLaneKey?: string) => {
      setAddLanePickerOpen(false);
      onAddLane(sourceLaneKey);
    },
    [onAddLane],
  );


  const accessibleJoins = useMemo(() => elements.filter(element => !element.removed_at).flatMap(element => {
    const join = transitionJoinAvailability(element, elements, []).candidate;
    return join ? [{element, join}] : [];
  }), [elements]);

  const scrollViewportId = useId();
  const audioStatusElement = elementById.get(hoveredClipId ?? selectedIds[0] ?? "") ?? null;
  const audioStatus = videoAudioStatus(audioStatusElement, audioStatusElement ? mutedLanes.has(audioStatusElement.lane_key) : false);
  const audioStatusDescription = audioStatusElement?.type === "video_clip" && speechLinkSourceId(audioStatusElement) ? "Speech linked" : audioStatus ? `${String(audioStatusElement?.props?.title ?? "Video")}: ${audioStatus.description}` : undefined;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="timeline-scroll-shell">
    <div
      ref={containerRef}
      id={scrollViewportId}
      className="timeline-contrast-well timeline-overlay-scroll-viewport"
      data-timeline-scroll-container="true"
      data-studio-overlay-scrollable="true"
      {...dropHandlers}
      style={{
        position: "relative",
        width: "100%",
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: "var(--glass-panel)",
        overscrollBehaviorX: "contain",
        overscrollBehaviorY: "contain",
      } as CSSProperties}
    >
      <div className="pointer-events-none" style={{position:"sticky",top:0,height:0,zIndex:3}}>
        <span className="timeline-position-readout" aria-label="Preview time" style={{right:`calc(100% - ${sidebarWidth - 8}px)`}}>
          {Math.floor(playheadSec / 60)}:{String(Math.floor(playheadSec % 60)).padStart(2,"0")} <span>/ {Math.floor(playbackDuration / 60)}:{String(Math.floor(playbackDuration % 60)).padStart(2,"0")}</span>
        </span>
        <div style={{position:"absolute",left:sidebarWidth,width:Math.max(0,size.width-sidebarWidth),height:RULER_HEIGHT}}>
          <TimelineMarks marks={reviewMarkers.map(mark => ({id:mark.id,label:mark.label,time:mark.timeline_seconds,note:mark.note}))} start={renderedScrollSec} duration={Math.max(.001,(size.width-sidebarWidth)/pxPerSec)} onSelect={mark => onSeek(mark.time)} />
        </div>
        {dropSec != null && <div aria-hidden="true" className="timeline-drop-indicator" style={{left: sidebarWidth + (dropSec - renderedScrollSec) * pxPerSec, height: size.height}} />}
      </div>
      <canvas
        ref={rulerCanvasRef}
        onPointerDown={wrappedPointerDown}
        onPointerMove={wrappedPointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          marginBottom: -RULER_HEIGHT,
          width: "100%",
          height: RULER_HEIGHT,
          display: "block",
          background: "var(--glass-bar)",
          touchAction: "none",
          cursor: getCursor(),
        }}
      />
      <canvas
        ref={canvasRef}
        title={audioStatusDescription}
        aria-label={audioStatusDescription ?? "Timeline clips"}
        onPointerDown={wrappedPointerDown}
        onPointerMove={wrappedPointerMove}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          height: canvasHeight,
          display: "block",
          touchAction: "none",
          cursor: getMainCursor(),
        }}
      />
      {laneDropY != null && <div aria-hidden="true" className="timeline-lane-drop-indicator" style={{ top: laneDropY, width: size.width }} />}
      <div aria-label="Clip joins" style={{position: "absolute", inset: 0, pointerEvents: "none"}}>
        {accessibleJoins.map(({element, join}) => {
          const lane = laneLayouts.find(layout => layout.lane.key === element.lane_key);
          if (!join || !lane) return null;
          const x = sidebarWidth + (element.timeline_start + element.duration - renderedScrollSec) * pxPerSec;
          if (x < sidebarWidth + 14 || x > size.width - 14) return null;
          const existing = transitionChips.find(chip => chip.from_element_id === join.fromElementId && chip.to_element_id === join.toElementId);
          return <button key={element.id} type="button"
            aria-label={`${existing ? "Edit" : "Add"} transition: ${join.fromLabel} to ${join.toLabel}`}
            title={`${existing ? "Edit" : "Add"} transition: ${join.fromLabel} → ${join.toLabel}`}
            className="rounded-full border border-transparent bg-transparent hover:border-[var(--chrome-focus-ring)] focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)]"
            style={{position: "absolute", left: x - 14, top: lane.top + lane.height / 2 - 9, width: 28, height: 18, pointerEvents: "auto"}}
            onPointerDown={event => event.stopPropagation()}
            onPointerEnter={() => setTransitionHover(existing?.id ?? `create:${join.fromElementId}:${join.toElementId}`)}
            onPointerLeave={() => setTransitionHover(null)}
            onClick={() => existing ? onSelectTransition(existing.id) : onCreateTransition(join.fromElementId, join.toElementId)} />;
        })}
      </div>
      {rhythmView && rhythmLayout && <TimelineRhythmRows key={`${rhythmView.projectId}:${rhythmView.clip.id}:${rhythmView.clip.source_url}`} view={rhythmView} top={rhythmLayout.bottom} sidebarWidth={sidebarWidth} width={size.width} scrollSec={renderedScrollSec} pxPerSec={pxPerSec} playhead={playheadSec} onSeek={onSeek} onHeightChange={setRhythmHeight} />}
      {ctxMenu ? (
        <TimelineContextMenu
          menu={ctxMenu}
          menuRef={ctxMenuRef}
          position={ctxMenuPosition}
          elements={elements}
          selectedIds={selectedIds}
          lanes={orderedLanes}
          mutedLanes={mutedLanes}
          hiddenLanes={hiddenLanes}
          onToggleLaneHidden={onToggleLaneHidden}
          playheadSec={playheadSec}
          selectedBeatId={selectedBeatId}
          hasClipboard={hasClipboard}
          transitionChips={transitionChips}
          onCreateTransition={onCreateTransition}
          onSelectTransition={onSelectTransition}
          onClose={() => setCtxMenu(null)}
          onSelectBeat={onSelectBeat}
          onFitBeatToVisualContent={onFitBeatToVisualContent}
          onMoveBeatVisualsToBeatStart={onMoveBeatVisualsToBeatStart}
          onToggleMute={onToggleMute}
          onDeleteElement={onDeleteElement}
          onToggleLock={onToggleLock}
          onSoloLane={onSoloLane}
          onToggleLaneLock={onToggleLaneLock}
          onSelectLaneElements={(laneKey) => onSetSelection(elements
            .filter((element) => element.lane_key === laneKey && element.removed_at == null)
            .map((element) => element.id))}
          onSplitElement={onSplitElement}
          onDuplicateElement={onDuplicateElement}
          onCopyElement={onCopyElement}
          onCutElement={onCutElement}
          onPasteElement={onPasteElement}
          onToggleDisable={onToggleDisable}
          onOpenClipProperties={onOpenClipProperties}
          onCombineElements={onCombineElements}
          onPreparePresenterCompound={onPreparePresenterCompound}
          onBreakApartCompoundClip={onBreakApartCompoundClip}
          onAddLane={onAddLane}
          onCreateCaptionsLaneAbove={onCreateCaptionsLaneAbove}
          onDeleteLane={onDeleteLane}
          onAddCaptionElement={onAddCaptionElement}
          onMoveLaneUp={(laneKey) => moveLane(laneKey, -1)}
          onMoveLaneDown={(laneKey) => moveLane(laneKey, 1)}
        />
      ) : null}
      {addLanePickerOpen ? (
        <div
          ref={addLanePickerRef}
          style={{
            position: "fixed",
            left: addLanePickerPosition?.left ?? 0,
            top: addLanePickerPosition?.top ?? 0,
            visibility: addLanePickerPosition ? "visible" : "hidden",
            zIndex: 20,
            background: "var(--chrome-panel)",
            border: "1px solid var(--chrome-line-strong)",
            borderRadius: "var(--edge-control)",
            padding: "4px 0",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            minWidth: 150,
          }}
        >
          {[
            { label: "Visual", key: undefined },
            { label: "Narrator", key: AUDIO_LANE_NARRATOR },
            { label: "Music", key: MUSIC_LANE_KEY },
            { label: "Sound effects", key: SOUND_EFFECT_LANE_KEY },
            { label: "Text & captions", key: CAPTIONS_LANE_KEY },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handlePickLaneType(item.key)}
              style={{
                display: "block",
                width: "100%",
                padding: "0.45rem 0.75rem",
                border: "none",
                background: "none",
                color: "var(--ink)",
                fontSize: "0.8rem",
                textAlign: "left",
                cursor: "pointer",
                borderRadius: "var(--edge-control-inner)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--chrome-raised)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
    <OverlayScrollbar controls={scrollViewportId} target={containerRef} contentHeight={canvasHeight} label="Scroll timeline lanes" />
    </div>
  );
}
