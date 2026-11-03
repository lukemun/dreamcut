type PropsLike = Record<string, unknown> | null | undefined;

export type KeyframeEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "hold";
export type KeyframeValue = number | readonly number[];

export type KeyframePoint<T extends KeyframeValue = KeyframeValue> = {
  t: number;
  v: T;
  ease?: KeyframeEase;
  /**
   * Optional absolute source-media boundary. Timeline speed steps use this as
   * their durable authority and derive `t` from the surrounding rates.
   */
  source_t?: number;
};

export type KeyframeMap = Record<string, KeyframePoint[]>;

const KEYFRAMES_PROP = "keyframes";
const TIME_PRECISION = 3;
const KEYFRAME_TIME_EPSILON = 0.0005;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundTime(value: number) {
  return Number(Math.max(0, value).toFixed(TIME_PRECISION));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeEase(value: unknown): KeyframeEase | undefined {
  if (
    value === "linear"
    || value === "easeIn"
    || value === "easeOut"
    || value === "easeInOut"
    || value === "hold"
  ) {
    return value;
  }
  return undefined;
}

function normalizeValue(value: unknown): KeyframeValue | null {
  if (isFiniteNumber(value)) return value;
  if (!Array.isArray(value)) return null;
  const tuple = value.filter(isFiniteNumber);
  return tuple.length === value.length && tuple.length > 0 ? tuple : null;
}

function normalizePoint(value: unknown): KeyframePoint | null {
  if (!isRecord(value) || !isFiniteNumber(value.t)) return null;
  const normalizedValue = normalizeValue(value.v);
  if (normalizedValue == null) return null;
  const ease = normalizeEase(value.ease);
  const sourceTime = isFiniteNumber(value.source_t) ? Math.max(0, value.source_t) : null;
  return {
    t: roundTime(value.t),
    v: normalizedValue,
    ...(ease ? { ease } : {}),
    ...(sourceTime != null ? { source_t: sourceTime } : {}),
  };
}

function normalizedPoints(rawPoints: unknown): KeyframePoint[] {
  if (!Array.isArray(rawPoints)) return [];
  return rawPoints.map(normalizePoint)
    .filter((point): point is KeyframePoint => point != null)
    .sort((a, b) => a.t - b.t);
}

// Per-frame evaluation needs only one field. Avoid normalizing every other
// animated field, without caching mutable props or changing normalization rules.
function readFieldPoints(props: PropsLike, field: string): KeyframePoint[] {
  const map = props?.[KEYFRAMES_PROP];
  if (!isRecord(map) || !Object.prototype.propertyIsEnumerable.call(map, field)) return [];
  return normalizedPoints(map[field]);
}

export function readKeyframeMap(props: PropsLike): KeyframeMap {
  if (!isRecord(props?.[KEYFRAMES_PROP])) return {};
  const result: KeyframeMap = {};
  for (const [field, rawPoints] of Object.entries(props[KEYFRAMES_PROP])) {
    if (!Array.isArray(rawPoints)) continue;
    const points = normalizedPoints(rawPoints);
    if (points.length > 0) result[field] = points;
  }
  return result;
}

export function writeKeyframeMap(props: PropsLike, keyframes: KeyframeMap): Record<string, unknown> {
  const next = { ...(props ?? {}) };
  const cleanEntries = Object.entries(keyframes)
    .map(([field, points]) => [
      field,
      points
        .map(normalizePoint)
        .filter((point): point is KeyframePoint => point != null)
        .sort((a, b) => a.t - b.t),
    ] as const)
    .filter(([, points]) => points.length > 0);
  if (cleanEntries.length === 0) {
    delete next[KEYFRAMES_PROP];
  } else {
    next[KEYFRAMES_PROP] = Object.fromEntries(cleanEntries);
  }
  return next;
}

export function upsertKeyframe(
  props: PropsLike,
  field: string,
  timeSeconds: number,
  value: KeyframeValue,
  ease: KeyframeEase = "linear",
): Record<string, unknown> {
  const normalizedValue = normalizeValue(value);
  if (normalizedValue == null) return { ...(props ?? {}) };
  const keyframes = readKeyframeMap(props);
  const t = roundTime(timeSeconds);
  const points = (keyframes[field] ?? []).filter((point) => Math.abs(point.t - t) > 0.0005);
  points.push({ t, v: normalizedValue, ease });
  return completeKeyframeMoment(
    writeKeyframeMap(props, { ...keyframes, [field]: points }),
    t,
    ["playback_rate"],
  );
}

/**
 * Make a keyframe timestamp a coherent moment instead of a sparse collection
 * of unrelated property points. Every property that was already animated
 * earlier inherits its latest value at the new moment. Speed steps are kept
 * separate because their source_t field is a source-clock authority, not a
 * normal visual control that can be copied forward.
 */
export function completeKeyframeMoment(
  props: PropsLike,
  timeSeconds: number,
  excludedFields: readonly string[] = ["playback_rate"],
): Record<string, unknown> {
  const keyframes = readKeyframeMap(props);
  const t = roundTime(timeSeconds);
  const excluded = new Set(excludedFields);
  const hasEditablePointAtMoment = Object.entries(keyframes).some(([field, points]) => (
    !excluded.has(field)
    && points.some((point) => Math.abs(point.t - t) <= KEYFRAME_TIME_EPSILON)
  ));
  if (!hasEditablePointAtMoment) return { ...(props ?? {}) };

  let changed = false;
  for (const [field, points] of Object.entries(keyframes)) {
    if (excluded.has(field) || points.some((point) => Math.abs(point.t - t) <= KEYFRAME_TIME_EPSILON)) continue;
    const previous = points
      .filter((point) => point.t < t - KEYFRAME_TIME_EPSILON)
      .at(-1);
    if (!previous) continue;
    points.push({
      t,
      v: Array.isArray(previous.v) ? [...previous.v] : previous.v,
      ease: previous.ease ?? "linear",
    });
    changed = true;
  }
  return changed ? writeKeyframeMap(props, keyframes) : { ...(props ?? {}) };
}

/** Update an existing point without dropping metadata such as a speed step's
 * source-time authority. The keyframe inspector uses this instead of upsert so
 * editing a value never silently turns a source-bound speed point into a plain
 * timeline point. */
export function updateKeyframeAtTime(
  props: PropsLike,
  field: string,
  timeSeconds: number,
  patch: { value?: KeyframeValue; ease?: KeyframeEase },
): Record<string, unknown> {
  const keyframes = readKeyframeMap(props);
  const t = roundTime(timeSeconds);
  const points = keyframes[field];
  if (!points) return { ...(props ?? {}) };
  const normalizedValue = patch.value === undefined ? undefined : normalizeValue(patch.value);
  if (patch.value !== undefined && normalizedValue == null) return { ...(props ?? {}) };
  const nextValue = normalizedValue ?? undefined;
  let changed = false;
  const nextPoints = points.map((point) => {
    if (Math.abs(point.t - t) > KEYFRAME_TIME_EPSILON) return point;
    changed = true;
    return {
      ...point,
      ...(nextValue !== undefined ? { v: nextValue } : {}),
      ...(patch.ease !== undefined ? { ease: patch.ease } : {}),
    };
  });
  return changed
    ? writeKeyframeMap(props, { ...keyframes, [field]: nextPoints })
    : { ...(props ?? {}) };
}

export function removeKeyframes(props: PropsLike, fields: readonly string[]): Record<string, unknown> {
  const keyframes = readKeyframeMap(props);
  for (const field of fields) delete keyframes[field];
  return writeKeyframeMap(props, keyframes);
}

export function hasKeyframes(props: PropsLike, field: string) {
  return (readKeyframeMap(props)[field]?.length ?? 0) > 0;
}

export function hasKeyframeAtTime(
  props: PropsLike,
  fields: readonly string[],
  timeSeconds: number,
) {
  const t = roundTime(timeSeconds);
  const keyframes = readKeyframeMap(props);
  return fields.some((field) =>
    (keyframes[field] ?? []).some((point) => Math.abs(point.t - t) <= 0.0005),
  );
}

export function removeKeyframesAtTime(
  props: PropsLike,
  fields: readonly string[],
  timeSeconds: number,
): Record<string, unknown> {
  const t = roundTime(timeSeconds);
  const keyframes = readKeyframeMap(props);
  for (const field of fields) {
    const remaining = (keyframes[field] ?? []).filter((point) => Math.abs(point.t - t) > 0.0005);
    if (remaining.length === 0) delete keyframes[field];
    else keyframes[field] = remaining;
  }
  return writeKeyframeMap(props, keyframes);
}

function easeProgress(progress: number, ease: KeyframeEase | undefined) {
  const p = clamp(progress, 0, 1);
  switch (ease) {
    case "hold":
      return 0;
    case "easeIn":
      return p * p;
    case "easeOut":
      return 1 - (1 - p) * (1 - p);
    case "easeInOut":
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    case "linear":
    default:
      return p;
  }
}

function resolveSegment(points: KeyframePoint[], timeSeconds: number) {
  if (points.length === 0) return null;
  const exact = points.find((point) => Math.abs(point.t - timeSeconds) <= KEYFRAME_TIME_EPSILON);
  if (exact) return { left: exact, right: exact, progress: 0 };
  if (timeSeconds <= points[0]!.t) return { left: points[0]!, right: points[0]!, progress: 0 };
  const last = points[points.length - 1]!;
  if (timeSeconds >= last.t) return { left: last, right: last, progress: 0 };
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index]!;
    const right = points[index + 1]!;
    if (timeSeconds >= left.t && timeSeconds <= right.t) {
      const span = Math.max(0.0001, right.t - left.t);
      return { left, right, progress: easeProgress((timeSeconds - left.t) / span, left.ease) };
    }
  }
  return { left: last, right: last, progress: 0 };
}

export function resolveNumberKeyframe(
  props: PropsLike,
  field: string,
  timeSeconds: number,
  fallback: number,
  options?: { min?: number; max?: number },
) {
  const points = readFieldPoints(props, field).filter((point) => isFiniteNumber(point.v));
  const segment = resolveSegment(points, Math.max(0, timeSeconds));
  if (!segment) return fallback;
  const start = segment.left.v as number;
  const end = segment.right.v as number;
  const value = start + (end - start) * segment.progress;
  return clamp(value, options?.min ?? Number.NEGATIVE_INFINITY, options?.max ?? Number.POSITIVE_INFINITY);
}

export function resolveTupleKeyframe(
  props: PropsLike,
  field: string,
  timeSeconds: number,
  fallback: readonly number[],
  options?: { min?: number; max?: number; length?: number },
) {
  const length = options?.length ?? fallback.length;
  const points = readFieldPoints(props, field).filter((point) => Array.isArray(point.v) && point.v.length === length);
  const segment = resolveSegment(points, Math.max(0, timeSeconds));
  if (!segment) return [...fallback];
  const start = segment.left.v as number[];
  const end = segment.right.v as number[];
  return start.map((startValue, index) => {
    const value = startValue + ((end[index] ?? startValue) - startValue) * segment.progress;
    return clamp(value, options?.min ?? Number.NEGATIVE_INFINITY, options?.max ?? Number.POSITIVE_INFINITY);
  });
}

/** Interpolated value at a time, matching resolveSegment's exact playback semantics. */
function segmentValueAt(points: KeyframePoint[], timeSeconds: number): KeyframeValue {
  const segment = resolveSegment(points, Math.max(0, timeSeconds))!;
  const start = segment.left.v;
  const end = segment.right.v;
  if (isFiniteNumber(start) && isFiniteNumber(end)) {
    return start + (end - start) * segment.progress;
  }
  if (Array.isArray(start) && Array.isArray(end) && start.length === end.length) {
    return start.map((startValue, index) => startValue + ((end[index] ?? startValue) - startValue) * segment.progress);
  }
  return start;
}

/**
 * Keyframes for the RIGHT half of a clip split at `splitLocalSeconds` (clip-local
 * timeline seconds — keyframe time is never scaled by playback rate; the renderer
 * samples frame/fps directly).
 *
 * The left half needs no rebase: it keeps the original map and never samples past
 * its shortened duration, so its playback is untouched. The right half's local
 * clock restarts at zero, so its points shift by -split and, when the original
 * curve was mid-segment at the cut, a boundary point holding the interpolated
 * value is inserted at t=0 so the curve CONTINUES rather than restarting.
 *
 * The boundary point inherits the containing segment's ease. For linear and hold
 * segments the result is sample-exact; for easeIn/easeOut/easeInOut the ease now
 * runs over the shorter remainder, which is a close approximation, not identity —
 * value and continuity at the cut are exact in every case.
 */
/** Arrays whose length may differ between keys (curve points): neighbours of equal length
 * interpolate element by element; otherwise the earlier key holds until the next one. */
export function resolveVariableTupleKeyframe(props: PropsLike, field: string, timeSeconds: number, fallback: readonly number[]) {
  const points = readFieldPoints(props, field).filter((point) => Array.isArray(point.v) && point.v.every(isFiniteNumber));
  const segment = resolveSegment(points, Math.max(0, timeSeconds));
  if (!segment) return [...fallback];
  const start = segment.left.v as number[];
  const end = segment.right.v as number[];
  if (start.length !== end.length) return [...(segment.progress >= 1 ? end : start)];
  return start.map((value, index) => value + (end[index]! - value) * segment.progress);
}

export function rebaseKeyframesForSplitRight(
  props: PropsLike,
  splitLocalSeconds: number,
): Record<string, unknown> {
  const map = readKeyframeMap(props);
  const fields = Object.keys(map);
  const base = { ...(props ?? {}) } as Record<string, unknown>;
  if (fields.length === 0) return base;
  const next: KeyframeMap = {};
  for (const field of fields) {
    const points = map[field]!;
    const shifted = points
      .filter((point) => point.t >= splitLocalSeconds - KEYFRAME_TIME_EPSILON)
      .map((point) => ({ ...point, t: roundTime(point.t - splitLocalSeconds) }));
    if (shifted.length === 0 || shifted[0]!.t > KEYFRAME_TIME_EPSILON) {
      const ease = resolveSegment(points, Math.max(0, splitLocalSeconds))?.left.ease;
      shifted.unshift({
        t: 0,
        v: segmentValueAt(points, splitLocalSeconds),
        ...(ease ? { ease } : {}),
      });
    }
    next[field] = shifted;
  }
  return writeKeyframeMap(base, next);
}

export function countKeyframes(props: PropsLike, fields: readonly string[]) {
  const keyframes = readKeyframeMap(props);
  return fields.reduce((count, field) => count + (keyframes[field]?.length ?? 0), 0);
}

export function collectKeyframeTimes(
  props: PropsLike,
  fields: readonly string[],
  durationSeconds?: number,
) {
  const keyframes = readKeyframeMap(props);
  const maxTime = typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
    ? Math.max(0, durationSeconds)
    : Number.POSITIVE_INFINITY;
  return [...new Set(
    fields.flatMap((field) => (keyframes[field] ?? [])
      .map((point) => point.t)
      .filter((time) => time <= maxTime)),
  )].sort((a, b) => a - b);
}

/** Whether the item has at least one valid keyframe moment on its visible
 * local clock. This contract deliberately accepts only props + duration: the
 * Properties banner must not depend on whether the item is a still, video,
 * caption, music clip, SFX, or voice segment. */
export function hasKeyframeMoments(
  props: PropsLike,
  durationSeconds?: number,
) {
  const fields = Object.keys(readKeyframeMap(props));
  return collectKeyframeTimes(props, fields, durationSeconds).length > 0;
}

/** Move every property keyed at one clip-local moment as a unit. Collisions
 * are deterministic: the moved point replaces an existing point for the same
 * field at the destination, while unrelated fields at that moment survive. */
export function retimeKeyframeMoment(
  props: PropsLike,
  fromTimeSeconds: number,
  toTimeSeconds: number,
  durationSeconds: number,
  framesPerSecond = 30,
  excludedFields: readonly string[] = [],
) {
  const completedProps = completeKeyframeMoment(props, fromTimeSeconds, ["playback_rate", ...excludedFields]);
  const keyframes = readKeyframeMap(completedProps);
  const maxTime = Math.max(0, durationSeconds);
  const frame = 1 / Math.max(1, framesPerSecond);
  const target = roundTime(clamp(Math.round(toTimeSeconds / frame) * frame, 0, maxTime));
  let moved = false;
  for (const [field, points] of Object.entries(keyframes)) {
    if (excludedFields.includes(field)) continue;
    const moving = points.filter((point) => Math.abs(point.t - fromTimeSeconds) <= KEYFRAME_TIME_EPSILON);
    if (moving.length === 0) continue;
    moved = true;
    const remaining = points.filter((point) => (
      Math.abs(point.t - fromTimeSeconds) > KEYFRAME_TIME_EPSILON
      && Math.abs(point.t - target) > KEYFRAME_TIME_EPSILON
    ));
    keyframes[field] = [
      ...remaining,
      ...moving.map((point) => ({ ...point, t: target })),
    ];
  }
  return {
    props: moved ? writeKeyframeMap(completedProps, keyframes) : { ...(props ?? {}) },
    timeSeconds: target,
  };
}

export function keyframeValuesAtTime(props: PropsLike, timeSeconds: number) {
  const keyframes = readKeyframeMap(props);
  return Object.entries(keyframes)
    .flatMap(([field, points]) => points
      .filter((point) => Math.abs(point.t - timeSeconds) <= KEYFRAME_TIME_EPSILON)
      .map((point) => ({ field, value: point.v, ease: point.ease ?? "linear" })))
    .sort((left, right) => left.field.localeCompare(right.field));
}
