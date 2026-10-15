import type { TransitionHitRegion } from "./timeline-hit-regions";

/** Dense cuts can have overlapping targets; hover and click must choose the same nearest seam. */
export function findTransitionRegion(regions: TransitionHitRegion[], x: number, y: number) {
  return regions.filter(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height)
    .reduce<TransitionHitRegion | undefined>((nearest, r) => !nearest
      || Math.abs(x - r.x - r.width / 2) < Math.abs(x - nearest.x - nearest.width / 2) ? r : nearest, undefined);
}

export function transitionHoverId(region: TransitionHitRegion | undefined): string | null {
  return !region ? null : region.kind === "existing" ? region.transitionId
    : `create:${region.fromElementId}:${region.toElementId}`;
}
