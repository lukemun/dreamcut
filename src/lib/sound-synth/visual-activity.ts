import { readKeyframeMap, resolveNumberKeyframe, resolveTupleKeyframe } from "@/lib/timeline/keyframes";
import { resolveShapeProps, shapeContours, type ShapeContour } from "@/lib/timeline/shapes";
import { isAudioElementType } from "@/lib/timeline/animation-presets";
import { timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";

/**
 * Visual activity curves: how much is changing on screen over time, sampled on the
 * timeline clock, so a sound can follow the picture exactly (loudness on activity,
 * onsets on starts). Pure math over timeline data; media readers live in activity-media.ts.
 * See .agents/skills/sound-design/SKILL.md (sound follows the picture).
 */

export type ActivityElement = {
  id: string;
  type: string;
  timeline_start: number;
  duration: number;
  trim_start?: number | null;
  trim_end?: number | null;
  playback_rate?: number | null;
  source_url?: string | null;
  props?: Record<string, unknown> | null;
};

export type ActivityWindow = { start: number; end: number; rate: number };

export type CurveKind = "draw" | "pen" | "camera" | "motion" | "entrances" | "cuts" | "frames" | "composition";

export type ActivityCurve = {
  name: string;
  kind: CurveKind;
  /** Raw activity per bin, in the curve's own units (progress or normalized change per second). */
  values: Float64Array;
  element_ids: string[];
};

/** Keyframe fields that are not picture motion. */
const NON_MOTION_FIELDS = new Set(["playback_rate", "volume", "transition_blur"]);

export function binCount(window: ActivityWindow) {
  return Math.max(1, Math.round((window.end - window.start) * window.rate));
}

export function binTime(window: ActivityWindow, index: number) {
  return window.start + (index + 0.5) / window.rate;
}

export function isVisualElement(element: ActivityElement) {
  return !isAudioElementType(element.type);
}

export function overlapsWindow(element: ActivityElement, window: ActivityWindow) {
  return element.timeline_start < window.end && element.timeline_start + element.duration > window.start;
}

export function elementTitle(element: ActivityElement) {
  const props = element.props ?? {};
  const title = props.title ?? props.label ?? props.text;
  return typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : element.type;
}

/** Composition id when the clip is a HyperFrames render (media/hyperframes/<id>/...). */
export function compositionIdOf(element: ActivityElement): string | null {
  const match = /\/media\/hyperframes\/([A-Za-z0-9._-]+)\//.exec(element.source_url ?? "");
  return match?.[1] ?? null;
}

/** Source (media) time shown at a timeline time, honouring trims, speed steps and reverse. */
export function sourceTimeAt(element: ActivityElement, timelineSeconds: number) {
  return timelineTimeToSourceTime(element as Parameters<typeof timelineTimeToSourceTime>[0], timelineSeconds - element.timeline_start);
}

function keyframeValue(props: Record<string, unknown>, field: string, local: number, sample: unknown): number[] | null {
  if (typeof sample === "number") return [resolveNumberKeyframe(props, field, local, sample)];
  if (Array.isArray(sample) && sample.every((value) => typeof value === "number")) {
    return resolveTupleKeyframe(props, field, local, sample as number[]);
  }
  return null;
}

/**
 * Per-element keyframe activity: the summed speed of every animated numeric field,
 * each scaled by its own range so a full sweep of any field counts the same.
 * Keyframe time is clip-local timeline seconds (never scaled by playback rate).
 */
export function keyframeActivity(element: ActivityElement, window: ActivityWindow): { draw: Float64Array; motion: Float64Array; fields: string[] } | null {
  const props = element.props ?? {};
  const map = readKeyframeMap(props);
  const n = binCount(window);
  const draw = new Float64Array(n);
  const motion = new Float64Array(n);
  const fields: string[] = [];
  const step = 1 / window.rate;
  for (const [field, points] of Object.entries(map)) {
    if (NON_MOTION_FIELDS.has(field) || points.length < 2) continue;
    const sample = points[0]!.v;
    const valueAt = (time: number) => keyframeValue(props, field, time - element.timeline_start, sample);
    // Range of each component over the clip, for scale-free speed.
    const lows: number[] = [];
    const highs: number[] = [];
    for (const point of points) {
      const values = typeof point.v === "number" ? [point.v] : Array.isArray(point.v) ? point.v as number[] : [];
      values.forEach((value, index) => {
        lows[index] = Math.min(lows[index] ?? value, value);
        highs[index] = Math.max(highs[index] ?? value, value);
      });
    }
    const ranges = highs.map((high, index) => high - lows[index]!);
    if (!ranges.some((range) => range > 1e-9)) continue;
    const target = field === "shape_draw" || field.endsWith("_draw") || field.endsWith("_reveal") ? draw : motion;
    let any = false;
    for (let index = 0; index < n; index += 1) {
      const time = binTime(window, index);
      if (time < element.timeline_start || time > element.timeline_start + element.duration) continue;
      const before = valueAt(time - step / 2);
      const after = valueAt(time + step / 2);
      if (!before || !after) continue;
      let speed = 0;
      for (let component = 0; component < after.length; component += 1) {
        const range = ranges[component] ?? 0;
        if (range > 1e-9) speed += Math.abs((after[component]! - before[component]!) / range) / step;
      }
      if (speed > 0) any = true;
      target[index] += speed;
    }
    if (any) fields.push(field);
  }
  return fields.length ? { draw, motion, fields } : null;
}

/** A contour as a polyline (curves flattened) with cumulative arc length, in pixels on a 1080-high canvas. */
function flatten(contour: ShapeContour) {
  const points = contour.points;
  const out: Array<[number, number]> = points.length ? [[points[0]!.x, points[0]!.y]] : [];
  const segments = points.slice(1).map((to, index) => ({ from: points[index]!, to }));
  if (contour.closed && points.length > 1) segments.push({ from: points.at(-1)!, to: points[0]! });
  for (const { from, to } of segments) {
    if (!from.out && !to.in) {
      out.push([to.x, to.y]);
      continue;
    }
    const p1 = [from.x + (from.out?.[0] ?? 0), from.y + (from.out?.[1] ?? 0)];
    const p2 = [to.x + (to.in?.[0] ?? 0), to.y + (to.in?.[1] ?? 0)];
    for (let step = 1; step <= 24; step += 1) {
      const t = step / 24;
      const u = 1 - t;
      out.push([0, 1].map((k) => u * u * u * [from.x, from.y][k]! + 3 * u * u * t * p1[k]! + 3 * u * t * t * p2[k]! + t * t * t * [to.x, to.y][k]!) as [number, number]);
    }
  }
  const lengths = [0];
  for (let index = 1; index < out.length; index += 1) lengths.push(lengths[index - 1]! + Math.hypot(out[index]![0] - out[index - 1]![0], out[index]![1] - out[index - 1]![1]));
  return { points: out, lengths, length: lengths.at(-1) ?? 0 };
}

/** Which contour the pen is on and its heading (radians) at arc length `at` across the contours in order. */
function penAt(paths: ReturnType<typeof flatten>[], at: number) {
  let remaining = at;
  for (let contour = 0; contour < paths.length; contour += 1) {
    const path = paths[contour]!;
    if (remaining <= path.length || contour === paths.length - 1) {
      let index = 1;
      while (index < path.lengths.length - 1 && path.lengths[index]! < remaining) index += 1;
      const a = path.points[index - 1] ?? [0, 0];
      const b = path.points[index] ?? a;
      return { contour, heading: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    remaining -= path.length;
  }
  return { contour: 0, heading: 0 };
}

/**
 * The pen tip of a drawn shape (draw-on through its contours in order, as the renderer
 * draws it): speed along the stroke in pixels per second on a 1080-high canvas, how fast
 * the stroke turns (radians per second), and the moments the pen touches down on a new
 * contour. Handwriting sounds follow these: loudness and brightness on speed, a different
 * scratch on turns, silence between strokes.
 */
export function penActivity(element: ActivityElement, window: ActivityWindow): { speed: Float64Array; turn: Float64Array; pen_down: number[] } | null {
  const props = element.props ?? {};
  const draw = readKeyframeMap(props).shape_draw;
  if (element.type !== "shape" || !draw || draw.length < 2) return null;
  const resolved = resolveShapeProps(props);
  const height = 1080;
  const scale = typeof props.media_scale === "number" ? props.media_scale : 1;
  const paths = shapeContours(resolved, resolved.shape_width * height, resolved.shape_height * height).map(flatten).filter((path) => path.length > 0);
  const perimeter = paths.reduce((sum, path) => sum + path.length, 0);
  if (!(perimeter > 0)) return null;
  const n = binCount(window);
  const speed = new Float64Array(n);
  const turn = new Float64Array(n);
  const penDown: number[] = [];
  const step = 1 / window.rate;
  const drawnAt = (time: number) => perimeter * resolveNumberKeyframe(props, "shape_draw", time - element.timeline_start, 1, { min: 0, max: 1 });
  let any = false;
  for (let index = 0; index < n; index += 1) {
    const time = binTime(window, index);
    if (time < element.timeline_start || time > element.timeline_start + element.duration) continue;
    const before = drawnAt(time - step / 2);
    const after = drawnAt(time + step / 2);
    if (after - before <= 1e-6) continue;
    any = true;
    speed[index] = ((after - before) / step) * scale;
    const from = penAt(paths, before);
    const to = penAt(paths, after);
    if (to.contour !== from.contour) {
      penDown.push(time);
      continue;
    }
    if (before <= 1e-6) penDown.push(time);
    let delta = Math.abs(to.heading - from.heading);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    turn[index] = delta / step;
  }
  return any ? { speed, turn, pen_down: penDown } : null;
}

function presetBump(curve: Float64Array, window: ActivityWindow, from: number, seconds: number) {
  if (!(seconds > 0)) return;
  for (let index = 0; index < curve.length; index += 1) {
    const time = binTime(window, index);
    if (time < from || time > from + seconds) continue;
    // Smooth bump with unit area: an eased transition changes most in its middle.
    curve[index] += (Math.PI / 2) * Math.sin(Math.PI * (time - from) / seconds) / seconds;
  }
}

/** Entrance/exit presets as activity bumps over their durations. */
export function presetActivity(element: ActivityElement, window: ActivityWindow): Float64Array | null {
  const props = element.props ?? {};
  const curve = new Float64Array(binCount(window));
  let any = false;
  const inName = props.animationIn;
  const inSeconds = Number(props.animationInDuration ?? 0.5);
  if (typeof inName === "string" && inName !== "none" && inSeconds > 0) {
    presetBump(curve, window, element.timeline_start, Math.min(inSeconds, element.duration));
    any = true;
  }
  const outName = props.animationOut;
  const outSeconds = Number(props.animationOutDuration ?? 0.5);
  if (typeof outName === "string" && outName !== "none" && outSeconds > 0) {
    const seconds = Math.min(outSeconds, element.duration);
    presetBump(curve, window, element.timeline_start + element.duration - seconds, seconds);
    any = true;
  }
  return any ? curve : null;
}

/** A hard appearance or disappearance (no entrance/exit preset) as a one-frame impulse. */
export function cutActivity(element: ActivityElement, window: ActivityWindow, fps = 30): Float64Array | null {
  const props = element.props ?? {};
  const curve = new Float64Array(binCount(window));
  const width = Math.max(1, Math.round(window.rate / fps));
  let any = false;
  const mark = (time: number) => {
    if (time <= window.start || time >= window.end) return;
    const first = Math.floor((time - window.start) * window.rate);
    for (let index = first; index < Math.min(curve.length, first + width); index += 1) curve[index] += window.rate / width;
    any = true;
  };
  // An element that starts undrawn or transparent (or ends that way) appears through its keyframes, not a cut.
  const map = readKeyframeMap(props);
  const reveal = ["shape_draw", "opacity", "media_opacity"].map((field) => map[field]).filter((points) => points?.length);
  const startsHidden = reveal.some((points) => points![0]!.t <= 0.01 && points![0]!.v === 0);
  const endsHidden = reveal.some((points) => points!.at(-1)!.v === 0 && points!.at(-1)!.t >= element.duration - 0.01);
  const hasIn = typeof props.animationIn === "string" && props.animationIn !== "none";
  const hasOut = typeof props.animationOut === "string" && props.animationOut !== "none";
  if (!hasIn && !startsHidden) mark(element.timeline_start);
  if (!hasOut && !endsHidden) mark(element.timeline_start + element.duration);
  return any ? curve : null;
}

/** Light moving-average smoothing (radius in bins) so curves do not buzz at the bin rate. */
export function smooth(values: ArrayLike<number>, radius: number): Float64Array {
  const out = new Float64Array(values.length);
  if (radius <= 0) {
    for (let index = 0; index < values.length; index += 1) out[index] = values[index]!;
    return out;
  }
  for (let index = 0; index < values.length; index += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = index - radius; offset <= index + radius; offset += 1) {
      if (offset < 0 || offset >= values.length) continue;
      sum += values[offset]!;
      count += 1;
    }
    out[index] = sum / count;
  }
  return out;
}

export function normalize(values: ArrayLike<number>): Float64Array {
  let peak = 0;
  for (let index = 0; index < values.length; index += 1) peak = Math.max(peak, values[index]!);
  const out = new Float64Array(values.length);
  if (peak <= 0) return out;
  for (let index = 0; index < values.length; index += 1) out[index] = values[index]! / peak;
  return out;
}

/** Sum of each curve scaled to its own peak, rescaled to a peak of 1. */
export function combineCurves(curves: readonly ArrayLike<number>[], length: number): Float64Array {
  const total = new Float64Array(length);
  for (const curve of curves) {
    const scaled = normalize(curve);
    for (let index = 0; index < length; index += 1) total[index] += scaled[index] ?? 0;
  }
  return normalize(total);
}

/**
 * Onset times: where a curve starts rising. A rise is a local increase of at least
 * `minRise` (on a 0–1 curve) over `riseSeconds`; the onset is the first bin of the
 * rise that clears 20% of the way from the preceding minimum to the rise's peak.
 * The same rule is applied to sound envelopes, so offsets compare like with like.
 */
export function detectOnsets(values: ArrayLike<number>, rate: number, options: { minRise?: number; riseSeconds?: number; minGapSeconds?: number } = {}): number[] {
  const curve = normalize(values);
  const minRise = options.minRise ?? 0.15;
  const lag = Math.max(1, Math.round((options.riseSeconds ?? 0.06) * rate));
  const minGap = Math.max(1, Math.round((options.minGapSeconds ?? 0.12) * rate));
  const lookBack = Math.max(lag, Math.round(0.15 * rate));
  const onsets: number[] = [];
  let index = lag;
  while (index < curve.length) {
    const rise = curve[index]! - curve[index - lag]!;
    if (rise < minRise) {
      index += 1;
      continue;
    }
    // Peak of this rise, then the base before it.
    let peakIndex = index;
    while (peakIndex + 1 < curve.length && curve[peakIndex + 1]! >= curve[peakIndex]!) peakIndex += 1;
    let base = curve[index]!;
    let baseIndex = index;
    for (let back = index; back >= Math.max(0, index - lookBack); back -= 1) {
      if (curve[back]! <= base) {
        base = curve[back]!;
        baseIndex = back;
      }
    }
    const threshold = base + 0.2 * (curve[peakIndex]! - base);
    let onset = baseIndex;
    while (onset < peakIndex && curve[onset]! < threshold) onset += 1;
    if (!onsets.length || onset - Math.round(onsets.at(-1)! * rate) >= minGap) onsets.push(onset / rate);
    index = Math.max(index + 1, peakIndex + 1, onset + minGap);
  }
  return onsets;
}

/** Active spans where a 0–1 curve stays above a threshold, merged across short gaps. */
export function activeIntervals(values: ArrayLike<number>, rate: number, threshold = 0.05, mergeSeconds = 0.1): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let open: number | null = null;
  for (let index = 0; index <= values.length; index += 1) {
    const on = index < values.length && values[index]! > threshold;
    if (on && open == null) open = index;
    if (!on && open != null) {
      const span: [number, number] = [open / rate, index / rate];
      const last = spans.at(-1);
      if (last && span[0] - last[1] <= mergeSeconds) last[1] = span[1];
      else spans.push(span);
      open = null;
    }
  }
  return spans;
}

export function topPeaks(values: ArrayLike<number>, rate: number, count = 5, minGapSeconds = 0.25) {
  const gap = Math.round(minGapSeconds * rate);
  const candidates: Array<{ index: number; value: number }> = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    const value = values[index]!;
    if (value > 0.1 && value >= values[index - 1]! && value > values[index + 1]!) candidates.push({ index, value });
  }
  candidates.sort((left, right) => right.value - left.value);
  const chosen: typeof candidates = [];
  for (const candidate of candidates) {
    if (chosen.every((other) => Math.abs(other.index - candidate.index) >= gap)) chosen.push(candidate);
    if (chosen.length >= count) break;
  }
  return chosen.sort((left, right) => left.index - right.index).map(({ index, value }) => ({ time: index / rate, value: Number(value.toFixed(3)) }));
}

/** Resample a curve sampled at `fromRate` from `fromStart` onto a window (linear). */
export function resampleOnto(values: ArrayLike<number>, fromStart: number, fromRate: number, window: ActivityWindow, mapTime: (time: number) => number | null): Float64Array {
  const out = new Float64Array(binCount(window));
  for (let index = 0; index < out.length; index += 1) {
    const source = mapTime(binTime(window, index));
    if (source == null) continue;
    const position = (source - fromStart) * fromRate;
    const left = Math.floor(position);
    if (left < 0 || left >= values.length) continue;
    const right = Math.min(values.length - 1, left + 1);
    const fraction = position - left;
    out[index] = values[left]! * (1 - fraction) + values[right]! * fraction;
  }
  return out;
}

const round3 = (value: number) => Number(value.toFixed(3));

/** Compact JS an agent pastes into synth_js so the sound follows the curves. t is seconds from the window start. */
export function synthEmbed(window: ActivityWindow, curves: Record<string, ArrayLike<number>>, maxRate = 100) {
  const factor = Math.max(1, Math.round(window.rate / maxRate));
  const rate = window.rate / factor;
  const packed: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(curves)) {
    const out: number[] = [];
    for (let index = 0; index < values.length; index += factor) {
      let peak = 0;
      for (let offset = index; offset < Math.min(values.length, index + factor); offset += 1) peak = Math.max(peak, values[offset]!);
      out.push(round3(peak));
    }
    packed[name] = out;
  }
  return [
    `// Visual activity from visual_activity_prepare: ${window.start.toFixed(3)}-${window.end.toFixed(3)} s on the timeline, ${rate} values per second, 0-1.`,
    `// Place the rendered sound at timeline_start ${window.start.toFixed(3)} with source_start_seconds 0 so t lines up.`,
    `const ACTIVITY = { rate: ${rate}, curves: ${JSON.stringify(packed)} };`,
    "function activityAt(name, t) { const c = ACTIVITY.curves[name]; if (!c) return 0; const p = t * ACTIVITY.rate - 0.5; const i = Math.floor(p); if (i < 0) return c[0] || 0; if (i >= c.length - 1) return c[c.length - 1] || 0; return c[i] + (c[i + 1] - c[i]) * (p - i); }",
  ].join("\n");
}

export function summarizeCurve(values: ArrayLike<number>, window: ActivityWindow) {
  const offset = (time: number) => round3(window.start + time);
  return {
    onsets_seconds: detectOnsets(values, window.rate).map(offset),
    peaks: topPeaks(values, window.rate).map((peak) => ({ time_seconds: offset(peak.time), value: peak.value })),
    active_intervals: activeIntervals(values, window.rate).map(([from, to]) => [offset(from), offset(to)]),
  };
}

export type HoldAround = {
  at_seconds: number;
  /** Whether the moment itself falls in a still stretch; when not, the nearest still stretch within reach is reported. */
  at_rest: boolean;
  /** When motion stops before the moment (the subject has arrived), timeline seconds; null when no still stretch is in reach. */
  settle_seconds: number | null;
  /** When motion starts again after it (the subject sets off). */
  takeoff_seconds: number | null;
  /** How clearly still the stretch is against the motion around it, 0-1; below about 0.5 read the frames before trusting it. */
  contrast: number;
};

/**
 * Where something comes to rest around each given moment, and when it sets off again. Each moment is read
 * against the motion in the seconds around it, so a small far subject and a large near one are judged
 * alike: a stretch is still when the curve stays below the geometric midpoint of its local quiet and busy
 * levels (motion spans orders of magnitude, so a linear midpoint would call a far walk still). Brief flickers
 * shorter than mergeSeconds do not end a hold. Built for marks on a locked-off take (stop, then go),
 * but answers the same question for any curve.
 */
export function holdsAround(values: ArrayLike<number>, window: ActivityWindow, moments: readonly number[],
  options: { reachSeconds?: number; contextSeconds?: number; mergeSeconds?: number; minHoldSeconds?: number } = {}): HoldAround[] {
  const { reachSeconds = 1.5, contextSeconds = 3, mergeSeconds = 0.1, minHoldSeconds = 0.1 } = options;
  const n = values.length;
  const index = (time: number) => Math.min(n - 1, Math.max(0, Math.round((time - window.start) * window.rate)));
  const time = (bin: number) => Number((window.start + bin / window.rate).toFixed(3));
  const quantile = (list: number[], q: number) => { const sorted = [...list].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0; };
  return moments.map(at => {
    const centre = index(at);
    const from = index(at - contextSeconds), to = index(at + contextSeconds);
    const local = Array.from({ length: to - from + 1 }, (_, k) => values[from + k]!);
    const floor = quantile(local, 0.1), high = quantile(local, 0.9);
    const threshold = Math.sqrt(Math.max(floor, high * 1e-3) * high);
    // Still bins, with flickers shorter than mergeSeconds folded into the hold around them.
    const still = local.map(value => value <= threshold);
    const gap = Math.round(mergeSeconds * window.rate);
    for (let k = 0; k < still.length;) {
      if (still[k]) { k++; continue; }
      let end = k; while (end < still.length && !still[end]) end++;
      if (k > 0 && end < still.length && end - k <= gap) for (let j = k; j < end; j++) still[j] = true;
      k = end;
    }
    const runs: Array<[number, number]> = [];
    for (let k = 0; k < still.length;) {
      if (!still[k]) { k++; continue; }
      let end = k; while (end < still.length && still[end]) end++;
      if ((end - k) / window.rate >= minHoldSeconds) runs.push([from + k, from + end - 1]);
      k = end;
    }
    const reach = Math.round(reachSeconds * window.rate);
    const distance = ([a, b]: [number, number]) => centre < a ? a - centre : centre > b ? centre - b : 0;
    const run = runs.filter(candidate => distance(candidate) <= reach).sort((x, y) => distance(x) - distance(y))[0];
    if (!run || high <= 0) return { at_seconds: at, at_rest: false, settle_seconds: null, takeoff_seconds: null, contrast: 0 };
    // A hold longer than the context runs on past it: follow it along the whole curve.
    const extend = (bin: number, step: 1 | -1) => {
      for (let next = bin + step; next >= 0 && next < n;) {
        if (values[next]! <= threshold) { bin = next; next += step; continue; }
        let flicker = next; while (flicker >= 0 && flicker < n && values[flicker]! > threshold && Math.abs(flicker - next) < gap) flicker += step;
        if (flicker >= 0 && flicker < n && values[flicker]! <= threshold && Math.abs(flicker - next) <= gap) { next = flicker; continue; }
        break;
      }
      return bin;
    };
    if (run[0] === from) run[0] = extend(run[0], -1);
    if (run[1] === to) run[1] = extend(run[1], 1);
    const inside = Array.from({ length: run[1] - run[0] + 1 }, (_, k) => values[run[0] + k]!);
    const mean = inside.reduce((sum, value) => sum + value, 0) / inside.length;
    return { at_seconds: at, at_rest: distance(run) === 0, settle_seconds: time(run[0]), takeoff_seconds: time(run[1] + 1),
      contrast: Number(Math.max(0, Math.min(1, (high - mean) / Math.max(high, 1e-9))).toFixed(2)) };
  });
}
