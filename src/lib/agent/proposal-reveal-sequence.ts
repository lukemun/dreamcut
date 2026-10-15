import { currentFrameRate } from "../timeline/frame-rate-scope";
import { z } from "zod";
import { countOperationMutations, editorAgentOptionSchema } from "./timeline-editor-agent-apply";
import type { ProposalTimingControl } from "./proposal-timing-controls";
import { assertProposalControlBudget } from "./proposal-control-budget";
import { compileProposalSubjectEntrance } from "./proposal-subject-entrance";

const seconds = z.number().finite().min(0).max(3);
export const revealSequenceSchema = z.object({
  option: editorAgentOptionSchema,
  start_seconds: z.number().finite().nonnegative(),
  gap_seconds: seconds.min(0.2).max(1.2).default(0.4),
  min_gap_seconds: seconds.min(0.2).max(1.2).default(0.2),
  max_gap_seconds: seconds.min(0.2).max(1.2).default(0.8),
  gap_mode: z.enum(["shared", "independent"]).default("shared"),
  actors: z.array(z.object({
    element_id: z.string().uuid(), label: z.string().min(1).max(48),
    presence: z.object({ seconds: seconds.positive(), min_seconds: seconds.positive(), max_seconds: seconds.positive() }).strict().optional(),
    audio: z.array(z.object({ element_id: z.string().uuid(), offset_seconds: z.number().finite().min(-3).max(3).default(0) }).strict()).max(8).default([]),
  }).strict()).min(2).max(16),
}).strict();

const frame = (v: number) => Math.round(v * currentFrameRate()) / currentFrameRate();

/** Pure authoring adapter: prepared actors in, existing proposal contracts out. No IO. */
export function compileRevealSequence(raw: unknown) {
  const input = revealSequenceSchema.parse(raw);
  const option = structuredClone(input.option);
  if (option.timing_controls?.length) throw new Error("Sequence input must not contain timing controls; compile from the unchanged base option when revising the control plan.");
  if (!(input.min_gap_seconds < input.max_gap_seconds && input.gap_seconds >= input.min_gap_seconds && input.gap_seconds <= input.max_gap_seconds)) throw new Error("Gap must be within its declared range");
  const used = new Set<string>();
  const controls: ProposalTimingControl[] = [];
  const starts: { operation_index: number; target: "create_visual" | "create_audio"; actor: number; offset: number }[] = [];
  const find = (id: string) => {
    if (used.has(id)) throw new Error("Each actor or linked audio must have unique ownership");
    used.add(id);
    const index = option.operations.findIndex(op => op.element_id === id);
    if (index < 0) throw new Error(`Missing prepared operation for ${id}`);
    return index;
  };
  input.actors.forEach((actor, i) => {
    const index = find(actor.element_id);
    const visual = option.operations[index].create_visual;
    if (!visual || visual.type !== "video_clip" || visual.speech_sync || (visual.playback_rate ?? 1) !== 1) throw new Error("Reveal actors require prepared, unbound normal-speed video clips");
    visual.timeline_start = frame(input.start_seconds) + i * frame(input.gap_seconds);
    starts.push({ operation_index: index, target: "create_visual", actor: i, offset: 0 });
    if (actor.presence) {
      const p = actor.presence;
      const minimum = (visual.subject_entrance_seconds ?? 0) + (visual.subject_flash_seconds ?? 0) + (visual.subject_glow_fade_seconds ?? 0);
      if (!(p.min_seconds < p.max_seconds && p.seconds >= p.min_seconds && p.seconds <= p.max_seconds) || frame(p.min_seconds) < Math.max(1 / currentFrameRate(), minimum) - 1e-7) throw new Error("Presence range must contain its default and the complete entrance envelope");
      if (visual.source_start_seconds === undefined) throw new Error("Presence requires a handled source start");
      visual.source_end_seconds = visual.source_start_seconds + frame(p.seconds);
      controls.push({ id: `presence-${i}`, kind: "hold", label: `${actor.label} · time on screen`, reference_seconds: frame(p.seconds), spacing_seconds: frame(p.seconds), min_spacing_seconds: p.min_seconds, max_spacing_seconds: p.max_seconds,
        bindings: [{ operation_index: index, target: "create_visual", field: "source_end_seconds", offset_seconds: visual.source_end_seconds, spacing_multiplier: 1 }] });
    }
    for (const audio of actor.audio) {
      const audioIndex = find(audio.element_id);
      const target = option.operations[audioIndex].create_audio;
      if (!target) throw new Error("Linked audio requires a prepared create_audio operation");
      target.timeline_start = visual.timeline_start + frame(audio.offset_seconds);
      if (target.timeline_start < 0) throw new Error("Linked audio would start before zero");
      starts.push({ operation_index: audioIndex, target: "create_audio", actor: i, offset: frame(audio.offset_seconds) });
    }
  });
  const gap = frame(input.gap_seconds);
  if (input.gap_mode === "shared") {
    controls.unshift({ id: "entrance-gap", kind: "hold", label: "Time between entrances", reference_seconds: gap, spacing_seconds: gap, min_spacing_seconds: input.min_gap_seconds, max_spacing_seconds: input.max_gap_seconds,
      bindings: starts.filter(s => s.actor > 0).map(s => ({ operation_index: s.operation_index, target: s.target, field: "timeline_start", offset_seconds: frame(input.start_seconds) + s.actor * gap + s.offset, spacing_multiplier: s.actor })) });
  } else {
    controls.unshift(...input.actors.slice(1).map((actor, i): ProposalTimingControl => ({ id: `entrance-gap-${i}`, kind: "hold", label: `${input.actors[i].label} → ${actor.label} delay`, reference_seconds: gap, spacing_seconds: gap, min_spacing_seconds: input.min_gap_seconds, max_spacing_seconds: input.max_gap_seconds,
      bindings: starts.filter(s => s.actor > i).map(s => ({ operation_index: s.operation_index, target: s.target, field: "timeline_start", offset_seconds: frame(input.start_seconds) + s.actor * gap + s.offset, spacing_multiplier: 1 })) })));
  }
  const existing = option.review_controls ?? [];
  // Conflicting direct controls are an authoring error; never silently drop requested dials.
  if (existing.some(ref => controls.some(c => c.bindings.some(b => [ref.operation_index, ...(ref.linked_operation_indices ?? [])].includes(b.operation_index) && b.target === ref.target && b.field === ref.field)))) throw new Error("Remove direct start/source-end controls replaced by sequence controls before compiling");
  option.timing_controls = controls;
  option.review_controls = [...controls.map((_, operation_index) => ({ operation_index, target: "timing_control" as const, field: "spacing_seconds" })), ...existing];
  option.operations = option.operations.map(compileProposalSubjectEntrance);
  option.requested_mutations = countOperationMutations(option.operations);
  const result = editorAgentOptionSchema.parse(option);
  assertProposalControlBudget({ elements: [], transitions: [] }, [result]);
  return { compiler_version: "reveal-sequence-v1", option: result, preparation: "reused_supplied_assets", persisted: false };
}
