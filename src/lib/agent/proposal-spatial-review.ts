import { EFFECT_CONTROLS } from "@/lib/timeline/effect-controls";
import { assessProjectSpatial } from "@/lib/local-store/spatial-assessment";
import type { TimelineFile } from "@/lib/local-store/store";
import { compareProposalSpatialAssessments, deriveProposalSpatialScope } from "./proposal-spatial-preflight";
import { deriveProposalTimeline, type EditorAgentOperation, type EditorAgentOption } from "./timeline-editor-agent-apply";

// The scoped spatial check (introduced overlaps between changed actors and their neighbours),
// shared by proposal_create, which runs it on every staged option that can move something, and
// proposal_spatial_preflight, which runs it as an optional dry run. See
// docs/standards/spatial-authoring.md.

/** Fields that cannot move, resize or reveal anything: audio, and effects the registry marks geometry-preserving. */
const GEOMETRY_PRESERVING_PROPS = new Set(EFFECT_CONTROLS.filter(control => control.spatial === "geometry_preserving").map(control => control.prop as string));
const AUDIO_PATCH = new Set(["volume", "fade_in", "fade_out"]);
const AUDIO_PROPS = new Set(["volume_envelope"]);
const NEUTRAL = new Set(["element_id", "rationale", "type"]);

/** Whether an operation could change where or when anything is seen. Unknown fields count as yes. */
export function operationMayMoveVisuals(operation: EditorAgentOperation) {
  return Object.entries(operation).some(([key, value]) => {
    if (NEUTRAL.has(key) || value == null) return false;
    if (key === "patch") return Object.keys(value as object).some(field => !AUDIO_PATCH.has(field));
    if (key === "props") return Object.keys(value as object).some(field => !GEOMETRY_PRESERVING_PROPS.has(field) && !AUDIO_PROPS.has(field));
    if (key === "use_voice_enhancement") return false;
    return true;
  });
}

export type OptionSpatialReview = {
  option_id: string;
  spatial_status: "checked" | "not_applicable";
  reason?: string;
  scope?: ReturnType<typeof deriveProposalSpatialScope>;
  delta?: ReturnType<typeof compareProposalSpatialAssessments>;
  /** The full after-assessment, for the preflight dry run only. */
  assessment?: ReturnType<typeof assessProjectSpatial>;
  overlap_status?: string;
};

/** Scoped spatial review of each option against the current timeline; `full` keeps the after-assessment. */
export function reviewProposalSpatial(projectId: string, before: TimelineFile, laneOrderKeys: string[] | undefined, options: readonly EditorAgentOption[], { full = false, always = false } = {}): OptionSpatialReview[] {
  return options.map(option => {
    if (!always && !option.operations.some(operationMayMoveVisuals)) {
      return { option_id: option.id, spatial_status: "not_applicable", reason: "This option only changes sound or colour, which cannot move or cover anything." };
    }
    const derived = deriveProposalTimeline(before, option.operations, projectId, option.preserve_fields);
    const scope = deriveProposalSpatialScope(before, derived.timeline, derived.touched, option.operations);
    if (scope.kind === "no_visual_change") return { option_id: option.id, spatial_status: "not_applicable", reason: scope.reason, scope };
    const assessorScope = { time_ranges: scope.time_ranges, ...(scope.focus_element_ids ? { focus_element_ids: scope.focus_element_ids } : {}) };
    const beforeAssessment = assessProjectSpatial(projectId, before, laneOrderKeys, undefined, assessorScope);
    const afterAssessment = assessProjectSpatial(projectId, derived.timeline, derived.laneOrderKeys ?? laneOrderKeys, derived.outputFormat, assessorScope);
    const delta = withinDrawingRemoved(compareProposalSpatialAssessments(beforeAssessment, afterAssessment), option);
    return { option_id: option.id, spatial_status: "checked", scope, overlap_status: afterAssessment.visual_overlap.status,
      delta, ...(full ? { assessment: afterAssessment } : {}) };
  });
}

/** Shapes one option creates together are one drawing (a skyline and its windows); their boxes overlapping each other is the drawing, not a collision. */
function withinDrawingRemoved(delta: ReturnType<typeof compareProposalSpatialAssessments>, option: EditorAgentOption) {
  const drawn = new Set(option.operations.filter(operation => operation.create_shape && operation.create_shape.shape_kind !== "camera").map(operation => operation.element_id));
  if (drawn.size < 2) return delta;
  const introduced = delta.introduced.filter(issue => !("element_ids" in issue && (issue.element_ids as string[]).every(id => drawn.has(id))));
  return { ...delta, introduced, summary: { ...delta.summary, introduced: introduced.length } };
}

/** One plain warning per option whose change introduced or worsened an overlap. */
export function spatialWarnings(reviews: readonly OptionSpatialReview[]) {
  return reviews.flatMap(review => {
    const summary = review.delta?.summary;
    if (!summary || (!summary.introduced && !summary.worsened)) return [];
    return [`Option ${review.option_id}: the change introduces ${summary.introduced} new overlap${summary.introduced === 1 ? "" : "s"}${summary.worsened ? ` and worsens ${summary.worsened}` : ""} between visuals; check the introduced issues in spatial_review and repair them unless the overlap is intended.`];
  });
}

/**
 * Cards apply independently, but the creator can preview and apply several together. A new
 * option is checked against what each other pending card would add (its recommended option),
 * so a label staged over a drawing another card adds is named before it is presented.
 */
export function pendingCardCollisions(projectId: string, base: TimelineFile, laneOrderKeys: string[] | undefined, options: readonly EditorAgentOption[],
  pending: readonly { proposal_id: string; proposal: { summary: string; options: readonly EditorAgentOption[] } }[]) {
  const collisions: Array<{ option_id: string; proposal_id: string; card: string; element_ids: string[] }> = [];
  for (const record of pending.slice(0, 8)) {
    const other = record.proposal.options.find(option => option.recommended) ?? record.proposal.options[0];
    if (!other) continue;
    let withOther: ReturnType<typeof deriveProposalTimeline>;
    try { withOther = deriveProposalTimeline(base, other.operations, projectId, other.preserve_fields); } catch { continue; }
    const added = new Set(withOther.touched);
    for (const review of reviewProposalSpatial(projectId, withOther.timeline, withOther.laneOrderKeys ?? laneOrderKeys, options)) {
      const ids = (review.delta?.introduced ?? []).map(issue => "element_ids" in issue ? issue.element_ids as string[] : [])
        .filter(pair => pair.some(id => added.has(id)));
      if (ids.length) collisions.push({ option_id: review.option_id, proposal_id: record.proposal_id, card: record.proposal.summary, element_ids: [...new Set(ids.flat())] });
    }
  }
  return collisions;
}

export function pendingCollisionWarnings(collisions: ReturnType<typeof pendingCardCollisions>) {
  return collisions.map(c => `Option ${c.option_id}: overlaps what the pending card "${c.card.slice(0, 80)}" adds, if both are applied. Move one of them, or combine them into one card if they belong together.`);
}
