import { TIMELINE_RULER_HEIGHT } from "./timeline-geometry";
import { findTransitionRegion } from "./transition-hover";
import {
  distanceToLineSegment,
  findRectRegion,
  findSquareRegion,
  pointInCircle,
} from "@/components/studio/timeline/canvas-helpers";

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
  HideHitRegion,
  TransitionHitRegion,
  ResizeHitRegion,
  VisualKeyframeHitRegion,
} from "./timeline-hit-regions";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const TIMELINE_SIDEBAR_WIDTH = 196;
export { TIMELINE_RULER_HEIGHT } from "./timeline-geometry";

export function resolveClipPointerSelection(
  targetElementId: string,
  selectedElementIds: string[],
  additive: boolean,
) {
  const selected = new Set(selectedElementIds);
  if (additive) {
    const wasSelected = selected.has(targetElementId);
    return {
      selectionMode: wasSelected ? "toggle_off" as const : "add" as const,
      beginDragElementIds: [] as string[],
    };
  }

  // A plain press on a clip that is part of the selection drags the whole
  // selection; the selection collapses to that clip only if it is released
  // without moving. A press on any other clip replaces the selection.
  if (selected.has(targetElementId) && selected.size > 1) {
    return {
      selectionMode: "keep" as const,
      beginDragElementIds: [...selected],
    };
  }

  return {
    selectionMode: "replace" as const,
    beginDragElementIds: [targetElementId],
  };
}

export type PointerDownTarget =
  | { kind: "playhead_scrub" }
  | { kind: "add_lane" }
  | { kind: "mute_lane"; laneKey: string }
  | { kind: "solo_lane"; laneKey: string }
  | { kind: "hide_lane"; laneKey: string }
  | { kind: "beat_menu"; beatId: string }
  | { kind: "beat_resize"; beatId: string; edge: "start" | "end" }
  | { kind: "ruler_scrub" }
  | { kind: "lane_resize"; laneKey: string }
  | { kind: "lane_menu"; laneKey: string }
  | { kind: "clip_menu"; elementId: string }
  | { kind: "clip_resize"; elementId: string; edge: "start" | "end" }
  | { kind: "gain_keyframe"; elementId: string; keyframeIndex: number }
  | { kind: "visual_keyframe"; elementId: string; timeSec: number }
  | { kind: "gain_line"; elementId: string }
  | { kind: "gain_point"; elementId: string; pointIndex: number }
  | { kind: "gain_segment"; elementId: string; leftIndex: number; rightIndex: number }
  | { kind: "transition_chip"; transitionId: string }
  | { kind: "transition_create"; fromElementId: string; toElementId: string }
  | { kind: "clip_body"; elementId: string }
  | { kind: "marquee" }
  | { kind: "clear_selection" };

type ResolvePointerDownTargetArgs = {
  x: number;
  y: number;
  isOverPlayhead: boolean;
  addLaneButtonRect: Rect | null;
  clipRegions: ClipHitRegion[];
  resizeRegions: ResizeHitRegion[];
  transitionRegions: TransitionHitRegion[];
  muteRegions: MuteHitRegion[];
  soloRegions: SoloHitRegion[];
  hideRegions?: HideHitRegion[];
  laneResizeRegions: LaneResizeHitRegion[];
  laneMenuBtnRegions: LaneMenuBtnHitRegion[];
  menuBtnRegions: MenuBtnHitRegion[];
  beatMenuBtnRegions: BeatMenuBtnHitRegion[];
  beatResizeRegions: BeatResizeHitRegion[];
  gainRegions: GainHitRegion[];
  gainKeyframeRegions: GainKeyframeHitRegion[];
  visualKeyframeRegions?: VisualKeyframeHitRegion[];
  envelopePointRegions: EnvelopePointHitRegion[];
  envelopeSegmentRegions: EnvelopeSegmentHitRegion[];
  sidebarWidth?: number;
};

export function resolvePointerDownTarget({
  x,
  y,
  isOverPlayhead,
  addLaneButtonRect,
  clipRegions,
  resizeRegions,
  transitionRegions,
  muteRegions,
  soloRegions,
  hideRegions = [],
  laneResizeRegions,
  laneMenuBtnRegions,
  menuBtnRegions,
  beatMenuBtnRegions,
  beatResizeRegions,
  gainRegions,
  gainKeyframeRegions,
  visualKeyframeRegions = [],
  envelopePointRegions = [],
  envelopeSegmentRegions = [],
  sidebarWidth: sidebarWidthArg,
}: ResolvePointerDownTargetArgs): PointerDownTarget {
  const sidebarW = sidebarWidthArg ?? TIMELINE_SIDEBAR_WIDTH;
  const clipRegion = findRectRegion(clipRegions, x, y);
  // At montage-scale zoom, seam pills and trim handles can consume the
  // entire clip. Reserve its lower half for selecting the actual image.
  if (clipRegion && clipRegion.width <= 32 && y >= clipRegion.y + clipRegion.height / 2
    && !visualKeyframeRegions.some(region => pointInCircle(x, y, region))
    && !envelopePointRegions.some(region => pointInCircle(x, y, region))) {
    return { kind: "clip_body", elementId: clipRegion.elementId };
  }
  const transitionRegion = findTransitionRegion(transitionRegions, x, y);
  if (transitionRegion?.kind === "create") {
    return {
      kind: "transition_create",
      fromElementId: transitionRegion.fromElementId,
      toElementId: transitionRegion.toElementId,
    };
  }

  // A visual keyframe is a precise navigation target. Give its diamond
  // priority over the playhead line and clip resize/body targets so clicking
  // the marker always seeks to the authored keyframe time.
  const visualKeyframeRegion = visualKeyframeRegions.find((region) => pointInCircle(x, y, region));
  if (visualKeyframeRegion) {
    return {
      kind: "visual_keyframe",
      elementId: visualKeyframeRegion.elementId,
      timeSec: visualKeyframeRegion.timeSec,
    };
  }

  const resizeRegion = findRectRegion(resizeRegions, x, y);

  if (isOverPlayhead && !resizeRegion && !clipRegion) {
    return { kind: "playhead_scrub" };
  }

  if (
    addLaneButtonRect
    && x >= addLaneButtonRect.x
    && x <= addLaneButtonRect.x + addLaneButtonRect.width
    && y >= addLaneButtonRect.y
    && y <= addLaneButtonRect.y + addLaneButtonRect.height
  ) {
    return { kind: "add_lane" };
  }

  const muteRegion = findSquareRegion(muteRegions, x, y);
  if (muteRegion) return { kind: "mute_lane", laneKey: muteRegion.laneKey };

  const soloRegion = findSquareRegion(soloRegions, x, y);
  if (soloRegion) return { kind: "solo_lane", laneKey: soloRegion.laneKey };

  const hideRegion = findSquareRegion(hideRegions, x, y);
  if (hideRegion) return { kind: "hide_lane", laneKey: hideRegion.laneKey };

  if (y <= TIMELINE_RULER_HEIGHT && x >= sidebarW) {
    const beatMenuBtnRegion = findSquareRegion(beatMenuBtnRegions, x, y);
    if (beatMenuBtnRegion) return { kind: "beat_menu", beatId: beatMenuBtnRegion.beatId };

    const beatResizeRegion = findRectRegion(beatResizeRegions, x, y);
    if (beatResizeRegion) {
      return { kind: "beat_resize", beatId: beatResizeRegion.beatId, edge: beatResizeRegion.edge };
    }

    return { kind: "ruler_scrub" };
  }

  const laneResizeRegion = findRectRegion(laneResizeRegions, x, y);
  if (laneResizeRegion) return { kind: "lane_resize", laneKey: laneResizeRegion.laneKey };

  const laneMenuBtnRegion = findSquareRegion(laneMenuBtnRegions, x, y);
  if (laneMenuBtnRegion) return { kind: "lane_menu", laneKey: laneMenuBtnRegion.laneKey };

  const menuBtnRegion = findSquareRegion(menuBtnRegions, x, y);
  if (menuBtnRegion) return { kind: "clip_menu", elementId: menuBtnRegion.elementId };

  // Envelope point targets (new model) should win over edge resize handles,
  // especially for first/last keyframes that sit near clip boundaries.
  const envelopePointRegion = envelopePointRegions.find((region) => pointInCircle(x, y, region));
  if (envelopePointRegion) {
    return {
      kind: "gain_point",
      elementId: envelopePointRegion.elementId,
      pointIndex: envelopePointRegion.pointIndex,
    };
  }

  if (resizeRegion) {
    return { kind: "clip_resize", elementId: resizeRegion.elementId, edge: resizeRegion.edge };
  }

  // Envelope segment targets (new model) — distance-to-line-segment hit testing
  const SEGMENT_HIT_THRESHOLD = 8;
  const envelopeSegmentRegion = envelopeSegmentRegions.find(
    (region) => distanceToLineSegment(x, y, region.x1, region.y1, region.x2, region.y2) <= SEGMENT_HIT_THRESHOLD,
  );
  if (envelopeSegmentRegion) {
    return {
      kind: "gain_segment",
      elementId: envelopeSegmentRegion.elementId,
      leftIndex: envelopeSegmentRegion.leftIndex,
      rightIndex: envelopeSegmentRegion.rightIndex,
    };
  }

  // Legacy gain targets (kept for backward compat during migration)
  const keyframeRegion = gainKeyframeRegions.find((region) => pointInCircle(x, y, region));
  if (keyframeRegion) {
    return {
      kind: "gain_keyframe",
      elementId: keyframeRegion.elementId,
      keyframeIndex: keyframeRegion.keyframeIndex,
    };
  }

  const gainRegion = findRectRegion(gainRegions, x, y);
  if (gainRegion) return { kind: "gain_line", elementId: gainRegion.elementId };

  if (transitionRegion) {
    return { kind: "transition_chip", transitionId: transitionRegion.transitionId };
  }

  if (clipRegion) return { kind: "clip_body", elementId: clipRegion.elementId };

  if (x >= sidebarW && y > TIMELINE_RULER_HEIGHT) {
    return { kind: "marquee" };
  }

  return { kind: "clear_selection" };
}
