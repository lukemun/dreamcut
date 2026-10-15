import {
  resolveMediaTiming,
  supportsOverflowHold,
} from "@/lib/timeline/media";

import type { TimelineBeatBand, TimelineElement } from "./types";
import type { SnapTier } from "./timeline-canvas-model";

type RectRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SquareRegion = {
  x: number;
  y: number;
  size: number;
};

type CircleRegion = {
  x: number;
  y: number;
  radius: number;
};

export const SNAP_TIER_CONFIG: Record<SnapTier, { thresholdPx: number; stickyReleasePx: number | null }> = {
  primary: { thresholdPx: 8, stickyReleasePx: 20 },
  secondary: { thresholdPx: 5, stickyReleasePx: 10 },
  ruler: { thresholdPx: 5, stickyReleasePx: null },
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type LaneScrollLayout = {
  key: string;
  top: number;
  height: number;
};

export function resolveLaneHeightAnchoredScrollTop(input: {
  scrollTop: number;
  viewportHeight: number;
  rulerHeight: number;
  contentHeight: number;
  previousLayouts: LaneScrollLayout[];
  nextLayouts: LaneScrollLayout[];
}) {
  const { previousLayouts, nextLayouts } = input;
  if (previousLayouts.length === 0 || previousLayouts.length !== nextLayouts.length) return input.scrollTop;
  if (previousLayouts.some((layout, index) => layout.key !== nextLayouts[index]?.key)) return input.scrollTop;
  if (previousLayouts.every((layout, index) => Math.abs(layout.height - nextLayouts[index]!.height) < 0.001)) {
    return input.scrollTop;
  }

  const viewportAnchorY = input.scrollTop + input.rulerHeight;
  const previousAnchor = previousLayouts.find((layout, index) => (
    viewportAnchorY >= layout.top
    && (viewportAnchorY < layout.top + layout.height || index === previousLayouts.length - 1)
  )) ?? previousLayouts[0]!;
  const nextAnchor = nextLayouts.find((layout) => layout.key === previousAnchor.key);
  if (!nextAnchor) return input.scrollTop;

  const progressThroughLane = previousAnchor.height > 0
    ? clamp((viewportAnchorY - previousAnchor.top) / previousAnchor.height, 0, 1)
    : 0;
  const nextAnchorY = nextAnchor.top + nextAnchor.height * progressThroughLane;
  const maxScrollTop = Math.max(0, input.contentHeight - input.viewportHeight);
  return clamp(nextAnchorY - input.rulerHeight, 0, maxScrollTop);
}

export function getSnapThresholdPx(tier: SnapTier) {
  return SNAP_TIER_CONFIG[tier].thresholdPx;
}

export function getSnapReleasePx(tier: SnapTier) {
  return SNAP_TIER_CONFIG[tier].stickyReleasePx;
}

export function getRulerTickStep(pxPerSec: number) {
  if (pxPerSec >= 120) return 0.1;
  if (pxPerSec >= 75) return 0.5;
  if (pxPerSec >= 22) return 1;
  if (pxPerSec >= 10) return 2;
  return 5;
}

export function getRulerSnapStep(pxPerSec: number) {
  if (pxPerSec >= 75) return 0.5;
  return null;
}

export function pointInRect(
  x: number,
  y: number,
  region: RectRegion,
) {
  return (
    x >= region.x
    && x <= region.x + region.width
    && y >= region.y
    && y <= region.y + region.height
  );
}

export function pointInSquare(
  x: number,
  y: number,
  region: SquareRegion,
) {
  return (
    x >= region.x
    && x <= region.x + region.size
    && y >= region.y
    && y <= region.y + region.size
  );
}

export function pointInCircle(
  x: number,
  y: number,
  region: CircleRegion,
) {
  const dx = x - region.x;
  const dy = y - region.y;
  return Math.sqrt(dx * dx + dy * dy) <= region.radius;
}

export function distanceToLineSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

export function getGainLineGeometry(input: {
  clipX: number;
  clipY: number;
  clipWidth: number;
  clipHeight: number;
}) {
  const linePaddingX = 8;
  const minLinePaddingY = 12;
  const maxLinePaddingRatio = 0.22;
  const preferredLinePaddingY = input.clipHeight * 0.16;
  const linePaddingY = Math.min(
    Math.max(preferredLinePaddingY, minLinePaddingY),
    input.clipHeight * maxLinePaddingRatio,
  );
  const hitPaddingY = clamp(input.clipHeight * 0.08, 6, 12);
  const lineStartX = input.clipX + linePaddingX;
  const lineEndX = input.clipX + input.clipWidth - linePaddingX;
  const lineTop = input.clipY + linePaddingY;
  const lineBottom = input.clipY + input.clipHeight - linePaddingY;

  return {
    lineStartX,
    lineEndX,
    lineTop,
    lineBottom,
    hitTop: lineTop - hitPaddingY,
    hitHeight: Math.max(hitPaddingY * 2, lineBottom - lineTop + hitPaddingY * 2),
  };
}

export function findRectRegion<T extends RectRegion>(
  regions: T[],
  x: number,
  y: number,
) {
  return regions.find((region) => pointInRect(x, y, region));
}

export function findSquareRegion<T extends SquareRegion>(
  regions: T[],
  x: number,
  y: number,
) {
  return regions.find((region) => pointInSquare(x, y, region));
}

export function collectSnapTargets(
  elementId: string,
  beats: TimelineBeatBand[],
  allElements: TimelineElement[],
  options?: {
    musicalBeatTimes?: number[];
    includeOverflowTargets?: boolean;
    playheadSec?: number | null;
  },
) {
  const targets: number[] = [...(options?.musicalBeatTimes ?? [])];
  const includeOverflowTargets = options?.includeOverflowTargets ?? true;
  if (typeof options?.playheadSec === "number" && Number.isFinite(options.playheadSec)) {
    targets.push(options.playheadSec);
  }
  for (const beat of beats) {
    targets.push(beat.startSec, beat.endSec);
  }
  for (const element of allElements) {
    if (element.id === elementId) continue;
    if (!element.transition_in) {
      targets.push(element.timeline_start);
    }
    if (!element.transition_out) {
      targets.push(element.timeline_start + element.duration);
    }
    if (includeOverflowTargets && supportsOverflowHold(element.type)) {
      const timing = resolveMediaTiming(element);
      const leadingHoldDuration = timing.leadingHoldDuration;
      if (leadingHoldDuration > 0.001) {
        targets.push(Number((element.timeline_start + leadingHoldDuration).toFixed(3)));
      }
      const playableDuration = timing.maxPlayableTimelineDuration;
      const playableEnd = Number((element.timeline_start + leadingHoldDuration + playableDuration).toFixed(3));
      if (playableEnd < element.timeline_start + element.duration - 0.001) {
        targets.push(playableEnd);
      }
    }
  }
  return targets;
}

export function collectSecondarySnapTargets(
  elementId: string,
  allElements: TimelineElement[],
) {
  const targets = new Set<number>();
  for (const element of allElements) {
    if (element.id === elementId) continue;
    if (element.transition_in) {
      targets.add(Number(element.timeline_start.toFixed(3)));
    }
    if (element.transition_out) {
      targets.add(Number((element.timeline_start + element.duration).toFixed(3)));
    }
  }
  return [...targets].sort((a, b) => a - b);
}

export function computeSnap(
  position: number,
  duration: number,
  elementId: string,
  beats: TimelineBeatBand[],
  allElements: TimelineElement[],
  pxPerSec: number,
  options?: {
    musicalBeatTimes?: number[];
    includeOverflowTargets?: boolean;
    playheadSec?: number | null;
  },
): { position: number; snapLine: number | null } {
  const threshold = getSnapThresholdPx("primary") / pxPerSec;
  const targets = collectSnapTargets(elementId, beats, allElements, {
    musicalBeatTimes: options?.musicalBeatTimes,
    includeOverflowTargets: options?.includeOverflowTargets ?? false,
    playheadSec: options?.playheadSec,
  });
  const end = position + duration;
  let best: { position: number; snapLine: number; distance: number } | null = null;

  for (const target of targets) {
    const startDistance = Math.abs(position - target);
    if (startDistance < threshold) {
      const candidate = { position: target, snapLine: target, distance: startDistance };
      if (!best || candidate.distance < best.distance) best = candidate;
    }

    const endDistance = Math.abs(end - target);
    if (endDistance < threshold) {
      const candidate = { position: target - duration, snapLine: target, distance: endDistance };
      if (!best || candidate.distance < best.distance) best = candidate;
    }
  }

  if (best) {
    return { position: best.position, snapLine: best.snapLine };
  }

  return { position, snapLine: null };
}

export function snapBoundaryToTargets(
  boundarySec: number,
  pxPerSec: number,
  targets: number[],
) {
  const threshold = getSnapThresholdPx("primary") / pxPerSec;
  const target = targets.reduce<number | null>((closest, candidate) => {
    const distance = Math.abs(boundarySec - candidate);
    if (distance >= threshold) return closest;
    if (closest == null || distance < Math.abs(boundarySec - closest)) return candidate;
    return closest;
  }, null);
  if (target != null) return { boundarySec: target, snapLine: target };
  return { boundarySec, snapLine: null };
}

export function snapBoundaryToSecondaryTargets(
  boundarySec: number,
  pxPerSec: number,
  targets: number[],
) {
  const threshold = getSnapThresholdPx("secondary") / pxPerSec;
  const target = targets.reduce<number | null>((closest, candidate) => {
    const distance = Math.abs(boundarySec - candidate);
    if (distance >= threshold) return closest;
    if (closest == null || distance < Math.abs(boundarySec - closest)) return candidate;
    return closest;
  }, null);
  if (target != null) return { boundarySec: target, snapLine: target };
  return { boundarySec, snapLine: null };
}

export function computeRulerSnap(
  position: number,
  duration: number,
  pxPerSec: number,
): { position: number; snapLine: number | null } {
  const step = getRulerSnapStep(pxPerSec);
  if (step == null) return { position, snapLine: null };

  const threshold = getSnapThresholdPx("ruler") / pxPerSec;
  const startTarget = Number((Math.round(position / step) * step).toFixed(3));
  const end = position + duration;
  const endTarget = Number((Math.round(end / step) * step).toFixed(3));

  let best: { position: number; snapLine: number; distance: number } | null = null;

  const startDistance = Math.abs(position - startTarget);
  if (startDistance < threshold) {
    best = { position: startTarget, snapLine: startTarget, distance: startDistance };
  }

  const endDistance = Math.abs(end - endTarget);
  if (endDistance < threshold) {
    const candidate = {
      position: endTarget - duration,
      snapLine: endTarget,
      distance: endDistance,
    };
    if (!best || candidate.distance < best.distance) best = candidate;
  }

  if (best) {
    return {
      position: best.position,
      snapLine: best.snapLine,
    };
  }

  return { position, snapLine: null };
}

export function computeSecondarySnap(
  position: number,
  duration: number,
  pxPerSec: number,
  targets: number[],
): { position: number; snapLine: number | null } {
  const startSnap = snapBoundaryToSecondaryTargets(position, pxPerSec, targets);
  const end = position + duration;
  const endSnap = snapBoundaryToSecondaryTargets(end, pxPerSec, targets);

  if (startSnap.snapLine == null && endSnap.snapLine == null) {
    return { position, snapLine: null };
  }

  if (startSnap.snapLine == null) {
    return { position: endSnap.boundarySec - duration, snapLine: endSnap.snapLine };
  }

  if (endSnap.snapLine == null) {
    return { position: startSnap.boundarySec, snapLine: startSnap.snapLine };
  }

  const startDistance = Math.abs(position - startSnap.snapLine);
  const endDistance = Math.abs(end - endSnap.snapLine);
  if (startDistance <= endDistance) {
    return { position: startSnap.boundarySec, snapLine: startSnap.snapLine };
  }
  return { position: endSnap.boundarySec - duration, snapLine: endSnap.snapLine };
}

export function snapBoundaryToRuler(
  boundarySec: number,
  pxPerSec: number,
) {
  const step = getRulerSnapStep(pxPerSec);
  if (step == null) return { boundarySec, snapLine: null };

  const threshold = getSnapThresholdPx("ruler") / pxPerSec;
  const target = Number((Math.round(boundarySec / step) * step).toFixed(3));
  if (Math.abs(boundarySec - target) < threshold) {
    return { boundarySec: target, snapLine: target };
  }
  return { boundarySec, snapLine: null };
}
