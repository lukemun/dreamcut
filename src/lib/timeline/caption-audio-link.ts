import type { TimelineElement } from "@/components/studio/timeline/types";
import { timelineTimeToSourceTime } from "./speed-steps";

/** Explicit provenance only: never attach a title to whichever clip happens to be nearby. */
export function captionAudioSourceId(element: TimelineElement): string | null {
  if (element.type !== "caption_text") return null;
  const props = element.props ?? {};
  for (const value of [props.caption_source_element_id, props.speech_caption_source_element_id,
    props.source_audio_element_id, element.voice_clip_id]) {
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function captionFollowsAudio(element: TimelineElement) {
  return captionAudioSourceId(element) !== null && element.props?.caption_follow_audio === true;
}

/** Capture immutable source seconds when a caption is generated, not on first audio edit. */
export function bindGeneratedCaption(caption: Pick<TimelineElement, "props" | "timeline_start" | "duration">, source: TimelineElement) {
  const rate = source.playback_rate;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid caption source playback rate.");
  const localStart = caption.timeline_start - source.timeline_start;
  const start = timelineTimeToSourceTime(source, localStart);
  const words = Array.isArray(caption.props?.wordTimings) ? caption.props.wordTimings as Array<{text: string; start: number; end: number}> : [];
  caption.props = { ...caption.props, caption_follow_audio: true, caption_source_element_id: source.id,
    caption_audio_binding: { version: 1, start, end: timelineTimeToSourceTime(source, localStart + caption.duration),
      text: String(caption.props?.text ?? ""),
      words: words.map((word) => ({ ...word, start: timelineTimeToSourceTime(source, localStart + word.start), end: timelineTimeToSourceTime(source, localStart + word.end) })),
    },
  };
}
