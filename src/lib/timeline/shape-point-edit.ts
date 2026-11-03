import { readKeyframeMap, upsertKeyframe, writeKeyframeMap } from "./keyframes";
import { decodeShapePoints, encodeShapePoints, normalizeShapeContours, shapePointsAnimated, type ShapeContour, type ShapePoint } from "./shapes";

/**
 * Point edits on freeform shape contours, in the shape's unit box. Each returns new contours and
 * leaves its input alone, so a drag can restart from the contours it began with.
 */

type Vec = [number, number];
export type PointRef = { contour: number; point: number };

const replacePoint = (contours: ShapeContour[], ref: PointRef, next: ShapePoint) =>
  contours.map((contour, ci) => ci !== ref.contour ? contour
    : { ...contour, points: contour.points.map((p, pi) => pi === ref.point ? next : p) });

const round = (value: number) => Number(value.toFixed(5));
const roundHandle = (handle: Vec): Vec => [round(handle[0]), round(handle[1])];

/** Move a point; its handles travel with it. */
export function movePoint(contours: ShapeContour[], ref: PointRef, x: number, y: number): ShapeContour[] {
  const p = contours[ref.contour]?.points[ref.point];
  return p ? replacePoint(contours, ref, { ...p, x: round(x), y: round(y) }) : contours;
}

/**
 * Move one handle to an offset from its point. Unless `independent`, the opposite handle turns to
 * stay in line and keeps its own length, so a smooth curve stays smooth.
 */
export function moveHandle(contours: ShapeContour[], ref: PointRef, side: "in" | "out", offset: Vec, independent = false): ShapeContour[] {
  const p = contours[ref.contour]?.points[ref.point];
  if (!p) return contours;
  const next: ShapePoint = { ...p, [side]: roundHandle(offset) };
  const other = side === "in" ? "out" : "in";
  const opposite = p[other];
  const length = Math.hypot(offset[0], offset[1]);
  if (!independent && opposite && length > 1e-9) {
    const keep = Math.hypot(opposite[0], opposite[1]);
    next[other] = roundHandle([-offset[0] / length * keep, -offset[1] / length * keep]);
  }
  return replacePoint(contours, ref, next);
}

/** Remove a point; a contour keeps at least two points. */
export function deletePoint(contours: ShapeContour[], ref: PointRef): ShapeContour[] {
  const contour = contours[ref.contour];
  if (!contour || contour.points.length <= 2) return contours;
  return contours.map((c, ci) => ci !== ref.contour ? c : { ...c, points: c.points.filter((_, pi) => pi !== ref.point) });
}

/** Segment `segment` runs from point `segment` to the next one (wrapping on a closed contour). */
export function segmentCount(contour: ShapeContour) {
  return contour.closed ? contour.points.length : contour.points.length - 1;
}

function segmentControls(contour: ShapeContour, segment: number): [Vec, Vec, Vec, Vec] {
  const a = contour.points[segment], b = contour.points[(segment + 1) % contour.points.length];
  const ao = a.out ?? [0, 0], bi = b.in ?? [0, 0];
  return [[a.x, a.y], [a.x + ao[0], a.y + ao[1]], [b.x + bi[0], b.y + bi[1]], [b.x, b.y]];
}

const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function segmentPointAt(contour: ShapeContour, segment: number, t: number): Vec {
  const [p0, p1, p2, p3] = segmentControls(contour, segment);
  const a = lerp(p0, p1, t), b = lerp(p1, p2, t), c = lerp(p2, p3, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

/** Closest place on any segment to `target`, measured after `scale` maps unit coordinates to pixels. */
export function nearestSegment(contours: ShapeContour[], target: Vec, scale: Vec = [1, 1]): { contour: number; segment: number; t: number; distance: number } | null {
  let best: { contour: number; segment: number; t: number; distance: number } | null = null;
  contours.forEach((contour, ci) => {
    for (let s = 0; s < segmentCount(contour); s++) {
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, [x, y] = segmentPointAt(contour, s, t);
        const distance = Math.hypot((x - target[0]) * scale[0], (y - target[1]) * scale[1]);
        if (!best || distance < best.distance) best = { contour: ci, segment: s, t, distance };
      }
    }
  });
  return best;
}

/** Add a point on a segment at `t` without changing the outline (de Casteljau split). */
export function insertPoint(contours: ShapeContour[], contourIndex: number, segment: number, t: number): { contours: ShapeContour[]; ref: PointRef } {
  const contour = contours[contourIndex];
  const n = contour.points.length, nextIndex = (segment + 1) % n;
  const a = contour.points[segment], b = contour.points[nextIndex];
  const [p0, p1, p2, p3] = segmentControls(contour, segment);
  const curved = Boolean(a.out || b.in);
  const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t), m = lerp(r0, r1, t);
  const added: ShapePoint = curved
    ? { x: round(m[0]), y: round(m[1]), in: roundHandle([r0[0] - m[0], r0[1] - m[1]]), out: roundHandle([r1[0] - m[0], r1[1] - m[1]]) }
    : { x: round(m[0]), y: round(m[1]) };
  const points = contour.points.map((p, i) => {
    if (!curved) return p;
    if (i === segment) return { ...p, out: roundHandle([q0[0] - p0[0], q0[1] - p0[1]]) };
    if (i === nextIndex) return { ...p, in: roundHandle([q2[0] - p3[0], q2[1] - p3[1]]) };
    return p;
  });
  points.splice(segment + 1, 0, added);
  return {
    contours: contours.map((c, ci) => ci === contourIndex ? { ...c, points } : c),
    ref: { contour: contourIndex, point: segment + 1 },
  };
}

/** A curve point becomes a corner; a corner gets smooth handles along its neighbours. */
export function toggleSmooth(contours: ShapeContour[], ref: PointRef): ShapeContour[] {
  const contour = contours[ref.contour];
  const p = contour?.points[ref.point];
  if (!p) return contours;
  if (p.in || p.out) return replacePoint(contours, ref, { x: p.x, y: p.y });
  const n = contour.points.length;
  const prev = contour.points[(ref.point - 1 + n) % n], next = contour.points[(ref.point + 1) % n];
  const hasPrev = contour.closed || ref.point > 0, hasNext = contour.closed || ref.point < n - 1;
  const from = hasPrev ? prev : p, to = hasNext ? next : p;
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  if (length < 1e-9) return contours;
  const ux = dx / length, uy = dy / length;
  const reach = (q: ShapePoint) => Math.hypot(q.x - p.x, q.y - p.y) / 3;
  return replacePoint(contours, ref, {
    x: p.x, y: p.y,
    ...(hasPrev ? { in: roundHandle([-ux * reach(prev), -uy * reach(prev)]) } : {}),
    ...(hasNext ? { out: roundHandle([ux * reach(next), uy * reach(next)]) } : {}),
  });
}

type PropsLike = Record<string, unknown> | null | undefined;

/**
 * Props patch that saves edited points. A shape whose points are keyframed gets a key at
 * clip-local `timeSeconds` (a new one, or the one already there), so editing at another
 * moment makes it morph; otherwise the outline itself changes.
 */
export function pointEditPatch(props: PropsLike, timeSeconds: number, next: ShapeContour[]): Record<string, unknown> {
  if (!shapePointsAnimated(props)) return { shape_contours: next };
  const keyed = upsertKeyframe(props, "shape_contours", timeSeconds, encodeShapePoints(next));
  return { keyframes: keyed.keyframes };
}

/**
 * Apply a change in structure (a point added or removed) to the outline and to every point
 * keyframe the same way, so all keys keep matching and the shape still morphs.
 */
function restructure(props: PropsLike, change: (contours: ShapeContour[]) => ShapeContour[]): Record<string, unknown> {
  const base = normalizeShapeContours(props?.shape_contours);
  const nextBase = change(base);
  if (!shapePointsAnimated(props)) return { shape_contours: nextBase };
  const map = readKeyframeMap(props);
  map.shape_contours = map.shape_contours!.map((key) => {
    const outline = decodeShapePoints(base, key.v as number[]);
    return outline ? { ...key, v: encodeShapePoints(change(outline)) } : key;
  });
  return { shape_contours: nextBase, keyframes: writeKeyframeMap(props, map).keyframes };
}

export function insertPointEverywhere(props: PropsLike, contourIndex: number, segment: number, t: number) {
  return { patch: restructure(props, (contours) => insertPoint(contours, contourIndex, segment, t).contours), ref: { contour: contourIndex, point: segment + 1 } };
}

export function deletePointEverywhere(props: PropsLike, ref: PointRef): Record<string, unknown> | null {
  const base = normalizeShapeContours(props?.shape_contours);
  if (deletePoint(base, ref) === base) return null;
  return restructure(props, (contours) => deletePoint(contours, ref));
}

function segmentLength(contour: ShapeContour, segment: number) {
  let length = 0, [px, py] = segmentPointAt(contour, segment, 0);
  for (let i = 1; i <= 16; i++) {
    const [x, y] = segmentPointAt(contour, segment, i / 16);
    length += Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  return length;
}

/** Add points (splitting the longest edge each time) until the contour has `count`; the outline does not change. */
function subdivideTo(contour: ShapeContour, count: number): ShapeContour {
  let current = contour;
  while (current.points.length < count) {
    let longest = 0, best = -1;
    for (let s = 0; s < segmentCount(current); s++) {
      const length = segmentLength(current, s);
      if (length > best) { best = length; longest = s; }
    }
    current = insertPoint([current], 0, longest, 0.5).contours[0];
  }
  return current;
}

/** Start a closed contour at the point that best lines up with `target`, so points travel the shortest way. */
function alignStart(contour: ShapeContour, target: ShapeContour): ShapeContour {
  if (!contour.closed || contour.points.length !== target.points.length) return contour;
  const n = contour.points.length;
  let best = 0, bestCost = Infinity;
  for (let shift = 0; shift < n; shift++) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const p = contour.points[(i + shift) % n], q = target.points[i];
      cost += (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    }
    if (cost < bestCost) { bestCost = cost; best = shift; }
  }
  return best === 0 ? contour : { ...contour, points: [...contour.points.slice(best), ...contour.points.slice(0, best)] };
}

/**
 * Give several outlines the same structure so one can morph into the next: the same number of
 * contours (a missing contour grows from a point at its partner's centre), the same number of
 * points in each (added along the longest edges, so no outline changes shape) and the same open or
 * closed flag (the first outline's). Each closed contour then starts where it best lines up with
 * the previous outline's.
 */
export function matchOutlines(outlines: ShapeContour[][]): ShapeContour[][] {
  const contourCount = Math.max(0, ...outlines.map((outline) => outline.length));
  const partner = (index: number) => outlines.find((outline) => outline[index])![index];
  const padded = outlines.map((outline) => Array.from({ length: contourCount }, (_, index) => {
    if (outline[index]) return outline[index];
    const model = partner(index);
    const cx = model.points.reduce((sum, p) => sum + p.x, 0) / model.points.length;
    const cy = model.points.reduce((sum, p) => sum + p.y, 0) / model.points.length;
    return { closed: model.closed, points: model.points.map(() => ({ x: cx, y: cy })) };
  }));
  const matched = padded.map((outline) => outline.map((contour, index) => {
    const closed = padded[0][index].closed;
    const target = Math.max(...padded.map((other) => other[index].points.length));
    return subdivideTo({ ...contour, closed }, target);
  }));
  for (let i = 1; i < matched.length; i++) matched[i] = matched[i].map((contour, index) => alignStart(contour, matched[i - 1][index]));
  return matched;
}
