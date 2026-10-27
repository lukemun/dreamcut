/** Scroll velocity in screen pixels/second; independent of timeline zoom. */
export function trimEdgeScrollVelocity(pointerX: number, left: number, right: number): number {
  const zone = Math.min(56, Math.max(0, (right - left) / 3));
  if (zone === 0) return 0;
  if (pointerX < left + zone) return -600 * Math.min(1, (left + zone - pointerX) / zone) ** 2;
  if (pointerX > right - zone) return 600 * Math.min(1, (pointerX - right + zone) / zone) ** 2;
  return 0;
}

export function trimEdgeScrollPosition(scroll: number, velocity: number, elapsedMs: number, pxPerSec: number, maxScroll: number): number {
  return Math.max(0, Math.min(maxScroll, scroll + velocity * Math.min(50, Math.max(0, elapsedMs)) / 1000 / pxPerSec));
}

/** A press at a trim edge is still selection until the pointer intentionally moves. */
export function trimGestureActivated(startX: number | null, clientX: number, alreadyActive: boolean): boolean {
  return alreadyActive || (startX !== null && Math.abs(clientX - startX) >= 4);
}
