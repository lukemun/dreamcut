import type { TimelineElement } from "@/components/studio/timeline/types";
import { isCaptionHexColor, validateWordTimings, type WordTimingFinding } from "./active-word-captions";

export function captionTimingFindings(element: Pick<TimelineElement, "type" | "duration" | "props">): WordTimingFinding[] {
  if (element.type !== "caption_text") return [];
  const props = (element.props ?? {}) as Record<string, unknown>;
  if (props.timingMode !== "active_word" && props.timingMode !== "single_word") return [];
  const text = typeof props.text === "string" ? props.text : "";
  const findings = validateWordTimings(text, element.duration, props.wordTimings).findings;
  if (
    props.timingMode === "active_word"
    && props.activeWordColor !== undefined
    && !isCaptionHexColor(props.activeWordColor)
  ) {
    findings.push({
      code: "invalid_active_word_color",
      index: null,
      message: "Active word colour must be a six-digit hex colour.",
    });
  }
  return findings;
}

export function assertCaptionTimingState(element: Pick<TimelineElement, "id" | "type" | "duration" | "props">) {
  const findings = captionTimingFindings(element);
  if (findings.length === 0) return;
  const first = findings[0]!;
  throw Object.assign(new Error(`Caption ${element.id}: ${first.message}`), {
    status: 400,
    code: first.code,
    finding: first,
  });
}

export function assertActiveWordTimingPatch(
  current: TimelineElement,
  patch: { timeline_start?: number; duration?: number; props?: Record<string, unknown> },
) {
  const currentProps = (current.props ?? {}) as Record<string, unknown>;
  if (
    current.type === "caption_text"
    && (currentProps.timingMode === "active_word" || currentProps.timingMode === "single_word")
  ) {
    const changesStart = patch.timeline_start !== undefined && patch.timeline_start !== current.timeline_start;
    const changesDuration = patch.duration !== undefined && patch.duration !== current.duration;
    if (changesStart && changesDuration) {
      throw Object.assign(new Error("Word-timed captions cannot be resized from the start. Move the whole caption or regenerate its alignment."), { status: 400 });
    }
  }

  assertCaptionTimingState({
    id: current.id,
    type: current.type,
    duration: patch.duration ?? current.duration,
    props: patch.props ?? current.props,
  });
}
