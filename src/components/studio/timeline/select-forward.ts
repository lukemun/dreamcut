import type { TimelineElement } from "./types";

const PLAYHEAD_EPSILON_SECONDS = 1e-6;

/**
 * Track-select semantics: select active items whose left edge is at or to the
 * right of the playhead. A clip crossing the playhead is intentionally not
 * included; split it first, then Select forward to operate on the new right
 * half and everything after it.
 */
export function selectForwardElementIds(
  elements: readonly TimelineElement[],
  playheadSec: number,
): string[] {
  return elements
    .filter((element) => (
      element.removed_at == null
      && element.props?.disabled !== true
      && element.timeline_start >= playheadSec - PLAYHEAD_EPSILON_SECONDS
    ))
    .map((element) => element.id);
}

/**
 * Select active items whose right edge is at or to the left of the playhead.
 * As with forward selection, a clip crossing the playhead is excluded until it
 * is split so the selection never includes media on the other side.
 */
export function selectBackwardElementIds(
  elements: readonly TimelineElement[],
  playheadSec: number,
): string[] {
  return elements
    .filter((element) => (
      element.removed_at == null
      && element.props?.disabled !== true
      && element.timeline_start + element.duration <= playheadSec + PLAYHEAD_EPSILON_SECONDS
    ))
    .map((element) => element.id);
}
