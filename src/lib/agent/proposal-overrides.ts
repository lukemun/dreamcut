import { currentFrameRate } from "../timeline/frame-rate-scope";
import { setProposedTransitionField } from "../timeline/transition-controls";
import { PROPOSAL_STRING_CONTROL_FIELDS, TIMING_PATCH_FIELDS, proposalAvailableFieldValue, setDerivedField, setTimingField, timingFieldOwnedByTrim } from "./proposal-controls";
import type { TimelineFile } from "../local-store/store";
import { compileProposalSubjectEntrance } from "./proposal-subject-entrance";
import { compileProposalSpeedRamp } from "./proposal-speed-ramp";
import { holdTimingFields, timingValue } from "./proposal-timing-controls";
import { maskWindowValues, synchronizeMaskWindowForeground } from "./proposal-mask-window";
import { MOTION_RENDER_FIELD, motionSubjectFromSourceUrl } from "../hyperframes/motion-media";
import { z } from "zod";

import { countOperationMutations, editorAgentOptionSchema, type EditorAgentOption, type EditorAgentProposal } from "./timeline-editor-agent-apply";

export type ProposalNumericOverride = {
  operation_index: number;
  target: "create_transition" | "create_audio" | "create_visual" | "create_text" | "opening_sequence_edit" | "replace_captions" | "source_range_cut" | "patch" | "props" | "timing_control";
  field: string;
  value: number | string;
};

export const proposalNumericOverridesSchema = z.array(z.object({
  operation_index: z.number().int().min(0),
  target: z.enum(["create_transition", "create_audio", "create_visual", "create_text", "opening_sequence_edit", "replace_captions", "source_range_cut", "patch", "props", "timing_control"]),
  field: z.string().min(1).max(128),
  value: z.union([z.number().finite(), z.string().max(512)]),
}).strict()).max(500);

/** Human tuning may materialize a transition's previously implicit params object.
 * Account for that bounded storage field; actor count and operation scope stay fixed. */
export function applyProposalReviewOverrides(proposal: EditorAgentProposal, optionId: string, overrides: readonly ProposalNumericOverride[], timeline?: Pick<TimelineFile, "elements">) {
  if (!overrides.length) return proposal;
  const options = proposal.options.map(option => option.id === optionId ? applyProposalNumericOverrides(option, overrides, timeline) : option);
  const original = proposal.options.find(option => option.id === optionId);
  if (!original) throw new Error("Proposal option does not exist");
  const tuned = options.find(option => option.id === optionId)!;
  const reservedParams = original.operations.filter(op => op.create_transition && !op.create_transition.params).length;
  if (tuned.requested_mutations > original.requested_mutations + reservedParams) throw new Error("Review tuning exceeded its declared operation scope");
  const requested = Math.max(...options.map(option => option.requested_mutations));
  return {...proposal, options, caps: {...proposal.caps, requested_mutations: requested, max_mutations: Math.max(proposal.caps.max_mutations, requested)}};
}

/** `timeline` supplies each clip's playback rate for timing dials that move coupled fields. */
export function applyProposalNumericOverrides(
  option: EditorAgentOption,
  overrides: readonly ProposalNumericOverride[] | undefined,
  timeline?: Pick<TimelineFile, "elements">,
): EditorAgentOption {
  if (!overrides?.length) return option;
  const next = structuredClone(option) as EditorAgentOption;
  const seen = new Set<string>();
  const expanded = overrides.flatMap(override => {
    const group = option.review_controls?.find(ref => ref.target === override.target && ref.field === override.field
      && [ref.operation_index, ...(ref.linked_operation_indices ?? [])].includes(override.operation_index));
    return group?.linked_operation_indices
      ? [group.operation_index, ...group.linked_operation_indices].map(operation_index => ({ ...override, operation_index }))
      : [override];
  });
  // Shared holds provide member defaults; explicit individual values take priority.
  // Resolve once from the authored draft so request order and repeated previews agree.
  for (const [index, group] of (option.timing_controls ?? []).entries()) {
    if (!group.member_control_ids) continue;
    const override = expanded.find(item => item.target === "timing_control" && item.operation_index === index);
    if (!override || typeof override.value !== "number") continue;
    for (const id of group.member_control_ids) {
      const memberIndex = option.timing_controls!.findIndex(member => member.id === id);
      if (expanded.some(item => item.target === "timing_control" && item.operation_index === memberIndex)) continue;
      expanded.push({operation_index: memberIndex, target: "timing_control", field: "spacing_seconds",
        value: option.timing_controls![memberIndex].spacing_seconds + override.value - group.spacing_seconds});
    }
  }
  for (const override of expanded) {
    if (!Number.isInteger(override.operation_index) || override.operation_index < 0) {
      throw new Error("Proposal override operation index must be a non-negative integer");
    }
    if (typeof override.value === "number" && !Number.isFinite(override.value)) throw new Error("Proposal override value must be finite");
    if (override.target === "timing_control") {
      const control = next.timing_controls?.[override.operation_index];
      const key = `timing:${override.operation_index}`;
      if (!control || override.field !== "spacing_seconds" || typeof override.value !== "number" || override.value < (control.min_spacing_seconds ?? (control.kind === "hold" ? 0 : 0.2)) || override.value > (control.max_spacing_seconds ?? (control.kind === "hold" ? 3 : 1.2)) || seen.has(key)) throw new Error("Invalid or duplicate spacing override");
      seen.add(key);
      control.spacing_seconds = override.value;
      if (control.kind === "hold") continue;
      for (const binding of control.bindings) {
        const target = next.operations[binding.operation_index][binding.target] as Record<string, unknown>;
        target[binding.field] = timingValue(binding, override.value);
      }
      continue;
    }
    const operation = next.operations[override.operation_index];
    if (!operation) throw new Error(`Proposal override operation ${override.operation_index} does not exist`);
    if (override.field === MOTION_RENDER_FIELD) {
      applyMotionRenderOverride(operation, override, seen);
      continue;
    }
    if (["timeline_start", "source_start_seconds", "source_end_seconds", "playback_rate"].includes(override.field)
      && option.operations.some(candidate => maskWindowValues(candidate.props)?.mask_window_foreground_id === operation.element_id)) {
      throw new Error("Tune the picture-window timing; its foreground source follows automatically");
    }
    if (option.timing_controls?.some(control => control.bindings.some(binding => binding.operation_index === override.operation_index && binding.target === override.target && binding.field === override.field))) throw new Error("Tune the owning timing control, not a bound child field");
    const target = operation[override.target] as Record<string, unknown> | undefined;
    const availableValue = proposalAvailableFieldValue(override.target, target, override.field);
    if (!target || availableValue === undefined) {
      throw new Error(`Proposal override may only tune an already-proposed ${override.target} field`);
    }
    const stringControl = (override.target === "props" || override.target === "create_visual")
      && PROPOSAL_STRING_CONTROL_FIELDS.includes(override.field);
    if (typeof override.value === "string") {
      if (!stringControl || typeof target[override.field] !== "string") {
        throw new Error(`Proposal override field ${override.field} is not an editable color or blend`);
      }
    } else if (typeof availableValue !== "number") {
      throw new Error(`Proposal override field ${override.field} is not numeric`);
    }
    const key = `${override.operation_index}:${override.target}:${override.field}`;
    if (seen.has(key)) throw new Error(`Duplicate proposal override for ${key}`);
    seen.add(key);
    if (override.target === "create_transition") {
      if (typeof override.value !== "number") throw new Error("Transition controls must be numeric");
      setProposedTransitionField(target, override.field, override.value);
    } else {
      // A proposed flash/glow/blur amount controls the peak of its authored envelope,
      // not an inaudible/invisible scalar fallback beneath animated values.
      if ((override.target === "props" || override.target === "create_visual") && typeof override.value === "number"
        && ["subject_glow", "subject_flash", "directional_blur_x", "directional_blur_y", "sticker_outline_width"].includes(override.field)) {
        const tracks = target.transition_keyframes as Record<string, Array<{t: number; v: number; ease?: string}>> | undefined;
        const points = tracks?.[override.field];
        const peak = points?.reduce((max, point) => Math.max(max, point.v), 0) ?? 0;
        if (points && peak > 0) {
          tracks![override.field] = points.map(point => ({...point, v: point.v / peak * (override.value as number)}));
        }
      }
      if (override.target === "patch" && TIMING_PATCH_FIELDS.has(override.field) && typeof override.value === "number") {
        if (timingFieldOwnedByTrim(option.operations[override.operation_index], override.field)) throw new Error("Tune this clip's trim; its start follows the trim");
        const proposedRate = (target as { playback_rate?: unknown }).playback_rate;
        const rate = typeof proposedRate === "number" ? proposedRate : timeline?.elements.find(element => element.id === operation.element_id)?.playback_rate;
        const coupled = ["timeline_start", "duration"].some(field => typeof target[field] === "number") && override.field !== "timeline_start";
        if (coupled && !(typeof rate === "number" && rate > 0)) throw new Error("Timing tuning needs the clip's playback rate");
        setTimingField(target as Record<string, number>, override.field, override.value, typeof rate === "number" && rate > 0 ? rate : 1);
      } else if (override.target === "patch" && override.field === "duration" && timingFieldOwnedByTrim(option.operations[override.operation_index], "duration")) {
        throw new Error("Tune this clip's trim; its length follows the trim");
      } else if (typeof override.value !== "number" || !setDerivedField(target, override.field, override.value)) target[override.field] = override.value;
    }
  }
  // Recompute the shared clock once, independent of override ordering. Multiple
  // holds may move the same later clip; each contributes only its own delta.
  for (const { binding, value } of holdTimingFields(next.timing_controls ?? []).values()) {
    const target = next.operations[binding.operation_index][binding.target] as Record<string, unknown>;
    target[binding.field] = value;
    if (binding.source_tail) {
      const tail = binding.source_tail;
      target.trim_end = tail.source_duration_seconds - tail.trim_start - value * tail.playback_rate;
    }
  }
  if (option.preview_range) {
    // Keep the authored context padding when a hold extends the reviewed beat.
    // Only duration-bound actors originally inside that range define its end;
    // downstream ripple starts must not expand it to the rest of the project.
    const endpoints = [...holdTimingFields(option.timing_controls ?? []).values()].flatMap(({binding}) => {
      if (!["duration", "duration_seconds"].includes(binding.field)) return [];
      const before = option.operations[binding.operation_index][binding.target] as Record<string, unknown>;
      const after = next.operations[binding.operation_index][binding.target] as Record<string, unknown>;
      if (typeof before.timeline_start !== "number" || typeof before[binding.field] !== "number"
        || typeof after.timeline_start !== "number" || typeof after[binding.field] !== "number") return [];
      const end = before.timeline_start + (before[binding.field] as number);
      if (before.timeline_start < option.preview_range!.start_seconds || end > option.preview_range!.end_seconds) return [];
      return [{before: end, after: after.timeline_start + (after[binding.field] as number)}];
    });
    if (endpoints.length) next.preview_range = {...option.preview_range,
      end_seconds: Math.max(option.preview_range.start_seconds + 1 / currentFrameRate(),
        option.preview_range.end_seconds + Math.max(...endpoints.map(e => e.after)) - Math.max(...endpoints.map(e => e.before)))};
  }
  synchronizeMaskWindowForeground(next);
  next.operations = next.operations.map(op => compileProposalSubjectEntrance(compileProposalSpeedRamp(op)));
  next.requested_mutations = countOperationMutations(next.operations);
  return editorAgentOptionSchema.parse(next);
}

/**
 * A creator's change to a model-authored composition's own controls re-renders it in the
 * background; this override then swaps the proposed clip to that render. Only another
 * value-keyed render of the same composition in the same project is accepted; preparation
 * readiness is enforced where the visual is derived, so preview and approval agree.
 */
export { MOTION_RENDER_FIELD };

function applyMotionRenderOverride(
  operation: EditorAgentOption["operations"][number],
  override: ProposalNumericOverride,
  seen: Set<string>,
) {
  // A new graphic (create_visual) or an existing clip whose picture this card swaps (patch).
  const create = (override.target === "patch" ? operation.patch : operation.create_visual) as { source_url?: string } | undefined;
  if (!["create_visual", "patch"].includes(override.target) || !create?.source_url || typeof override.value !== "string") {
    throw new Error("A motion graphic render can only replace a proposed motion graphic");
  }
  const original = motionSubjectFromSourceUrl(create.source_url);
  const replacement = motionSubjectFromSourceUrl(override.value);
  const prefix = /^\/api\/projects\/[^/]+\/media\//.exec(create.source_url)?.[0];
  if (!original || original.kind !== "composition" || !replacement || replacement.kind !== original.kind
    || replacement.id !== original.id || !prefix || !override.value.startsWith(prefix)
    || !new RegExp(`/${original.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[a-f0-9]{16}\\.webm$`).test(override.value)) {
    throw new Error("Choose a render of the same motion graphic");
  }
  const key = `${override.operation_index}:${override.target}:${MOTION_RENDER_FIELD}`;
  if (seen.has(key)) throw new Error(`Duplicate proposal override for ${key}`);
  seen.add(key);
  create.source_url = override.value;
}
