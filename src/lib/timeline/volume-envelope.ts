/**
 * Shared pure helpers for volume envelope normalization and manipulation.
 *
 * Imported by both the editor/canvas code and the Remotion render path.
 * Do not add React or browser dependencies here.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type EnvelopePoint = {
  time_seconds: number;
  volume: number;
};

type ElementLike = {
  props?: Record<string, unknown> | null;
  volume?: unknown;
};

// ── Constants ────────────────────────────────────────────────────────────────

export const MIN_VOLUME = 0;
export const MAX_VOLUME = 4;
const DECIMAL_PRECISION = 3;
const VOLUME_SNAP_EPSILON = 0.02;

// ── Internal helpers ─────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

function isEnvelopePoint(value: unknown): value is EnvelopePoint {
  return (
    !!value
    && typeof value === "object"
    && "time_seconds" in value
    && "volume" in value
    && Number.isFinite((value as { time_seconds: unknown }).time_seconds)
    && Number.isFinite((value as { volume: unknown }).volume)
  );
}

function normalizePoint(point: EnvelopePoint): EnvelopePoint {
  const clampedVolume = clamp(point.volume, MIN_VOLUME, MAX_VOLUME);
  const snappedVolume = clampedVolume <= MIN_VOLUME + VOLUME_SNAP_EPSILON
    ? MIN_VOLUME
    : clampedVolume >= MAX_VOLUME - VOLUME_SNAP_EPSILON
      ? MAX_VOLUME
      : clampedVolume;
  return {
    time_seconds: roundTo(point.time_seconds, DECIMAL_PRECISION),
    volume: roundTo(snappedVolume, DECIMAL_PRECISION),
  };
}

function defaultEnvelope(duration: number, fallbackVolume = 1): EnvelopePoint[] {
  const normalizedDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const normalizedFallbackVolume = roundTo(clamp(fallbackVolume, MIN_VOLUME, MAX_VOLUME), DECIMAL_PRECISION);
  return [
    { time_seconds: 0, volume: normalizedFallbackVolume },
    { time_seconds: roundTo(normalizedDuration, DECIMAL_PRECISION), volume: normalizedFallbackVolume },
  ];
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read the normalized volume envelope from an element.
 * Returns a default two-point flat envelope if the element has no valid
 * `volume_envelope` in its props.
 *
 * Never throws — malformed data falls back to the default.
 */
export function readVolumeEnvelopePoints(
  element: ElementLike,
  duration: number,
): EnvelopePoint[] {
  const fallbackVolume = Number.isFinite(element.volume) ? Number(element.volume) : 1;
  const raw = element.props?.volume_envelope;
  if (!Array.isArray(raw)) return defaultEnvelope(duration, fallbackVolume);
  const valid = raw.filter(isEnvelopePoint);
  if (valid.length < 2) return defaultEnvelope(duration, fallbackVolume);
  return normalizeVolumeEnvelope(valid, duration);
}

/**
 * Normalize an array of envelope points against a given duration.
 *
 * Guarantees:
 * - sorted by time_seconds
 * - first point at time_seconds = 0
 * - last point at time_seconds = duration
 * - interior points strictly between 0 and duration
 * - volumes clamped to [0, 4]
 * - rounded to 3 decimal places
 */
export function normalizeVolumeEnvelope(
  points: EnvelopePoint[],
  duration: number,
): EnvelopePoint[] {
  const dur = roundTo(Number.isFinite(duration) ? Math.max(0, duration) : 0, DECIMAL_PRECISION);

  // Normalize and sort
  const sorted = points.map(normalizePoint).sort((a, b) => a.time_seconds - b.time_seconds);

  // Extract interior points (strictly between 0 and duration)
  const interior = sorted.filter((p) => p.time_seconds > 0 && p.time_seconds < dur);

  // Deduplicate interior points at the same time
  const deduped: EnvelopePoint[] = [];
  for (const point of interior) {
    if (deduped.length > 0 && deduped[deduped.length - 1]!.time_seconds === point.time_seconds) {
      // Keep the later one (last write wins)
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }

  // Find start and end volumes from the input
  const startVolume = sorted.find((p) => p.time_seconds <= 0)?.volume ?? 1;
  const endVolume = [...sorted].reverse().find((p) => p.time_seconds >= dur)?.volume ?? 1;

  return [
    { time_seconds: 0, volume: roundTo(clamp(startVolume, MIN_VOLUME, MAX_VOLUME), DECIMAL_PRECISION) },
    ...deduped,
    { time_seconds: dur, volume: roundTo(clamp(endVolume, MIN_VOLUME, MAX_VOLUME), DECIMAL_PRECISION) },
  ];
}

/**
 * Build a props patch that writes `volume_envelope` while preserving
 * all other keys in `element.props`.
 */
export function writeVolumeEnvelopePatch(
  element: ElementLike,
  points: EnvelopePoint[],
  duration: number,
): { volume: number; props: Record<string, unknown> } {
  const normalized = normalizeVolumeEnvelope(points, duration);
  return {
    // Keep the scalar field synchronized with the envelope's opening gain.
    // Rendering reads the envelope, while metadata, agents, and legacy controls
    // still inspect `volume`; allowing the two to drift makes the visible fader
    // disagree with the actual mix and can conceal a native/Web Audio switch.
    volume: normalized[0]?.volume ?? 1,
    props: {
      ...(element.props ?? {}),
      volume_envelope: normalized,
    },
  };
}

/**
 * Move an envelope to a new opening gain without changing its automation shape.
 *
 * The inspector fader represents the opening absolute gain. Retargeting shifts
 * every point by the same delta so live preview and the persisted patch follow
 * the same rule.
 */
export function retargetVolumeEnvelope(
  points: EnvelopePoint[],
  openingVolume: number,
): EnvelopePoint[] {
  if (points.length === 0) return [];
  const target = roundTo(clamp(openingVolume, MIN_VOLUME, MAX_VOLUME), DECIMAL_PRECISION);
  const delta = target - points[0]!.volume;
  return points.map((point) => normalizePoint({
    time_seconds: point.time_seconds,
    volume: point.volume + delta,
  }));
}

/**
 * Adjust an existing envelope when clip duration changes.
 *
 * - End endpoint moves to `newDuration`
 * - Interior points beyond `newDuration` are dropped
 * - Interior points at their absolute clip-relative times are preserved (no scaling)
 */
export function adjustEnvelopeForDuration(
  points: EnvelopePoint[],
  newDuration: number,
): EnvelopePoint[] {
  const dur = roundTo(Math.max(0, newDuration), DECIMAL_PRECISION);
  if (points.length < 2) return defaultEnvelope(dur);

  const normalized = normalizeVolumeEnvelope(points, points[points.length - 1]!.time_seconds);
  const startPoint = normalized[0]!;

  // Keep interior points that are still within the new duration
  const interior = normalized
    .slice(1, -1)
    .filter((p) => p.time_seconds > 0 && p.time_seconds < dur);
  const endVolume = roundTo(
    clamp(interpolateEnvelopeVolume(normalized, dur), MIN_VOLUME, MAX_VOLUME),
    DECIMAL_PRECISION,
  );

  return [
    { time_seconds: 0, volume: startPoint.volume },
    ...interior,
    { time_seconds: dur, volume: endVolume },
  ];
}

/**
 * Interpolate the volume at a given time in the envelope.
 * Uses piecewise linear interpolation.
 */
export function interpolateEnvelopeVolume(
  points: EnvelopePoint[],
  time: number,
): number {
  if (points.length === 0) return 1;
  if (points.length === 1) return points[0]!.volume;

  // Clamp to envelope bounds
  if (time <= points[0]!.time_seconds) return points[0]!.volume;
  if (time >= points[points.length - 1]!.time_seconds) return points[points.length - 1]!.volume;

  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i]!;
    const right = points[i + 1]!;
    if (time >= left.time_seconds && time <= right.time_seconds) {
      const span = right.time_seconds - left.time_seconds;
      if (span <= 0) return left.volume;
      const progress = (time - left.time_seconds) / span;
      return left.volume + (right.volume - left.volume) * progress;
    }
  }

  return points[points.length - 1]!.volume;
}

/**
 * Insert a new point at `time` on the existing envelope.
 * The volume is interpolated so the envelope shape does not change.
 */
export function insertEnvelopePoint(
  points: EnvelopePoint[],
  time: number,
): EnvelopePoint[] {
  const volume = interpolateEnvelopeVolume(points, time);
  const newPoint = normalizePoint({ time_seconds: time, volume });

  // Don't insert if a point already exists at this time
  if (points.some((p) => roundTo(p.time_seconds, DECIMAL_PRECISION) === newPoint.time_seconds)) {
    return [...points];
  }

  const result = [...points, newPoint].sort((a, b) => a.time_seconds - b.time_seconds);
  return result;
}

/**
 * Move a point in the envelope.
 * First and last points are time-locked (only volume changes).
 */
export function moveEnvelopePoint(
  points: EnvelopePoint[],
  index: number,
  nextTime: number,
  nextVolume: number,
): EnvelopePoint[] {
  if (index < 0 || index >= points.length) return [...points];

  const isEndpoint = index === 0 || index === points.length - 1;
  const clampedVolume = clamp(nextVolume, MIN_VOLUME, MAX_VOLUME);

  const result = points.map((p, i) => {
    if (i !== index) return { ...p };

    if (isEndpoint) {
      // Time-locked: only volume changes
      return { time_seconds: p.time_seconds, volume: roundTo(clampedVolume, DECIMAL_PRECISION) };
    }

    // Interior point: clamp time to neighbors
    const prevTime = points[index - 1]!.time_seconds;
    const nextTimeLimit = points[index + 1]!.time_seconds;
    const clampedTime = roundTo(
      clamp(nextTime, prevTime + 0.001, nextTimeLimit - 0.001),
      DECIMAL_PRECISION,
    );

    return {
      time_seconds: clampedTime,
      volume: roundTo(clampedVolume, DECIMAL_PRECISION),
    };
  });

  return result;
}

/**
 * Move a segment (the two adjacent points) vertically by `deltaVolume`.
 * Both points move by the same clamped delta. Neither moves horizontally.
 */
export function moveEnvelopeSegment(
  points: EnvelopePoint[],
  leftIndex: number,
  rightIndex: number,
  deltaVolume: number,
): EnvelopePoint[] {
  if (leftIndex < 0 || rightIndex >= points.length || leftIndex >= rightIndex) {
    return [...points];
  }

  const leftPoint = points[leftIndex]!;
  const rightPoint = points[rightIndex]!;

  // Compute shared max legal delta so both points stay in [0, 4]
  const maxUp = Math.min(MAX_VOLUME - leftPoint.volume, MAX_VOLUME - rightPoint.volume);
  const maxDown = Math.min(leftPoint.volume - MIN_VOLUME, rightPoint.volume - MIN_VOLUME);
  const clampedDelta = clamp(deltaVolume, -maxDown, maxUp);

  return points.map((p, i) => {
    if (i === leftIndex || i === rightIndex) {
      return {
        time_seconds: p.time_seconds,
        volume: roundTo(p.volume + clampedDelta, DECIMAL_PRECISION),
      };
    }
    return { ...p };
  });
}

/**
 * Split an envelope at `splitTime` into left and right halves.
 *
 * - `splitTime` is the left clip's new duration
 * - `rightDuration` is the right clip's new duration
 * - The volume at `splitTime` is interpolated from the original envelope
 * - Left half: [0, splitTime], right half: [0, rightDuration] (re-zeroed)
 */
export function splitEnvelope(
  points: EnvelopePoint[],
  splitTime: number,
  rightDuration: number,
): { left: EnvelopePoint[]; right: EnvelopePoint[] } {
  const split = roundTo(splitTime, DECIMAL_PRECISION);
  const rightDur = roundTo(rightDuration, DECIMAL_PRECISION);
  const volumeAtSplit = interpolateEnvelopeVolume(points, split);
  const splitVolume = roundTo(clamp(volumeAtSplit, MIN_VOLUME, MAX_VOLUME), DECIMAL_PRECISION);

  // Left envelope: points in [0, splitTime]
  const leftInterior = points.filter(
    (p) => p.time_seconds > 0 && p.time_seconds < split,
  ).map(normalizePoint);

  // Check if a point already exists exactly at splitTime
  const existsAtSplit = points.some(
    (p) => roundTo(p.time_seconds, DECIMAL_PRECISION) === split,
  );

  const left: EnvelopePoint[] = [
    { time_seconds: 0, volume: normalizePoint(points[0]!).volume },
    ...leftInterior,
    { time_seconds: split, volume: existsAtSplit
      ? normalizePoint(points.find((p) => roundTo(p.time_seconds, DECIMAL_PRECISION) === split)!).volume
      : splitVolume },
  ];

  // Right envelope: points in (splitTime, end], rebased to [0, rightDuration]
  const rightInterior = points.filter(
    (p) => p.time_seconds > split && p.time_seconds < points[points.length - 1]!.time_seconds,
  ).map((p) => normalizePoint({
    time_seconds: p.time_seconds - splitTime,
    volume: p.volume,
  }));

  // Check if a point exists exactly at splitTime to use its volume for the right start
  const rightStartVolume = existsAtSplit
    ? normalizePoint(points.find((p) => roundTo(p.time_seconds, DECIMAL_PRECISION) === split)!).volume
    : splitVolume;

  const right: EnvelopePoint[] = [
    { time_seconds: 0, volume: rightStartVolume },
    ...rightInterior.filter((p) => p.time_seconds > 0 && p.time_seconds < rightDur),
    { time_seconds: rightDur, volume: normalizePoint(points[points.length - 1]!).volume },
  ];

  return { left, right };
}
