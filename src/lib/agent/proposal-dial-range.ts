import { numericWorkingRange } from "@/lib/timeline/numeric-working-range";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";
import { proposalMaskWindowRange } from "@/components/studio/timeline/proposal-mask-window-range";
import { proposalTunableField, type ProposalControlReference, type TunableField } from "./proposal-controls";
import type { ProposalFieldChange, ProposalReviewRow } from "./proposal-review";

type DialOption = { rows: ProposalReviewRow[]; adjustment_rows?: ProposalReviewRow[] };
type Binding = Pick<ProposalControlReference, "operation_index" | "target" | "field">;
/** The dial's current value (a tuned override), or undefined for the authored one. */
export type DialValueFor = (binding: Binding) => number | string | number[] | undefined;

function peakRampRange(option: DialOption, field: string, valueFor: DialValueFor) {
  if (!field.startsWith("playback_ramp_")) return undefined;
  const changes = (option.adjustment_rows ?? option.rows).flatMap(row => row.changes);
  const number = (name: string) => {
    const change = changes.find(item => item.field === name && item.operation_index === 0);
    if (!change) return undefined;
    const value = valueFor({operation_index: change.operation_index, target: "props", field: name}) ?? change.after_value;
    return typeof value === "number" ? value : undefined;
  };
  const profile = changes.find(item => item.field === "playback_ramp_profile" && item.operation_index === 0)?.after_value as {hold_end_source_seconds?: number} | undefined;
  const fast = number("playback_ramp_fast_rate");
  const top = number("playback_ramp_top_rate");
  const start = number("playback_ramp_slow_start_source_seconds");
  const end = number("playback_ramp_slow_end_source_seconds");
  const floor = (value: number) => Math.floor((value + 1e-9) * 100) / 100;
  const ceil = (value: number) => Math.ceil((value - 1e-9) * 100) / 100;
  if (field === "playback_ramp_fast_rate" && top !== undefined) return {min: Math.max(.5, top), max: 4};
  if (field === "playback_ramp_top_rate" && fast !== undefined) return {min: .25, max: Math.min(2, fast)};
  if (field === "playback_ramp_slow_start_source_seconds" && end !== undefined) return {min: .03, max: floor(end - .03)};
  if (field === "playback_ramp_slow_end_source_seconds" && start !== undefined && typeof profile?.hold_end_source_seconds === "number")
    return {min: ceil(start + .03), max: floor(profile.hold_end_source_seconds)};
  return undefined;
}

function peakBarRange(option: DialOption, field: string, valueFor: DialValueFor) {
  if (!field.startsWith("playback_ramp_bar_")) return undefined;
  const changes = (option.adjustment_rows ?? option.rows).flatMap(row => row.changes);
  const number = (name: string) => {
    const change = changes.find(item => item.field === name && item.operation_index === 0);
    if (!change) return undefined;
    const value = valueFor({operation_index: 0, target: name === "duration" ? "patch" : "props", field: name}) ?? change.after_value;
    return typeof value === "number" ? value : undefined;
  };
  const close = number("playback_ramp_bar_close_start_seconds");
  const closing = number("playback_ramp_bar_close_duration_seconds");
  const reopen = number("playback_ramp_bar_reopen_start_seconds");
  const reopening = number("playback_ramp_bar_reopen_duration_seconds");
  const duration = number("duration");
  const floor = (value: number) => Math.floor((value + 1e-9) * 100) / 100;
  const ceil = (value: number) => Math.ceil((value - 1e-9) * 100) / 100;
  if (field === "playback_ramp_bar_close_start_seconds" && closing !== undefined && reopen !== undefined) return {min:.03,max:floor(reopen-closing-.03)};
  if (field === "playback_ramp_bar_close_duration_seconds" && close !== undefined && reopen !== undefined) return {min:.03,max:floor(reopen-close-.03)};
  if (field === "playback_ramp_bar_reopen_start_seconds" && close !== undefined && closing !== undefined && reopening !== undefined && duration !== undefined)
    return {min:ceil(close+closing+.03),max:floor(duration-reopening-.03)};
  if (field === "playback_ramp_bar_reopen_duration_seconds" && reopen !== undefined && duration !== undefined) return {min:.03,max:floor(duration-reopen-.03)};
  return undefined;
}


/**
 * One owner for where a card's numeric dial starts and ends: the field's limits, narrowed by the
 * dials it depends on (picture window, speed ramp, bars, source length), then the working window the
 * slider draws. The card draws it and proposal_create sweeps it, so the two never disagree.
 */
export function proposalDialSlider(option: DialOption, change: ProposalFieldChange, valueFor: DialValueFor): { spec: TunableField; range: { min: number; max: number } } | undefined {
  const base = proposalTunableField(change.target, change.field, change.control_range, change.control_unit, change.control_display);
  if (!base) return undefined;
  const spec = {...base};
  const windowRange = proposalMaskWindowRange(option as Parameters<typeof proposalMaskWindowRange>[0], change.field, (operation_index, field) => {
    const current = valueFor({operation_index, target: "props", field});
    return typeof current === "number" ? current : undefined;
  });
  for (const narrowed of [windowRange, peakRampRange(option, change.field, valueFor), peakBarRange(option, change.field, valueFor)]) {
    if (narrowed && narrowed.max >= narrowed.min) { spec.min = narrowed.min; spec.max = narrowed.max; }
  }
  // Limits that depend on the clip's other values in the same operation, so no slider end is refused.
  const sameOperation = option.rows.flatMap(row => row.changes).filter(item => item.operation_index === change.operation_index);
  const sibling = (field: string) => {
    const item = sameOperation.find(other => other.field === field);
    if (!item) return undefined;
    const current = valueFor({operation_index: item.operation_index, target: item.target as Binding["target"], field}) ?? item.after_value;
    return typeof current === "number" ? current : undefined;
  };
  // Keyframes (shape, transition, mask) must fit inside the clip.
  const lastKey = Math.max(0, ...sameOperation
    .filter(item => ["keyframes", "transition_keyframes", "mask_inset_keyframes"].includes(item.field))
    .flatMap(item => {
      const value = item.after_value;
      const tracks = Array.isArray(value) ? [value] : value && typeof value === "object" ? Object.values(value) : [];
      return tracks.flatMap(track => Array.isArray(track) ? track.map(key => typeof key?.t === "number" ? key.t : 0) : []);
    }));
  const frame = 1 / currentFrameRate();
  const start = sibling("source_start_seconds");
  const end = sibling("source_end_seconds");
  // Source in and out keep at least a frame between them, and enough source for the clip's animation.
  const rate = sibling("playback_rate") ?? 1;
  const keepSource = Math.max(frame, lastKey * rate);
  if (change.field === "source_start_seconds" && end !== undefined) spec.max = Math.min(spec.max, end - keepSource);
  if (change.field === "source_end_seconds" && start !== undefined) spec.min = Math.max(spec.min, start + keepSource);
  // A camera's move stretches with its clip, so only other clips keep their keyframes as a floor.
  const isCameraClip = sameOperation.some(item => item.field === "shape_kind" && item.after_value === "camera");
  if ((change.field === "duration_seconds" || change.field === "duration") && !isCameraClip && lastKey > spec.min) spec.min = Math.min(lastKey, spec.max);
  // A faster speed shortens the clip; it stops where the clip would end before its last keyframe.
  if (change.field === "playback_rate" && lastKey > 0 && start !== undefined && end !== undefined && end > start)
    spec.max = Math.max(spec.min, Math.min(spec.max, (end - start) / lastKey));
  if (spec.max < spec.min) spec.max = spec.min;
  const sourceDuration = option.rows.flatMap(row => row.changes).find(item => item.operation_index === change.operation_index && item.field === "source_duration_seconds")?.after_value;
  if (["source_start_seconds", "source_end_seconds"].includes(change.field) && typeof sourceDuration === "number") spec.max = Math.min(spec.max, sourceDuration);
  if (spec.max < spec.min) spec.max = spec.min;
  const authored = typeof change.after_value === "number" ? (spec.toDisplay?.(change.after_value) ?? change.after_value) : spec.min;
  const range = change.target === "timing_control" || change.target === "block"
    ? {min: spec.min, max: spec.max}
    : numericWorkingRange(authored, spec.min, spec.max, spec.step,
      // Size and position get room to reach any placement; timing keeps a fine window.
      spec.suffix === "s" || spec.suffix === "frames" ? {} : {floorFraction: 0.25});
  return { spec, range };
}
