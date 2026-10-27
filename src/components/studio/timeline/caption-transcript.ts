import type { TimelineElement } from "./types";

/** A view of live timeline captions; never a second saved transcript. */
export function captionTranscriptRows(elements: readonly TimelineElement[]) {
  return elements.filter(element => element.type === "caption_text" && element.removed_at == null)
    .sort((a, b) => a.timeline_start - b.timeline_start || a.lane_index - b.lane_index || a.id.localeCompare(b.id));
}

export function captionTranscriptTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function srtTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

/** Subtitles for the edit as it stands: live captions at their timeline times. */
export function captionTranscriptSrt(elements: readonly TimelineElement[]) {
  return captionTranscriptRows(elements).map(element => ({ element, text: String(element.props?.text ?? "").trim() }))
    .filter(row => row.text && row.element.duration > 0)
    .map((row, index) => `${index + 1}\n${srtTime(row.element.timeline_start)} --> ${srtTime(row.element.timeline_start + row.element.duration)}\n${row.text}\n`)
    .join("\n");
}
