import type { TimelineElement } from "@/components/studio/timeline/types";
import { captionTextTokens, validateWordTimings, type CaptionWordTiming } from "./active-word-captions";

/**
 * A caption element always holds exactly the words it shows. "One word at a time"
 * (timingMode single_word) is therefore one caption element per word, never a
 * multi-word element that only draws one of its words: that hides the words from
 * editing. Every timeline write runs this normalization on the captions it adds or
 * changes, so a multi-word single_word caption — from the editor, a proposal, MCP or
 * generated captions — is stored as one caption per word on the same lane and speech
 * clock. Untouched older captions are split only through an approved edit.
 *
 * Rendering is unchanged: a single_word cue already draws each word only inside its
 * own [start, end) interval, which is exactly each new element's span.
 */

export const CAPTION_WORD_SPLIT_REASON = "caption_split_into_words";

type Binding = { version: 1; start: number; end: number; text: string; words: CaptionWordTiming[] };
const seconds = (value: number) => Number(value.toFixed(9));

/** Stable id for word N of a caption, so preview, approval and every rewrite agree. */
export function captionWordElementId(captionId: string, index: number) {
  const input = `${captionId}#word${index}`;
  let h1 = 0x811c9dc5, h2 = 0x1b873593, h3 = 0x85ebca6b, h4 = 0xc2b2ae35;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x5bd1e995);
    h3 = Math.imul(h3 ^ code, 0x27d4eb2d);
    h4 = Math.imul(h4 ^ code, 0x165667b1);
  }
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function bindingOf(props: Record<string, unknown>): Binding | null {
  const binding = props.caption_audio_binding as Binding | undefined;
  return binding?.version === 1 && Array.isArray(binding.words) ? binding : null;
}

/** The one-word captions a multi-word single_word caption becomes, or null when it is already one word (or not word-timed). */
export function captionWordElements(
  element: TimelineElement,
  options: { fps?: number } = {},
): TimelineElement[] | null {
  if (element.type !== "caption_text" || element.removed_at != null) return null;
  const props = (element.props ?? {}) as Record<string, unknown>;
  if (props.timingMode !== "single_word") return null;
  const text = typeof props.text === "string" ? props.text : "";
  const { timings, findings } = validateWordTimings(text, element.duration, props.wordTimings, options.fps ?? 30);
  // Invalid timings render as a phrase; leave them for the timing validator to report.
  if (findings.length > 0 || timings.length < 2) return null;

  const sourceTokens = typeof props.caption_source_text === "string" ? captionTextTokens(props.caption_source_text) : [];
  const binding = bindingOf(props);
  const bindingWords = binding && binding.words.length === timings.length ? binding.words : null;
  const sourceStart = typeof props.caption_source_start_seconds === "number" ? props.caption_source_start_seconds : null;
  const rate = typeof props.caption_source_playback_rate === "number" && props.caption_source_playback_rate > 0
    ? props.caption_source_playback_rate : 1;

  return timings.map((word, index) => {
    const duration = seconds(word.end - word.start);
    const wordSourceStart = bindingWords?.[index]?.start ?? (sourceStart == null ? null : seconds(sourceStart + word.start * rate));
    const wordSourceEnd = bindingWords?.[index]?.end ?? (sourceStart == null ? null : seconds(sourceStart + word.end * rate));
    const next: Record<string, unknown> = {
      ...props,
      text: word.text,
      wordTimings: [{ ...word, start: 0, end: duration }],
      caption_word_count: 1,
      caption_word_limit: 1,
      caption_source_text: sourceTokens.length === timings.length ? sourceTokens[index] : word.text,
      ...(index > 0 ? { split_from_id: element.id } : {}),
    };
    if (wordSourceStart != null && wordSourceEnd != null) {
      next.caption_source_start_seconds = wordSourceStart;
      next.caption_source_end_seconds = wordSourceEnd;
      next.caption_hold_until_source_seconds = wordSourceEnd;
    } else {
      delete next.caption_hold_until_source_seconds;
    }
    if (binding) {
      const bound = bindingWords?.[index];
      next.caption_audio_binding = bound
        ? { version: 1, start: bound.start, end: bound.end, text: bound.text, words: [bound] }
        : null;
    }
    // The first word keeps the caption's identity so selection and references stay valid.
    return {
      ...element,
      id: index === 0 ? element.id : captionWordElementId(element.id, index),
      timeline_start: seconds(element.timeline_start + word.start),
      duration,
      props: next,
    };
  });
}

/**
 * Replace every multi-word single_word caption with one caption per word, in place.
 * Returns the ids of captions it created or changed (empty when nothing needed splitting).
 */
export function splitSingleWordCaptions(
  elements: TimelineElement[],
  options: { fps?: number; only?: (element: TimelineElement) => boolean } = {},
): string[] {
  const changed: string[] = [];
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]!;
    if (options.only && !options.only(element)) continue;
    const words = captionWordElements(element, options);
    if (!words) continue;
    // A word split earlier (an undo/redo or a stale editor copy) is replaced, never duplicated.
    const wordIds = new Set(words.slice(1).map((word) => word.id));
    for (let other = elements.length - 1; other >= 0; other -= 1) {
      if (other !== index && wordIds.has(elements[other]!.id)) {
        elements.splice(other, 1);
        if (other < index) index -= 1;
      }
    }
    elements.splice(index, 1, ...words);
    changed.push(...words.map((word) => word.id));
    index += words.length - 1;
  }
  return changed;
}

/** Only captions this write adds or changes: untouched older captions move through an approved edit, not a side effect. */
export function changedSince(before: readonly TimelineElement[]) {
  const prior = new Map(before.map((element) => [element.id, JSON.stringify(element)]));
  return (element: TimelineElement) => prior.get(element.id) !== JSON.stringify(element);
}
