/** A stable local slider window; exact entry retains the complete valid domain.
 * Anchor to the authored value, never to each live drag sample. The window reaches at least the
 * value's own size (or ten steps) each way, and each side clips to the domain on its own, so a
 * proposed value near one bound keeps its full room on the other side.
 *
 * `floorFraction` is for layout dials (size, position, px): the window is never smaller
 * than that share of the full domain on each side, and each side clips to the domain on
 * its own, so a value near one bound keeps its full room on the other. Err wide: hitting
 * the end of a slider before reaching the intended look leaves the creator stuck. */
export function numericWorkingRange(anchor: number, min: number, max: number, step: number, options: { floorFraction?: number } = {}) {
  if (!Number.isFinite(anchor) || anchor <= min || anchor >= max || max <= min) return {min, max};
  if (options.floorFraction) {
    const radius = Math.max(Math.abs(anchor), step * 10, (max - min) * options.floorFraction);
    return onSteps({min: Math.max(min, anchor - radius), max: Math.min(max, anchor + radius)}, step);
  }
  const radius = Math.max(Math.abs(anchor), step * 10);
  // Clamped: anchor - (anchor - min) can land a rounding error below min, which the field then refuses.
  return onSteps({min: Math.max(min, anchor - radius), max: Math.min(max, anchor + radius)}, step);
}

/** Whole-number dials (a variation seed, a point count) end on whole steps, or every drag lands between them. */
function onSteps(range: {min: number; max: number}, step: number) {
  if (!Number.isInteger(step) || step <= 0) return range;
  const min = Math.ceil(range.min / step - 1e-9) * step + 0; // + 0 turns -0 into 0
  const max = Math.floor(range.max / step + 1e-9) * step;
  return max >= min ? {min, max} : range;
}
