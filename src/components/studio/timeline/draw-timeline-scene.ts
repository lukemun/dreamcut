import { TIMELINE_RULER_HEIGHT as RULER_HEIGHT } from "./timeline-geometry";
import { validateTransitionPair } from "@/lib/timeline/transitions";
import {
  getVideoHoldSegments,
  supportsOverflowHold,
  WAVEFORM_SUPPORTED_TYPES,
} from "@/lib/timeline/media";
import { isVisualLane } from "@/lib/timeline/lanes";
import { collectKeyframeTimes } from "@/lib/timeline/keyframes";
import { MEDIA_KEYFRAME_FIELDS } from "@/lib/timeline/media-transform";
import { SHAPE_KEYFRAME_FIELDS } from "@/lib/timeline/shapes";
import { isCamera } from "@/lib/timeline/camera";
import {
  COMPOUND_CLIP_LABEL_PROP,
  COMPOUND_CLIP_MEMBER_COUNT_PROP,
  COMPOUND_CLIP_PRESENTATION_PROP,
} from "@/lib/timeline/compound-clips";

import { speechLinkSourceId } from "./speech-sync-status";
import { videoAudioStatus } from "./video-audio-status";
import { elementTypeBadge } from "./adapters";
import { clamp, getGainLineGeometry, getRulerLabelStep, getRulerTickStep } from "./canvas-helpers";
import { audioClipMetadata } from "./clip-labels";
import { MAX_VOLUME, readVolumeEnvelopePoints, type EnvelopePoint } from "@/lib/timeline/volume-envelope";
import { buildVideoPreviewFrameCacheKey, getVideoPreviewFrameCount } from "./timeline-canvas-model";
import type {
  BeatMenuBtnHitRegion,
  BeatResizeHitRegion,
  ClipHitRegion,
  EnvelopePointHitRegion,
  EnvelopeSegmentHitRegion,
  GainHitRegion,
  GainKeyframeHitRegion,
  LaneMenuBtnHitRegion,
  LaneResizeHitRegion,
  MenuBtnHitRegion,
  MuteHitRegion,
  SoloHitRegion,
  TransitionHitRegion,
  ResizeHitRegion,
  VisualKeyframeHitRegion, HideHitRegion } from "./timeline-hit-regions";
import type {
  BeatResizeState,
  DragState,
  EnvelopePointDragState,
  EnvelopeSegmentDragState,
  ImageCacheEntry,
  LaneLayout,
  MarqueeState,
  Rect,
  ResizeState,
  SelectedEnvelopePoint,
  SnapGuide,
  SnapTier,
  ThemeColors,
} from "./timeline-canvas-model";
import type { TimelineBeatBand, TimelineElement, TimelineTransitionChip } from "./types";

const DEFAULT_SIDEBAR_WIDTH = 196;

const LANE_BTN_SIZE = 26; // Solo/Mute/eye hit targets; kept ≥26px for less precise pointing.
const CLIP_VERTICAL_PADDING = 2;
const MIN_VIDEO_PREVIEW_CELL_WIDTH_PX = 72;

function clipFillColor(element: TimelineElement, theme: ThemeColors): string {
  if (element.type === "caption_text") return theme.clipText ?? theme.raised;
  if (isCamera(element)) return theme.clipCamera ?? theme.clipVisual ?? theme.raised;
  if (element.type === "still" || element.type === "video_clip" || element.type === "shape") return theme.clipVisual ?? theme.raised;
  return theme.clipAudio ?? theme.raised;
}

type Args = {
  ctx: CanvasRenderingContext2D;
  size: { width: number; height: number };
  theme: ThemeColors;
  elementById: Map<string, TimelineElement>;
  beatMarkers: TimelineBeatBand[];
  mutedLanes: Set<string>;
  hiddenLanes?: Set<string>;
  playheadSec: number;
  scrollSec: number;
  pxPerSec: number;
  viewportEndSec: number;
  contentWidth: number;
  laneLayouts: LaneLayout[];
  laneFooterGap?: number;
  itemsByLane: Map<string, TimelineElement[]>;
  transitionChips: TimelineTransitionChip[];
  beatLabelById: Map<string, string>;
  selectedIds: string[];
  selectedBeatId: string | null;
  selectedTransitionId: string | null;
  selectedEnvelopePoint: SelectedEnvelopePoint | null;
  dragState: DragState | null;
  resizeState: ResizeState | null;
  beatResizeState: BeatResizeState | null;
  envelopePointDragState: EnvelopePointDragState | null;
  envelopeSegmentDragState: EnvelopeSegmentDragState | null;
  marqueeState: MarqueeState | null;
  hoveredClipId: string | null;
  hoveredTransitionId: string | null;
  /** Elements touched by the proposal option being previewed — tinted for review. */
  previewHighlightIds?: Set<string> | null;
  /** Clips that checked proposals would add: drawn faint and dashed, and never selectable. */
  pendingElementIds?: ReadonlySet<string> | null;
  /** Live clips that checked proposals would replace or remove: drawn dimmed. */
  outgoingElementIds?: ReadonlySet<string> | null;
  snapGuide: SnapGuide | null;
  imageCache: Map<string, ImageCacheEntry>;
  clipRegions: ClipHitRegion[];
  resizeRegions: ResizeHitRegion[];
  transitionRegions: TransitionHitRegion[];
  muteRegions: MuteHitRegion[];
  hideRegions?: HideHitRegion[];
  soloRegions: SoloHitRegion[];
  laneResizeRegions: LaneResizeHitRegion[];
  laneMenuBtnRegions: LaneMenuBtnHitRegion[];
  menuBtnRegions: MenuBtnHitRegion[];
  beatMenuBtnRegions: BeatMenuBtnHitRegion[];
  beatResizeRegions: BeatResizeHitRegion[];
  gainRegions: GainHitRegion[];
  gainKeyframeRegions: GainKeyframeHitRegion[];
  visualKeyframeRegions: VisualKeyframeHitRegion[];
  envelopePointRegions: EnvelopePointHitRegion[];
  envelopeSegmentRegions: EnvelopeSegmentHitRegion[];
  addLaneButtonRectRef: { current: Rect | null };
  playheadRegionRef: { current: Rect | null };
  sidebarWidth?: number;
};

type RulerArgs = Pick<
  Args,
  | "ctx"
  | "size"
  | "theme"
  | "beatMarkers"
  | "selectedBeatId"
  | "beatResizeState"
  | "beatMenuBtnRegions"
  | "beatResizeRegions"
  | "scrollSec"
  | "viewportEndSec"
  | "pxPerSec"
  | "playheadSec"
  | "sidebarWidth"
> & {
  collectRegions?: boolean;
};

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const next = `${text.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(next).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${text.slice(0, low)}${ellipsis}`;
}

function selectPreviewSampleIndices(totalSamples: number, visibleSamples: number) {
  if (visibleSamples >= totalSamples) {
    return Array.from({ length: totalSamples }, (_, index) => index);
  }
  return Array.from({ length: visibleSamples }, (_, slotIndex) => {
    if (visibleSamples === 1) return Math.floor(totalSamples / 2);
    return Math.round((slotIndex * (totalSamples - 1)) / (visibleSamples - 1));
  });
}

function buildPreviewElement(
  element: TimelineElement,
  resizeState: ResizeState | null,
  effectiveStart: number,
  effectiveDuration: number,
) {
  const isResizingElement = resizeState?.elementId === element.id;
  const previewPlaybackRate = isResizingElement
    ? (resizeState.previewPlaybackRate ?? element.playback_rate)
    : element.playback_rate;
  const previewProps = isResizingElement
    ? (resizeState.previewProps ?? element.props)
    : element.props;

  return {
    previewElement: isResizingElement
      ? {
        ...element,
        timeline_start: effectiveStart,
        duration: effectiveDuration,
        playback_rate: previewPlaybackRate,
        props: previewProps,
      }
      : element,
    previewPlaybackRate,
    showHoldBoundaryMarkers: true,
  };
}

function drawVideoClipFrames(
  ctx: CanvasRenderingContext2D,
  args: {
    element: TimelineElement;
    previewElement: TimelineElement;
    imageCache: Map<string, ImageCacheEntry>;
    videoPreviewFrameCount: number;
    segmentPreviewPlaybackRate: number;
    segmentPreviewDuration: number;
    clipY: number;
    clipHeight: number;
    clipStartX: number;
    x: number;
    width: number;
    pxPerSec: number;
  },
) {
  const {
    element,
    previewElement,
    imageCache,
    videoPreviewFrameCount,
    segmentPreviewPlaybackRate,
    segmentPreviewDuration,
    clipY,
    clipHeight,
    clipStartX,
    x,
    width,
    pxPerSec,
  } = args;
  if (!element.source_url) return;

  const { leadingHoldDuration, visiblePlayableDuration } = getVideoHoldSegments(previewElement);
  const playableStartX = clipStartX + leadingHoldDuration * pxPerSec;
  const playableEndX = playableStartX + visiblePlayableDuration * pxPerSec;
  const playableVisibleStartX = Math.max(x, playableStartX);
  const playableVisibleEndX = Math.min(x + width, playableEndX);
  if (playableVisibleEndX - playableVisibleStartX <= 1) return;

  try {
    ctx.save();
    ctx.beginPath();
    ctx.rect(playableVisibleStartX, clipY + 1, playableVisibleEndX - playableVisibleStartX, clipHeight - 2);
    ctx.clip();
    const fullPlayableWidth = Math.max(1, visiblePlayableDuration * pxPerSec);
    const maxVisibleSamples = Math.max(
      1,
      Math.floor((playableVisibleEndX - playableVisibleStartX) / MIN_VIDEO_PREVIEW_CELL_WIDTH_PX),
    );
    const visibleSampleIndices = selectPreviewSampleIndices(
      videoPreviewFrameCount,
      Math.min(videoPreviewFrameCount, maxVisibleSamples),
    );
    const cellWidth = fullPlayableWidth / visibleSampleIndices.length;
    visibleSampleIndices.forEach((sampleIndex, visibleIndex) => {
      const frameKey = buildVideoPreviewFrameCacheKey(element.source_url!, sampleIndex, {
        trimStart: element.trim_start,
        trimEnd: element.trim_end,
        playbackRate: segmentPreviewPlaybackRate,
        duration: segmentPreviewDuration,
      });
      const cachedFrame = imageCache.get(frameKey);
      const drawable = cachedFrame?.status === "ready" && cachedFrame.drawable
        ? cachedFrame.drawable
        : null;
      if (!drawable) return;
      const cellX = playableStartX + visibleIndex * cellWidth;
      ctx.drawImage(drawable, cellX, clipY, cellWidth, clipHeight);
    });
    ctx.restore();
  } catch {
    ctx.restore();
  }
}

function drawVideoHoldRegions(
  ctx: CanvasRenderingContext2D,
  args: {
    element: TimelineElement;
    previewElement: TimelineElement;
    resizeState: ResizeState | null;
    imageCache: Map<string, ImageCacheEntry>;
    firstPreviewFrameKey: string | null;
    lastPreviewFrameKey: string | null;
    clipY: number;
    clipHeight: number;
    clipStartX: number;
    clipEndX: number;
    x: number;
    width: number;
    pxPerSec: number;
    showHoldBoundaryMarkers: boolean;
  },
) {
  const {
    element,
    previewElement,
    resizeState,
    imageCache,
    firstPreviewFrameKey,
    lastPreviewFrameKey,
    clipY,
    clipHeight,
    clipStartX,
    clipEndX,
    x,
    width,
    pxPerSec,
    showHoldBoundaryMarkers,
  } = args;
  const markers: Array<{ x: number; clipY: number; clipHeight: number; active?: boolean }> = [];
  const {
    leadingHoldDuration,
    playableDuration,
    visiblePlayableDuration: previewPlayableDuration,
    trailingHoldDuration,
  } = getVideoHoldSegments(previewElement);

  if (leadingHoldDuration > 0.001 && width >= 28) {
    const leadingHoldEndX = clipStartX + leadingHoldDuration * pxPerSec;
    const leadingHoldVisibleStartX = Math.max(x, clipStartX);
    const leadingHoldVisibleEndX = Math.min(x + width, leadingHoldEndX);
    const leadingHoldWidth = Math.max(0, leadingHoldVisibleEndX - leadingHoldVisibleStartX);
    const leadingHoldFrameUrl = typeof element.props?.overflow_hold_start_frame_url === "string"
      ? element.props.overflow_hold_start_frame_url
      : null;
    const leadingCached = (firstPreviewFrameKey ? imageCache.get(firstPreviewFrameKey) : null)
      ?? (leadingHoldFrameUrl ? imageCache.get(leadingHoldFrameUrl) : null);
    if (leadingCached?.status === "ready" && leadingCached.drawable && leadingHoldWidth > 1) {
      try {
        ctx.save();
        ctx.beginPath();
        ctx.rect(leadingHoldVisibleStartX, clipY + 1, leadingHoldWidth, clipHeight - 2);
        ctx.clip();
        const source = leadingCached.drawable;
        const sourceWidth =
          source instanceof HTMLImageElement
            ? source.naturalWidth
            : source instanceof HTMLVideoElement
              ? (source.videoWidth || width)
              : width;
        const sourceHeight =
          source instanceof HTMLImageElement
            ? source.naturalHeight
            : source instanceof HTMLVideoElement
              ? (source.videoHeight || clipHeight)
              : clipHeight;
        const scale = clipHeight / sourceHeight;
        const thumbWidth = sourceWidth * scale;
        const thumbHeight = clipHeight;
        const thumbY = clipY + (clipHeight - thumbHeight) / 2;
        const thumbStartX = clipStartX + Math.floor((leadingHoldVisibleStartX - clipStartX) / Math.max(1, thumbWidth)) * thumbWidth;
        for (let tx = thumbStartX; tx < leadingHoldVisibleStartX + leadingHoldWidth; tx += thumbWidth) {
          ctx.drawImage(source, tx, thumbY, thumbWidth, thumbHeight);
        }
        ctx.restore();
      } catch {
        ctx.restore();
      }
    }
    ctx.save();
    ctx.fillStyle = "rgba(255, 200, 74, 0.18)";
    ctx.fillRect(leadingHoldVisibleStartX, clipY + 1, leadingHoldWidth, clipHeight - 2);
    ctx.restore();
    if (showHoldBoundaryMarkers) {
      markers.push({ x: leadingHoldEndX, clipY, clipHeight });
    }
  }

  if (trailingHoldDuration > 0.001 && width >= 28) {
    const holdBoundaryX = clipStartX + (leadingHoldDuration + previewPlayableDuration) * pxPerSec;
    const holdVisibleStartX = Math.max(x, holdBoundaryX);
    const holdVisibleEndX = Math.min(x + width, clipEndX);
    const holdWidth = Math.max(0, holdVisibleEndX - holdVisibleStartX);
    const isActiveOverflowResize =
      resizeState?.elementId === element.id
      && resizeState.edge === "end"
      && resizeState.previewDurationSec > leadingHoldDuration + playableDuration + 0.001;
    const overflowHoldFrameUrl = typeof element.props?.overflow_hold_frame_url === "string"
      ? element.props.overflow_hold_frame_url
      : null;
    const overflowCached = (lastPreviewFrameKey ? imageCache.get(lastPreviewFrameKey) : null)
      ?? (overflowHoldFrameUrl ? imageCache.get(overflowHoldFrameUrl) : null);
    if (overflowCached?.status === "ready" && overflowCached.drawable && holdWidth > 1) {
      try {
        ctx.save();
        ctx.beginPath();
        ctx.rect(holdVisibleStartX, clipY + 1, holdWidth - 1, clipHeight - 2);
        ctx.clip();
        const source = overflowCached.drawable;
        const sourceWidth =
          source instanceof HTMLImageElement
            ? source.naturalWidth
            : source instanceof HTMLVideoElement
              ? (source.videoWidth || width)
              : width;
        const sourceHeight =
          source instanceof HTMLImageElement
            ? source.naturalHeight
            : source instanceof HTMLVideoElement
              ? (source.videoHeight || clipHeight)
              : clipHeight;
        const scale = clipHeight / sourceHeight;
        const thumbWidth = sourceWidth * scale;
        const thumbHeight = clipHeight;
        const thumbY = clipY + (clipHeight - thumbHeight) / 2;
        const thumbStartX = holdBoundaryX + Math.floor((holdVisibleStartX - holdBoundaryX) / Math.max(1, thumbWidth)) * thumbWidth;
        for (let tx = thumbStartX; tx < holdVisibleStartX + holdWidth; tx += thumbWidth) {
          ctx.drawImage(source, tx, thumbY, thumbWidth, thumbHeight);
        }
        ctx.restore();
      } catch {
        ctx.restore();
      }
    }
    ctx.save();
    ctx.fillStyle = isActiveOverflowResize ? "rgba(255, 210, 122, 0.25)" : "rgba(255, 200, 74, 0.18)";
    ctx.fillRect(holdVisibleStartX, clipY + 1, holdWidth, clipHeight - 2);

    ctx.restore();
    if (showHoldBoundaryMarkers) {
      markers.push({ x: holdBoundaryX, clipY, clipHeight, active: isActiveOverflowResize });
    }
  }

  return markers;
}

function elementTitle(element: TimelineElement, beatLabelById: Map<string, string>): string {
  if (element.props?.[COMPOUND_CLIP_PRESENTATION_PROP] === true) {
    const label = element.props?.[COMPOUND_CLIP_LABEL_PROP];
    return typeof label === "string" && label.length > 0 ? label : "Compound clip";
  }
  const beatLabel = element.beat_id ? beatLabelById.get(element.beat_id) : null;
  const audioMetadata = audioClipMetadata(element);
  if (audioMetadata) return audioMetadata.title;
  if (element.type === "still" || element.type === "video_clip") {
    const authored = [element.props?.timeline_label, element.props?.label, element.props?.title]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return authored ?? beatLabel ?? "";
  }
  if (element.type === "caption_text") {
    const text = typeof element.props?.text === "string" ? element.props.text : "";
    return text.length > 0 ? text.slice(0, 40) : "Caption";
  }
  if (element.type === "shape") {
    const title = typeof element.props?.title === "string" && element.props.title.trim() ? element.props.title : null;
    const kind = typeof element.props?.shape_kind === "string" ? element.props.shape_kind : "rect";
    return title ?? ({ rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", star: "Star", line: "Line", arc: "Arc", arrow: "Arrow", path: "Freeform" }[kind] ?? "Shape");
  }
  return elementTypeBadge(element.type);
}

function elementSubtitle(element: TimelineElement, beatLabelById: Map<string, string>): string {
  if (element.props?.[COMPOUND_CLIP_PRESENTATION_PROP] === true) {
    const count = element.props?.[COMPOUND_CLIP_MEMBER_COUNT_PROP];
    return `${typeof count === "number" ? count : 2} source clips`;
  }
  const beatLabel = element.beat_id ? beatLabelById.get(element.beat_id) : null;
  const audioMetadata = audioClipMetadata(element);
  if (audioMetadata) return audioMetadata.subtitle;
  if (element.type === "still" || element.type === "video_clip") return "";
  if (element.type === "caption_text") return beatLabel ?? "Caption";
  return "";
}

/** A visual clip needs a single compact type cue, never a text banner competing
 * with its thumbnail or overflowing a short clip. */
function drawVisualTypeIcon(
  ctx: CanvasRenderingContext2D,
  type: "still" | "video_clip",
  clipX: number,
  clipY: number,
  clipWidth: number,
  clipHeight: number,
) {
  const size = Math.min(11, clipHeight - 12, clipWidth - 8);
  if (size < 7) return;
  const x = clipX + Math.min(7, Math.max(4, clipWidth - size - 4));
  const y = clipY + 7;
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipX + 1, clipY + 1, Math.max(0, clipWidth - 2), Math.max(0, clipHeight - 2));
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 1.35;
  if (type === "video_clip") {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.32, y + size * 0.18);
    ctx.lineTo(x + size * 0.32, y + size * 0.82);
    ctx.lineTo(x + size * 0.82, y + size * 0.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.strokeRect(x + 0.5, y + 1.5, size - 1, size - 3);
    ctx.beginPath();
    ctx.arc(x + size * 0.73, y + size * 0.3, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 2, y + size - 3);
    ctx.lineTo(x + size * 0.43, y + size * 0.52);
    ctx.lineTo(x + size - 2, y + size - 3);
    ctx.stroke();
  }
  ctx.restore();
}


/** Returns the badge's right edge (relative to the clip's x), or 0 when nothing was drawn. `compact` draws the icon only. */
function drawVideoAudioBadge(ctx: CanvasRenderingContext2D, element: TimelineElement, laneMuted: boolean, x: number, y: number, width: number, compact = false): number {
  const speechLinked = element.type === "video_clip" && speechLinkSourceId(element) != null;
  const status = speechLinked ? { state: "speech", label: "Speech linked" } : videoAudioStatus(element, laneMuted);
  if (!status || width < 22) return 0;
  const badgeOffset = width < 44 ? 3 : 24;
  // Reserve the duration at the right on clips wide enough to show both labels.
  const available = width - badgeOffset - 6 - (width >= 155 ? 48 : 0);
  ctx.save();
  ctx.font = "600 10px var(--font-sans, sans-serif)";
  const showLabel = !compact && available >= ctx.measureText(status.label).width + 23;
  const badgeWidth = showLabel ? ctx.measureText(status.label).width + 23 : 17;
  ctx.fillStyle = speechLinked ? "#175269" : "rgba(15,23,32,0.85)";
  ctx.beginPath(); ctx.roundRect(x + badgeOffset, y + 5, badgeWidth, 17, 3); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.fillStyle = "#fff"; ctx.lineWidth = 1.2;
  ctx.translate(x + badgeOffset + 3, y + 8);
  if (speechLinked) {
    // Two joined links remain distinct from the speaker/mute symbol.
    ctx.save(); ctx.translate(6, 6); ctx.rotate(-Math.PI / 4);
    ctx.strokeRect(-6, -3, 7, 6); ctx.strokeRect(-1, -3, 7, 6); ctx.restore();
  } else if (status.state === "unknown" || status.state === "none") {
    ctx.fillText(status.state === "unknown" ? "?" : "∅", 1, 10);
  } else {
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(3, 4); ctx.lineTo(6, 1); ctx.lineTo(6, 11); ctx.lineTo(3, 8); ctx.lineTo(0, 8); ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    if (status.state === "muted") { ctx.moveTo(0, 12); ctx.lineTo(11, 0); }
    else { ctx.arc(6, 6, 4, -Math.PI / 3, Math.PI / 3); }
    ctx.stroke();
  }
  if (showLabel) ctx.fillText(status.label, 15, 10);
  ctx.restore();
  return badgeOffset + badgeWidth;
}

function snapGuideStyle(kind: SnapTier, position: string) {
  if (kind === "primary") {
    return {
      strokeStyle: position,
      lineWidth: 1,
      dash: [4, 4] as number[],
    };
  }
  if (kind === "secondary") {
    return {
      strokeStyle: "rgba(107, 174, 255, 0.9)",
      lineWidth: 0.75,
      dash: [3, 4] as number[],
    };
  }
  return {
    strokeStyle: "rgba(107, 174, 255, 0.9)",
    lineWidth: 0.75,
    dash: [2, 5] as number[],
  };
}

function seamNeutralColors(theme: ThemeColors) {
  return {
    fill: theme.raised,
    fillSoft: theme.border,
    stroke: theme.textMuted,
    text: theme.textPrimary,
  };
}

function drawSeamBadge(
  ctx: CanvasRenderingContext2D,
  args: {
    centerX: number;
    y: number;
    type: TimelineTransitionChip["type"] | "create";
    selected?: boolean;
    theme: ThemeColors;
  },
) {
  const { centerX, y, type, selected = false, theme } = args;
  const width = type === "create" ? 28 : 24;
  const height = 18;
  const x = Math.round(centerX - width / 2);
  const neutral = seamNeutralColors(theme);
  const colors = {
    ...neutral,
    text: neutral.text,
  };

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 7);
  ctx.fillStyle = colors.fill;
  ctx.shadowColor = selected ? theme.textMuted : "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 0;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = selected ? 2 : 1.25;
  ctx.strokeStyle = colors.stroke;
  ctx.stroke();
  ctx.fillStyle = colors.text;
  if (type === "create") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy);
    ctx.lineTo(cx + 3.5, cy);
    ctx.moveTo(cx, cy - 3.5);
    ctx.lineTo(cx, cy + 3.5);
    ctx.stroke();
  } else {
    ctx.font = "700 10px var(--font-sans, sans-serif)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(type.charAt(0).toUpperCase(), x + width / 2, y + height / 2 + 0.5);
  }
  ctx.restore();
}

function drawTransitionPill(
  ctx: CanvasRenderingContext2D,
  args: {
    centerX: number;
    centerY: number;
    type: TimelineTransitionChip["type"];
    selected?: boolean;
    hovered?: boolean;
    theme: ThemeColors;
  },
) {
  const { centerX, centerY, type, selected = false, hovered = false, theme } = args;
  const neutral = seamNeutralColors(theme);
  const iconColor = neutral.text;
  const width = 28;
  const height = 18;
  const x = Math.round(centerX - width / 2);
  const y = Math.round(centerY - height / 2);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 9);
  ctx.fillStyle = neutral.fill;
  ctx.shadowColor = selected ? theme.textMuted : hovered ? theme.border : "rgba(0,0,0,0.24)";
  ctx.shadowBlur = 0;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = selected ? 2 : hovered ? 1.75 : 1.4;
  ctx.strokeStyle = selected || hovered ? neutral.text : neutral.stroke;
  ctx.stroke();

  ctx.strokeStyle = iconColor;
  ctx.fillStyle = iconColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";

  if (type === "fade") {
    ctx.globalAlpha = 0.95;
    ctx.strokeRect(x + 7, y + 5, 6, 6);
    ctx.globalAlpha = 0.45;
    ctx.strokeRect(x + 13, y + 7, 6, 6);
    ctx.globalAlpha = 1;
  } else if (type === "slide") {
    ctx.beginPath();
    ctx.moveTo(x + 8, centerY);
    ctx.lineTo(x + 18, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 15, centerY - 3);
    ctx.lineTo(x + 18, centerY);
    ctx.lineTo(x + 15, centerY + 3);
    ctx.stroke();
  } else {
    ctx.strokeRect(x + 8, y + 5, 10, 8);
    ctx.globalAlpha = 0.28;
    ctx.fillRect(x + 8, y + 5, 5, 8);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawHoldBoundaryMarker(
  ctx: CanvasRenderingContext2D,
  args: {
    x: number;
    clipY: number;
    clipHeight: number;
    active?: boolean;
  },
) {
  const { x, clipY, clipHeight, active = false } = args;
  const dashPattern: [number, number] = active ? [5, 9] : [4, 8];
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = active ? 7 : 6;
  ctx.setLineDash(dashPattern);
  ctx.beginPath();
  ctx.moveTo(x, clipY + 4);
  ctx.lineTo(x, clipY + clipHeight - 4);
  ctx.stroke();
  ctx.strokeStyle = active ? "#ffd27a" : "#ffc84a";
  ctx.lineWidth = active ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(x, clipY + 4);
  ctx.lineTo(x, clipY + clipHeight - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawTimelineRuler({
  ctx,
  size,
  theme,
  beatMarkers,
  selectedBeatId,
  beatResizeState,
  beatMenuBtnRegions,
  beatResizeRegions,
  scrollSec,
  viewportEndSec,
  pxPerSec,
  playheadSec,
  sidebarWidth: sidebarWidthArg,
  collectRegions = true,
}: RulerArgs) {
  const SIDEBAR_WIDTH = sidebarWidthArg ?? DEFAULT_SIDEBAR_WIDTH;
  const { background, border, textPrimary, textMuted, selectedBg, selectedRing, position } = theme;

  if (collectRegions) {
    beatMenuBtnRegions.length = 0;
    beatResizeRegions.length = 0;
  }

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;

  ctx.fillStyle = background;
  // Paint the entire sticky ruler opaquely; translucent CSS backing can retain
  // the old surface underneath it when the theme changes.
  ctx.fillRect(0, 0, size.width, RULER_HEIGHT);
  ctx.fillStyle = theme.divider ?? border;
  ctx.fillRect(0, RULER_HEIGHT - 1, size.width, 1);
  ctx.fillStyle = textPrimary;
  ctx.font = "800 20px var(--font-sans, sans-serif)";
  ctx.textBaseline = "middle";
  ctx.fillText("Lanes", 16, RULER_HEIGHT - 10);

  const contentWidth = Math.max(0, size.width - SIDEBAR_WIDTH);
  if (contentWidth <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(SIDEBAR_WIDTH, 0, contentWidth, RULER_HEIGHT);
  ctx.clip();

  for (const beat of beatMarkers) {
    const previewStartSec = beatResizeState
      ? beatMarkers.findIndex((entry) => entry.id === beat.id) >= 0
        ? (() => {
            const beatIndex = beatMarkers.findIndex((entry) => entry.id === beat.id);
            if (beatIndex < 0) return beat.startSec;
            if (beat.id === beatResizeState.beatId) {
              return beatResizeState.edge === "start" ? beatResizeState.previewBoundarySec : beat.startSec;
            }
            const previousBeat = beatMarkers[beatIndex - 1];
            if (previousBeat?.id === beatResizeState.beatId && beatResizeState.edge === "end") {
              return beatResizeState.previewBoundarySec;
            }
            if (previousBeat && beatResizeState.edge === "start" && beat.id === beatResizeState.beatId) {
              return beatResizeState.previewBoundarySec;
            }
            return beat.startSec;
          })()
        : beat.startSec
      : beat.startSec;
    const previewEndSec = beatResizeState
      ? (() => {
          const beatIndex = beatMarkers.findIndex((entry) => entry.id === beat.id);
          if (beatIndex < 0) return beat.endSec;
          if (beat.id === beatResizeState.beatId) {
            return beatResizeState.edge === "end" ? beatResizeState.previewBoundarySec : beat.endSec;
          }
          const nextBeat = beatMarkers[beatIndex + 1];
          if (nextBeat?.id === beatResizeState.beatId && beatResizeState.edge === "start") {
            return beatResizeState.previewBoundarySec;
          }
          if (nextBeat && beatResizeState.edge === "end" && beat.id === beatResizeState.beatId) {
            return beatResizeState.previewBoundarySec;
          }
          return beat.endSec;
        })()
      : beat.endSec;
    const leftSec = Math.max(previewStartSec, scrollSec);
    const rightSec = Math.min(previewEndSec, viewportEndSec);
    if (rightSec <= leftSec) continue;
    const fullX = SIDEBAR_WIDTH + (previewStartSec - scrollSec) * pxPerSec;
    const fullWidth = Math.max((previewEndSec - previewStartSec) * pxPerSec, 0);
    const x = SIDEBAR_WIDTH + (leftSec - scrollSec) * pxPerSec;
    const width = Math.max((rightSec - leftSec) * pxPerSec, 0);
    const isSelectedBeat = selectedBeatId === beat.id;
    if (isSelectedBeat) {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = selectedBg;
      ctx.fillRect(x, 0, width, RULER_HEIGHT);
      ctx.restore();
    }
    ctx.strokeStyle = isSelectedBeat ? selectedRing : border;
    ctx.strokeRect(x, 0, width, RULER_HEIGHT);
    if (isSelectedBeat) {
      const handleWidth = 10;
      if (collectRegions && previewStartSec > 0) {
        beatResizeRegions.push({
          beatId: beat.id,
          edge: "start",
          x: fullX - handleWidth / 2,
          y: 0,
          width: handleWidth,
          height: RULER_HEIGHT,
        });
      }
      if (collectRegions) {
        beatResizeRegions.push({
          beatId: beat.id,
          edge: "end",
          x: fullX + fullWidth - handleWidth / 2,
          y: 0,
          width: handleWidth,
          height: RULER_HEIGHT,
        });
      }
    }
    // Beat options open with right-click on the beat (no ⋮ button).
    ctx.fillStyle = isSelectedBeat ? textPrimary : textMuted;
    ctx.font = "700 32px var(--font-sans, sans-serif)";
    const labelRightPadding = 12;
    ctx.fillText(
      truncateText(ctx, beat.beat_label.toUpperCase(), Math.max(0, width - labelRightPadding - 14)),
      x + 14,
      RULER_HEIGHT / 2 + 2,
    );
  }

  const tickStep = getRulerTickStep(pxPerSec);

  const showDecimalLabels = tickStep < 1;
  const tickStart = Math.floor(scrollSec / tickStep) * tickStep;

  ctx.strokeStyle = border;
  ctx.fillStyle = textMuted;
  ctx.font = `${showDecimalLabels ? "700 13px" : "700 12px"} var(--font-mono, monospace)`;
  // Space labels by the widest one on screen so they never overlap at any zoom.
  const widestLabel = showDecimalLabels ? `${viewportEndSec.toFixed(1)}s` : `${Math.round(viewportEndSec)}s`;
  const labelEvery = Math.round(getRulerLabelStep(pxPerSec, tickStep, ctx.measureText(widestLabel).width) / tickStep);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  for (let second = tickStart; second <= viewportEndSec + tickStep; second += tickStep) {
    const roundedSecond = Number(second.toFixed(3));
    const x = SIDEBAR_WIDTH + (roundedSecond - scrollSec) * pxPerSec;
    const tickNumber = Math.round(roundedSecond / tickStep);
    const isMajor = tickNumber % labelEvery === 0;

    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT - (isMajor ? 11 : 6));
    ctx.lineTo(x, RULER_HEIGHT);
    ctx.stroke();

    if (!isMajor) continue;

    const label = showDecimalLabels
      ? `${roundedSecond.toFixed(1)}s`
      : `${Math.round(roundedSecond)}s`;
    const labelWidth = ctx.measureText(label).width;
    const labelLeft = x - labelWidth / 2;
    // A label the right edge would cut ("6.") is left out; the next scroll reveals it whole.
    if (x + labelWidth / 2 > size.width - 2) continue;
    if (labelLeft < SIDEBAR_WIDTH) {
      ctx.textAlign = "left";
      ctx.fillText(label, SIDEBAR_WIDTH + 2, RULER_HEIGHT - 14);
      ctx.textAlign = "center";
    } else {
      ctx.fillText(label, x, RULER_HEIGHT - 14);
    }
  }
  ctx.textAlign = "left";

  const playheadRawX = SIDEBAR_WIDTH + (playheadSec - scrollSec) * pxPerSec;
  const playheadOnScreen = playheadRawX >= SIDEBAR_WIDTH && playheadRawX <= size.width;

  if (playheadOnScreen) {
    // Draw playhead line and triangle when visible
    ctx.strokeStyle = position;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadRawX, 0);
    ctx.lineTo(playheadRawX, RULER_HEIGHT);
    ctx.stroke();

    ctx.fillStyle = position;
    ctx.beginPath();
    ctx.moveTo(playheadRawX - 7, 0);
    ctx.lineTo(playheadRawX + 7, 0);
    ctx.lineTo(playheadRawX, 10);
    ctx.closePath();
    ctx.fill();
  } else {
    // Off-screen indicator arrow in the ruler
    const offLeft = playheadSec < scrollSec;
    const arrowX = offLeft ? SIDEBAR_WIDTH + 10 : size.width - 10;
    const arrowY = RULER_HEIGHT - 8;
    ctx.fillStyle = position;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    if (offLeft) {
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX + 6, arrowY - 4);
      ctx.lineTo(arrowX + 6, arrowY + 4);
    } else {
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - 6, arrowY - 4);
      ctx.lineTo(arrowX - 6, arrowY + 4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export function drawTimelineScene({
  ctx,
  size,
  theme,
  elementById,
  beatMarkers,
  mutedLanes,
  hiddenLanes = new Set<string>(),
  playheadSec,
  scrollSec,
  pxPerSec,
  viewportEndSec,
  contentWidth,
  laneLayouts,
  laneFooterGap = 0,
  itemsByLane,
  transitionChips,
  beatLabelById,
  selectedIds,
  selectedBeatId,
  selectedTransitionId,
  selectedEnvelopePoint,
  dragState,
  resizeState,
  beatResizeState,
  envelopePointDragState,
  envelopeSegmentDragState,
  marqueeState,
  hoveredClipId,
  hoveredTransitionId,
  previewHighlightIds,
  pendingElementIds = null,
  outgoingElementIds = null,
  snapGuide,
  imageCache,
  clipRegions,
  resizeRegions,
  transitionRegions,
  muteRegions,
  hideRegions = [],
  soloRegions,
  laneResizeRegions,
  laneMenuBtnRegions,
  menuBtnRegions,
  beatMenuBtnRegions,
  beatResizeRegions,
  gainRegions,
  gainKeyframeRegions,
  visualKeyframeRegions,
  envelopePointRegions,
  envelopeSegmentRegions,
  addLaneButtonRectRef,
  playheadRegionRef,
  sidebarWidth: sidebarWidthArg,
}: Args) {
  const SIDEBAR_WIDTH = sidebarWidthArg ?? DEFAULT_SIDEBAR_WIDTH;
  const { background, border, textPrimary, textMuted, selectedBg, selectedRing, position } = theme;
  const selectedIdSet = new Set(selectedIds);
  const transitionChipByPair = new Map<string, TimelineTransitionChip>(
    transitionChips.map((chip) => [`${chip.from_element_id}:${chip.to_element_id}`, chip]),
  );
  // A flat, open surface: clips carry the contrast, rows separate by a hairline only.
  const divider = theme.divider ?? border;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size.width, size.height);

  clipRegions.length = 0;
  resizeRegions.length = 0;
  transitionRegions.length = 0;
  muteRegions.length = 0;
  hideRegions.length = 0;
  soloRegions.length = 0;
  laneResizeRegions.length = 0;
  laneMenuBtnRegions.length = 0;
  menuBtnRegions.length = 0;
  beatMenuBtnRegions.length = 0;
  beatResizeRegions.length = 0;
  gainRegions.length = 0;
  gainKeyframeRegions.length = 0;
  visualKeyframeRegions.length = 0;
  envelopePointRegions.length = 0;
  envelopeSegmentRegions.length = 0;

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  drawTimelineRuler({
    ctx,
    size,
    theme,
    beatMarkers,
    selectedBeatId,
    beatResizeState,
    beatMenuBtnRegions,
    beatResizeRegions,
    scrollSec,
    viewportEndSec,
    pxPerSec,
    playheadSec,
    collectRegions: true,
  });

  // Clip rects touched by a previewed proposal option, painted above clip
  // chrome (before the playhead) so the reviewed change is legible at a glance.
  const previewHighlightRects: Array<{ x: number; y: number; width: number; height: number }> = [];

  const draggedElement = dragState
    ? elementById.get(dragState.elementId) ?? null
    : null;
  const isGroupDrag = (dragState?.draggedElementIds.length ?? 0) > 1;
  const dragDeltaSec = dragState ? dragState.previewStartSec - dragState.originalStartSec : 0;
  const isDragCrossLane = !isGroupDrag && dragState && draggedElement && dragState.previewLaneKey !== draggedElement.lane_key;

  laneLayouts.forEach(({ lane, top: y, bottom, height: renderedLaneHeight }) => {
    const laneMuted = mutedLanes.has(lane.key);
    const laneHoldBoundaryMarkers: Array<{
      x: number;
      clipY: number;
      clipHeight: number;
      active?: boolean;
    }> = [];

    ctx.fillStyle = background;
    ctx.fillRect(0, y, SIDEBAR_WIDTH, renderedLaneHeight);
    ctx.fillStyle = divider;
    ctx.fillRect(0, Math.round(bottom) - 1, size.width, 1);
    ctx.fillRect(SIDEBAR_WIDTH - 1, y, 1, renderedLaneHeight);

    if (lane.role === "camera") drawCameraGlyph(ctx, 6, y + renderedLaneHeight / 2 - 8, 16, textPrimary);
    else {
      ctx.fillStyle = lane.color;
      ctx.beginPath();
      ctx.arc(14, y + renderedLaneHeight / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Right-side toggles: Solo (headphones: hear only this lane), Mute (sound) and the eye (pictures/text).
    // Lock, select, move and delete live in the track's right-click menu. Mute and the eye change shape
    // when on (slashed icon), Solo fills; none relies on colour alone.
    const btnY = y + Math.round((renderedLaneHeight - LANE_BTN_SIZE) / 2);
    const btnGap = 4;
    const laneHidden = hiddenLanes.has(lane.key);
    // A camera lane draws nothing and plays nothing, so it has neither toggle.
    const laneHasSound = lane.type !== "captions" && lane.role !== "camera";
    const laneHasPicture = (lane.type === "visual" || lane.type === "captions") && lane.role !== "camera";
    const hideX = SIDEBAR_WIDTH - LANE_BTN_SIZE - 8;
    const muteX = laneHasPicture ? hideX - LANE_BTN_SIZE - btnGap : hideX;
    const soloX = muteX - LANE_BTN_SIZE - btnGap;
    const firstButtonX = laneHasSound ? soloX : hideX;
    const laneSoloed = !laneMuted && laneLayouts.every((other) => other.lane.key === lane.key || mutedLanes.has(other.lane.key));

    const [laneName, laneTechnicalId] = lane.label.split(" · ", 2);
    const labelMaxWidth = Math.max(24, firstButtonX - 34);
    ctx.fillStyle = laneMuted && laneHidden ? textMuted : textPrimary;
    ctx.textBaseline = "middle";
    ctx.font = "700 14px var(--font-sans, sans-serif)";
    ctx.fillText(
      truncateText(ctx, laneName ?? lane.label, labelMaxWidth),
      28,
      y + renderedLaneHeight / 2 + (laneTechnicalId ? -7 : 1),
    );
    if (laneTechnicalId) {
      ctx.fillStyle = textMuted;
      ctx.font = "650 11px var(--font-sans, sans-serif)";
      ctx.fillText(
        truncateText(ctx, laneTechnicalId, labelMaxWidth),
        28,
        y + renderedLaneHeight / 2 + 10,
      );
    }

    if (laneHasSound) {
      soloRegions.push({ laneKey: lane.key, x: soloX, y: btnY, size: LANE_BTN_SIZE });
      drawLaneToggle(ctx, soloX, btnY, laneSoloed, LANE_ICON_PATHS.solo,
        { onBg: selectedBg, onInk: textPrimary, offInk: textMuted });
      muteRegions.push({ laneKey: lane.key, x: muteX, y: btnY, size: LANE_BTN_SIZE });
      drawLaneToggle(ctx, muteX, btnY, laneMuted, laneMuted ? LANE_ICON_PATHS.soundOff : LANE_ICON_PATHS.soundOn,
        { onBg: selectedBg, onInk: textPrimary, offInk: textMuted });
    }
    if (laneHasPicture) {
      hideRegions.push({ laneKey: lane.key, x: hideX, y: btnY, size: LANE_BTN_SIZE });
      drawLaneToggle(ctx, hideX, btnY, laneHidden, laneHidden ? LANE_ICON_PATHS.hidden : LANE_ICON_PATHS.visible,
        { onBg: selectedBg, onInk: textPrimary, offInk: textMuted });
    }
    ctx.textAlign = "left";


    laneResizeRegions.push({
      laneKey: lane.key,
      x: 0,
      width: size.width,
      y: bottom - 4,
      height: 8,
    });

    const laneElements = itemsByLane.get(lane.key) ?? [];
    const elementsToRender: Array<{
      element: TimelineElement;
      effectiveStart: number;
      effectiveDuration: number;
      isGhost: boolean;
    }> = [];

    for (const element of laneElements) {
      const previewLaneKey = dragState?.previewLaneById[element.id]
        ?? (dragState?.elementId === element.id
          ? dragState.previewLaneKey
          : resizeState?.elementId === element.id
            ? resizeState.previewLaneKey
            : element.lane_key);
      if (
        (isGroupDrag && dragState?.draggedElementIds.includes(element.id) && previewLaneKey !== lane.key)
        || (!isGroupDrag && dragState?.elementId === element.id && dragState.previewLaneKey !== lane.key)
        || (resizeState?.elementId === element.id && resizeState.previewLaneKey !== lane.key)
      ) {
        continue;
      }
      const effectiveStart = resizeState?.elementId === element.id
        ? resizeState.previewStartSec
        : dragState?.draggedElementIds.includes(element.id)
          ? Number(((dragState.originalStartById[element.id] ?? element.timeline_start) + dragDeltaSec).toFixed(3))
          : dragState?.elementId === element.id
          ? dragState.previewStartSec
          : element.timeline_start;
      const effectiveDuration = resizeState?.elementId === element.id
        ? resizeState.previewDurationSec
        : element.duration;
      elementsToRender.push({ element, effectiveStart, effectiveDuration, isGhost: false });
    }

    if (isDragCrossLane && dragState.previewLaneKey === lane.key && draggedElement) {
      elementsToRender.push({
        element: draggedElement,
        effectiveStart: dragState.previewStartSec,
        effectiveDuration: draggedElement.duration,
        isGhost: true,
      });
    }

    if (isGroupDrag && dragState) {
      for (const elementId of dragState.draggedElementIds) {
        const element = elementById.get(elementId);
        if (!element) continue;
        const previewLaneKey = dragState.previewLaneById[elementId] ?? element.lane_key;
        if (previewLaneKey !== lane.key || previewLaneKey === element.lane_key) continue;
        elementsToRender.push({
          element,
          effectiveStart: Number(((dragState.originalStartById[elementId] ?? element.timeline_start) + dragDeltaSec).toFixed(3)),
          effectiveDuration: element.duration,
          isGhost: true,
        });
      }
    }

    for (const { element, effectiveStart, effectiveDuration, isGhost: dragGhost } of elementsToRender) {
      // A pending clip shares the drag ghost's faint, dashed look and takes no clicks.
      const isPending = pendingElementIds?.has(element.id) ?? false;
      const isGhost = dragGhost || isPending;
      const isCompoundPresentation = element.props?.[COMPOUND_CLIP_PRESENTATION_PROP] === true;
      const clipEndSec = effectiveStart + effectiveDuration;
      if (clipEndSec <= scrollSec || effectiveStart >= viewportEndSec) continue;

      const visibleStartSec = Math.max(effectiveStart, scrollSec);
      const visibleEndSec = Math.min(clipEndSec, viewportEndSec);
      const clipStartX = SIDEBAR_WIDTH + (effectiveStart - scrollSec) * pxPerSec;
      const clipEndX = SIDEBAR_WIDTH + (clipEndSec - scrollSec) * pxPerSec;
      const x = SIDEBAR_WIDTH + (visibleStartSec - scrollSec) * pxPerSec;
      const width = Math.max((visibleEndSec - visibleStartSec) * pxPerSec, 1);
      const clipY = y + CLIP_VERTICAL_PADDING;
      const clipHeight = renderedLaneHeight - CLIP_VERTICAL_PADDING * 2;
      if (previewHighlightIds?.has(element.id)) {
        previewHighlightRects.push({ x, y: clipY, width, height: clipHeight });
      }
      const handleWidth = element.type === "caption_text"
        ? Math.min(16, Math.max(10, width * 0.22))
        : Math.min(10, Math.max(6, width * 0.18));
      const segmentPreviewStart = resizeState?.elementId === element.id ? effectiveStart : element.timeline_start;
      const segmentPreviewDuration = resizeState?.elementId === element.id ? effectiveDuration : element.duration;
      const {
        previewElement,
        previewPlaybackRate: segmentPreviewPlaybackRate,
        showHoldBoundaryMarkers,
      } = buildPreviewElement(element, resizeState, segmentPreviewStart, segmentPreviewDuration);
      const videoPreviewFrameCount = element.type === "video_clip"
        ? getVideoPreviewFrameCount(segmentPreviewDuration)
        : 0;
      const firstPreviewFrameKey = element.type === "video_clip" && element.source_url
        ? buildVideoPreviewFrameCacheKey(element.source_url!, 0, {
          trimStart: element.trim_start,
          trimEnd: element.trim_end,
          playbackRate: segmentPreviewPlaybackRate,
          duration: segmentPreviewDuration,
        })
        : null;
      const lastPreviewFrameKey = element.type === "video_clip" && element.source_url
        ? buildVideoPreviewFrameCacheKey(element.source_url!, Math.max(0, videoPreviewFrameCount - 1), {
          trimStart: element.trim_start,
          trimEnd: element.trim_end,
          playbackRate: segmentPreviewPlaybackRate,
          duration: segmentPreviewDuration,
        })
        : null;

      if (!isPending) clipRegions.push({
        elementId: element.id,
        x,
        y: clipY,
        width,
        height: clipHeight,
      });
      if (!isCompoundPresentation && !isPending) {
        resizeRegions.push({
          elementId: element.id,
          edge: "start",
          x,
          y: clipY,
          width: handleWidth,
          height: clipHeight,
        });
        resizeRegions.push({
          elementId: element.id,
          edge: "end",
          x: x + width - handleWidth,
          y: clipY,
          width: handleWidth,
          height: clipHeight,
        });
      }

      const isDisabled = !!element.props?.disabled;
      // Picture/text tracks dim when hidden; sound tracks dim when muted.
      const laneDimmed = lane.type === "visual" || lane.type === "captions" ? hiddenLanes.has(lane.key) : laneMuted;
      const isOutgoing = outgoingElementIds?.has(element.id) ?? false;
      ctx.globalAlpha = (laneDimmed ? 0.4 : 1) * (isPending ? theme.pendingAlpha ?? 0.45 : isGhost ? 0.6 : 1) * (isOutgoing ? 0.4 : 1) * (isDisabled ? 0.3 : 1);
      const isCaptionElement = element.type === "caption_text";
      const clipColor = clipFillColor(element, theme);
      const clipInk = theme.clipInk ?? "#fff";
      const clipShade = theme.clipShade ?? 0.30;
      const clipRadius = Math.min(3, width / 12, clipHeight / 2);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, clipY, width, clipHeight, clipRadius);
      ctx.clip();
      ctx.fillStyle = clipColor;
      ctx.fillRect(x, clipY, width, clipHeight);
      if (!isCompoundPresentation && (element.type === "still" || element.type === "video_clip") && element.source_url) {
        if (element.type === "video_clip") {
          drawVideoClipFrames(ctx, {
            element,
            previewElement,
            imageCache,
            videoPreviewFrameCount,
            segmentPreviewPlaybackRate,
            segmentPreviewDuration,
            clipY,
            clipHeight,
            clipStartX,
            x,
            width,
            pxPerSec,
          });
        } else {
          const cached = imageCache.get(element.source_url);
          if (cached?.status === "ready" && cached.drawable) {
            try {
              ctx.save();
              ctx.beginPath();
              ctx.rect(x + 1, clipY + 1, width - 2, clipHeight - 2);
              ctx.clip();
              const source = cached.drawable;
              const sourceWidth =
                source instanceof HTMLVideoElement
                  ? (source.videoWidth || width)
                  : source instanceof HTMLImageElement
                    ? source.naturalWidth
                    : width;
              const sourceHeight =
                source instanceof HTMLVideoElement
                  ? (source.videoHeight || clipHeight)
                  : source instanceof HTMLImageElement
                    ? source.naturalHeight
                    : clipHeight;
              const scale = clipHeight / sourceHeight;
              const thumbWidth = sourceWidth * scale;
              const thumbHeight = clipHeight;
              const thumbY = clipY + (clipHeight - thumbHeight) / 2;
              const thumbStartX = clipStartX + Math.floor((x - clipStartX) / Math.max(1, thumbWidth)) * thumbWidth;
              for (let tx = thumbStartX; tx < x + width; tx += thumbWidth) {
                ctx.drawImage(source, tx, thumbY, thumbWidth, thumbHeight);
              }
              ctx.restore();
            } catch {
              ctx.restore();
            }
          }
        }
      }

      const peaks = element._peaks;
      const sourceDur = element._source_duration;
      if (!isCompoundPresentation && peaks && peaks.length > 0 && sourceDur && sourceDur > 0) {
        const trimStart = element.trim_start ?? 0;
        const visOffsetStart = Math.max(0, visibleStartSec - effectiveStart);
        const visOffsetEnd = Math.min(effectiveDuration, visibleEndSec - effectiveStart);
        const playbackRate = element.playback_rate ?? 1;
        const srcStart = trimStart + visOffsetStart * playbackRate;
        const srcEnd = trimStart + visOffsetEnd * playbackRate;
        const totalPeaks = peaks.length;
        const startIndex = Math.floor((srcStart / sourceDur) * totalPeaks);
        const endIndex = Math.ceil((srcEnd / sourceDur) * totalPeaks);
        const sliced = peaks.slice(Math.max(0, startIndex), Math.min(totalPeaks, endIndex));

        if (sliced.length > 0) {
          const barWidth = 2;
          const barGap = 1;
          const step = barWidth + barGap;
          const numBars = Math.max(1, Math.floor(width / step));
          const samplesPerBar = Math.max(1, Math.floor(sliced.length / numBars));
          const midY = clipY + clipHeight / 2;
          const maxBarHeight = (clipHeight - 16) / 2;

          ctx.fillStyle = clipShade === 0 ? clipInk : "rgba(255, 255, 255, 0.45)";
          for (let bi = 0; bi < numBars; bi++) {
            const sStart = bi * samplesPerBar;
            const sEnd = Math.min(sStart + samplesPerBar, sliced.length);
            let peak = 0;
            for (let s = sStart; s < sEnd; s++) {
              if (sliced[s] > peak) peak = sliced[s];
            }
            const barH = Math.max(1, peak * maxBarHeight);
            ctx.fillRect(x + bi * step, midY - barH, barWidth, barH * 2);
          }
        }
      }

      if (!isCompoundPresentation && WAVEFORM_SUPPORTED_TYPES.has(element.type) && width >= 36) {
        const {
          lineStartX,
          lineEndX,
          lineTop,
          lineBottom,
        } = getGainLineGeometry({
          clipX: x,
          clipY,
          clipWidth: width,
          clipHeight,
        });
        // Build envelope for drawing from the new envelope model only.
        let envelopePoints: EnvelopePoint[];
        if (envelopePointDragState?.elementId === element.id) {
          envelopePoints = envelopePointDragState.previewEnvelope;
        } else if (envelopeSegmentDragState?.elementId === element.id) {
          envelopePoints = envelopeSegmentDragState.previewEnvelope;
        } else {
          envelopePoints = readVolumeEnvelopePoints(element, effectiveDuration);
        }

        // Helper to convert envelope time/volume → canvas x/y
        const timeToX = (t: number) => lineStartX + (t / Math.max(0.001, effectiveDuration)) * (lineEndX - lineStartX);
        const volToY = (v: number) => lineBottom - (v / MAX_VOLUME) * (lineBottom - lineTop);

        for (let pi = 0; pi < envelopePoints.length; pi += 1) {
          const pt = envelopePoints[pi]!;
          envelopePointRegions.push({
            elementId: element.id,
            pointIndex: pi,
            x: timeToX(pt.time_seconds),
            y: volToY(pt.volume),
            radius: 6,
          });
        }
        for (let si = 0; si < envelopePoints.length - 1; si += 1) {
          const sp = envelopePoints[si]!;
          const ep = envelopePoints[si + 1]!;
          envelopeSegmentRegions.push({
            elementId: element.id,
            leftIndex: si,
            rightIndex: si + 1,
            x1: timeToX(sp.time_seconds),
            y1: volToY(sp.volume),
            x2: timeToX(ep.time_seconds),
            y2: volToY(ep.volume),
          });
        }

        // Guide lines
        const guideVolumes = [MAX_VOLUME, 1, 0];
        guideVolumes.forEach((guideVolume) => {
          const guideY = volToY(guideVolume);
          ctx.save();
          ctx.strokeStyle = guideVolume === 1
            ? "rgba(255, 227, 190, 0.58)"
            : "rgba(255, 255, 255, 0.24)";
          ctx.lineWidth = guideVolume === 1 ? 2 : 1.5;
          ctx.setLineDash(guideVolume === 1 ? [8, 4] : [5, 5]);
          ctx.beginPath();
          ctx.moveTo(lineStartX, guideY);
          ctx.lineTo(lineEndX, guideY);
          ctx.stroke();
          ctx.restore();
        });

        // Draw envelope line
        ctx.strokeStyle = selectedIdSet.has(element.id) ? "rgba(255, 189, 108, 0.95)" : "rgba(255, 214, 163, 0.9)";
        ctx.lineWidth = selectedIdSet.has(element.id) ? 2.5 : 2;
        ctx.beginPath();
        envelopePoints.forEach((point, index) => {
          const px = timeToX(point.time_seconds);
          const py = volToY(point.volume);
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // Draw envelope point circles (all points, not just interior)
        const showEnvelopeHandles =
          selectedIdSet.has(element.id)
          || hoveredClipId === element.id
          || selectedEnvelopePoint?.elementId === element.id;
        if (showEnvelopeHandles) {
          ctx.fillStyle = "#ffcf8f";
          for (let pi = 0; pi < envelopePoints.length; pi += 1) {
            const pt = envelopePoints[pi]!;
            const px = timeToX(pt.time_seconds);
            const py = volToY(pt.volume);
            const isSelected =
              selectedEnvelopePoint?.elementId === element.id && selectedEnvelopePoint.pointIndex === pi;
            ctx.beginPath();
            ctx.arc(px, py, isSelected ? 5 : 4, 0, Math.PI * 2);
            ctx.fill();
            if (isSelected) {
              ctx.save();
              ctx.strokeStyle = "#2b2118";
              ctx.lineWidth = 1.5;
              ctx.stroke();
              ctx.restore();
            }
          }
        } else {
          // When not selected, draw interior points with lighter style
          ctx.fillStyle = "rgba(255, 230, 194, 0.95)";
          for (let pi = 1; pi < envelopePoints.length - 1; pi += 1) {
            const pt = envelopePoints[pi]!;
            const px = timeToX(pt.time_seconds);
            const py = volToY(pt.volume);
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      const gradient = ctx.createLinearGradient(x, clipY, x, clipY + clipHeight);
      gradient.addColorStop(0, `rgba(255,255,255,${clipShade ? 0.08 : 0})`);
      gradient.addColorStop(0.55, `rgba(0,0,0,${clipShade ? 0.08 : 0})`);
      gradient.addColorStop(1, `rgba(0,0,0,${clipShade})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, clipY, width, clipHeight);


      if (isVisualLane(lane.key) && !isGhost) {
        const keyframeTimes = collectKeyframeTimes(element.props, element.type === "shape" ? [...MEDIA_KEYFRAME_FIELDS, ...SHAPE_KEYFRAME_FIELDS] : MEDIA_KEYFRAME_FIELDS, effectiveDuration);
        if (keyframeTimes.length > 0) {
          const markerY = clipY + clipHeight - 8;
          const markerRadius = selectedIdSet.has(element.id) ? 4.5 : 3.5;
          for (const localTime of keyframeTimes) {
            const rawMarkerX = clipStartX + localTime * pxPerSec;
            if (rawMarkerX < x || rawMarkerX > x + width) continue;
            const markerInset = Math.min(markerRadius + 1, width / 2);
            const markerX = clamp(rawMarkerX, x + markerInset, x + width - markerInset);
            visualKeyframeRegions.push({
              elementId: element.id,
              timeSec: Number((effectiveStart + localTime).toFixed(3)),
              x: markerX,
              y: markerY,
              radius: 9,
            });
            ctx.save();
            ctx.translate(markerX, markerY);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = selectedIdSet.has(element.id) ? "#ffd39b" : "rgba(255, 255, 255, 0.82)";
            ctx.strokeStyle = "rgba(20, 17, 15, 0.9)";
            ctx.lineWidth = 1.25;
            ctx.fillRect(-markerRadius, -markerRadius, markerRadius * 2, markerRadius * 2);
            ctx.strokeRect(-markerRadius, -markerRadius, markerRadius * 2, markerRadius * 2);
            ctx.restore();
          }
        }
      }

      // A clip seen through a camera says so, so the camera's push-ins and pans are never a surprise.
      const cameraId = element.props?.camera_id;
      const camera = typeof cameraId === "string" ? elementById.get(cameraId) : undefined;
      const followsCamera = !isCamera(element) && camera != null && !camera.removed_at && isCamera(camera);
      const availableTextWidth = Math.max(0, width - 24 - (isCaptionElement && followsCamera ? 24 : 0));
      if (isCaptionElement && followsCamera && width >= 52) drawCameraGlyph(ctx, x + width - 26, clipY + clipHeight / 2 - 8, 16, clipInk);
      if (isCaptionElement) {
        const title = elementTitle(element, beatLabelById);
        if (availableTextWidth >= 28) {
          ctx.fillStyle = clipInk;
          ctx.font = "700 14px var(--font-sans, sans-serif)";
          ctx.textBaseline = "middle";
          ctx.fillText(truncateText(ctx, title, availableTextWidth), x + 12, clipY + clipHeight / 2 + 0.5);
          ctx.textBaseline = "alphabetic";
        }
      } else {
        // Short lanes (the compact defaults) have room for one line: the name sits beside the badges
        // instead of below them, so it is never cut off by the clip's top or bottom edge.
        const compactLabel = clipHeight < 56;
        const showDuration = width >= (element.type === "video_clip" ? 155 : 88);
        let compactTextStart = 12;
        if (element.type === "still" || element.type === "video_clip") {
          if (element.type !== "video_clip" || width >= 44) drawVisualTypeIcon(ctx, element.type, x, clipY, width, clipHeight);
          const badgeEnd = drawVideoAudioBadge(ctx, element, laneMuted, x, clipY, width, compactLabel);
          compactTextStart = Math.max(24, badgeEnd) + 6;
        } else if (compactLabel) {
          // The lane already names the kind of media; the clip keeps its own name.
        } else if (width >= 44) {
          ctx.fillStyle = clipShade === 0 ? clipColor : "rgba(0,0,0,0.34)";
          ctx.fillRect(x + 8, clipY + 8, 48, 16);
          ctx.fillStyle = clipInk;
          ctx.font = "600 11px var(--font-sans, sans-serif)";
          ctx.fillText(elementTypeBadge(element.type, element), x + 12, clipY + 16);
        }

        const compactTextWidth = width - compactTextStart - 8 - (showDuration ? 56 : 0);
        if (compactLabel) {
          const title = elementTitle(element, beatLabelById);
          if (title && compactTextWidth >= 28) {
            ctx.fillStyle = clipInk;
            ctx.font = "700 11px var(--font-sans, sans-serif)";
            ctx.textBaseline = "middle";
            // Level with the badges in the top band; keyframe markers keep the lower band.
            ctx.fillText(truncateText(ctx, title, compactTextWidth), x + compactTextStart, clipY + 13.5);
            ctx.textBaseline = "alphabetic";
          }
        } else if (availableTextWidth >= 44) {
          const title = elementTitle(element, beatLabelById);
          const subtitle = elementSubtitle(element, beatLabelById);
          if (clipShade === 0 && (title || subtitle)) {
            ctx.fillStyle = clipColor;
            ctx.fillRect(x + 8, clipY + clipHeight - 42, width - 16, 36);
          }
          if (title) {
            ctx.fillStyle = clipInk;
            ctx.font = "700 14px var(--font-sans, sans-serif)";
            ctx.fillText(truncateText(ctx, title, availableTextWidth), x + 12, clipY + clipHeight - 28);
          }
          if (subtitle) {
            ctx.fillStyle = clipInk;
            ctx.font = "600 14px var(--font-sans, sans-serif)";
            ctx.fillText(truncateText(ctx, subtitle, availableTextWidth), x + 12, clipY + clipHeight - 12);
          }
        }

        if (followsCamera && width >= 64) {
          ctx.font = "600 12px var(--font-mono, monospace)";
          const durationWidth = showDuration ? ctx.measureText(`${effectiveDuration.toFixed(1)}s`).width + 18 : 0;
          drawCameraGlyph(ctx, x + width - durationWidth - 24, clipY + 8, 16, clipInk);
        }
        if (showDuration) {
          const durationLabel = `${effectiveDuration.toFixed(1)}s`;
          ctx.font = "600 12px var(--font-mono, monospace)";
          const badgeWidth = ctx.measureText(durationLabel).width + 10;
          ctx.fillStyle = clipShade === 0 ? clipColor : "rgba(255,255,255,0.14)";
          ctx.fillRect(x + width - badgeWidth - 8, clipY + 8, badgeWidth, 18);
          ctx.fillStyle = clipInk;
          ctx.fillText(durationLabel, x + width - badgeWidth - 3, clipY + 21);
        }
      }

      if (supportsOverflowHold(element.type)) {
        const markers = drawVideoHoldRegions(ctx, {
          element,
          previewElement,
          resizeState,
          imageCache,
          firstPreviewFrameKey,
          lastPreviewFrameKey,
          clipY,
          clipHeight,
          clipStartX,
          clipEndX,
          x,
          width,
          pxPerSec,
          showHoldBoundaryMarkers,
        });
        laneHoldBoundaryMarkers.push(...markers);
      }

      if (element.position_locked) {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x + width - 26, clipY + clipHeight - 22, 18, 14);
        ctx.fillStyle = "#fff";
        ctx.font = "700 11px var(--font-sans, sans-serif)";
        ctx.fillText("L", x + width - 20, clipY + clipHeight - 11);
      }

      // No ⋮ button on clips: right-click opens the same menu without covering the clip.

      ctx.fillStyle = isCaptionElement ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.2)";
      ctx.fillRect(x, clipY, handleWidth, clipHeight);
      ctx.fillRect(x + width - handleWidth, clipY, handleWidth, clipHeight);
      ctx.restore();
      const clipSelected = selectedIdSet.has(element.id);
      const strokeInset = clipSelected ? 1 : 0.5;
      ctx.strokeStyle = clipSelected ? textPrimary : (theme.clipBorder ?? border);
      ctx.lineWidth = clipSelected ? 2 : 1;
      if (isGhost) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.roundRect(x + strokeInset, clipY + strokeInset,
        Math.max(0, width - strokeInset * 2), Math.max(0, clipHeight - strokeInset * 2),
        Math.max(0, clipRadius - strokeInset));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (const marker of laneHoldBoundaryMarkers) {
      drawHoldBoundaryMarker(ctx, marker);
    }

    if (isVisualLane(lane.key)) {
      const seamBadgeY = y + renderedLaneHeight / 2 - 9;
      const seamPillCenterY = y + renderedLaneHeight / 2;
      for (let index = 0; index < laneElements.length - 1; index += 1) {
        const fromElement = laneElements[index]!;
        const toElement = laneElements[index + 1]!;
        const seamSec = fromElement.timeline_start + fromElement.duration;
        if (!validateTransitionPair(fromElement, toElement, 0.5).ok) continue;
        const seamX = SIDEBAR_WIDTH + (seamSec - scrollSec) * pxPerSec;
        if (seamX < SIDEBAR_WIDTH - 24 || seamX > SIDEBAR_WIDTH + contentWidth + 24) continue;

        const pairKey = `${fromElement.id}:${toElement.id}`;
        const transitionChip = transitionChipByPair.get(pairKey) ?? null;
        if (transitionChip) {
          const isSelected = selectedTransitionId === transitionChip.id;
          const isHovered = hoveredTransitionId === transitionChip.id;
          drawTransitionPill(ctx, {
            centerX: seamX,
            centerY: seamPillCenterY,
            type: transitionChip.type,
            selected: isSelected,
            hovered: isHovered,
            theme,
          });
          transitionRegions.push({
            kind: "existing",
            transitionId: transitionChip.id,
            x: seamX - 14,
            y: seamPillCenterY - 9,
            width: 28,
            height: 18,
          });
          continue;
        }

        drawSeamBadge(ctx, {
          centerX: seamX,
          y: seamBadgeY,
          type: "create",
          selected: hoveredTransitionId === `create:${pairKey}`,
          theme,
        });
        transitionRegions.push({
          kind: "create",
          fromElementId: fromElement.id,
          toElementId: toElement.id,
          x: seamX - 14,
          y: seamBadgeY,
          width: 28,
          height: 18,
        });
      }
    }

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(SIDEBAR_WIDTH + contentWidth - 20, bottom);
    ctx.lineTo(SIDEBAR_WIDTH + contentWidth - 8, bottom);
    ctx.moveTo(SIDEBAR_WIDTH + contentWidth - 20, bottom - 4);
    ctx.lineTo(SIDEBAR_WIDTH + contentWidth - 8, bottom - 4);
    ctx.stroke();
  });

  const lastBottom = (laneLayouts.at(-1)?.bottom ?? RULER_HEIGHT) + laneFooterGap;
  const btnSize = 26;
  const btnX = Math.round((SIDEBAR_WIDTH - btnSize) / 2);
  const btnY = lastBottom + 8;
  addLaneButtonRectRef.current = { x: btnX, y: btnY, width: btnSize, height: btnSize };

  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnSize, btnSize, 6);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = textMuted;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const cx = btnX + btnSize / 2;
  const cy = btnY + btnSize / 2;
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();

  for (const rect of previewHighlightRects) {
    ctx.save();
    ctx.fillStyle = "rgba(52, 211, 153, 0.16)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = "rgba(52, 211, 153, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x + 0.75, rect.y + 0.75, rect.width - 1.5, rect.height - 1.5);
    ctx.restore();
  }

  const mainPlayheadX = SIDEBAR_WIDTH + (playheadSec - scrollSec) * pxPerSec;
  const mainPlayheadOnScreen = mainPlayheadX >= SIDEBAR_WIDTH && mainPlayheadX <= size.width;

  if (mainPlayheadOnScreen) {
    ctx.strokeStyle = position;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mainPlayheadX, 0);
    ctx.lineTo(mainPlayheadX, size.height);
    ctx.stroke();

    ctx.fillStyle = position;
    ctx.beginPath();
    ctx.moveTo(mainPlayheadX - 7, 0);
    ctx.lineTo(mainPlayheadX + 7, 0);
    ctx.lineTo(mainPlayheadX, 10);
    ctx.closePath();
    ctx.fill();

    playheadRegionRef.current = {
      x: mainPlayheadX - 14,
      y: 0,
      width: 28,
      height: size.height,
    };
  } else {
    playheadRegionRef.current = null;
  }

  if (snapGuide !== null) {
    const snapX = SIDEBAR_WIDTH + (snapGuide.sec - scrollSec) * pxPerSec;
    if (snapX >= SIDEBAR_WIDTH && snapX <= size.width) {
      const guideStyle = snapGuideStyle(snapGuide.kind, position);
      ctx.strokeStyle = guideStyle.strokeStyle;
      ctx.lineWidth = guideStyle.lineWidth;
      ctx.setLineDash(guideStyle.dash);
      ctx.beginPath();
      ctx.moveTo(snapX, 0);
      ctx.lineTo(snapX, size.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (marqueeState) {
    const left = Math.min(marqueeState.startX, marqueeState.currentX);
    const top = Math.min(marqueeState.startY, marqueeState.currentY);
    const width = Math.abs(marqueeState.currentX - marqueeState.startX);
    const height = Math.abs(marqueeState.currentY - marqueeState.startY);
    ctx.save();
    ctx.fillStyle = selectedBg;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(left, top, width, height);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = selectedRing;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(left, top, width, height);
    ctx.restore();
  }
}

/** Lucide 24px icon paths for the lane header toggles (volume-2/volume-x, eye/eye-off). */
const CAMERA_ICON_PATHS = ["m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5", "M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"] as const;

/** The camera mark: on a camera lane's header, and on every clip that follows a camera. */
function drawCameraGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ink: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of CAMERA_ICON_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
}

const LANE_ICON_PATHS = {
  soundOn: ["M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", "M16 9a5 5 0 0 1 0 6", "M19.364 18.364a9 9 0 0 0 0-12.728"],
  soundOff: ["M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", "m22 9-6 6", "m16 9 6 6"],
  visible: ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  solo: ["M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"],
  hidden: ["M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49", "M14.084 14.158a3 3 0 0 1-4.242-4.242", "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143", "m2 2 20 20"],
} as const;

function drawLaneToggle(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean, paths: readonly string[],
  colors: { onBg: string; onInk: string; offInk: string }) {
  if (on) {
    ctx.fillStyle = colors.onBg;
    ctx.beginPath();
    ctx.roundRect(x, y, LANE_BTN_SIZE, LANE_BTN_SIZE, 6);
    ctx.fill();
  }
  const iconSize = 16;
  ctx.save();
  ctx.translate(x + (LANE_BTN_SIZE - iconSize) / 2, y + (LANE_BTN_SIZE - iconSize) / 2);
  ctx.scale(iconSize / 24, iconSize / 24);
  ctx.strokeStyle = on ? colors.onInk : colors.offInk;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Path2D is unavailable outside browsers (e.g. node tests); the hit region still exists there.
  if (typeof Path2D !== "undefined") for (const d of paths) ctx.stroke(new Path2D(d));
  ctx.restore();
}
