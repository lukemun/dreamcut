import type { TimelineElement } from "@/components/studio/timeline/types";
import { captionBoxFrame, captionRectangle, elementRectAt } from "@/lib/media-analysis/visual-overlap";

import { isCamera } from "./camera";
import { CAPTION_ABS_POSITION_REACH } from "./captions";
import { shapeBoundsAt } from "./shapes";

/**
 * Placement by relation: a text or drawn shape says where it sits relative to other elements
 * ("below the skyline", "left of the photo") and this resolver computes its coordinates. The
 * relation is stored on the follower as `props.place`; the follower re-resolves whenever its
 * anchors move, resize or are tuned, and it is seen through the same camera as its first anchor.
 * Geometry is computed before any camera (the camera then moves follower and anchor together),
 * from the same boxes the overlap check uses (visual-overlap.ts), with drawn shapes counted fully
 * inked so a label does not jump while its drawing draws on.
 */
import { PLACE_PROP, PLACEMENT_ALIGNS, PLACEMENT_GAP, PLACEMENT_SIDES, type PlacementAlign, type PlacementRelation, type PlacementSide } from "./placement-vocabulary";

export { PLACE_PROP, PLACEMENT_ALIGNS, PLACEMENT_GAP, PLACEMENT_SIDES, type PlacementAlign, type PlacementRelation, type PlacementSide };
type Rect = { x: number; y: number; width: number; height: number };
type Canvas = { width: number; height: number };

const MAX_SAMPLES = 12;
const round = (value: number) => Number(value.toFixed(5));

export function placementRelation(element: Pick<TimelineElement, "props">): PlacementRelation | null {
  const raw = element.props?.[PLACE_PROP] as Partial<PlacementRelation> & { relative_to?: unknown } | undefined;
  if (!raw || typeof raw !== "object") return null;
  const ids = typeof raw.relative_to === "string" ? [raw.relative_to] : Array.isArray(raw.relative_to) ? raw.relative_to.filter((id): id is string => typeof id === "string") : [];
  if (!ids.length || !PLACEMENT_SIDES.includes(raw.side as PlacementSide)) return null;
  const gap = typeof raw.gap === "number" && Number.isFinite(raw.gap) ? raw.gap : PLACEMENT_GAP.default;
  const verticalAlign = PLACEMENT_ALIGNS.includes(raw.vertical_align as PlacementAlign) ? raw.vertical_align as PlacementAlign : undefined;
  return { relative_to: ids, side: raw.side as PlacementSide, gap, align: PLACEMENT_ALIGNS.includes(raw.align as PlacementAlign) ? raw.align as PlacementAlign : "center",
    ...(verticalAlign ? { vertical_align: verticalAlign } : {}) };
}

/** What a follower can be: graphic text or a drawn shape (never a camera). */
export function canFollowRelation(element: Pick<TimelineElement, "type" | "props">) {
  return element.type === "caption_text" || (element.type === "shape" && !isCamera(element as TimelineElement));
}

const withoutCamera = (element: TimelineElement): TimelineElement => {
  if (typeof element.props?.camera_id !== "string") return element;
  const { camera_id: _camera, ...props } = element.props;
  return { ...element, props };
};

/**
 * A picture without its film-look finish (grain, vignette, split tone, halation, bloom). The finish only
 * recolours the placed picture, though its glow can spill past the edge, so the overlap check cannot
 * box it; a label that belongs to the picture follows the picture's own box.
 */
const withoutFilmFinish = (element: TimelineElement): TimelineElement => {
  if (!element.props || !Object.keys(element.props).some(key => key.startsWith("film_"))) return element;
  return { ...element, props: Object.fromEntries(Object.entries(element.props).filter(([key]) => !key.startsWith("film_"))) };
};

/** A shape as if fully drawn and opaque, so its box is the whole drawing at every moment. */
function fullyInked(props: Record<string, unknown> | null | undefined) {
  const keyframes = props?.keyframes as Record<string, unknown> | undefined;
  const { shape_draw: _draw, media_opacity: _opacity, ...kept } = keyframes ?? {};
  return { ...props, shape_draw: 1, media_opacity: 1, keyframes: kept };
}

/** An element's box on the canvas before any camera, or null when it shows nothing then. */
export function relationRectAt(element: TimelineElement, at: number, elements: TimelineElement[], canvas: Canvas): Rect | null {
  if (element.removed_at || at < element.timeline_start || at >= element.timeline_start + element.duration) return null;
  // Caption boxes do not depend on entrance animations; the overlap check leaves those unknown.
  if (element.type === "caption_text") return captionRectangle(element, canvas, mediaOf(elements));
  if (element.type === "shape") return shapeBoundsAt(fullyInked(element.props), at - element.timeline_start, canvas.width, canvas.height);
  return elementRectAt(withoutFilmFinish(withoutCamera(element)), at, elements, canvas);
}

const mediaOf = (elements: TimelineElement[]) => elements.filter(m => (m.type === "video_clip" || m.type === "still") && m.source_url && !m.removed_at)
  .sort((a, b) => a.timeline_start - b.timeline_start);

function sampleTimes(start: number, end: number) {
  if (end - start <= 1e-6) return [start];
  const count = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(end - start) + 1));
  return Array.from({ length: count }, (_, i) => start + (end - start - 1e-3) * i / (count - 1));
}

const union = (a: Rect | null, b: Rect): Rect => {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

/** The anchors' combined box over the follower's time on screen (or the anchors' own, when they never meet). */
export function anchorBox(follower: Pick<TimelineElement, "timeline_start" | "duration">, anchors: TimelineElement[], elements: TimelineElement[], canvas: Canvas): Rect | null {
  let box: Rect | null = null;
  for (const anchor of anchors) {
    const start = Math.max(follower.timeline_start, anchor.timeline_start);
    const end = Math.min(follower.timeline_start + follower.duration, anchor.timeline_start + anchor.duration);
    const times = end > start ? sampleTimes(start, end) : sampleTimes(anchor.timeline_start, anchor.timeline_start + anchor.duration);
    for (const at of times) {
      const rect = relationRectAt(anchor, at, elements, canvas);
      if (rect) box = union(box, rect);
    }
  }
  return box;
}

/** Where a box of this size lands for the relation: its top-left corner, kept on the canvas. */
export function relationTarget(anchor: Rect, size: { width: number; height: number }, relation: PlacementRelation, canvas: Canvas) {
  const gap = relation.gap * canvas.height;
  const along = (start: number, length: number, own: number) => relation.align === "start" ? start
    : relation.align === "end" ? start + length - own : start + (length - own) / 2;
  let x: number, y: number;
  if (relation.side === "below" || relation.side === "above") {
    x = along(anchor.x, anchor.width, size.width);
    y = relation.side === "below" ? anchor.y + anchor.height + gap : anchor.y - gap - size.height;
  } else if (relation.side === "left" || relation.side === "right") {
    y = along(anchor.y, anchor.height, size.height);
    x = relation.side === "right" ? anchor.x + anchor.width + gap : anchor.x - gap - size.width;
  } else {
    // Inside: the gap is an inset from the anchor's edges; align is horizontal and vertical_align
    // vertical (centred unless set), so start + start is the top-left corner.
    x = relation.align === "start" ? anchor.x + gap : relation.align === "end" ? anchor.x + anchor.width - gap - size.width : anchor.x + (anchor.width - size.width) / 2;
    y = relation.vertical_align === "start" ? anchor.y + gap
      : relation.vertical_align === "end" ? anchor.y + anchor.height - gap - size.height
        : anchor.y + (anchor.height - size.height) / 2;
  }
  return {
    x: Math.min(Math.max(0, x), Math.max(0, canvas.width - size.width)),
    y: Math.min(Math.max(0, y), Math.max(0, canvas.height - size.height)),
  };
}

/** The props that put `follower` where its relation says, or null when its anchors show nothing. */
export function resolvePlacementProps(follower: TimelineElement, relation: PlacementRelation, elements: TimelineElement[], canvas: Canvas): Record<string, unknown> | null {
  const live = new Map(elements.filter(e => !e.removed_at).map(e => [e.id, e]));
  const anchors = relation.relative_to.map(id => live.get(id)).filter((e): e is TimelineElement => !!e);
  const box = anchors.length ? anchorBox(follower, anchors, elements, canvas) : null;
  if (!box) return null;
  const camera = anchors[0]!.props?.camera_id;
  const cameraProps = { camera_id: typeof camera === "string" ? camera : undefined };
  if (follower.type === "caption_text") {
    const frame = captionBoxFrame(follower, canvas, mediaOf(elements));
    const target = relationTarget(box, frame, relation, canvas);
    const nudge = frame.props.positionNudgeY === "slightly_down" ? 0.04 : frame.props.positionNudgeY === "slightly_up" ? -0.04 : 0;
    // Caption coordinates are shares of the source's picture area, which can be a thin band of the
    // canvas (a wide clip in a tall frame); the target is already on the canvas, so use the full reach.
    const clamp = (value: number) => Math.min(CAPTION_ABS_POSITION_REACH.max, Math.max(CAPTION_ABS_POSITION_REACH.min, value));
    return { ...cameraProps,
      absX: round(clamp((target.x / canvas.width - frame.content.left) / frame.content.width)),
      absY: round(clamp((target.y / canvas.height - frame.content.top) / frame.content.height - nudge)) };
  }
  const centred = shapeBoundsAt({ ...fullyInked(follower.props), media_offset_x: 0, media_offset_y: 0 }, 0, canvas.width, canvas.height);
  if (!centred) return null;
  const target = relationTarget(box, centred, relation, canvas);
  return { ...cameraProps,
    media_offset_x: round((target.x - centred.x) / (canvas.width / 2)),
    media_offset_y: round((target.y - centred.y) / (canvas.height / 2)) };
}

const POSITION_FIELDS = ["absX", "absY", "media_offset_x", "media_offset_y"] as const;
const sameRelation = (a: PlacementRelation | null, b: PlacementRelation | null) => JSON.stringify(a) === JSON.stringify(b);
const sameBox = (a: Rect | null, b: Rect | null) => (!a && !b) || (!!a && !!b && (["x", "y", "width", "height"] as const).every(k => Math.abs(a[k] - b[k]) < 0.5));

/** Followers in an order where every anchor that is itself a follower resolves first. */
function dependencyOrder(followers: TimelineElement[]) {
  const byId = new Map(followers.map(f => [f.id, f]));
  const ordered: TimelineElement[] = [], state = new Map<string, "visiting" | "done">();
  const visit = (follower: TimelineElement, path: string[]) => {
    if (state.get(follower.id) === "done") return;
    if (state.get(follower.id) === "visiting") throw new Error(`Placement relations form a loop: ${[...path, follower.id].join(" → ")}. Place one of them in open space instead.`);
    state.set(follower.id, "visiting");
    for (const id of placementRelation(follower)!.relative_to) { const anchor = byId.get(id); if (anchor) visit(anchor, [...path, follower.id]); }
    state.set(follower.id, "done");
    ordered.push(follower);
  };
  for (const follower of followers) visit(follower, []);
  return ordered;
}

/**
 * Keep related elements where their relation puts them after an edit. Mutates `after`; returns changed ids.
 * - A new follower, or one whose anchors moved, resized or changed camera, is placed from its relation.
 * - A follower moved on its own (its anchors did not move) keeps its new position and leaves the relation:
 *   an explicit placement by the person wins.
 * - A follower whose anchors are all removed keeps its position and leaves the relation.
 * Locked followers stay put.
 */
export function reconcilePlacementRelations(before: readonly TimelineElement[], after: TimelineElement[], canvas: Canvas): string[] {
  const prior = new Map(before.map(e => [e.id, e]));
  const priorLive = before.filter(e => !e.removed_at) as TimelineElement[];
  const followers = after.filter(e => !e.removed_at && !e.position_locked && canFollowRelation(e) && placementRelation(e));
  const changed: string[] = [];
  const drop = (follower: TimelineElement) => {
    const { [PLACE_PROP]: _place, ...props } = follower.props ?? {};
    follower.props = props;
    changed.push(follower.id);
  };
  for (const follower of dependencyOrder(followers)) {
    const relation = placementRelation(follower)!;
    const liveAnchors = relation.relative_to.map(id => after.find(e => e.id === id && !e.removed_at)).filter((e): e is TimelineElement => !!e);
    if (!liveAnchors.length) { drop(follower); continue; }
    const was = prior.get(follower.id);
    if (was && !was.removed_at && sameRelation(placementRelation(was), relation)
      && POSITION_FIELDS.some(field => was.props?.[field] !== follower.props?.[field])) {
      const priorAnchors = relation.relative_to.map(id => priorLive.find(e => e.id === id)).filter((e): e is TimelineElement => !!e);
      const anchorsStill = priorAnchors.length === liveAnchors.length
        && sameBox(anchorBox(was, priorAnchors, priorLive, canvas), anchorBox(follower, liveAnchors, after, canvas))
        && priorAnchors[0]!.props?.camera_id === liveAnchors[0]!.props?.camera_id;
      if (anchorsStill) { drop(follower); continue; }
    }
    const resolved = resolvePlacementProps(follower, relation, after, canvas);
    if (!resolved) continue;
    const next: Record<string, unknown> = { ...follower.props };
    for (const [field, value] of Object.entries(resolved)) {
      if (value === undefined) delete next[field]; else next[field] = value;
    }
    if (JSON.stringify(next) !== JSON.stringify(follower.props ?? {})) { follower.props = next; changed.push(follower.id); }
  }
  return changed;
}

/**
 * How much a follower's box overlaps its anchors' box (share of the follower's area), for the
 * proposal check: a relation other than inside should never land on its anchors, which happens
 * when the canvas edge pushes it back over them.
 */
export function relationOverlap(follower: TimelineElement, elements: TimelineElement[], canvas: Canvas) {
  const relation = placementRelation(follower);
  if (!relation || relation.side === "inside") return null;
  const live = new Map(elements.filter(e => !e.removed_at).map(e => [e.id, e]));
  const anchors = relation.relative_to.map(id => live.get(id)).filter((e): e is TimelineElement => !!e);
  const anchor = anchors.length ? anchorBox(follower, anchors, elements, canvas) : null;
  let own: Rect | null = null;
  for (const at of sampleTimes(follower.timeline_start, follower.timeline_start + follower.duration)) {
    const rect = relationRectAt(follower, at, elements, canvas);
    if (rect) own = union(own, rect);
  }
  if (!anchor || !own) return null;
  const w = Math.min(own.x + own.width, anchor.x + anchor.width) - Math.max(own.x, anchor.x);
  const h = Math.min(own.y + own.height, anchor.y + anchor.height) - Math.max(own.y, anchor.y);
  const share = w > 0 && h > 0 ? (w * h) / Math.max(1, own.width * own.height) : 0;
  return { relation, share: Number(share.toFixed(3)), follower_box: own, anchor_box: anchor };
}
