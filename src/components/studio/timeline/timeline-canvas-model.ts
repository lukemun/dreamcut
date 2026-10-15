import type { LaneDef } from "./types";
import type { EnvelopePoint } from "@/lib/timeline/volume-envelope";

export type ThemeColors = {
  background: string;
  raised: string;
  border: string;
  /** Faint row and edge hairline; the timeline keeps open space instead of boxed lanes. */
  divider?: string;
  textPrimary: string;
  textMuted: string;
  textLight: string;
  selectedBg: string;
  selectedRing: string;
  position: string;
  reviewMarker: string;
  clipVisual?: string;
  clipAudio?: string;
  clipText?: string;
  clipBorder?: string;
  clipInk?: string;
  clipShade?: number;
};

export type SnapTier = "primary" | "secondary" | "ruler";

export type SnapGuide = {
  sec: number;
  kind: SnapTier;
};

export type ImageCacheEntry = {
  status: "loading" | "ready" | "error";
  drawable: CanvasImageSource | null;
};

export function getVideoPreviewFrameCount(durationSec: number) {
  if (durationSec <= 1.5) return 1;
  if (durationSec <= 3) return 2;
  if (durationSec <= 6) return 3;
  if (durationSec <= 10) return 4;
  if (durationSec <= 16) return 5;
  return 6;
}

export function buildVideoPreviewFrameCacheKey(
  url: string,
  sampleIndex: number,
  options: {
    trimStart: number;
    trimEnd: number | null;
    playbackRate: number;
    duration: number;
  },
) {
  const trimEnd = options.trimEnd ?? -1;
  return `${url}#preview-${sampleIndex}-ts:${options.trimStart.toFixed(3)}-te:${trimEnd.toFixed(3)}-pr:${options.playbackRate.toFixed(3)}-d:${options.duration.toFixed(3)}`;
}

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LaneLayout = {
  lane: LaneDef;
  top: number;
  bottom: number;
  height: number;
};

export type DragState = {
  elementId: string;
  draggedElementIds: string[];
  originalStartById: Record<string, number>;
  originalLaneById: Record<string, string>;
  previewLaneById: Record<string, string>;
  pointerOffsetSec: number;
  originalStartSec: number;
  originalDuration: number;
  originalLaneKey: string;
  previewStartSec: number;
  previewLaneKey: string;
};

export type ResizeState = {
  elementId: string;
  edge: "start" | "end";
  originalStartSec: number;
  originalDurationSec: number;
  previewStartSec: number;
  previewDurationSec: number;
  previewLaneKey: string;
  previewPlaybackRate?: number;
  previewProps?: Record<string, unknown> | null;
};

export type BeatResizeState = {
  beatId: string;
  edge: "start" | "end";
  originalBoundarySec: number;
  previewBoundarySec: number;
  minBoundarySec: number;
  maxBoundarySec: number;
};

export type LaneResizeState = {
  laneKey: string;
  previewHeight: number;
};

export type EnvelopePointDragState = {
  elementId: string;
  pointIndex: number;
  clipX: number;
  clipY: number;
  clipWidth: number;
  clipHeight: number;
  effectiveDuration: number;
  previewEnvelope: EnvelopePoint[];
};

export type EnvelopeSegmentDragState = {
  elementId: string;
  leftIndex: number;
  rightIndex: number;
  clipY: number;
  clipHeight: number;
  startPointerY: number;
  originalEnvelope: EnvelopePoint[];
  previewEnvelope: EnvelopePoint[];
};

export type SelectedEnvelopePoint = {
  elementId: string;
  pointIndex: number;
};

export type MarqueeState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

export type HoverCursor = "default" | "ns-resize" | "ew-resize" | "col-resize" | "pointer" | "crosshair" | "copy" | "grab" | "not-allowed";
