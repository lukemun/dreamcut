import type { BeatMarker, TimelineElement } from "./types";
import { frameTagPoints, type FrameTag } from "@/lib/review/frame-tag-types";
import { timelineElementInspectorLabel } from "./useTimelineTransitions";

const KIND: Record<string, string> = {
  video_clip: "Clip", still: "Image", caption_text: "Text", music: "Music", sound_effect: "Sound", vo_full: "Voice", vo_segment: "Voice",
};
const seconds = (value: number) => `${value.toFixed(1)}s`;

/**
 * A selected timeline item as a chat pill. The label is what the creator sees; the agent text
 * carries the identity and placement the agent needs (element id, lane, timeline bounds).
 */
export function timelineSelectionPill(
  element: TimelineElement,
  laneLabel: string,
  beatMarkers: Array<Pick<BeatMarker, "id" | "beat_label">>,
) {
  const text = element.type === "caption_text" && typeof element.props?.text === "string" ? element.props.text.trim() : "";
  const name = text ? (text.length > 28 ? `${text.slice(0, 27)}…` : text) : timelineElementInspectorLabel(element, beatMarkers);
  const end = element.timeline_start + element.duration;
  const kind = KIND[element.type] ?? "Item";
  return {
    id: `timeline:${element.id}`,
    kind,
    label: `${name} ${seconds(element.timeline_start)}–${seconds(end)}`,
    agentText: `Timeline ${element.type} element ${element.id} "${text || name}" on lane ${laneLabel} (${element.lane_key}), ${element.timeline_start.toFixed(3)}s–${end.toFixed(3)}s.`,
  };
}

/** A review mark as a chat pill: where it is, the traced points and the creator's note. */
export function reviewMarkPill(tag: FrameTag) {
  const note = tag.note?.trim() ?? "";
  const points = frameTagPoints(tag);
  const where = points.length ? `, ${points.length === 1 ? "point" : `${points.length} traced points`} ${points.slice(0, 12).map(point => `(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`).join(" ")}` : "";
  return {
    id: `mark:${tag.id}`,
    kind: "Mark",
    label: `${seconds(tag.timeline_seconds)}${note ? ` ${note.length > 24 ? `${note.slice(0, 23)}…` : note}` : ""}`,
    agentText: `Review mark ${tag.id} "${tag.label}" at ${tag.timeline_seconds.toFixed(3)}s (frame ${tag.frame_number})${where}${tag.active_element_ids.length ? `, over elements ${tag.active_element_ids.join(", ")}` : ""}${note ? `. Note: ${note.slice(0, 500)}` : ""}.`,
  };
}
