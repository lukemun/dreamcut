import { readKeyframeMap, resolveNumberKeyframe, resolveTupleKeyframe } from "./keyframes";
import { resolveMediaTransformAtTime } from "./media-transform";
import { inkContourPathD } from "./shape-ink";
import { cameraPoint, cameraViewFor, type CameraElement, type CameraView } from "./camera";
import { resolveAnimationProps } from "./animation-presets";

/**
 * Shape elements: an outline drawn from numbers, with no media source. Every shape is a set of
 * contours (points with optional curve handles). The base shapes are presets that generate
 * contours from a few dials; `path` is a freeform shape that stores its own contours, which is
 * what "Edit points" turns any preset into. Both renderers draw the same frame from
 * `shapeFrameAt`, so preview, GPU and export agree.
 *
 * Units: width and height are fractions of the canvas height (so a 0.4 × 0.4 ellipse is a
 * circle at any aspect ratio); stroke width is pixels at 1080 canvas height; corner radius is
 * a fraction of the shorter side. Freeform points live in a unit box from -0.5 to 0.5 that is
 * stretched to the shape's width and height. Position, scale and opacity reuse the media
 * transform fields (`media_offset_x/y` in half-canvas units, `media_scale`, `media_opacity`).
 */

export const SHAPE_KINDS = ["rect", "ellipse", "polygon", "star", "line", "arc", "arrow", "path", "camera"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
/** What each kind is called in the editor and on review cards. */
export const SHAPE_KIND_LABELS: Record<ShapeKind, string> = {
  rect: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", star: "Star", line: "Line", arc: "Arc", arrow: "Arrow", path: "Freeform", camera: "Camera",
};

/** One point of a freeform contour. Handles are offsets from the point, in the same unit box. */
export type ShapePoint = { x: number; y: number; in?: [number, number]; out?: [number, number] };
export type ShapeContour = { closed: boolean; points: ShapePoint[] };

export type ShapeProps = {
  shape_kind: ShapeKind;
  shape_width: number;
  shape_height: number;
  /** Fill colour, or null for no fill. */
  shape_fill: string | null;
  /** Outline colour, or null for no outline. */
  shape_stroke: string | null;
  shape_stroke_width: number;
  shape_corner_radius: number;
  /** Polygon and star: number of corners or points. */
  shape_sides: number;
  /** Star: inner radius as a share of the outer one. */
  shape_star_depth: number;
  /** Arc: start and end, in degrees clockwise from the top. */
  shape_arc_start: number;
  shape_arc_end: number;
  /** Arrow: head length as a share of the width, shaft thickness as a share of the height. */
  shape_arrow_head: number;
  shape_arrow_shaft: number;
  /** Freeform contours, for `path`. */
  shape_contours: ShapeContour[];
  /** How much of the outline is drawn, 0 to 1, tracing from each contour's first point. */
  shape_draw: number;
  /** Hand-drawn outline, 0 to 1: how much each line thins toward its ends. */
  shape_taper: number;
  /** Hand-drawn outline, 0 to 1: how far each line drifts and swells. */
  shape_wobble: number;
  /** Hand-drawn outline: picks a different but repeatable wobble. */
  shape_seed: number;
  /** Clockwise turn in degrees. */
  media_rotation: number;
  media_opacity: number;
};

export const SHAPE_LIMITS = {
  shape_width: { min: 0.005, max: 4 },
  shape_height: { min: 0.005, max: 4 },
  shape_stroke_width: { min: 0, max: 200 },
  shape_corner_radius: { min: 0, max: 0.5 },
  shape_sides: { min: 3, max: 24 },
  shape_star_depth: { min: 0.05, max: 0.95 },
  shape_arc_start: { min: -360, max: 360 },
  shape_arc_end: { min: -360, max: 720 },
  shape_arrow_head: { min: 0.05, max: 0.9 },
  shape_arrow_shaft: { min: 0.02, max: 1 },
  shape_draw: { min: 0, max: 1 },
  shape_taper: { min: 0, max: 1 },
  shape_wobble: { min: 0, max: 1 },
  shape_seed: { min: 0, max: 9999 },
  media_rotation: { min: -720, max: 720 },
  media_opacity: { min: 0, max: 1 },
} as const;

export const MAX_SHAPE_CONTOURS = 64;
export const MAX_SHAPE_POINTS = 2000;

export const DEFAULT_SHAPE_PROPS: ShapeProps = {
  shape_kind: "rect",
  shape_width: 0.4,
  shape_height: 0.4,
  shape_fill: "#1a7fff",
  shape_stroke: null,
  shape_stroke_width: 8,
  shape_corner_radius: 0,
  shape_sides: 5,
  shape_star_depth: 0.5,
  shape_arc_start: 0,
  shape_arc_end: 270,
  shape_arrow_head: 0.35,
  shape_arrow_shaft: 0.4,
  shape_contours: [],
  shape_draw: 1,
  shape_taper: 0,
  shape_wobble: 0,
  shape_seed: 0,
  media_rotation: 0,
  media_opacity: 1,
};

/** Outline colour a shape gets when its outline is switched on. */
export const DEFAULT_SHAPE_STROKE = "#ffffff";

/** Keyframed channels a shape adds to the media transform (scale, position) and opacity. */
export const SHAPE_KEYFRAME_FIELDS = ["media_rotation", "shape_draw", "shape_contours"] as const;

/**
 * Morphing: a `shape_contours` keyframe holds a freeform shape's points as one flat list,
 * six numbers per point (x, y, in handle, out handle), in the order of the stored contours.
 * Keyframe values are plain numbers so retiming, splitting and deleting keys work as for any
 * other setting. The stored `shape_contours` give the outline its structure (which contours,
 * how many points, open or closed); a key with a different number of points is not drawn.
 */
const POINT_STRIDE = 6;

export function encodeShapePoints(contours: ShapeContour[]): number[] {
  return contours.flatMap((contour) => contour.points.flatMap((p) => [p.x, p.y, p.in?.[0] ?? 0, p.in?.[1] ?? 0, p.out?.[0] ?? 0, p.out?.[1] ?? 0]));
}

export function decodeShapePoints(structure: ShapeContour[], flat: readonly number[]): ShapeContour[] | null {
  if (flat.length !== shapePointValueCount(structure)) return null;
  let i = 0;
  const handle = (x: number, y: number): [number, number] | undefined => (Math.abs(x) > 1e-9 || Math.abs(y) > 1e-9 ? [x, y] : undefined);
  return structure.map((contour) => ({
    closed: contour.closed,
    points: contour.points.map(() => {
      const [x, y, ix, iy, ox, oy] = flat.slice(i, i += POINT_STRIDE);
      const handleIn = handle(ix, iy), handleOut = handle(ox, oy);
      return { x, y, ...(handleIn ? { in: handleIn } : {}), ...(handleOut ? { out: handleOut } : {}) };
    }),
  }));
}

export function shapePointValueCount(contours: ShapeContour[]) {
  return contours.reduce((sum, contour) => sum + contour.points.length, 0) * POINT_STRIDE;
}

/** True when a freeform shape's points are keyframed. */
export function shapePointsAnimated(rawProps: PropsLike) {
  return (readKeyframeMap(rawProps).shape_contours?.length ?? 0) > 0;
}

/** A freeform shape's points at clip-local `timeSeconds`, morphing between point keyframes. */
export function shapeContoursAt(rawProps: PropsLike, timeSeconds: number, props: ShapeProps = resolveShapeProps(rawProps)): ShapeContour[] {
  if (props.shape_kind !== "path" || !shapePointsAnimated(rawProps)) return props.shape_contours;
  const base = encodeShapePoints(props.shape_contours);
  const flat = resolveTupleKeyframe(rawProps, "shape_contours", timeSeconds, base, { length: base.length });
  return decodeShapePoints(props.shape_contours, flat) ?? props.shape_contours;
}

/** Every prop a shape element draws from; anything else on a shape is not drawn. */
export const SHAPE_PROP_KEYS = [
  "shape_kind", "shape_width", "shape_height", "shape_fill", "shape_stroke", "shape_stroke_width", "shape_corner_radius",
  "shape_sides", "shape_star_depth", "shape_arc_start", "shape_arc_end", "shape_arrow_head", "shape_arrow_shaft", "shape_contours",
  "shape_draw", "shape_taper", "shape_wobble", "shape_seed", "camera_id", "media_rotation", "media_opacity", "media_scale", "media_offset_x", "media_offset_y", "keyframes",
] as const;

/** Entrances and exits a shape draws: a fade in or out over the clip's first or last seconds. */
export const SHAPE_ANIMATION_PRESETS = ["none", "fade"] as const;
export const SHAPE_ANIMATION_PROP_KEYS = ["animationIn", "animationOut", "animationInDuration", "animationOutDuration"] as const;

/** The share (0 to 1) a shape's fade in and fade out leave visible at clip-local `localSeconds`. */
export function shapeFadeOpacity(props: PropsLike, localSeconds: number, durationSeconds: number) {
  const animation = resolveAnimationProps(props);
  const fadeIn = animation.animationIn === "fade" && animation.animationInDuration > 0
    ? clamp(localSeconds / animation.animationInDuration, 0, 1) : 1;
  const fadeOut = animation.animationOut === "fade" && animation.animationOutDuration > 0
    ? clamp((durationSeconds - localSeconds) / animation.animationOutDuration, 0, 1) : 1;
  return Math.min(fadeIn, fadeOut);
}

/** Keyframe channels a shape may carry. */
export const SHAPE_ANIMATED_FIELDS = ["media_scale", "media_offset_x", "media_offset_y", "media_opacity", ...SHAPE_KEYFRAME_FIELDS] as const;

type PropsLike = Record<string, unknown> | null | undefined;
type NumericKey = keyof typeof SHAPE_LIMITS;
const HEX = /^#[0-9a-fA-F]{6}$/;
const KAPPA = 0.5522847498; // cubic handle length for a quarter circle
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const limited = (raw: PropsLike, key: NumericKey) =>
  clamp(finite(raw?.[key], DEFAULT_SHAPE_PROPS[key] as number), SHAPE_LIMITS[key].min, SHAPE_LIMITS[key].max);
const colour = (value: unknown, fallback: string | null) => (value === null ? null : typeof value === "string" && HEX.test(value) ? value : fallback);

function readHandle(value: unknown): [number, number] | undefined {
  return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number" && Number.isFinite(v))
    ? [clamp(value[0], -4, 4), clamp(value[1], -4, 4)] : undefined;
}

/** Keep only well-formed contours; points are clamped to a generous box around the unit box. */
export function normalizeShapeContours(raw: unknown): ShapeContour[] {
  if (!Array.isArray(raw)) return [];
  const contours: ShapeContour[] = [];
  let total = 0;
  for (const item of raw.slice(0, MAX_SHAPE_CONTOURS)) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { points?: unknown }).points)) continue;
    const points: ShapePoint[] = [];
    for (const p of (item as { points: unknown[] }).points) {
      if (total >= MAX_SHAPE_POINTS) break;
      const point = p as Record<string, unknown>;
      if (!point || typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const handleIn = readHandle(point.in), handleOut = readHandle(point.out);
      points.push({ x: clamp(point.x, -2, 2), y: clamp(point.y, -2, 2), ...(handleIn ? { in: handleIn } : {}), ...(handleOut ? { out: handleOut } : {}) });
      total += 1;
    }
    if (points.length >= 2) contours.push({ closed: (item as { closed?: unknown }).closed !== false, points });
  }
  return contours;
}

export function resolveShapeProps(raw: PropsLike): ShapeProps {
  return {
    shape_kind: SHAPE_KINDS.includes(raw?.shape_kind as ShapeKind) ? raw?.shape_kind as ShapeKind : DEFAULT_SHAPE_PROPS.shape_kind,
    shape_width: limited(raw, "shape_width"),
    shape_height: limited(raw, "shape_height"),
    shape_fill: colour(raw?.shape_fill, DEFAULT_SHAPE_PROPS.shape_fill),
    shape_stroke: colour(raw?.shape_stroke, DEFAULT_SHAPE_PROPS.shape_stroke),
    shape_stroke_width: limited(raw, "shape_stroke_width"),
    shape_corner_radius: limited(raw, "shape_corner_radius"),
    shape_sides: Math.round(limited(raw, "shape_sides")),
    shape_star_depth: limited(raw, "shape_star_depth"),
    shape_arc_start: limited(raw, "shape_arc_start"),
    shape_arc_end: limited(raw, "shape_arc_end"),
    shape_arrow_head: limited(raw, "shape_arrow_head"),
    shape_arrow_shaft: limited(raw, "shape_arrow_shaft"),
    shape_contours: normalizeShapeContours(raw?.shape_contours),
    shape_draw: limited(raw, "shape_draw"),
    shape_taper: limited(raw, "shape_taper"),
    shape_wobble: limited(raw, "shape_wobble"),
    shape_seed: Math.round(limited(raw, "shape_seed")),
    media_rotation: limited(raw, "media_rotation"),
    media_opacity: limited(raw, "media_opacity"),
  };
}

/** Point on the ellipse `rx` × `ry` at `deg` degrees clockwise from the top. */
const onEllipse = (rx: number, ry: number, deg: number): [number, number] => {
  const a = (deg - 90) * Math.PI / 180;
  return [rx * Math.cos(a), ry * Math.sin(a)];
};

/** An elliptical arc as cubic segments of at most 90°, clockwise from `from` to `to` degrees. */
function arcPoints(rx: number, ry: number, from: number, to: number): ShapePoint[] {
  const sweep = Math.max(0.0001, Math.min(360, to - from));
  const segments = Math.max(1, Math.ceil(sweep / 90 - 1e-9));
  const step = sweep / segments, k = 4 / 3 * Math.tan(step * Math.PI / 720);
  const tangent = (deg: number): [number, number] => { const a = (deg - 90) * Math.PI / 180; return [-rx * Math.sin(a), ry * Math.cos(a)]; };
  return Array.from({ length: segments + 1 }, (_, i) => {
    const deg = from + i * step, [x, y] = onEllipse(rx, ry, deg), [tx, ty] = tangent(deg);
    return {
      x, y,
      ...(i > 0 ? { in: [-tx * k, -ty * k] as [number, number] } : {}),
      ...(i < segments ? { out: [tx * k, ty * k] as [number, number] } : {}),
    };
  });
}

/**
 * The shape's contours in local pixels, centred on 0,0, for a `w` × `h` box. Presets start at
 * the top (or the left end of a line) and run clockwise, so draw-on traces them that way.
 */
export function shapeContours(props: ShapeProps, w: number, h: number): ShapeContour[] {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  switch (props.shape_kind) {
    case "ellipse": {
      const points = arcPoints(w / 2, h / 2, 0, 360);
      // The last point repeats the first; closing draws that segment, so the first point takes its handle.
      const last = points.pop()!;
      points[0] = { ...points[0], in: last.in };
      return [{ closed: true, points }];
    }
    case "polygon":
    case "star": {
      const count = props.shape_kind === "star" ? props.shape_sides * 2 : props.shape_sides;
      return [{ closed: true, points: Array.from({ length: count }, (_, i) => {
        const inner = props.shape_kind === "star" && i % 2 === 1 ? props.shape_star_depth : 1;
        const [x, y] = onEllipse(w / 2 * inner, h / 2 * inner, i * 360 / count);
        return { x, y };
      }) }];
    }
    case "line":
      return [{ closed: false, points: [{ x: x0, y: 0 }, { x: x1, y: 0 }] }];
    case "arc":
      return [{ closed: false, points: arcPoints(w / 2, h / 2, props.shape_arc_start, Math.max(props.shape_arc_start, props.shape_arc_end)) }];
    case "arrow": {
      const hx = x1 - props.shape_arrow_head * w, t = props.shape_arrow_shaft * h / 2;
      return [{ closed: true, points: [
        { x: x0, y: -t }, { x: hx, y: -t }, { x: hx, y: y0 }, { x: x1, y: 0 }, { x: hx, y: y1 }, { x: hx, y: t }, { x: x0, y: t },
      ] }];
    }
    // A camera draws nothing; it is a view other elements follow (timeline/camera.ts).
    case "camera":
      return [];
    case "path":
      return props.shape_contours.map((contour) => ({
        closed: contour.closed,
        points: contour.points.map((p) => ({
          x: p.x * w, y: p.y * h,
          ...(p.in ? { in: [p.in[0] * w, p.in[1] * h] as [number, number] } : {}),
          ...(p.out ? { out: [p.out[0] * w, p.out[1] * h] as [number, number] } : {}),
        })),
      }));
    case "rect":
    default: {
      const r = Math.min(props.shape_corner_radius * Math.min(w, h), w / 2, h / 2);
      if (r <= 0) return [{ closed: true, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] }];
      const c = r * KAPPA;
      return [{ closed: true, points: [
        { x: x0 + r, y: y0, in: [-c, 0] }, { x: x1 - r, y: y0, out: [c, 0] },
        { x: x1, y: y0 + r, in: [0, -c] }, { x: x1, y: y1 - r, out: [0, c] },
        { x: x1 - r, y: y1, in: [c, 0] }, { x: x0 + r, y: y1, out: [-c, 0] },
        { x: x0, y: y1 - r, in: [0, c] }, { x: x0, y: y0 + r, out: [0, -c] },
      ] }];
    }
  }
}

/** Pixel contours back into the unit box a `path` stores (the inverse of `shapeContours` for `path`). */
export function shapeContoursToUnitBox(contours: ShapeContour[], w: number, h: number): ShapeContour[] {
  const sx = w || 1, sy = h || 1;
  return contours.map((contour) => ({
    closed: contour.closed,
    points: contour.points.map((p) => ({
      x: p.x / sx, y: p.y / sy,
      ...(p.in ? { in: [p.in[0] / sx, p.in[1] / sy] as [number, number] } : {}),
      ...(p.out ? { out: [p.out[0] / sx, p.out[1] / sy] as [number, number] } : {}),
    })),
  }));
}

type Segment = { from: ShapePoint; to: ShapePoint };
function contourSegments(contour: ShapeContour): Segment[] {
  const { points } = contour;
  const segments = points.slice(1).map((to, i) => ({ from: points[i], to }));
  if (contour.closed && points.length > 1) segments.push({ from: points.at(-1)!, to: points[0] });
  return segments;
}
const curved = (s: Segment) => Boolean(s.from.out || s.to.in);

const n = (value: number) => Number(value.toFixed(3));
/** SVG path data for one contour. */
export function contourPathD(contour: ShapeContour): string {
  if (contour.points.length === 0) return "";
  const [first] = contour.points;
  const parts = [`M ${n(first.x)} ${n(first.y)}`];
  for (const s of contourSegments(contour)) {
    if (curved(s)) {
      const c1 = [s.from.x + (s.from.out?.[0] ?? 0), s.from.y + (s.from.out?.[1] ?? 0)];
      const c2 = [s.to.x + (s.to.in?.[0] ?? 0), s.to.y + (s.to.in?.[1] ?? 0)];
      parts.push(`C ${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(s.to.x)} ${n(s.to.y)}`);
    } else parts.push(`L ${n(s.to.x)} ${n(s.to.y)}`);
  }
  if (contour.closed && contour.points.length > 1) parts.push("Z");
  return parts.join(" ");
}

/** Outline length of one contour; curves are measured by sampling. */
export function contourLength(contour: ShapeContour): number {
  let length = 0;
  for (const s of contourSegments(contour)) {
    if (!curved(s)) { length += Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y); continue; }
    const p0 = [s.from.x, s.from.y], p3 = [s.to.x, s.to.y];
    const p1 = [p0[0] + (s.from.out?.[0] ?? 0), p0[1] + (s.from.out?.[1] ?? 0)];
    const p2 = [p3[0] + (s.to.in?.[0] ?? 0), p3[1] + (s.to.in?.[1] ?? 0)];
    let prev = p0;
    for (let i = 1; i <= 48; i++) {
      const t = i / 48, u = 1 - t;
      const pt = [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
      length += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      prev = pt;
    }
  }
  return length;
}

/** `ink` is the drawn part of a hand-drawn outline as a filled path; null for a plain outline. */
export type ShapeContourFrame = { d: string; closed: boolean; length: number; drawn: number; ink: string | null };

/** True when the outline is drawn as hand-drawn ink rather than an even line. */
export const shapeIsHandDrawn = (props: ShapeProps) => props.shape_taper > 0 || props.shape_wobble > 0;

export type ShapeFrame = {
  /** Fill path: every closed contour, filled even-odd so inner contours cut holes. In local pixels, centred on 0,0. */
  d: string;
  /** Each contour's own path and how much of it is drawn, in order. */
  contours: ShapeContourFrame[];
  perimeter: number;
  centerX: number;
  centerY: number;
  rotationDeg: number;
  scale: number;
  opacity: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  /** Visible outline length across all contours; equal to `perimeter` when fully drawn. */
  strokeDrawn: number;
};

type ShapeOutline = { contours: ShapeContour[]; lengths: number[]; perimeter: number };
type ShapeStaticGeometry = { resolved: ShapeProps; pointsAnimated: boolean; outlines: Map<number, ShapeOutline> };

/**
 * Time-independent shape work (resolved props, outline contours and their lengths) kept per props object.
 * Only for one pass over an unchanging timeline (a spatial assessment): a props object edited in place
 * while its cache is alive would read stale geometry. A new props object always recomputes.
 */
export type ShapeGeometryCache = WeakMap<object, ShapeStaticGeometry>;
export const createShapeGeometryCache = (): ShapeGeometryCache => new WeakMap();

function shapeOutline(props: ShapeProps, height: number): ShapeOutline {
  const contours = shapeContours(props, props.shape_width * height, props.shape_height * height);
  const lengths = contours.map(contourLength);
  return { contours, lengths, perimeter: lengths.reduce((sum, value) => sum + value, 0) };
}

function staticShapeGeometry(rawProps: PropsLike, cache: ShapeGeometryCache | undefined): ShapeStaticGeometry {
  const cached = cache && rawProps ? cache.get(rawProps) : undefined;
  if (cached) return cached;
  const resolved = resolveShapeProps(rawProps);
  const computed = { resolved, pointsAnimated: resolved.shape_kind === "path" && shapePointsAnimated(rawProps), outlines: new Map<number, ShapeOutline>() };
  if (cache && rawProps) cache.set(rawProps, computed);
  return computed;
}

/** A shape's outline and placement at clip-local `timeSeconds`, without building any path strings. */
function shapeGeometryAt(rawProps: PropsLike, timeSeconds: number, width: number, height: number, cache?: ShapeGeometryCache) {
  const known = staticShapeGeometry(rawProps, cache);
  const resolved = known.resolved;
  const props = resolved.shape_kind === "path" ? { ...resolved, shape_contours: shapeContoursAt(rawProps, timeSeconds, resolved) } : resolved;
  const transform = resolveMediaTransformAtTime(rawProps, timeSeconds);
  const keyed = (field: NumericKey) =>
    resolveNumberKeyframe(rawProps, field, timeSeconds, props[field] as number, SHAPE_LIMITS[field]);
  // Morphing points change the outline over time; every other outline depends only on the props and canvas height.
  let outline = known.pointsAnimated || !cache ? undefined : known.outlines.get(height);
  if (!outline) {
    outline = shapeOutline(props, height);
    if (!known.pointsAnimated && cache) known.outlines.set(height, outline);
  }
  const { contours, lengths, perimeter } = outline;
  return {
    props, contours, lengths, perimeter,
    strokeDrawn: perimeter * keyed("shape_draw"),
    strokeWidth: props.shape_stroke_width * height / 1080,
    centerX: width / 2 + transform.offsetX * width / 2,
    centerY: height / 2 + transform.offsetY * height / 2,
    rotationDeg: keyed("media_rotation"),
    scale: transform.scale,
    opacity: keyed("media_opacity"),
  };
}

/** Everything a renderer needs to draw a shape at clip-local `timeSeconds` on a `width` × `height` canvas. */
export function shapeFrameAt(rawProps: PropsLike, timeSeconds: number, width: number, height: number): ShapeFrame {
  const { props, contours, lengths, perimeter, strokeDrawn, strokeWidth, ...placement } = shapeGeometryAt(rawProps, timeSeconds, width, height);
  // Draw-on runs through the contours in order; each one shows its share of what is drawn.
  const ink = props.shape_stroke && strokeWidth > 0 && shapeIsHandDrawn(props)
    ? { width: strokeWidth, taper: props.shape_taper, wobble: props.shape_wobble, seed: props.shape_seed, unit: height / 1080 }
    : null;
  let before = 0;
  const frames = contours.map((contour, i) => {
    const drawn = clamp(strokeDrawn - before, 0, lengths[i]);
    before += lengths[i];
    return { d: contourPathD(contour), closed: contour.closed, length: lengths[i], drawn, ink: ink ? inkContourPathD(contour, drawn, ink, i) || null : null };
  });
  return {
    d: frames.filter((frame) => frame.closed).map((frame) => frame.d).join(" "),
    contours: frames,
    perimeter,
    ...placement,
    fill: props.shape_fill,
    stroke: props.shape_stroke,
    strokeWidth,
    strokeDrawn,
  };
}

/**
 * The canvas box a shape covers at clip-local `timeSeconds` (outline, handles and line width
 * included, so it is conservative), or null while nothing of it is visible: fully transparent,
 * or an unfilled outline not yet drawn on. The spatial checks use it.
 */
export function shapeBoundsAt(rawProps: PropsLike, timeSeconds: number, width: number, height: number, cache?: ShapeGeometryCache) {
  if (staticShapeGeometry(rawProps, cache).resolved.shape_kind === "camera") return null;
  // Geometry only: the ink outlines a renderer needs are far costlier than the box and never change it.
  const frame = shapeGeometryAt(rawProps, timeSeconds, width, height, cache);
  if (frame.opacity <= 0 || (!frame.props.shape_fill && frame.strokeDrawn <= 0)) return null;
  const contours = frame.contours;
  const a = frame.rotationDeg * Math.PI / 180, c = Math.cos(a) * frame.scale, si = Math.sin(a) * frame.scale;
  // Running pairwise extremes: the same values as Math.min/Math.max over every point, without the arrays.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
  const add = (x: number, y: number) => {
    const px = frame.centerX + c * x - si * y, py = frame.centerY + si * x + c * y;
    count++;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  };
  for (const contour of contours) for (const p of contour.points) {
    add(p.x, p.y);
    if (p.in) add(p.x + p.in[0], p.y + p.in[1]);
    if (p.out) add(p.x + p.out[0], p.y + p.out[1]);
  }
  if (!count) return null;
  const pad = frame.props.shape_stroke ? frame.strokeWidth * frame.scale / 2 : 0;
  const x = minX - pad, y = minY - pad;
  return { x, y, width: maxX + pad - x, height: maxY + pad - y };
}

/** A shape frame as seen through a camera view (timeline/camera.ts). */
export function applyShapeCamera(frame: ShapeFrame, view: CameraView | null, width: number, height: number): ShapeFrame {
  if (!view) return frame;
  const [centerX, centerY] = cameraPoint(view, frame.centerX, frame.centerY, width, height);
  return { ...frame, centerX, centerY, rotationDeg: frame.rotationDeg - view.rotationDeg, scale: frame.scale * view.zoom };
}

/**
 * Everything a renderer needs for a shape, camera included: `localSeconds` on the clip's own clock,
 * `timelineSeconds` on the timeline clock the camera follows.
 */
export function shapeFrameInTimeline<T extends CameraElement>(element: T, elements: readonly T[], localSeconds: number, timelineSeconds: number, width: number, height: number): ShapeFrame {
  const frame = shapeFrameAt(element.props, localSeconds, width, height);
  const faded = { ...frame, opacity: frame.opacity * shapeFadeOpacity(element.props, localSeconds, element.duration) };
  return applyShapeCamera(faded, cameraViewFor(element, elements, timelineSeconds, width, height), width, height);
}

/** A preset's current outline as freeform contours in the unit box, for "Edit points". */
export function shapePresetToPath(props: ShapeProps): ShapeContour[] {
  if (props.shape_kind === "path") return props.shape_contours;
  const w = props.shape_width, h = props.shape_height;
  return shapeContoursToUnitBox(shapeContours(props, w, h), w, h);
}
