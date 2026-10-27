"use client";
import { isCamera } from "@/lib/timeline/camera";
import { buildCompositingLaneOrder } from "@/lib/timeline/compositing-lanes";
import { TIMELINE_RULER_HEIGHT } from "./timeline-geometry";

import {
  isVisualLane,
  isAudioLane,
  isMusicLane,
  isSoundEffectLane,
  isCaptionsLane,
  laneIndexFromKey,
  laneStackIndex,
  laneFamilyKey,
  visualLaneKey,
  VISUAL_LANE_PREFIX,
  AUDIO_LANE_NARRATOR,
  AUDIO_LANE_CHARACTER_PREFIX,
  CAPTIONS_LANE_KEY,
} from "@/lib/timeline/lanes";
import {
  buildCompositionElements as sharedBuildCompositionElements,
  getCompositionDimensions as sharedGetCompositionDimensions,
} from "@/lib/render/composition-adapters";
import type {
  BeatMarker,
  LaneDef,
  PreviewAspectRatio,
  TimelineAspectRatio,
  TimelineBeatBand,
  TimelineElement,
  TimelineSpan,
} from "./types";
import type { CompositionElement } from "@/lib/render/composition-adapters";

export const LANE_HEIGHT = 104;
export const DEFAULT_LANE_SCALE = 0.5;
export const MIN_LANE_SCALE = 0.4;
export const MAX_LANE_SCALE = 4;
export const DEFAULT_ZOOM_LEVEL = 1;
export const MIN_ZOOM_LEVEL = 0.25;
export const MAX_ZOOM_LEVEL = 100;
export const MIN_VISIBLE_DURATION = 1;
export function timelineMaxZoom(totalDuration: number) {
  return Math.max(MAX_ZOOM_LEVEL, totalDuration / MIN_VISIBLE_DURATION);
}
export const PORTRAIT_PREVIEW_HEIGHT = "clamp(40rem, 82vh, 58rem)";
export const PREVIEW_ASPECT_RATIO_STORAGE_KEY_PREFIX = "timeline:preview-aspect-ratio:";

export const SPEED_OPTIONS = [
  { value: "0.25", label: "0.25x" },
  { value: "0.5", label: "0.5x" },
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "2", label: "2x" },
];

const LANE_COLORS: Record<string, string> = {
  visual: "#c87a3b",
  video: "#a06830",
  audio: "#5a8a6e",
  music: "#7c6a8a",
  sfx: "#8a5f7c",
  captions: "#8b7d6b",
};

type LaneType = LaneDef["type"];

type LaneSizingConfig = {
  baseHeight: number;
  minHeight: number;
  maxHeight: number;
};

const LANE_SIZING: Record<LaneType, LaneSizingConfig> = {
  // Start compact, as mainstream NLEs do. Editors can still enlarge every lane with the
  // toolbar scale control or resize one lane when waveform/keyframe detail matters.
  visual: { baseHeight: 80, minHeight: 32, maxHeight: 440 },
  audio: { baseHeight: 56, minHeight: 32, maxHeight: 280 },
  music: { baseHeight: 56, minHeight: 32, maxHeight: 280 },
  captions: { baseHeight: 52, minHeight: 32, maxHeight: 240 },
};

// Chrome inside the timeline canvas that competes with lanes for vertical space.
// Must match RULER_HEIGHT and the footer padding in CanvasTimeline's content-height math.
export const TIMELINE_CANVAS_RULER_HEIGHT = TIMELINE_RULER_HEIGHT;
export const TIMELINE_CANVAS_FOOTER_HEIGHT = 42;

/**
 * Largest lane scale in [MIN_LANE_SCALE, DEFAULT_LANE_SCALE] whose total lane stack
 * (plus canvas chrome) fits the available viewport height. Fit only ever shrinks:
 * a project that already fits keeps the default scale. Per-lane min heights mean the
 * stack cannot always fit — the floor is MIN_LANE_SCALE and vertical scroll remains.
 */
export function resolveFitLaneScale({
  laneTypes,
  availableHeight,
  chromeHeight = TIMELINE_CANVAS_RULER_HEIGHT + TIMELINE_CANVAS_FOOTER_HEIGHT,
}: {
  laneTypes: LaneType[];
  availableHeight: number;
  chromeHeight?: number;
}): number {
  const totalAt = (scale: number) =>
    chromeHeight
    + laneTypes.reduce((sum, type) => {
      const sizing = laneSizingConfig(type);
      return sum + Math.round(clamp(sizing.baseHeight * scale, sizing.minHeight, sizing.maxHeight));
    }, 0);
  if (availableHeight <= 0 || laneTypes.length === 0) return DEFAULT_LANE_SCALE;
  if (totalAt(DEFAULT_LANE_SCALE) <= availableHeight) return DEFAULT_LANE_SCALE;
  if (totalAt(MIN_LANE_SCALE) > availableHeight) return MIN_LANE_SCALE;
  let lo = MIN_LANE_SCALE;
  let hi = DEFAULT_LANE_SCALE;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (totalAt(mid) <= availableHeight) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  // Floor, not round: totalAt is monotone, so rounding up could re-overflow by a pixel.
  return Math.floor(lo * 1000) / 1000;
}

export function secToMs(sec: number): number {
  return Math.round(sec * 1000);
}

export function msToSec(ms: number): number {
  return ms / 1000;
}

export function spanFromElement(el: { timeline_start: number; duration: number }): TimelineSpan {
  return { start: secToMs(el.timeline_start), end: secToMs(el.timeline_start + el.duration) };
}

export function laneColor(laneKey: string): string {
  if (isVisualLane(laneKey)) return LANE_COLORS.visual;
  if (isAudioLane(laneKey)) return LANE_COLORS.audio;
  if (isMusicLane(laneKey)) return LANE_COLORS.music;
  if (isSoundEffectLane(laneKey)) return LANE_COLORS.sfx;
  if (isCaptionsLane(laneKey)) return LANE_COLORS.captions;
  return LANE_COLORS.visual;
}

export function laneSizingConfig(type: LaneType): LaneSizingConfig {
  return LANE_SIZING[type];
}

export function formatTime(seconds: number, fractionDigits = 0): string {
  const m = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - m * 60);
  if (fractionDigits > 0) {
    const s = remainder.toFixed(fractionDigits).padStart(2 + fractionDigits + 1, "0");
    return `${m}:${s}`;
  }
  const s = Math.floor(remainder);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function elementTypeBadge(type: string, element?: Pick<TimelineElement, "type" | "props">): string {
  if (element && isCamera(element)) return "Camera";
  if (type === "still") return "Still";
  if (type === "video_clip") return "Video";
  if (type === "vo_segment" || type === "vo_full") return "Voice";
  if (type === "music") return "Music";
  if (type === "sound_effect") return "SFX";
  if (type === "caption_text") return "Caption";
  return type;
}

export function getCompositionDimensions(aspectRatio: TimelineAspectRatio) {
  return sharedGetCompositionDimensions(aspectRatio);
}

export function isPreviewAspectRatio(value: string | null): value is PreviewAspectRatio {
  return value === "9:16" || value === "16:9";
}

/** Find the next unused visual lane key (visual_0, visual_1, ...). */
export function nextVisualLaneKey(existingKeys: Iterable<string>): string {
  const taken = new Set<number>();
  for (const key of existingKeys) {
    if (isVisualLane(key)) taken.add(laneIndexFromKey(key));
  }
  let i = 0;
  while (taken.has(i)) i++;
  return visualLaneKey(i);
}

export function buildLaneDefs(
  elements: TimelineElement[],
  characters: Map<string, string>,
  laneScale: number,
  laneManualDeltaByKey: Record<string, number>,
  orderedLaneKeys?: Iterable<string>,
): LaneDef[] {
  const seen = new Set<string>();
  const explicitLabelByLane = new Map<string, string>();
  const elementsByLane = new Map<string, TimelineElement[]>();
  for (const el of elements) {
    seen.add(el.lane_key);
    const laneElements = elementsByLane.get(el.lane_key) ?? [];
    laneElements.push(el);
    elementsByLane.set(el.lane_key, laneElements);
    const explicitLabel = el.props?.timeline_lane_label;
    if (typeof explicitLabel === "string" && explicitLabel.trim().length > 0) {
      explicitLabelByLane.set(el.lane_key, explicitLabel.trim());
    }
  }
  const persistedLaneKeys = orderedLaneKeys ? [...orderedLaneKeys] : [];
  for (const key of persistedLaneKeys) seen.add(key);
  seen.add(CAPTIONS_LANE_KEY);

  const visualLanes: LaneDef[] = [];
  const audioLanes: LaneDef[] = [];
  const musicLanes: LaneDef[] = [];
  const sfxLanes: LaneDef[] = [];
  const captionsLanes: LaneDef[] = [];
  const unassignedLanes: LaneDef[] = [];

  const speechAuthorityIds = new Set(
    elements.flatMap((element) => {
      const binding = element.props?.speech_sync_binding;
      if (!binding || typeof binding !== "object") return [];
      const sourceId = (binding as Record<string, unknown>).source_element_id;
      return typeof sourceId === "string" ? [sourceId] : [];
    }),
  );

  const isCameraLane = (laneKey: string) => {
    const laneElements = elementsByLane.get(laneKey) ?? [];
    return laneElements.length > 0 && laneElements.every((element) => isCamera(element));
  };
  const semanticVisualLabel = (laneKey: string): string | null => {
    const laneElements = elementsByLane.get(laneKey) ?? [];
    const technicalLabel = isVisualLane(laneKey) && Number.isFinite(laneIndexFromKey(laneKey))
      ? `V${laneIndexFromKey(laneKey) + 1}`
      : null;
    const withTechnicalLabel = (label: string) => technicalLabel ? `${label} · ${technicalLabel}` : label;
    if (isCameraLane(laneKey)) return withTechnicalLabel("Camera");
    if (laneElements.some((element) => speechAuthorityIds.has(element.id) && element.volume > 0)) {
      return withTechnicalLabel("Original voice");
    }
    if (laneElements.some((element) => {
      const label = element.props?.compound_clip_label;
      return typeof label === "string" && /presenter/i.test(label);
    })) {
      return withTechnicalLabel("Presenter cutout");
    }
    if (laneElements.length > 0 && laneElements.every((element) => {
      const title = element.props?.title;
      return (typeof title === "string" && /black background|background/i.test(title))
        || (typeof element.source_url === "string" && /black-background/i.test(element.source_url));
    })) {
      return withTechnicalLabel("Background");
    }
    return null;
  };

  for (const key of seen) {
    if (isVisualLane(key)) {
      const suffix = key.slice(VISUAL_LANE_PREFIX.length);
      const numericIndex = Number(suffix);
      const fallbackLabel = Number.isFinite(numericIndex) && suffix.trim() !== ""
        ? `Visual ${numericIndex + 1}`
        : suffix
            .split("_")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ") || "Visual";
      visualLanes.push({
        key,
        label: explicitLabelByLane.get(key) ?? semanticVisualLabel(key) ?? fallbackLabel,
        color: laneColor(key),
        type: "visual",
        ...(isCameraLane(key) ? { role: "camera" as const } : {}),
        height: 0,
        minHeight: 0,
        maxHeight: 0,
      });
    } else if (key === AUDIO_LANE_NARRATOR || key.startsWith(`${AUDIO_LANE_NARRATOR}:`)) {
      const stackIndex = laneStackIndex(key);
      audioLanes.push({
        key,
        label: explicitLabelByLane.get(key) ?? (stackIndex === 0 ? "Narrator" : `Narrator ${stackIndex + 1}`),
        color: LANE_COLORS.audio,
        type: "audio",
        height: 0,
        minHeight: 0,
        maxHeight: 0,
      });
    } else if (key.startsWith(AUDIO_LANE_CHARACTER_PREFIX)) {
      const familyKey = laneFamilyKey(key);
      const charId = familyKey.slice(AUDIO_LANE_CHARACTER_PREFIX.length);
      const name = characters.get(charId) ?? "Character";
      const stackIndex = laneStackIndex(key);
      audioLanes.push({
        key,
        label: explicitLabelByLane.get(key) ?? (stackIndex === 0 ? name : `${name} ${stackIndex + 1}`),
        color: LANE_COLORS.audio,
        type: "audio",
        height: 0,
        minHeight: 0,
        maxHeight: 0,
      });
    } else if (isMusicLane(key)) {
      const stackIndex = laneStackIndex(key);
      musicLanes.push({
        key,
        label: explicitLabelByLane.get(key) ?? (stackIndex === 0 ? "Music" : `Music ${stackIndex + 1}`),
        color: LANE_COLORS.music,
        type: "music",
        height: 0,
        minHeight: 0,
        maxHeight: 0,
      });
    } else if (isSoundEffectLane(key)) {
      const stackIndex = laneStackIndex(key);
      sfxLanes.push({
        key,
        label: explicitLabelByLane.get(key) ?? (stackIndex === 0 ? "SFX" : `SFX ${stackIndex + 1}`),
        color: LANE_COLORS.sfx,
        type: "music",
        height: 0,
        minHeight: 0,
        maxHeight: 0,
      });
    } else if (isCaptionsLane(key)) {
      const stackIndex = laneStackIndex(key);
      captionsLanes.push({
        key,
        // These lanes hold titles and captions alike, so the default name says "Text".
        label: explicitLabelByLane.get(key) ?? (stackIndex === 0 ? "Text" : `Text ${stackIndex + 1}`),
        color: LANE_COLORS.captions,
        type: "captions",
        height: 0,
        minHeight: 0,
        maxHeight: 0,
      });
    } else if (elementsByLane.has(key)) {
      // Preserve visibility of legacy or externally malformed rows. Never invent a
      // new saved lane here: the original key keeps selection and repair addressable.
      const rows = elementsByLane.get(key)!;
      const soundOnly = rows.every(row => ["music", "sound_effect", "vo_full", "vo_segment"].includes(row.type));
      unassignedLanes.push({ key, label: "Unassigned", color: soundOnly ? LANE_COLORS.audio : LANE_COLORS.visual,
        type: soundOnly ? "audio" : "visual", height: 0, minHeight: 0, maxHeight: 0 });
    }
  }

  visualLanes.sort((a, b) => laneIndexFromKey(b.key) - laneIndexFromKey(a.key));

  audioLanes.sort((a, b) => {
    const familyA = laneFamilyKey(a.key);
    const familyB = laneFamilyKey(b.key);
    if (familyA !== familyB) {
      if (familyA === AUDIO_LANE_NARRATOR) return -1;
      if (familyB === AUDIO_LANE_NARRATOR) return 1;
      return familyA.localeCompare(familyB);
    }
    return laneStackIndex(b.key) - laneStackIndex(a.key);
  });

  musicLanes.sort((a, b) => laneStackIndex(b.key) - laneStackIndex(a.key));
  sfxLanes.sort((a, b) => laneStackIndex(b.key) - laneStackIndex(a.key));
  captionsLanes.sort((a, b) => laneStackIndex(b.key) - laneStackIndex(a.key));

  // Picture lanes are listed front layer first, in exactly the order the renderer stacks them, so
  // the lane list is the layer order. Sound lanes follow; they have no layer.
  const pictureLaneByKey = new Map([...visualLanes, ...captionsLanes].map((lane) => [lane.key, lane]));
  const pictureLanes = buildCompositingLaneOrder({
    visualLaneKeys: visualLanes.map((lane) => lane.key),
    captionLaneKeys: captionsLanes.map((lane) => lane.key),
    persistedLaneOrderKeys: persistedLaneKeys,
  }).reverse().map((key) => pictureLaneByKey.get(key)!);
  const soundLanes = [...audioLanes, ...musicLanes, ...sfxLanes];
  const persistedOrder = new Map(persistedLaneKeys.map((key, index) => [key, index]));
  const orderedSoundLanes = persistedOrder.size === 0
    ? soundLanes
    : [
      ...soundLanes.filter((lane) => persistedOrder.has(lane.key)).sort((a, b) => persistedOrder.get(a.key)! - persistedOrder.get(b.key)!),
      ...soundLanes.filter((lane) => !persistedOrder.has(lane.key)),
    ];
  const orderedLanes = [...unassignedLanes, ...pictureLanes, ...orderedSoundLanes];

  return orderedLanes.map((lane) => {
    const sizing = laneSizingConfig(lane.type);
    const scaledBaseHeight = sizing.baseHeight * laneScale;
    const manualDelta = laneManualDeltaByKey[lane.key] ?? 0;
    const height = Math.round(
      clamp(scaledBaseHeight + manualDelta, sizing.minHeight, sizing.maxHeight),
    );
    return {
      ...lane,
      height,
      minHeight: sizing.minHeight,
      maxHeight: sizing.maxHeight,
    };
  });
}

export function buildBeatMarkers(beats: BeatMarker[]): TimelineBeatBand[] {
  let fallbackCursor = 0;

  return beats.map((beat) => {
    const duration = beat.duration_seconds ?? 3;
    const start = fallbackCursor;
    fallbackCursor += duration;
    return { ...beat, startSec: start, endSec: start + duration };
  });
}

export function buildCompositionElements(
  elements: TimelineElement[],
  mutedLanes: ReadonlySet<string>,
  hiddenLanes: ReadonlySet<string> = new Set(),
): CompositionElement[] {
  return sharedBuildCompositionElements(elements, mutedLanes, hiddenLanes);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
