/** A stable local slider window; exact entry retains the complete valid domain.
 * Anchor to the authored value, never to each live drag sample.
 *
 * `floorFraction` is for layout dials (size, position, px): the window is never smaller
 * than that share of the full domain on each side, and each side clips to the domain on
 * its own, so a value near one bound keeps its full room on the other. Err wide: hitting
 * the end of a slider before reaching the intended look leaves the creator stuck. */
export function numericWorkingRange(anchor: number, min: number, max: number, step: number, options: { floorFraction?: number } = {}) {
  if (!Number.isFinite(anchor) || anchor <= min || anchor >= max || max <= min) return {min, max};
  if (options.floorFraction) {
    const radius = Math.max(Math.abs(anchor), step * 10, (max - min) * options.floorFraction);
    return {min: Math.max(min, anchor - radius), max: Math.min(max, anchor + radius)};
  }
  const radius = Math.min(Math.max(Math.abs(anchor), step * 10), anchor - min, max - anchor);
  return {min: anchor - radius, max: anchor + radius};
}
