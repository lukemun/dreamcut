import { currentFrameRate } from "../timeline/frame-rate-scope";
import { z } from "zod";

/** Spacing is absolute; hold controls contribute frame-quantized deltas to a shared clock. */
export const proposalTimingControlSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/).max(64),
  kind: z.enum(["spacing", "hold"]).optional(),
  label: z.string().min(1).max(80).optional(),
  display_unit: z.enum(["seconds", "frames"]).optional(),
  member_control_ids: z.array(z.string().regex(/^[a-z0-9_-]+$/).max(64)).min(2).max(31).optional(),
  reference_seconds: z.number().finite().min(0).max(3).optional(),
  spacing_seconds: z.number().finite().min(0).max(3),
  min_spacing_seconds: z.number().finite().min(0).max(3).optional(),
  max_spacing_seconds: z.number().finite().min(0).max(3).optional(),
  bindings: z.array(z.object({
    operation_index: z.number().int().min(0),
    target: z.enum(["patch", "create_visual", "create_audio", "create_text"]),
    field: z.enum(["timeline_start", "duration", "duration_seconds", "source_end_seconds"]),
    offset_seconds: z.number().finite().min(-3600).max(3600),
    spacing_multiplier: z.number().finite().min(-20).max(20),
    subtract_offset_seconds: z.number().finite().min(-3600).max(3600).optional(),
    subtract_spacing_multiplier: z.number().finite().min(-20).max(20).optional(),
    source_tail: z.object({
      source_duration_seconds: z.number().finite().positive(),
      trim_start: z.number().finite().nonnegative(),
      playback_rate: z.number().finite().positive().max(16),
    }).strict().optional(),
  }).strict()).max(250),
}).strict();
export type ProposalTimingControl = z.infer<typeof proposalTimingControlSchema>;
export const timingValue = (binding: ProposalTimingControl["bindings"][number], spacing: number) => {
  const endFrame = Math.round((binding.offset_seconds + binding.spacing_multiplier * spacing) * currentFrameRate());
  const startFrame = binding.subtract_offset_seconds === undefined ? 0 : Math.round((binding.subtract_offset_seconds + (binding.subtract_spacing_multiplier ?? 0) * spacing) * currentFrameRate());
  return (endFrame - startFrame) / currentFrameRate();
};

export function holdTimingFields(controls: ProposalTimingControl[]) {
  const fields = new Map<string, { binding: ProposalTimingControl["bindings"][number]; value: number; min: number; max: number }>();
  for (const control of controls.filter(control => control.kind === "hold")) {
    for (const binding of control.bindings) {
      const key = `${binding.operation_index}:${binding.target}:${binding.field}`;
      const entry = fields.get(key) ?? { binding, value: binding.offset_seconds, min: binding.offset_seconds, max: binding.offset_seconds };
      const delta = (seconds: number) => Math.round((seconds - (control.reference_seconds ?? 0)) * currentFrameRate()) / currentFrameRate() * binding.spacing_multiplier;
      entry.value += delta(control.spacing_seconds);
      const bounds = [delta(control.min_spacing_seconds ?? 0), delta(control.max_spacing_seconds ?? 3)];
      entry.min += Math.min(...bounds); entry.max += Math.max(...bounds);
      fields.set(key, entry);
    }
  }
  return fields;
}

export function assertHoldControlSources(option: { timing_controls?: ProposalTimingControl[]; operations: { element_id: string; patch?: { playback_rate?: number } }[] }, elements: { id: string; trim_start?: number | null; playback_rate?: number | null; props?: Record<string, unknown> | null }[]) {
  for (const control of option.timing_controls ?? []) for (const binding of control.bindings) {
    const tail = binding.source_tail;
    if (!tail) continue;
    const operation = option.operations[binding.operation_index];
    const element = elements.find(element => element.id === operation.element_id);
    const keyframes = element?.props?.keyframes as Record<string, unknown> | undefined;
    if (!element || keyframes?.playback_rate || element.props?.source_duration_seconds !== tail.source_duration_seconds
      || (element.trim_start ?? 0) !== tail.trim_start || (element.playback_rate ?? 1) !== tail.playback_rate
      || (operation.patch?.playback_rate !== undefined && operation.patch.playback_rate !== tail.playback_rate)) {
      throw new Error("A source-tail hold requires the unchanged scalar source clock; speed-keyframed clips are not supported");
    }
  }
}

export function validateTimingControls(option: {
  timing_controls?: ProposalTimingControl[];
  operations: unknown[];
  review_controls?: { operation_index: number; target: string; field: string; linked_operation_indices?: number[] }[];
}, ctx: z.RefinementCtx) {
  const claimed = new Map<string, ProposalTimingControl>();
  const ids = new Set<string>();
  const holdFields = holdTimingFields(option.timing_controls ?? []);
  for (const [i, control] of (option.timing_controls ?? []).entries()) {
    const hold = control.kind === "hold";
    const min = control.min_spacing_seconds ?? (hold ? 0 : 0.2);
    const max = control.max_spacing_seconds ?? (hold ? 3 : 1.2);
    if ((!hold && (min < 0.2 || max > 1.2 || control.reference_seconds !== undefined)) || (hold && control.reference_seconds === undefined)) ctx.addIssue({ code: "custom", path: ["timing_controls", i], message: "Hold controls require a reference; spacing retains its existing range" });
    if (min >= max || control.spacing_seconds < min || control.spacing_seconds > max) ctx.addIssue({ code: "custom", path: ["timing_controls", i], message: "Spacing must lie within its declared adjustment range" });
    if (ids.has(control.id)) ctx.addIssue({ code: "custom", path: ["timing_controls", i], message: "Timing control ids must be unique" });
    ids.add(control.id);
    if (control.member_control_ids) {
      const members = control.member_control_ids.map(id => option.timing_controls?.find(member => member.id === id));
      if (!hold || control.bindings.length || new Set(control.member_control_ids).size !== members.length
        || members.some(member => !member || member.kind !== "hold" || member.member_control_ids
          || ((member.reference_seconds ?? 0) + min - (control.reference_seconds ?? 0)) < (member.min_spacing_seconds ?? 0) - 1e-7
          || ((member.reference_seconds ?? 0) + max - (control.reference_seconds ?? 0)) > (member.max_spacing_seconds ?? 3) + 1e-7)
        || (option.timing_controls ?? []).some(other => other !== control && other.member_control_ids?.some(id => control.member_control_ids!.includes(id)))) {
        ctx.addIssue({code: "custom", path: ["timing_controls", i], message: "A shared hold must own unique independent holds and stay within every member's range"});
      }
    } else if (!control.bindings.length) ctx.addIssue({code: "custom", path: ["timing_controls", i], message: "Individual timing controls require bindings"});
    const localKeys = new Set<string>();
    for (const binding of control.bindings) {
      const op = option.operations[binding.operation_index] as Record<string, unknown> | undefined;
      const target = op?.[binding.target] as Record<string, unknown> | undefined;
      const key = `${binding.operation_index}:${binding.target}:${binding.field}`;
      const value = target?.[binding.field];
      const durationField = binding.field !== "timeline_start";
      const sourceEnd = binding.field === "source_end_seconds";
      const validField = (sourceEnd ? hold && binding.target === "create_visual" && target?.type === "video_clip" && !target.speech_sync
        : binding.target === "patch" ? binding.field !== "duration_seconds" : binding.field !== "duration")
        && (binding.subtract_offset_seconds === undefined) === (binding.subtract_spacing_multiplier === undefined)
        && (durationField || binding.subtract_offset_seconds === undefined);
      const exposedSeparately = option.review_controls?.some(ref => ref.target === binding.target && ref.field === binding.field && [ref.operation_index, ...(ref.linked_operation_indices ?? [])].includes(binding.operation_index));
      const minimum = binding.field === "timeline_start" ? 0 : 1 / currentFrameRate();
      const shared = holdFields.get(key);
      const previous = claimed.get(key);
      const validHold = !hold || (Number.isInteger(binding.spacing_multiplier) && binding.subtract_offset_seconds === undefined && shared && Math.abs(shared.binding.offset_seconds - binding.offset_seconds) < 1e-7
        && JSON.stringify(shared.binding.source_tail) === JSON.stringify(binding.source_tail));
      const expected = hold ? shared?.value : timingValue(binding, control.spacing_seconds);
      const bounds = hold ? [shared?.min ?? -1, shared?.max ?? -1] : [min, max].map(spacing => timingValue(binding, spacing));
      // A moving hold reveals real source frames. Its entire adjustment range
      // must fit the declared handles; never extend it with a frozen tail.
      if (sourceEnd && (typeof target?.source_start_seconds !== "number" || typeof target?.source_duration_seconds !== "number"
        || bounds.some(end => end < (target.source_start_seconds as number) + (target.playback_rate as number ?? 1) / currentFrameRate() - 1e-7
          || end > (target.source_duration_seconds as number) + 1e-7))) {
        ctx.addIssue({ code: "custom", path: ["timing_controls", i], message: "Moving holds must remain within the declared handled source window" });
      }
      if (!validField || !validHold || typeof value !== "number" || expected === undefined || Math.abs(value - expected) > 1e-7
        || localKeys.has(key) || (previous && (!hold || previous.kind !== "hold")) || exposedSeparately || bounds.some(value => value < minimum)) {
        ctx.addIssue({ code: "custom", path: ["timing_controls", i], message: "Spacing must uniquely bind declared timing fields, match the draft and stay valid across its range" });
      }
      const tail = binding.source_tail;
      if (tail) {
        const patch = op?.patch as Record<string, unknown> | undefined;
        const tailAt = (duration: number) => tail.source_duration_seconds - tail.trim_start - duration * tail.playback_rate;
        if (!hold || binding.target !== "patch" || binding.field !== "duration" || !patch
          || typeof patch.timeline_start !== "number" || patch.trim_start !== tail.trim_start || typeof patch.trim_end !== "number"
          || Math.abs(patch.trim_end - tailAt(value as number)) > 1e-7 || bounds.some(value => tailAt(value) < -1e-7)) {
          ctx.addIssue({ code: "custom", path: ["timing_controls", i], message: "Source-tail holds require a complete declared trim tuple and valid handled source bounds" });
        }
      }
      localKeys.add(key); claimed.set(key, control);
    }
  }
}
