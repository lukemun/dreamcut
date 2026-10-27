import { currentFrameRate } from "../timeline/frame-rate-scope";
import type { TimelineElement } from "@/components/studio/timeline/types";
import type { EditorAgentOperation } from "@/lib/agent/timeline-editor-agent-apply";
import type { SpatialAssessment } from "@/lib/media-analysis/spatial-assessment";
import type { SpatialAssessmentScope, VisualOverlap } from "@/lib/media-analysis/visual-overlap";
import type { TimelineFile } from "@/lib/local-store/store";

const SPATIAL_TYPES = new Set<TimelineElement["type"]>(["still", "video_clip", "caption_text", "shape"]);

export type ProposalSpatialScope = SpatialAssessmentScope & {
  kind: "proposal_changes" | "global_visual_change" | "no_visual_change";
  reason: string;
};

type SpatialIssue =
  | ({ issue_kind: "overlap" } & VisualOverlap["warnings"][number])
  | ({ issue_kind: "safe_area" } & VisualOverlap["safe_area_warnings"][number]);

function activeSpatial(element: TimelineElement | undefined): element is TimelineElement {
  // A camera draws nothing itself; its followers are what move.
  return Boolean(element && !element.removed_at && SPATIAL_TYPES.has(element.type) && element.props?.shape_kind !== "camera");
}

function timelineRange(timeline: TimelineFile) {
  const active = timeline.elements.filter(activeSpatial);
  if (!active.length) return [];
  return [{
    start_seconds: Math.min(...active.map((element) => element.timeline_start)),
    end_seconds: Math.max(...active.map((element) => element.timeline_start + element.duration)),
  }];
}

function mergeRanges(ranges: SpatialAssessmentScope["time_ranges"]) {
  const ordered = ranges
    .filter((range) => Number.isFinite(range.start_seconds) && Number.isFinite(range.end_seconds) && range.end_seconds > range.start_seconds)
    .sort((first, second) => first.start_seconds - second.start_seconds);
  const merged: typeof ordered = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (previous && range.start_seconds <= previous.end_seconds + 1 / currentFrameRate()) {
      previous.end_seconds = Math.max(previous.end_seconds, range.end_seconds);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function deriveProposalSpatialScope(
  before: TimelineFile,
  after: TimelineFile,
  touchedElementIds: readonly string[],
  operations: readonly EditorAgentOperation[],
): ProposalSpatialScope {
  const globalVisualChange = operations.some((operation) => operation.set_lane_order || operation.set_output_format);
  if (globalVisualChange) {
    return {
      kind: "global_visual_change",
      reason: "Lane order or output geometry can change every visual relationship, so the complete active visual span is relevant.",
      time_ranges: mergeRanges([...timelineRange(before), ...timelineRange(after)]),
    };
  }

  const beforeById = new Map(before.elements.map((element) => [element.id, element]));
  const afterById = new Map(after.elements.map((element) => [element.id, element]));
  // A changed camera moves everything that follows it, so its followers are in scope too.
  const touchedCameras = new Set(touchedElementIds.filter((id) => [beforeById.get(id), afterById.get(id)].some((element) => element?.props?.shape_kind === "camera")));
  const followers = [...before.elements, ...after.elements].filter((element) => typeof element.props?.camera_id === "string" && touchedCameras.has(element.props.camera_id as string)).map((element) => element.id);
  const focus = [...new Set([...touchedElementIds, ...followers])].filter((id) => activeSpatial(beforeById.get(id)) || activeSpatial(afterById.get(id)));
  const ranges = mergeRanges(focus.flatMap((id) => {
    const candidates = [beforeById.get(id), afterById.get(id)].filter(activeSpatial);
    return candidates.map((element) => ({
      start_seconds: element.timeline_start,
      end_seconds: element.timeline_start + element.duration,
    }));
  }));

  if (!focus.length || !ranges.length) {
    return {
      kind: "no_visual_change",
      reason: "This option does not change a visual or caption actor, so spatial preflight is not applicable.",
      time_ranges: [],
      focus_element_ids: [],
    };
  }

  return {
    kind: "proposal_changes",
    reason: "Only relationships involving changed visual actors inside their before/after timeline spans are assessed.",
    time_ranges: ranges,
    focus_element_ids: [...new Set(focus)],
  };
}

function issues(assessment: SpatialAssessment): SpatialIssue[] {
  return [
    ...assessment.visual_overlap.warnings.map((warning) => ({ issue_kind: "overlap" as const, ...warning })),
    ...assessment.visual_overlap.safe_area_warnings.map((warning) => ({ issue_kind: "safe_area" as const, ...warning })),
  ];
}

function issueKey(issue: SpatialIssue) {
  return issue.issue_kind === "overlap"
    ? `overlap:${[...issue.element_ids].sort().join("|")}`
    : `safe:${issue.element_id}`;
}

function issueMagnitude(issue: SpatialIssue) {
  return issue.issue_kind === "overlap" ? issue.max_fraction_of_smaller_box : issue.max_outside_pixels;
}

export function compareProposalSpatialAssessments(before: SpatialAssessment, after: SpatialAssessment) {
  const beforeByKey = new Map(issues(before).map((issue) => [issueKey(issue), issue]));
  const afterByKey = new Map(issues(after).map((issue) => [issueKey(issue), issue]));
  const introduced = [...afterByKey].filter(([key]) => !beforeByKey.has(key)).map(([, issue]) => issue);
  const resolved = [...beforeByKey].filter(([key]) => !afterByKey.has(key)).map(([, issue]) => issue);
  const remaining = [...afterByKey].flatMap(([key, afterIssue]) => {
    const beforeIssue = beforeByKey.get(key);
    if (!beforeIssue) return [];
    const beforeMagnitude = issueMagnitude(beforeIssue);
    const afterMagnitude = issueMagnitude(afterIssue);
    const trend = afterMagnitude < beforeMagnitude - 1e-6
      ? "improved" as const
      : afterMagnitude > beforeMagnitude + 1e-6
        ? "worsened" as const
        : "unchanged" as const;
    return [{ trend, before: beforeIssue, after: afterIssue }];
  });
  const trendCounts = {
    improved: remaining.filter((issue) => issue.trend === "improved").length,
    worsened: remaining.filter((issue) => issue.trend === "worsened").length,
    unchanged: remaining.filter((issue) => issue.trend === "unchanged").length,
  };
  return {
    summary: {
      introduced: introduced.length,
      resolved: resolved.length,
      remaining: remaining.length,
      ...trendCounts,
      unknowns: after.visual_overlap.unknowns.length,
      truncated: before.visual_overlap.truncated || after.visual_overlap.truncated,
    },
    introduced,
    resolved,
    remaining,
  };
}
