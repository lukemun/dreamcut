import type { TimelineFile } from "@/lib/local-store/store";
import { gridMatteMaskSchema } from "../timeline/grid-matte";
import { subjectWindowCoveredSource } from "../timeline/subject-window";
import { PROPOSAL_TUNABLE_FIELDS } from "./proposal-controls";
import type { ProposalFieldChange } from "./proposal-review";
import type { EditorAgentOption } from "./timeline-editor-agent-apply";

/**
 * Source seconds the prepared cutouts this clip's picture depends on all cover (their overlap), as
 * the option leaves them: subject windows that use it as their subject (ones the option adds, and
 * existing ones it neither removes nor rebinds), and its own grid matte.
 */
export function preparedMaskSourceBounds(timeline: TimelineFile, option: EditorAgentOption, elementId: string, fps: number): { start: number; end: number } | undefined {
  const masks: unknown[] = [];
  for (const element of timeline.elements) {
    if (element.removed_at) continue;
    const operations = option.operations.filter(operation => operation.element_id === element.id);
    if (operations.some(operation => operation.remove_visual)) continue;
    const props = Object.assign({}, element.props, ...operations.map(operation => operation.props ?? {})) as Record<string, unknown>;
    if (element.id === elementId) {
      if (props.grid_matte_mask && Number(props.grid_matte_cell_size) > 0 && props.grid_matte_enabled !== false) masks.push(props.grid_matte_mask);
    } else if (props.subject_window_parent_id === elementId) masks.push(props.subject_window_mask);
  }
  for (const operation of option.operations) {
    const created = operation.create_visual as Record<string, unknown> | undefined;
    if (created?.subject_window_parent_id === elementId) masks.push(created.subject_window_mask);
  }
  let bounds: { start: number; end: number } | undefined;
  for (const mask of masks) {
    const parsed = gridMatteMaskSchema.safeParse(mask);
    if (!parsed.success) continue;
    const covered = subjectWindowCoveredSource(parsed.data, fps);
    bounds = bounds ? { start: Math.max(bounds.start, covered.start), end: Math.min(bounds.end, covered.end) } : covered;
  }
  return bounds;
}

/**
 * A clip's source dials stop where the prepared cutout its picture depends on (a subject window
 * it drives, or its own grid matte) ends, not at the ends of the footage, so a cutout of the used window plus handles serves every slider
 * position. Covers a created clip's Source in/out and an existing clip's trims, Speed and
 * Duration (whose source end moves while its in-point stays). A range the authored value
 * already falls outside is left alone: the card itself is refused for that.
 */
export function boundSubjectSourceDial(change: ProposalFieldChange, timeline: TimelineFile, option: EditorAgentOption, fps: number): ProposalFieldChange {
  const operation = option.operations[change.operation_index];
  const value = change.after_value;
  if (!operation || typeof value !== "number") return change;
  const created = change.target === "create_visual" && operation.create_visual?.type === "video_clip";
  const patched = change.target === "patch" && ["trim_start", "trim_end", "playback_rate", "duration"].includes(change.field);
  if (!(created && ["source_start_seconds", "source_end_seconds"].includes(change.field)) && !patched) return change;
  const bounds = preparedMaskSourceBounds(timeline, option, operation.element_id, fps);
  if (!bounds) return change;
  const base = change.control_range ?? PROPOSAL_TUNABLE_FIELDS[change.field];
  if (!base) return change;
  let { min, max } = base;
  if (created) {
    min = Math.max(min, bounds.start);
    max = Math.min(max, bounds.end);
  } else {
    const element = timeline.elements.find(candidate => candidate.id === operation.element_id);
    if (!element) return change;
    const patch = (operation.patch ?? {}) as Record<string, number | undefined>;
    const trimStart = patch.trim_start ?? element.trim_start;
    const trimEnd = patch.trim_end ?? element.trim_end ?? 0;
    const rate = patch.playback_rate ?? (element.playback_rate > 0 ? element.playback_rate : 1);
    const duration = patch.duration ?? element.duration;
    const sourceDuration = Number((element.props as Record<string, unknown> | null)?.source_duration_seconds);
    // The shown source ends at in-point + length × speed, or earlier where the tail trim caps it.
    const tailCapped = Number.isFinite(sourceDuration) && sourceDuration - trimEnd <= bounds.end + 1e-6;
    // A trim with a proposed length keeps the other source end fixed (see the trim dial ranges).
    const coupled = patch.duration !== undefined;
    if (change.field === "trim_start") {
      min = Math.max(min, bounds.start);
      if (!coupled && !tailCapped) max = Math.min(max, bounds.end - duration * rate);
    } else if (change.field === "trim_end") {
      if (coupled && Number.isFinite(sourceDuration)) min = Math.max(min, sourceDuration - bounds.end);
    } else if (!tailCapped && change.field === "playback_rate" && duration > 0) {
      max = Math.min(max, (bounds.end - trimStart) / duration);
    } else if (!tailCapped && change.field === "duration") {
      max = Math.min(max, (bounds.end - trimStart) / rate);
    }
  }
  min = Math.ceil(min * 1e3 - 1e-6) / 1e3;
  max = Math.floor(max * 1e3 + 1e-6) / 1e3;
  if (max < min || value < min - 1e-6 || value > max + 1e-6) return change;
  return { ...change, control_range: { min, max } };
}
