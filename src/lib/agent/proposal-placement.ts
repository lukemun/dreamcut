import type { TimelineElement } from "@/components/studio/timeline/types";
import { readMetadata, type TimelineFile } from "@/lib/local-store/store";
import { getCompositionDimensions } from "@/lib/render/composition-adapters";
import { isCamera } from "@/lib/timeline/camera";
import { placementRelation, relationOverlap } from "@/lib/timeline/placement-relation";

import { deriveProposalTimeline, type EditorAgentOperation, type EditorAgentOption } from "./timeline-editor-agent-apply";

/**
 * Placement policy for new cards (docs/standards/spatial-authoring.md): text and drawn shapes are
 * placed by relation (`place`) or a named preset. Coordinates on them are a stated fallback: the
 * option names a coordinate_fallback_reason. A preset beside coordinates is two placement modes
 * on one element and is always refused. Settled and older drafts stay readable as written.
 */
export function placementPolicyIssues(options: readonly EditorAgentOption[], timeline: TimelineFile): string[] {
  const issues: string[] = [];
  for (const option of options) {
    const created = new Map<string, "text" | "shape" | "other">();
    for (const operation of option.operations) {
      const kind = followerKind(operation, timeline, created);
      if (operation.create_text) created.set(operation.element_id, "text");
      else if (operation.create_shape) created.set(operation.element_id, kind);
      if (kind === "other") continue;
      const values = (operation.create_text ?? operation.create_shape ?? operation.props) as Record<string, unknown> | undefined;
      if (!values || values.place) continue;
      const keyframes = values.keyframes as Record<string, unknown> | undefined;
      const coordinates = kind === "text"
        ? ["absX", "absY"].filter(field => values[field] !== undefined)
        : [...["media_offset_x", "media_offset_y"].filter(field => values[field] !== undefined),
          ...(keyframes?.media_offset_x || keyframes?.media_offset_y ? ["keyframes.media_offset_x/y"] : [])];
      if (!coordinates.length) continue;
      const name = describe(operation, timeline);
      if (kind === "text" && values.positionPreset) {
        issues.push(`Option ${option.id}: ${name} gives both a position preset and coordinates (${coordinates.join(", ")}); the coordinates silently win. Give it one placement: place relative to what it labels, or the preset alone.`);
        continue;
      }
      if (option.coordinate_fallback_reason) continue;
      issues.push(`Option ${option.id}: ${name} is placed by coordinates (${coordinates.join(", ")}). Place it relative to what it belongs to, for example place: { relative_to: "<element id or ids>", side: "below" }, so it stays there when that moves; svg_pieces_compile returns a label_slot for a drawing. If no relation fits, or the creator asked for exact values, set the option's coordinate_fallback_reason.`);
    }
  }
  return issues;
}

function followerKind(operation: EditorAgentOperation, timeline: TimelineFile, created: Map<string, "text" | "shape" | "other">): "text" | "shape" | "other" {
  if (operation.create_text) return "text";
  if (operation.create_shape) return operation.create_shape.shape_kind === "camera" ? "other" : "shape";
  if (!operation.props) return "other";
  const earlier = created.get(operation.element_id);
  if (earlier) return earlier;
  const element = timeline.elements.find(candidate => candidate.id === operation.element_id && !candidate.removed_at);
  if (element?.type === "caption_text") return "text";
  return element?.type === "shape" && !isCamera(element) ? "shape" : "other";
}

function describe(operation: EditorAgentOperation, timeline: TimelineFile) {
  const text = operation.create_text?.text ?? timeline.elements.find(element => element.id === operation.element_id)?.props?.text;
  if (typeof text === "string" && text.trim()) return `the text "${text.trim().slice(0, 60)}"`;
  const title = operation.create_shape?.title ?? timeline.elements.find(element => element.id === operation.element_id)?.props?.title;
  return typeof title === "string" ? `the shape "${title}"` : `element ${operation.element_id}`;
}

export type RelationOverlapReview = { option_id: string; element_id: string; side: string; share: number };

/** Followers that land on their own anchors (the canvas edge left no room on that side), per option. */
export function reviewPlacementRelations(projectId: string, base: TimelineFile, options: readonly EditorAgentOption[]): RelationOverlapReview[] {
  const canvas = projectCanvas(projectId);
  const found: RelationOverlapReview[] = [];
  // An option can also move the anchor of a label already on the timeline, which carries the label.
  const hasFollowers = base.elements.some(element => !element.removed_at && placementRelation(element));
  for (const option of options) {
    if (!hasFollowers && !option.operations.some(usesRelation)) continue;
    const derived = deriveProposalTimeline(base, option.operations, projectId, option.preserve_fields);
    const elements = derived.timeline.elements as TimelineElement[];
    for (const id of derived.touched) {
      const follower = elements.find(element => element.id === id && !element.removed_at);
      if (!follower || !placementRelation(follower)) continue;
      const overlap = relationOverlap(follower, elements, canvas);
      if (overlap && overlap.share > 0.05) found.push({ option_id: option.id, element_id: id, side: overlap.relation.side, share: overlap.share });
    }
  }
  return found;
}

export function relationOverlapMessage(found: readonly RelationOverlapReview[]) {
  return found.map(item => `Option ${item.option_id}: ${item.element_id} placed ${item.side} its anchor still covers ${Math.round(item.share * 100)}% of it, because the frame edge leaves no room on that side. Choose another side, a smaller gap or size, or move the anchor.`).join(" ")
    + " To size it from measurements instead of guessing, call open_space_find with the text over its time on screen: it returns the open regions and how much room the text needs in the real font.";
}

const usesRelation = (operation: EditorAgentOperation) => !!((operation.create_text ?? operation.create_shape ?? operation.props) as Record<string, unknown> | undefined)?.place;

function projectCanvas(projectId: string) {
  return getCompositionDimensions(readMetadata(projectId).output_aspect_ratio);
}
