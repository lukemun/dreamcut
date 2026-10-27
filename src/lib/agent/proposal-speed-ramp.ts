import { currentFrameRate } from "../timeline/frame-rate-scope";
/** Compile editable ramp endpoints to the existing integrated speed-step clock.
 * Small held samples approximate a linear acceleration without adding a second
 * preview/export time map. The screen duration remains fixed as endpoints change.
 */
type RampOperation = {
  patch?: { timeline_start?: number; duration?: number; trim_start?: number; trim_end?: number | null; playback_rate?: number };
  props?: Record<string, unknown>;
};
export function compileProposalSpeedRamp<T extends RampOperation>(operation: T): T {
  const props = operation.props;
  if (props?.playback_ramp_fast_rate !== undefined) return compilePeakRamp(operation);
  if (props?.playback_ramp_start_rate === undefined && props?.playback_ramp_end_rate === undefined) return operation;
  const start = props.playback_ramp_start_rate as number;
  const end = props.playback_ramp_end_rate as number;
  const sourceDuration = props.playback_ramp_source_duration_seconds as number;
  const patch = operation.patch;
  if (![start, end, sourceDuration, patch?.duration, patch?.trim_start, patch?.timeline_start, patch?.trim_end, patch?.playback_rate].every(value => typeof value === 'number' && Number.isFinite(value))
    || start < .5 || start > 4 || end < .5 || end > 4 || sourceDuration <= 0 || patch!.duration! <= 0) {
    throw new Error('Speed ramp requires bounded endpoints, source duration and a complete trim tuple');
  }
  const count = 60;
  const dt = patch!.duration! / count;
  let source = patch!.trim_start!;
  const points: { source_t: number; v: number }[] = [];
  for (let i = 0; i < count; i++) {
    const rate = start + (end - start) * i / (count - 1);
    if (i) points.push({source_t: source, v: rate});
    source += rate * dt;
  }
  const trimEnd = sourceDuration - source;
  if (trimEnd < 0) throw new Error('Speed ramp exceeds the available source handles');
  return {...operation, patch: {...patch, playback_rate: start, trim_end: trimEnd}, props: {...props, playback_speed_steps: points}};
}

type PeakProfile = {
  origin_source_seconds: number;
  origin_timeline_seconds: number;
  hold_end_source_seconds: number;
  recovery_end_source_seconds: number;
  mask_source_keyframes?: Array<{t: number; v: [number, number, number, number]; ease?: "linear" | "easeIn" | "easeOut" | "easeInOut" | "hold"}>;
  mask_depth?: [number, number, number, number];
};

/** One source-clock curve for a background clip and any matching alpha layer.
 * Each operation uses the same four linked dials. Its own source window defines
 * the output duration, while the shared origin places trimmed layers in sync. */
function compilePeakRamp<T extends RampOperation>(operation: T): T {
  const props = operation.props!;
  const patch = operation.patch;
  const fast = Number(props.playback_ramp_fast_rate);
  const top = Number(props.playback_ramp_top_rate);
  const slowStart = Number(props.playback_ramp_slow_start_source_seconds);
  const slowEnd = Number(props.playback_ramp_slow_end_source_seconds);
  const sourceDuration = Number(props.playback_ramp_source_duration_seconds);
  const profile = props.playback_ramp_profile as PeakProfile | undefined;
  const barFields = ["playback_ramp_bar_close_start_seconds", "playback_ramp_bar_close_duration_seconds",
    "playback_ramp_bar_reopen_start_seconds", "playback_ramp_bar_reopen_duration_seconds"] as const;
  const hasBarWindow = barFields.some(field => props[field] !== undefined);
  const barValues = barFields.map(field => Number(props[field]));
  if (!profile || !patch || ![fast, top, slowStart, slowEnd, sourceDuration, patch.trim_start, patch.trim_end,
    profile.origin_source_seconds, profile.origin_timeline_seconds, profile.hold_end_source_seconds,
    profile.recovery_end_source_seconds].every(value => typeof value === "number" && Number.isFinite(value))
    || fast < .5 || fast > 4 || top < .25 || top > 2 || top > fast
    || slowStart <= profile.origin_source_seconds || slowEnd <= slowStart
    || profile.hold_end_source_seconds < slowEnd || profile.recovery_end_source_seconds <= profile.hold_end_source_seconds
    || profile.recovery_end_source_seconds >= sourceDuration - patch.trim_end!
    || patch.trim_start! < profile.origin_source_seconds || patch.trim_start! >= sourceDuration - patch.trim_end!
    || hasBarWindow && (barValues.some(value => !Number.isFinite(value)) || !profile.mask_depth)) {
    throw new Error("Peak ramp requires a bounded source window and ordered slowdown, hold, and recovery points");
  }
  const rateAt = (source: number) => {
    if (source < slowStart) return fast;
    if (source < slowEnd) return fast + (top - fast) * (source - slowStart) / (slowEnd - slowStart);
    if (source < profile.hold_end_source_seconds) return top;
    if (source < profile.recovery_end_source_seconds) return top + (1 - top) * (source - profile.hold_end_source_seconds) / (profile.recovery_end_source_seconds - profile.hold_end_source_seconds);
    return 1;
  };
  const end = sourceDuration - patch.trim_end!;
  // Short source samples make the speed change gradual while preserving the
  // renderer's one authoritative, source-indexed speed-step clock.
  const boundaries = [profile.origin_source_seconds, patch.trim_start!, slowStart, slowEnd,
    profile.hold_end_source_seconds, profile.recovery_end_source_seconds, end];
  for (const [a, b] of [[slowStart, slowEnd], [profile.hold_end_source_seconds, profile.recovery_end_source_seconds]]) {
    const step = 1 / currentFrameRate();
    for (let s = a + step; s < b - 1e-7; s += step) boundaries.push(s);
  }
  for (const point of profile.mask_source_keyframes ?? []) boundaries.push(point.t);
  const unique = [...new Set(boundaries.filter(s => s >= profile.origin_source_seconds && s <= end).map(s => Number(s.toFixed(7))))].sort((a, b) => a - b);
  const elapsedTo = (target: number) => {
    let elapsed = 0;
    for (let i = 0; i < unique.length - 1 && unique[i]! < target - 1e-7; i++) {
      const a = unique[i]!;
      const b = Math.min(target, unique[i + 1]!);
      elapsed += (b - a) / rateAt(a);
    }
    return elapsed;
  };
  const points = unique.filter(s => s > patch.trim_start! + 1e-7 && s < end - 1e-7)
    .map(source_t => ({source_t, v: Number(rateAt(source_t).toFixed(6))}));
  const nextProps: Record<string, unknown> = {...props, playback_speed_steps: points};
  const duration = Number((elapsedTo(end) - elapsedTo(patch.trim_start!)).toFixed(6));
  if (hasBarWindow) {
    const [close, closing, reopen, reopening] = barValues;
    const depth = profile.mask_depth!;
    if (close! <= 0 || closing! < .03 || close! + closing! >= reopen!
      || reopening! < .03 || reopen! + reopening! >= duration
      || depth[0] + depth[2] >= 1 || depth[1] + depth[3] >= 1) {
      throw new Error("Peak-ramp bar timing must close, hold, and reopen inside the retimed clip");
    }
    const wide: [number, number, number, number] = [0, 0, 0, 0];
    nextProps.mask_inset_keyframes = [
      {t:0,v:wide,ease:"hold"},{t:close,v:wide,ease:"easeOut"},
      {t:Number((close!+closing!).toFixed(6)),v:depth,ease:"hold"},
      {t:reopen,v:depth,ease:"easeInOut"},
      {t:Number((reopen!+reopening!).toFixed(6)),v:wide},
    ];
  } else if (profile.mask_source_keyframes) nextProps.mask_inset_keyframes = profile.mask_source_keyframes.map(point => ({
    ...point, t: Number((elapsedTo(point.t) - elapsedTo(patch.trim_start!)).toFixed(6)),
  }));
  return {...operation,
    patch: {...patch,
      timeline_start: Number((profile.origin_timeline_seconds + elapsedTo(patch.trim_start!)).toFixed(6)),
      duration,
      playback_rate: Number(rateAt(patch.trim_start!).toFixed(6)),
    }, props: nextProps};
}
