import type { TimelineElement } from '../../components/studio/timeline/types';
import type { CaptionMeasurements } from '../qc/measure-captions';
import { resolveAnimationProps } from '../timeline/animation-presets';
import { resolveCaptionAnchorLayout, resolveCaptionContentRect, resolveCaptionCoordinateAspectRatio, resolveCaptionProps } from '../timeline/captions';
import { readKeyframeMap } from '../timeline/keyframes';
import { mediaSceneHolds, projectMediaScene, resolveMediaScene, type MediaSceneHold } from '../timeline/resolved-media-scene';
import { intersectProjectionRects, type ProjectionRect } from '../timeline/source-projection';
import { followerRect } from '../timeline/camera';
import { buildCompositingLaneOrder } from '../timeline/compositing-lanes';
import { createShapeGeometryCache, shapeBoundsAt, type ShapeGeometryCache } from '../timeline/shapes';
import { intersectRasterizedAlpha, rasterizeAlphaFootprint, touchingRasterizedAlpha, type AlphaFootprintEvidence, type RasterizedAlphaFootprint } from './alpha-footprint';

export const VISUAL_OVERLAP_VERSION = 'visual-overlap-v6';
const MIN_WARNING_FRACTION = 0.08;
const MAX_PAIR_SAMPLES = 10_000;
const MAX_ALPHA_PAIR_SAMPLES = 500;
const MAX_WARNINGS = 200;

type RelationUnknown = { element_id: string; at_seconds: number; reason: string };
type FootprintBasis = 'source_rectangle' | 'canvas_envelope' | 'measured_caption_rectangle' | 'estimated_caption_rectangle' | 'decoded_binary_alpha';
type Envelope = { box: ProjectionRect | null; basis?: FootprintBasis; alpha?: RasterizedAlphaFootprint; unknown?: RelationUnknown };
type ProjectionPoint = { x: number; y: number };
export type VisualFootprint = {
  basis: FootprintBasis;
  bounds: ProjectionRect;
  centroid: ProjectionPoint;
  outline: { kind: 'rectangle'; points: [ProjectionPoint, ProjectionPoint, ProjectionPoint, ProjectionPoint] };
  visible_shape: 'unknown' | 'binary_alpha';
  occupied_pixels?: number;
  evidence_revision?: string;
  includes_sticker_outline?: boolean;
};
export type VisualContact = {
  kind: 'area_overlap' | 'pixel_overlap';
  bounds: ProjectionRect;
  centroid: ProjectionPoint;
  area: number;
  fraction_of_first: number;
  fraction_of_second: number;
  overlap_pixels?: number;
  subject_overlap_pixels?: number;
  border_involved_pixels?: number;
};
export type VisualOverlap = {
  version: typeof VISUAL_OVERLAP_VERSION;
  status: 'not_applicable' | 'sampled' | 'unknown';
  evidence: 'conservative_rectangles';
  examined_relationships: number;
  examined_samples: number;
  examined_safe_area_samples: number;
  examined_alpha_samples: number;
  observed_intersections: number;
  suppressed_expected_overlaps: number;
  suppressed_minor_overlaps: number;
  suppressed_transparent_overlaps: number;
  truncated: boolean;
  warnings: Array<{
    code: 'possible_visual_overlap'; severity: 'warning';
    start_seconds: number; end_seconds: number; representative_at_seconds: number; sample_count: number;
    element_types: [TimelineElement['type'], TimelineElement['type']];
    element_ids: [string, string]; front_element_id: string | null;
    boxes: [ProjectionRect, ProjectionRect]; intersection: ProjectionRect;
    footprints: [VisualFootprint, VisualFootprint]; contact: VisualContact;
    max_fraction_of_smaller_box: number; intent: 'unknown'; message: string;
  }>;
  safe_area_warnings: Array<{
    code: 'visual_outside_safe_area'; severity: 'warning';
    element_id: string; element_type: TimelineElement['type'];
    start_seconds: number; end_seconds: number; representative_at_seconds: number; sample_count: number;
    box: ProjectionRect; safe_rect: ProjectionRect;
    safe_rail?: { top: number; right_edge: number };
    outside_pixels: { left: number; top: number; right: number; bottom: number };
    max_outside_pixels: number;
    message: string;
  }>;
  alpha_relations: Array<{
    element_ids:[string,string]; element_types:[TimelineElement['type'],TimelineElement['type']]; front_element_id:string|null;
    sample_count:number; start_seconds:number; end_seconds:number;
    states:Array<{at_seconds:number;relationship:'disjoint'|'touching'|'overlapping';first_frame_seconds:number;second_frame_seconds:number;
      overlap_pixels:number;touching_pixel_pairs:number;subject_overlap_pixels:number;border_involved_pixels:number;
      contact_bounds:ProjectionRect|null;contact_centroid:ProjectionPoint|null}>;
    statement:string;
  }>;
  unknowns: RelationUnknown[];
  limitations: string[];
};

export type SpatialAssessmentScope = {
  time_ranges: Array<{ start_seconds: number; end_seconds: number }>;
  /** When present, only relationships involving one of these changed actors are relevant. */
  focus_element_ids?: string[];
};

const finiteDimensions = (e: TimelineElement) => typeof e.props?.source_width === 'number' && typeof e.props.source_height === 'number'
  && Number.isFinite(e.props.source_width) && Number.isFinite(e.props.source_height) && e.props.source_width > 0 && e.props.source_height > 0;
/**
 * A picture's pixel size for its box: the probed source size, else its prepared or verified preview
 * proxy's (same shape as the source). Only boxes use the proxy; caption coordinate spaces keep reading the source
 * size (elementAspect), as both renderers do.
 */
export const PREPARED_PICTURE_SIZE_PROP = 'prepared_picture_size';
function mediaDimensions(e: TimelineElement): { width: number; height: number } | null {
  if (finiteDimensions(e)) return { width: e.props!.source_width as number, height: e.props!.source_height as number };
  // Measuring-only size from the clip's preparation record (local-store/prepared-picture-size.ts).
  const prepared = e.props?.[PREPARED_PICTURE_SIZE_PROP] as { width?: unknown; height?: unknown } | undefined;
  if (typeof prepared?.width === 'number' && typeof prepared.height === 'number' && prepared.width > 0 && prepared.height > 0) return { width: prepared.width, height: prepared.height };
  const proxy = e.props?.preview_proxy_validation as { ok?: unknown; width?: unknown; height?: unknown } | undefined;
  const width = proxy?.width, height = proxy?.height;
  return proxy?.ok === true && typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height } : null;
}
const elementAspect = (e: TimelineElement | undefined) => e && finiteDimensions(e) ? e.props!.source_width as number / (e.props!.source_height as number) : null;
const area = (box: ProjectionRect) => box.width * box.height;
const round = (value: number) => Number(value.toFixed(6));
const pairKey = (a: TimelineElement, b: TimelineElement) => [a.id,b.id].sort().join('|');
const centroid = (box: ProjectionRect): ProjectionPoint => ({ x: round(box.x + box.width / 2), y: round(box.y + box.height / 2) });
const footprint = (box: ProjectionRect, basis: FootprintBasis, alpha?: RasterizedAlphaFootprint): VisualFootprint => ({
  basis, bounds: box, centroid: alpha?.centroid ?? centroid(box), visible_shape: alpha ? 'binary_alpha' : 'unknown',
  ...(alpha ? { occupied_pixels: alpha.occupied_pixels, evidence_revision: alpha.evidence_revision,
    includes_sticker_outline: alpha.includes_sticker_outline } : {}),
  outline: { kind: 'rectangle', points: [
    { x: round(box.x), y: round(box.y) },
    { x: round(box.x + box.width), y: round(box.y) },
    { x: round(box.x + box.width), y: round(box.y + box.height) },
    { x: round(box.x), y: round(box.y + box.height) },
  ] },
});
const contact = (intersection: ProjectionRect, first: ProjectionRect, second: ProjectionRect): VisualContact => ({
  kind: 'area_overlap', bounds: intersection, centroid: centroid(intersection), area: round(area(intersection)),
  fraction_of_first: round(area(intersection) / area(first)), fraction_of_second: round(area(intersection) / area(second)),
});

const TOUCHING_SECONDS = 1e-6;

/** Where an element's entrance and exit end and its keyframes fall, in timeline seconds. */
function elementBoundaries(e: TimelineElement) {
  const animation = resolveAnimationProps(e.props);
  const times = [animation.animationInDuration, e.duration - animation.animationOutDuration].map(local => e.timeline_start + local);
  for (const points of Object.values(readKeyframeMap(e.props))) for (const point of points) times.push(e.timeline_start + point.t);
  return times;
}
/** One assessment's element boundaries, read once per element however many pairs it is in. */
export type ElementBoundaryCache = Map<TimelineElement, number[]>;
function boundariesOf(e: TimelineElement, cache?: ElementBoundaryCache) {
  if (!cache) return elementBoundaries(e);
  let times = cache.get(e);
  if (!times) { times = elementBoundaries(e); cache.set(e, times); }
  return times;
}

function pairTimes(a: TimelineElement, b: TimelineElement, start: number, end: number, cache?: ElementBoundaryCache) {
  if (Number.isFinite(start) && Number.isFinite(end)) return finitePairTimes(a, b, start, end, cache);
  const boundaries = new Set<number>([start,end]);
  for (const e of [a,b]) for (const at of boundariesOf(e, cache)) if (at > start && at < end) boundaries.add(at);
  const sorted = [...boundaries].sort((x,y) => x-y);
  return [...new Set(sorted.flatMap((at,i) => i + 1 < sorted.length ? [at, (at + sorted[i+1]!) / 2] : []).map(round))];
}

/**
 * pairTimes over a finite window without its intermediate arrays: every boundary inside the window is
 * finite, so the sorted list has no NaN, rounding keeps it in order, and a duplicate can only follow
 * its equal. Dropping each value equal to the one before keeps the first of each, as the Sets do.
 */
function finitePairTimes(a: TimelineElement, b: TimelineElement, start: number, end: number, cache?: ElementBoundaryCache) {
  const sorted = [start, end];
  for (const at of boundariesOf(a, cache)) if (at > start && at < end) sorted.push(at);
  for (const at of boundariesOf(b, cache)) if (at > start && at < end) sorted.push(at);
  sorted.sort((x,y) => x-y);
  const times: number[] = [];
  let previous = NaN;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const at = sorted[i]!, next = sorted[i+1]!;
    if (at === next) continue;
    // `+ 0` turns -0 (a tiny negative time, rounded) into 0, as adding it to a Set does.
    const rounded = round(at) + 0, mid = round((at + next) / 2) + 0;
    if (rounded !== previous) times.push(rounded);
    if (mid !== rounded) times.push(mid);
    previous = mid;
  }
  return times;
}

function scopedIntervals(start: number, end: number, scope?: SpatialAssessmentScope) {
  if (!scope) return end > start ? [{ start_seconds: start, end_seconds: end }] : [];
  return scope.time_ranges.flatMap((range) => {
    const scopedStart = Math.max(start, range.start_seconds);
    const scopedEnd = Math.min(end, range.end_seconds);
    return scopedEnd > scopedStart ? [{ start_seconds: scopedStart, end_seconds: scopedEnd }] : [];
  });
}

/** The sample times of a pair over its shared window, clipped to the scope (exported for its reference test). */
export function scopedPairTimes(a: TimelineElement, b: TimelineElement, start: number, end: number, scope?: SpatialAssessmentScope, cache?: ElementBoundaryCache) {
  // One finite window: finitePairTimes is already strictly increasing, so the merge below would return it unchanged.
  if (!scope && end > start && Number.isFinite(start) && Number.isFinite(end)) return finitePairTimes(a, b, start, end, cache);
  return [...new Set(scopedIntervals(start, end, scope)
    .flatMap((range) => pairTimes(a, b, range.start_seconds, range.end_seconds, cache)))]
    .sort((first, second) => first - second);
}

/**
 * Scenes of clips over a stretch where their geometry holds still (mediaSceneHolds), per element, stretch and
 * entrance/exit state, for one assessment of an unchanging timeline. `box` is the projected visible rectangle,
 * which then holds still too.
 */
export type MediaSceneCache = Map<TimelineElement, { holdAt: (time: number) => MediaSceneHold;
  scenes: Map<string, { scene: ReturnType<typeof resolveMediaScene>; box?: ProjectionRect }> }>;

function mediaEnvelope(e: TimelineElement, at: number, canvas: { width: number; height: number }, hasTransitions: boolean,
  alphaEvidence: AlphaFootprintEvidence | undefined, alphaCache: Map<string,RasterizedAlphaFootprint>, sceneCache?: MediaSceneCache): Envelope {
  const local = at - e.timeline_start;
  const animation = resolveAnimationProps(e.props);
  const dropIn = animation.animationIn === 'fade' || local >= animation.animationInDuration;
  const dropOut = animation.animationOut === 'fade' || local < e.duration - animation.animationOutDuration;
  const sceneProps = () => {
    const props = { ...e.props };
    if (dropIn) delete props.animationIn;
    if (dropOut) delete props.animationOut;
    delete props.animationInDuration; delete props.animationOutDuration;
    return props;
  };
  let cached: { scene: ReturnType<typeof resolveMediaScene>; box?: ProjectionRect } | undefined;
  if (sceneCache) {
    let clip = sceneCache.get(e);
    if (!clip) { clip = { holdAt: mediaSceneHolds(e.props), scenes: new Map() }; sceneCache.set(e, clip); }
    const hold = clip.holdAt(local);
    if (hold) {
      const state = `${hold}|${dropIn}|${dropOut}`;
      cached = clip.scenes.get(state);
      if (!cached) { cached = { scene: resolveMediaScene(sceneProps(), local, canvas) }; clip.scenes.set(state, cached); }
    }
  }
  const scene = cached?.scene ?? resolveMediaScene(sceneProps(), local, canvas);
  if (scene.opacity <= 0) return { box: null };
  const unsupported = scene.unsupported.filter(reason => reason !== 'image-dependent alpha or shadow');
  if (e.props?.media_shadow) unsupported.push('shadow extent');
  const reason = hasTransitions ? 'Transitions are not resolved.' : unsupported.length ? unsupported.join(', ') : null;
  if (reason) return { box: null, unknown: { element_id: e.id, at_seconds: at, reason } };
  const dimensions = finiteDimensions(e) || !alphaEvidence ? mediaDimensions(e) : { width: alphaEvidence.artifact.width, height: alphaEvidence.artifact.height };
  const known = Boolean(dimensions);
  const sourceWidth = dimensions?.width ?? canvas.width;
  const sourceHeight = dimensions?.height ?? canvas.height;
  // Only the source time moves a cached scene's projection, and only alpha footprints read it.
  if (cached?.box && !alphaEvidence) return { box: cached.box, basis: known ? 'source_rectangle' : 'canvas_envelope', ...(!known ? { unknown: { element_id: e.id, at_seconds: at,
    reason: 'Source dimensions unavailable; using conservative canvas envelope, not source bounds.' } } : {}) };
  const projection = projectMediaScene(scene, {
    source_width: sourceWidth,
    source_height: sourceHeight,
    composition_width: canvas.width, composition_height: canvas.height, fit: 'contain',
    timeline_time_seconds: at, timeline_start_seconds: e.timeline_start, source_trim_start_seconds:e.trim_start??0,
    playback_rate:e.playback_rate>0?e.playback_rate:1,
  });
  if (alphaEvidence) {
    const key=`${e.id}|${round(at)}|${round(scene.layout.scale)}|${round(projection.source_time_seconds)}`;
    let alpha=alphaCache.get(key);
    if (!alpha) {
      alpha=rasterizeAlphaFootprint({ evidence:alphaEvidence,projection,canvas,source_time_seconds:projection.source_time_seconds,
        sticker_outline_width:e.props?.sticker_outline===true ? Number(e.props?.sticker_outline_width??8) : 0,media_scale:scene.layout.scale });
      alphaCache.set(key,alpha);
    }
    return { box:alpha.bounds,basis:'decoded_binary_alpha',alpha };
  }
  if (cached) cached.box = projection.visible_rect;
  return { box: projection.visible_rect, basis: known ? 'source_rectangle' : 'canvas_envelope', ...(!known ? { unknown: { element_id: e.id, at_seconds: at,
    reason: 'Source dimensions unavailable; using conservative canvas envelope, not source bounds.' } } : {}) };
}

/** Where a caption's text block sits on the canvas: its full phrase at its resting place,
 * the envelope a one-word-at-a-time reveal stays inside. */
/** A caption's estimated box size and the content rect its absX/absY fractions are measured in. */
export function captionBoxFrame(e: TimelineElement, canvas: { width: number; height: number }, media: TimelineElement[], measuredHeight?: number) {
  const p = resolveCaptionProps(e.props);
  const anchor = media.find(v => e.timeline_start >= v.timeline_start && e.timeline_start < v.timeline_start + v.duration) ?? media[0];
  const content = resolveCaptionContentRect(resolveCaptionCoordinateAspectRatio(elementAspect(e), elementAspect(anchor)), canvas.width / canvas.height);
  const width = p.maxWidth * content.width * canvas.width;
  const chars = Math.max(1, Math.floor(width / (p.fontSizePx * 0.5)));
  const lines = p.text.split('\n').reduce((n,line) => n + Math.max(1, Math.ceil(line.length / chars)), 0);
  return { props: p, content, width, height: measuredHeight ?? lines * p.fontSizePx * 1.2 };
}

export function captionRectangle(e: TimelineElement, canvas: { width: number; height: number }, media: TimelineElement[], measuredHeight?: number) {
  const { props: p, content, width, height } = captionBoxFrame(e, canvas, media, measuredHeight);
  const layout = resolveCaptionAnchorLayout(p, content);
  return intersectProjectionRects({
    x: layout.x * canvas.width - layout.anchorX * width + (p.absX == null ? p.offsetX * content.width * canvas.width : 0),
    y: layout.y * canvas.height - layout.anchorY * height + (p.absY == null ? p.offsetY * content.height * canvas.height : 0), width, height,
  }, { x: 0, y: 0, ...canvas });
}

function captionEnvelope(e: TimelineElement, at: number, canvas: { width: number; height: number }, media: TimelineElement[],
  measurements: CaptionMeasurements | undefined, hasTransitions: boolean): Envelope {
  const p = resolveCaptionProps(e.props);
  if (e.props?.surface_track || e.props?.keyframes || p.surfaceMode === 'wall' || p.animationIn !== 'none' || p.animationOut !== 'none'
    || p.textScaleX !== 1 || p.textScaleY !== 1 || e.props?.ticker_motion || e.props?.scan_reveal_line || e.props?.text_mask_url
    || ['camera_reveal','inverse','image_fill'].includes(p.styleVariant) || p.timingMode === 'single_word' || hasTransitions) {
    return { box: null, unknown: { element_id: e.id, at_seconds: at, reason: 'Animated, transformed or transitional caption bounds are unsupported.' } };
  }
  if (!p.text.trim()) return { box: null };
  const measured = measurements?.[e.id];
  const box = captionRectangle(e, canvas, media, measured?.height);
  return { box, basis: measured ? 'measured_caption_rectangle' : 'estimated_caption_rectangle', ...(!measured ? { unknown: { element_id: e.id, at_seconds: at, reason: 'Caption box is estimated; loaded-font measurements are unavailable.' } } : {}) };
}

/** A drawn shape's conservative box; shapes draw no source pixels, so there is no alpha evidence. */
function shapeEnvelope(e: TimelineElement, at: number, canvas: { width: number; height: number }, shapeCache?: ShapeGeometryCache): Envelope {
  const box = shapeBoundsAt(e.props, at - e.timeline_start, canvas.width, canvas.height, shapeCache);
  return box ? { box: intersectProjectionRects(box, { x: 0, y: 0, ...canvas }), basis: 'canvas_envelope' } : { box: null };
}

/**
 * Any visual actor's envelope at `at`, seen through the camera it follows (timeline/camera.ts). A camera moves the
 * actor after its own framing, so pixel-alpha evidence from the source no longer lines up and is dropped.
 */
function actorEnvelope(e: TimelineElement, at: number, input: { elements: TimelineElement[]; canvas: { width: number; height: number }; measurements?: CaptionMeasurements; transition_count?: number; alpha_footprints?: Record<string,AlphaFootprintEvidence> },
  media: TimelineElement[], alphaCache: Map<string,RasterizedAlphaFootprint>, shapeCache?: ShapeGeometryCache, sceneCache?: MediaSceneCache): Envelope {
  const envelope = e.type === 'caption_text' ? captionEnvelope(e, at, input.canvas, media, input.measurements, Boolean(input.transition_count))
    : e.type === 'shape' ? shapeEnvelope(e, at, input.canvas, shapeCache)
    : mediaEnvelope(e, at, input.canvas, Boolean(input.transition_count), input.alpha_footprints?.[e.id], alphaCache, sceneCache);
  if (!envelope.box || typeof e.props?.camera_id !== 'string') return envelope;
  const moved = followerRect(e, input.elements, envelope.box, at, input.canvas.width, input.canvas.height);
  return { ...envelope, alpha: undefined, box: intersectProjectionRects(moved, { x: 0, y: 0, ...input.canvas }) };
}

/**
 * The one answer to "where is this element on the canvas at this moment": the same box the overlap check
 * uses (caption estimate, shape outline or projected picture, then the camera it follows), or null when it
 * shows nothing then. Placement and every spatial check read this, so they cannot disagree.
 */
export function elementRectAt(e: TimelineElement, at: number, elements: TimelineElement[], canvas: { width: number; height: number }): ProjectionRect | null {
  if (e.removed_at || at < e.timeline_start || at >= e.timeline_start + e.duration) return null;
  const media = elements.filter(m => (m.type === 'video_clip' || m.type === 'still') && m.source_url && !m.removed_at).sort((x, y) => x.timeline_start - y.timeline_start);
  return actorEnvelope(e, at, { elements, canvas }, media, new Map()).box;
}

function explicitBackground(e: TimelineElement) {
  const values = [e.lane_key, e.props?.visual_role, e.props?.editorial_role, e.props?.role, e.props?.title]
    .filter(v => typeof v === 'string').join(' ').toLowerCase();
  return /(^|[\s_-])(background|backdrop|base[\s_-]?plate|canvas)([\s_-]|$)/.test(values);
}

/** A full-canvas actor behind another element is an expected container relationship. */
function expectedContainer(a: TimelineElement, aBox: ProjectionRect, b: TimelineElement, bBox: ProjectionRect,
  frontId: string | null, canvas: { width: number; height: number }, background: (e: TimelineElement) => boolean = explicitBackground) {
  const canvasArea = canvas.width * canvas.height;
  const behind = (candidate: TimelineElement, box: ProjectionRect, other: TimelineElement) => frontId === other.id
    && (background(candidate) || area(box) / canvasArea >= 0.9);
  return behind(a,aBox,b) || behind(b,bBox,a);
}

/**
 * For each actor i, the later actors j > i (ascending) whose time on screen may overlap i's: a superset
 * of the pairs the overlap check keeps, found by a sweep over start times instead of every pair. A pair
 * the check keeps overlaps by at least TOUCHING_SECONDS, so the later-starting actor starts strictly
 * before the other ends, and the sweep still holds the other then. An actor whose start or end is not a
 * finite number pairs with every actor, since the check's own arithmetic on it is what decides.
 */
export function timeOverlapPartners(actors: readonly TimelineElement[]): number[][] {
  const partners: number[][] = actors.map(() => []);
  const starts: number[] = [], ends: number[] = [];
  const timed: number[] = [], untimed: number[] = [];
  actors.forEach((e, index) => {
    const start = e.timeline_start, end = e.timeline_start + e.duration;
    starts.push(start); ends.push(end);
    (Number.isFinite(start) && Number.isFinite(end) ? timed : untimed).push(index);
  });
  timed.sort((x, y) => starts[x]! - starts[y]! || x - y);
  let active: number[] = [];
  for (const index of timed) {
    const start = starts[index]!;
    active = active.filter(other => ends[other]! > start);
    for (const other of active) partners[Math.min(index, other)]!.push(Math.max(index, other));
    active.push(index);
  }
  for (const index of untimed) for (let other = 0; other < actors.length; other++) {
    if (other === index || (other < index && untimed.includes(other))) continue;
    partners[Math.min(index, other)]!.push(Math.max(index, other));
  }
  for (const list of partners) list.sort((x, y) => x - y);
  return partners;
}

/** Advisory broad phase. One warning represents one pair across its sampled overlap interval. */
export function assessVisualOverlap(input: {
  elements: TimelineElement[]; lane_order: string[]; canvas: { width: number; height: number };
  safe_area?: ProjectionRect;
  safe_area_rail?: { top: number; right_edge: number };
  hidden_lanes?: string[]; transition_count?: number; measurements?: CaptionMeasurements;
  alpha_footprints?: Record<string,AlphaFootprintEvidence>;
  scope?: SpatialAssessmentScope;
}): VisualOverlap {
  const visuals = input.elements.filter(e => (['still','video_clip','caption_text'].includes(e.type) || (e.type === 'shape' && e.props?.shape_kind !== 'camera')) && !e.removed_at && !input.hidden_lanes?.includes(e.lane_key));
  // Front-first stack as the renderer draws it, so lanes the saved order does not list yet still have a front and back.
  const stack = buildCompositingLaneOrder({ visualLaneKeys: visuals.filter(e => e.type !== 'caption_text').map(e => e.lane_key),
    captionLaneKeys: visuals.filter(e => e.type === 'caption_text').map(e => e.lane_key), persistedLaneOrderKeys: input.lane_order }).reverse();
  const media = visuals.filter(e => e.type !== 'caption_text' && e.type !== 'shape' && e.source_url).sort((a,b) => a.timeline_start-b.timeline_start);
  const result: VisualOverlap = {
    version: VISUAL_OVERLAP_VERSION, status: 'not_applicable', evidence: 'conservative_rectangles',
    examined_relationships: 0, examined_samples: 0, examined_safe_area_samples: 0, examined_alpha_samples:0,observed_intersections: 0,
    suppressed_expected_overlaps: 0, suppressed_minor_overlaps: 0, suppressed_transparent_overlaps:0,
    truncated: false, warnings: [], safe_area_warnings: [], alpha_relations:[],unknowns: [], limitations: [
      'One warning aggregates one element pair across sampled times; it is not a count of frames or continuous proof.',
      'Source rectangles include transparent pixels. Intersections are possible overlap, not measured pixel occlusion or editorial errors.',
      'Decoded-alpha actors use output-pixel binary support including the ordered sticker-outline passes; other footprint outlines remain conservative rectangles.',
      'Zero-area edge touching is not reported as contact. Contact records describe sampled positive-area intersections only.',
      `Intersections below ${(MIN_WARNING_FRACTION*100).toFixed(0)}% of the smaller box are measurements but not warnings.`,
      'Full-canvas actors behind another element and explicit background/container roles are treated as expected overlap.',
      'Videos describe frame bounds, not tracked subjects. Captions are estimated unless loaded-font measurements are supplied. Shapes use their outline box (handles and line width included).',
      'Actors that follow a camera are judged through its view, as a box around their moved footprint.',
      'Safe-area warnings compare sampled conservative footprints with the delivery-safe rectangle and action rail; transparent margins can overstate visible overflow.',
      ...(input.scope ? ['This assessment is scoped to proposal-changed actors and their before/after timeline intervals; unrelated project warnings are excluded.'] : []),
    ],
  };
  const unknownKeys = new Set<string>();
  const alphaCache=new Map<string,RasterizedAlphaFootprint>();
  // One assessment reads an unchanging timeline, so an actor's envelope at a time is computed once,
  // however many pairs and safe-area checks ask for it, and a shape's outline once per element.
  const shapeCache=createShapeGeometryCache();
  const sceneCache: MediaSceneCache=new Map();
  const boundaryCache: ElementBoundaryCache=new Map();
  const envelopes=new Map<TimelineElement,Map<number,Envelope>>();
  const envelopeAt=(e: TimelineElement, at: number): Envelope => {
    let byTime=envelopes.get(e);
    if (!byTime) { byTime=new Map(); envelopes.set(e,byTime); }
    let envelope=byTime.get(at);
    if (!envelope) { envelope=actorEnvelope(e,at,input,media,alphaCache,shapeCache,sceneCache); byTime.set(at,envelope); }
    return envelope;
  };
  // Most samples repeat an element's unknown reason. An (id, reason) seen before already has its key in
  // unknownKeys, so it is skipped without building the key; a new one goes through the key as before.
  const seenReasons = new Map<string, Set<string>>();
  const pushUnknown = (value?: RelationUnknown) => {
    if (!value) return;
    let reasons = seenReasons.get(value.element_id);
    if (reasons?.has(value.reason)) return;
    if (!reasons) { reasons = new Set(); seenReasons.set(value.element_id, reasons); }
    reasons.add(value.reason);
    const key = `${value.element_id}|${value.reason}`;
    if (!unknownKeys.has(key)) { unknownKeys.add(key); result.unknowns.push(value); }
  };
  const focus = input.scope?.focus_element_ids?.length ? new Set(input.scope.focus_element_ids) : null;
  // An element's background role, read once per assessment rather than at every intersecting sample.
  const backgrounds = new Map<TimelineElement, boolean>();
  const background = (e: TimelineElement) => {
    let value = backgrounds.get(e);
    if (value === undefined) { value = explicitBackground(e); backgrounds.set(e, value); }
    return value;
  };
  if (input.safe_area) {
    for (const element of visuals) {
      if (focus && !focus.has(element.id)) continue;
      if (background(element)) continue;
      const start = element.timeline_start;
      const end = element.timeline_start + element.duration;
      const times = scopedPairTimes(element, element, start, end, input.scope, boundaryCache);
      if (!times.length) continue;
      let issue: VisualOverlap['safe_area_warnings'][number] | null = null;
      for (const at of times) {
        result.examined_safe_area_samples++;
        const envelope = envelopeAt(element, at);
        pushUnknown(envelope.unknown);
        if (!envelope.box) continue;
        if (area(envelope.box) / (input.canvas.width * input.canvas.height) >= 0.9) continue;
        const outside = {
          left: Math.max(0, input.safe_area.x - envelope.box.x),
          top: Math.max(0, input.safe_area.y - envelope.box.y),
          right: Math.max(0, envelope.box.x + envelope.box.width - Math.min(
            input.safe_area.x + input.safe_area.width,
            input.safe_area_rail && envelope.box.y + envelope.box.height > input.safe_area_rail.top
              ? input.safe_area_rail.right_edge : Infinity,
          )),
          bottom: Math.max(0, envelope.box.y + envelope.box.height - (input.safe_area.y + input.safe_area.height)),
        };
        const maxOutside = Math.max(outside.left, outside.top, outside.right, outside.bottom);
        if (maxOutside <= 1) continue;
        if (!issue) {
          issue = {
            code: 'visual_outside_safe_area', severity: 'warning', element_id: element.id, element_type: element.type,
            start_seconds: at, end_seconds: at, representative_at_seconds: at, sample_count: 1,
            box: envelope.box, safe_rect: input.safe_area,
            ...(input.safe_area_rail ? { safe_rail: input.safe_area_rail } : {}), outside_pixels: outside,
            max_outside_pixels: maxOutside, message: '',
          };
        } else {
          issue.end_seconds = at;
          issue.sample_count++;
          if (maxOutside > issue.max_outside_pixels) {
            issue.representative_at_seconds = at;
            issue.box = envelope.box;
            issue.outside_pixels = outside;
            issue.max_outside_pixels = maxOutside;
          }
        }
      }
      if (issue) {
        issue.max_outside_pixels = round(issue.max_outside_pixels);
        issue.outside_pixels = Object.fromEntries(Object.entries(issue.outside_pixels).map(([key, value]) => [key, round(value)])) as typeof issue.outside_pixels;
        issue.message = `From sampled ${issue.start_seconds.toFixed(2)}s–${issue.end_seconds.toFixed(2)}s, ${element.type} ${element.id} extends up to ${issue.max_outside_pixels.toFixed(1)}px beyond the delivery-safe rectangle.`;
        result.safe_area_warnings.push(issue);
      }
    }
  }
  // First stack position of each lane, as stack.indexOf answers it.
  const stackIndex = new Map<string, number>();
  stack.forEach((lane, index) => { if (!stackIndex.has(lane)) stackIndex.set(lane, index); });
  const stackAt = (lane: string) => stackIndex.get(lane) ?? -1;
  // Pairs in the same (i, j) order as a scan of every pair, skipping only pairs never on screen together.
  const partners = timeOverlapPartners(visuals);
  for (let i=0; i<visuals.length; i++) for (const j of partners[i]!) {
    const a=visuals[i]!, b=visuals[j]!;
    if (focus && !focus.has(a.id) && !focus.has(b.id)) continue;
    const start=Math.max(a.timeline_start,b.timeline_start), end=Math.min(a.timeline_start+a.duration,b.timeline_start+b.duration);
    // Back-to-back clips can share a float sliver (a frame-snapped start against start + duration); that is touching, not overlapping.
    if (end - start < TOUCHING_SECONDS) continue;
    const times=scopedPairTimes(a,b,start,end,input.scope,boundaryCache);
    if (!times.length) continue;
    result.examined_relationships++;
    const alphaPair=Boolean(input.alpha_footprints?.[a.id]&&input.alpha_footprints?.[b.id]);
    if(alphaPair){if(result.examined_alpha_samples+times.length>MAX_ALPHA_PAIR_SAMPLES){result.truncated=true;continue;} result.examined_alpha_samples+=times.length;}
    else if (result.examined_samples + times.length > MAX_PAIR_SAMPLES) { result.truncated=true; continue; }
    let issue: null | { first:number; last:number; count:number; max:number; at:number; boxes:[ProjectionRect,ProjectionRect]; bases:[FootprintBasis,FootprintBasis];
      alphas:[RasterizedAlphaFootprint|undefined,RasterizedAlphaFootprint|undefined]; intersection:ProjectionRect; exact?:ReturnType<typeof intersectRasterizedAlpha>; front:string|null } = null;
    const alphaStates:VisualOverlap['alpha_relations'][number]['states']=[];
    let alphaFront:string|null=null;
    for (const at of times) {
      if(!alphaPair) result.examined_samples++;
      const ae=envelopeAt(a,at);
      const be=envelopeAt(b,at);
      pushUnknown(ae.unknown); pushUnknown(be.unknown);
      if (!ae.box || !be.box) continue;
      const ai=stackAt(a.lane_key), bi=stackAt(b.lane_key);
      const front=ai>=0 && bi>=0 && ai!==bi ? (ai<bi?a.id:b.id) : null;
      alphaFront=front;
      const exact=ae.alpha&&be.alpha?intersectRasterizedAlpha(ae.alpha,be.alpha):undefined;
      const touching=exact&&!exact.pixels?touchingRasterizedAlpha(ae.alpha!,be.alpha!):undefined;
      if(exact) alphaStates.push({at_seconds:at,relationship:exact.pixels?'overlapping':touching?.touching_pixel_pairs?'touching':'disjoint',
        first_frame_seconds:ae.alpha!.frame_time_seconds,second_frame_seconds:be.alpha!.frame_time_seconds,overlap_pixels:exact.pixels,
        touching_pixel_pairs:touching?.touching_pixel_pairs??0,subject_overlap_pixels:exact.subject_pixels,border_involved_pixels:exact.border_involved_pixels,
        contact_bounds:exact.bounds??touching?.bounds??null,contact_centroid:exact.centroid??touching?.centroid??null});
      let intersection=intersectProjectionRects(ae.box,be.box);
      if (!intersection) continue;
      result.observed_intersections++;
      if (expectedContainer(a,ae.box,b,be.box,front,input.canvas,background)) { result.suppressed_expected_overlaps++; continue; }
      if (exact&&!exact.pixels) { result.suppressed_transparent_overlaps++; continue; }
      if (exact?.bounds) intersection=exact.bounds;
      const fraction=exact ? exact.pixels/Math.min(ae.alpha!.occupied_pixels,be.alpha!.occupied_pixels)
        : area(intersection)/Math.min(area(ae.box),area(be.box));
      if (fraction < MIN_WARNING_FRACTION) { result.suppressed_minor_overlaps++; continue; }
      const bases: [FootprintBasis,FootprintBasis] = [ae.basis ?? 'canvas_envelope', be.basis ?? 'canvas_envelope'];
      const alphas:[RasterizedAlphaFootprint|undefined,RasterizedAlphaFootprint|undefined]=[ae.alpha,be.alpha];
      if (!issue) issue={first:at,last:at,count:1,max:fraction,at,boxes:[ae.box,be.box],bases,alphas,intersection,exact,front};
      else { issue.last=at; issue.count++; if (fraction>issue.max) Object.assign(issue,{max:fraction,at,boxes:[ae.box,be.box],bases,alphas,intersection,exact,front}); }
    }
    if(alphaStates.length){
      const counts={overlapping:alphaStates.filter(s=>s.relationship==='overlapping').length,touching:alphaStates.filter(s=>s.relationship==='touching').length,disjoint:alphaStates.filter(s=>s.relationship==='disjoint').length};
      result.alpha_relations.push({element_ids:[a.id,b.id],element_types:[a.type,b.type],front_element_id:alphaFront,sample_count:alphaStates.length,
        start_seconds:alphaStates[0]!.at_seconds,end_seconds:alphaStates.at(-1)!.at_seconds,states:alphaStates,
        statement:`Across ${alphaStates.length} decoded-alpha sample${alphaStates.length===1?'':'s'}, ${a.id} and ${b.id} were overlapping at ${counts.overlapping}, touching at ${counts.touching}, and disjoint at ${counts.disjoint}. Pixel support includes configured sticker outlines.`});
    }
    if (issue) {
      if (result.warnings.length>=MAX_WARNINGS) { result.truncated=true; continue; }
      result.warnings.push({ code:'possible_visual_overlap',severity:'warning',start_seconds:issue.first,end_seconds:issue.last,
        representative_at_seconds:issue.at,sample_count:issue.count,element_types:[a.type,b.type],element_ids:[a.id,b.id],front_element_id:issue.front,
        boxes:issue.boxes,intersection:issue.intersection,footprints:[footprint(issue.boxes[0],issue.bases[0],issue.alphas[0]),footprint(issue.boxes[1],issue.bases[1],issue.alphas[1])],
        contact:issue.exact?{kind:'pixel_overlap',bounds:issue.intersection,centroid:issue.exact.centroid!,area:issue.exact.pixels,
          fraction_of_first:round(issue.exact.pixels/issue.alphas[0]!.occupied_pixels),fraction_of_second:round(issue.exact.pixels/issue.alphas[1]!.occupied_pixels),
          overlap_pixels:issue.exact.pixels,subject_overlap_pixels:issue.exact.subject_pixels,border_involved_pixels:issue.exact.border_involved_pixels}
          :contact(issue.intersection,issue.boxes[0],issue.boxes[1]),max_fraction_of_smaller_box:round(issue.max),intent:'unknown',
        message:`From sampled ${issue.first.toFixed(2)}s–${issue.last.toFixed(2)}s, ${a.type} ${a.id} and ${b.type} ${b.id} intersect by up to ${(issue.max*100).toFixed(1)}% of the smaller box across ${issue.count} sample${issue.count===1?'':'s'}.` });
    }
  }
  result.status=result.examined_relationships===0?'not_applicable':result.unknowns.length?'unknown':'sampled';
  return result;
}
