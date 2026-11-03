/** Pointer-only magnetism; keyboard adjustments stay precise. */
export function snapPanelSize(value: number, points: readonly number[], min: number, max: number, threshold = 10): number {
  let result = value, distance = threshold;
  for (const point of points) {
    const delta = Math.abs(value - point);
    if (Number.isFinite(point) && point >= min && point <= max && delta <= distance) {
      result = point;
      distance = delta;
    }
  }
  return result;
}
