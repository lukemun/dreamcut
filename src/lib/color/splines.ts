/** Curve interpolation for grading curves. Points are [x, y] pairs; callers keep x sorted. */

export type CurvePoint = readonly [number, number];

function sorted(points: readonly CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a[0] - b[0]).filter((p, i, all) => i === 0 || p[0] - all[i - 1]![0] > 1e-6);
}

/**
 * Monotone cubic (Fritsch–Carlson) through the points, extended linearly past the ends with the end
 * segment's slope. Used for tone curves so they can never fold brightness back on itself.
 */
export function monotoneSpline(input: readonly CurvePoint[]): (x: number) => number {
  const points = sorted(input);
  if (points.length === 0) return (x) => x;
  if (points.length === 1) { const dy = points[0]![1] - points[0]![0]; return (x) => x + dy; }
  const n = points.length;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const delta = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  const m = Array.from({ length: n }, (_, i) => i === 0 ? delta[0]! : i === n - 1 ? delta[n - 2]! : (delta[i - 1]! * delta[i]! <= 0 ? 0 : (delta[i - 1]! + delta[i]!) / 2));
  for (let i = 0; i < n - 1; i += 1) {
    if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / delta[i]!, b = m[i + 1]! / delta[i]!, s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * delta[i]!; m[i + 1] = t * b * delta[i]!; }
  }
  return (x) => {
    if (x <= xs[0]!) return ys[0]! + (x - xs[0]!) * delta[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]! + (x - xs[n - 1]!) * delta[n - 2]!;
    let i = 0;
    while (x > xs[i + 1]!) i += 1;
    const h = xs[i + 1]! - xs[i]!, t = (x - xs[i]!) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h * m[i + 1]!;
  };
}

/**
 * Smooth curve that is flat outside its points, with overshoot-free (Fritsch–Carlson) tangents so a
 * run of equal values stays flat. With `periodic`, x wraps at 1 and the curve joins itself (hue
 * curves). No points means `identity`.
 */
export function smoothCurve(input: readonly CurvePoint[], identity: number, periodic = false): (x: number) => number {
  const base = sorted(periodic ? input.map(([x, y]) => [((x % 1) + 1) % 1, y] as const) : input);
  if (base.length === 0) return () => identity;
  if (base.length === 1) return () => base[0]![1];
  const n = base.length;
  // Periodic curves get one wrapped point on each side so the first and last segments join smoothly.
  const points: CurvePoint[] = periodic ? [[base[n - 1]![0] - 1, base[n - 1]![1]], ...base, [base[0]![0] + 1, base[0]![1]]] : base;
  const count = points.length;
  const secant = Array.from({ length: count - 1 }, (_, i) => (points[i + 1]![1] - points[i]![1]) / (points[i + 1]![0] - points[i]![0]));
  const tangent = Array.from({ length: count }, (_, i) => {
    if (i === 0 || i === count - 1) return 0;
    const a = secant[i - 1]!, b = secant[i]!;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  // The wrapped copies take their originals' tangents so the join is smooth.
  if (periodic) { tangent[0] = tangent[count - 2]!; tangent[count - 1] = tangent[1]!; }
  return (raw) => {
    const x = periodic ? ((raw % 1) + 1) % 1 : raw;
    if (!periodic && x <= points[0]![0]) return points[0]![1];
    if (!periodic && x >= points[count - 1]![0]) return points[count - 1]![1];
    let i = 0;
    while (i < count - 2 && x > points[i + 1]![0]) i += 1;
    const h = points[i + 1]![0] - points[i]![0], t = (x - points[i]![0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * points[i]![1] + (t3 - 2 * t2 + t) * h * tangent[i]! + (-2 * t3 + 3 * t2) * points[i + 1]![1] + (t3 - t2) * h * tangent[i + 1]!;
  };
}
