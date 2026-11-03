import { z } from "zod";
import type { ProposalTimingControl } from "./proposal-timing-controls";
import { currentFrameRate } from "../timeline/frame-rate-scope";

/** Opt-in temporal coverage, never inferred from matching clip endings or lanes. */
export const proposalCoverageConstraintSchema = z.object({
  operation_index: z.number().int().nonnegative().describe("Index of the created video overlay whose source trims and speed must remain inside its background."),
  covered_by_operation_index: z.number().int().nonnegative().describe("Index of the separate background patch with explicit timeline_start and duration, owned by a source-tail hold."),
}).strict();
export type ProposalCoverageConstraint = z.infer<typeof proposalCoverageConstraintSchema>;
type Source = {
  type?: string; timeline_start?: number; source_start_seconds?: number;
  source_end_seconds?: number; source_duration_seconds?: number; playback_rate?: number;
  speech_sync?: unknown; trailing_hold_seconds?: number;
};
type CoverageOption = {
  operations: { create_visual?: Source; patch?: { timeline_start?: number; duration?: number } }[];
  timing_controls?: ProposalTimingControl[];
  coverage_constraints?: ProposalCoverageConstraint[];
};
const EPS = 1e-7;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

class CoverageValidationError extends Error {
  readonly status = 400;
  readonly code = "INVALID_INPUT";
  constructor(message: string, readonly index: number) { super(message); }
}

/** Only this contract's validation failures are client errors; unrelated route failures keep their policy. */
export function coverageInputError(error: unknown) {
  const issues = error instanceof CoverageValidationError
    ? [{path: ["coverage_constraints", error.index], message: error.message}]
    : error instanceof z.ZodError
      ? error.issues.filter(issue => issue.path.includes("coverage_constraints"))
      : [];
  if (!issues.length) return undefined;
  return {error: issues.map(issue => issue.message).join(" "), code: "INVALID_INPUT" as const,
    issues: issues.map(issue => ({path: issue.path, message: issue.message}))};
}

/**
 * The smallest usable background interval across the complete legal hold domain.
 * Keep each hold's correlated deltas together: moving both endings equally does
 * not consume coverage. Independent holds contribute their own worst-case delta.
 * The supporting duration must already be owned by a source-tail hold, whose
 * existing validation proves its clock and real source handles.
 */
export function coverageWindowSeconds(option: CoverageOption, relation: ProposalCoverageConstraint): number {
  const actor = option.operations[relation.operation_index]?.create_visual;
  const cover = option.operations[relation.covered_by_operation_index]?.patch;
  if (relation.operation_index === relation.covered_by_operation_index || actor?.type !== "video_clip"
    || actor.speech_sync || !finite(actor.timeline_start) || !finite(cover?.timeline_start)
    || !finite(cover.duration) || cover.duration <= 0) {
    throw new Error("Coverage needs a separate video overlay and a background with an explicit start and duration.");
  }
  const controls = option.timing_controls ?? [];
  const owner = controls.some(control => control.kind === "hold" && control.bindings.some(binding =>
    binding.operation_index === relation.covered_by_operation_index && binding.target === "patch"
    && binding.field === "duration" && binding.source_tail));
  if (!owner) throw new Error("Coverage needs a source-tail hold to own the background duration and source handles.");
  let head = actor.timeline_start - cover.timeline_start;
  let length = cover.timeline_start + cover.duration - actor.timeline_start;
  for (const control of controls) {
    const relevant = control.bindings.filter(binding =>
      (binding.operation_index === relation.operation_index && binding.target === "create_visual"
        && ["timeline_start", "source_start_seconds", "source_end_seconds"].includes(binding.field))
      || (binding.operation_index === relation.covered_by_operation_index && binding.target === "patch"
        && ["timeline_start", "duration"].includes(binding.field)));
    if (!relevant.length) continue;
    if (control.kind !== "hold" || relevant.some(binding => binding.field.startsWith("source_"))) {
      throw new Error("Coverage supports hold-owned placement with independent overlay source trims and speed.");
    }
    const multiplier = (index: number, field: string) => relevant
      .filter(binding => binding.operation_index === index && binding.field === field)
      .reduce((sum, binding) => sum + binding.spacing_multiplier, 0);
    const actorStart = multiplier(relation.operation_index, "timeline_start");
    const coverStart = multiplier(relation.covered_by_operation_index, "timeline_start");
    const coverDuration = multiplier(relation.covered_by_operation_index, "duration");
    // Holds quantize their delta on the output clock before applying integer multipliers.
    const delta = (spacing: number) => Math.round((spacing - (control.reference_seconds ?? 0)) * currentFrameRate()) / currentFrameRate();
    const current = delta(control.spacing_seconds);
    const changes = [control.min_spacing_seconds ?? 0, control.max_spacing_seconds ?? 3].map(value => delta(value) - current);
    head += Math.min(...changes.map(value => value * (actorStart - coverStart)));
    length += Math.min(...changes.map(value => value * (coverStart + coverDuration - actorStart)));
  }
  const hold = actor.trailing_hold_seconds ?? 0;
  if (!finite(hold) || hold < 0) throw new Error("Trailing hold must be finite and nonnegative.");
  length -= hold;
  if (head < -EPS || length <= 0) throw new Error("Keep the overlay inside its background throughout the Lead-in range.");
  return length;
}

function coverageIssues(option: CoverageOption) {
  const issues: {index: number; message: string}[] = [];
  const claimed = new Set<number>();
  for (const [index, relation] of (option.coverage_constraints ?? []).entries()) {
    try {
      if (claimed.has(relation.operation_index)) throw new Error("An overlay can have only one coverage constraint.");
      claimed.add(relation.operation_index);
      const seconds = coverageWindowSeconds(option, relation);
      const source = option.operations[relation.operation_index].create_visual!;
      const start = source.source_start_seconds, end = source.source_end_seconds;
      const duration = source.source_duration_seconds, rate = source.playback_rate ?? 1;
      if (!finite(start) || !finite(end) || !finite(duration) || !finite(rate) || rate <= 0
        || start < 0 || end <= start || end > duration + EPS) {
        throw new Error("Keep the overlay source range inside its original footage.");
      }
      if ((end - start) / rate > seconds + EPS) {
        throw new Error("Shorten the overlay or increase Speed to keep it over the background throughout the Lead-in range.");
      }
    } catch (error) {
      issues.push({index, message: error instanceof Error ? error.message : String(error)});
    }
  }
  return issues;
}

export function validateCoverageConstraints(option: CoverageOption, ctx: z.RefinementCtx) {
  for (const issue of coverageIssues(option)) ctx.addIssue({code: "custom", path: ["coverage_constraints", issue.index], message: issue.message});
}

/** The same invariant at live derivation boundaries, including saved options without overrides. */
export function assertCoverageConstraints(option: CoverageOption) {
  const issue = coverageIssues(option)[0];
  if (issue) throw new CoverageValidationError(issue.message, issue.index);
}
