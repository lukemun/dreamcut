export type CaptionTimingMode = "phrase" | "active_word" | "single_word";

export type CaptionWordTiming = {
  text: string;
  start: number;
  end: number;
  /** Optional paragraph-build emphasis. Ordinary words inherit the caption colour and size. */
  color?: string;
  scale?: number;
  rowBreakBefore?: boolean;
  rowBreakAfter?: boolean;
};

export type WordTimingFinding = {
  code:
    | "missing_word_timings"
    | "invalid_word_timing"
    | "word_timing_out_of_range"
    | "word_timing_overlap"
    | "word_timing_text_mismatch"
    | "word_timing_no_render_frame"
    | "invalid_active_word_color";
  index: number | null;
  message: string;
};

const WORD_PART = /[^\s]+/gu;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function isCaptionHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);
}

/** Pick a readable foreground for the active-word backing color. */
export function activeWordForegroundColor(background: string) {
  if (!isCaptionHexColor(background)) return "#ffffff";
  const red = Number.parseInt(background.slice(1, 3), 16) / 255;
  const green = Number.parseInt(background.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(background.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance >= 0.58 ? "#111111" : "#ffffff";
}

export function normalizeCaptionToken(text: string) {
  return text
    .normalize("NFKC")
    .replaceAll("’", "'")
    .replace(EDGE_PUNCTUATION, "")
    .toLocaleLowerCase();
}

export function captionTextTokens(text: string) {
  return text.match(WORD_PART) ?? [];
}

export function captionRenderParts(text: string) {
  let wordIndex = 0;
  return text.split(/(\s+)/u).filter(Boolean).map((part) => {
    if (/^\s+$/u.test(part)) return { text: part, wordIndex: null };
    const result = { text: part, wordIndex };
    wordIndex += 1;
    return result;
  });
}

/**
 * A look for one word of graphic text, by its position among the words (0 = first). Unlike
 * word timings it needs no speech clock, so it draws in every timing mode.
 */
export type CaptionWordStyle = {
  index: number;
  /** Word colour. */
  color?: string;
  /** Highlight box drawn behind the word. */
  background?: string;
};

export const MAX_CAPTION_WORD_STYLES = 100;

export function normalizeWordStyles(raw: unknown): CaptionWordStyle[] {
  if (!Array.isArray(raw)) return [];
  const styles = new Map<number, CaptionWordStyle>();
  for (const item of raw.slice(0, MAX_CAPTION_WORD_STYLES)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.index !== "number" || !Number.isInteger(record.index) || record.index < 0) continue;
    const color = isCaptionHexColor(record.color) ? record.color as string : undefined;
    const background = isCaptionHexColor(record.background) ? record.background as string : undefined;
    if (!color && !background) continue;
    styles.set(record.index, { index: record.index, ...(color ? { color } : {}), ...(background ? { background } : {}) });
  }
  return [...styles.values()].sort((a, b) => a.index - b.index);
}

export function normalizeWordTimings(raw: unknown): CaptionWordTiming[] {
  if (!Array.isArray(raw)) return [];
  const timings: CaptionWordTiming[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.text !== "string"
      || !record.text.trim()
      || typeof record.start !== "number"
      || !Number.isFinite(record.start)
      || typeof record.end !== "number"
      || !Number.isFinite(record.end)
    ) return [];
    if (record.color !== undefined && !isCaptionHexColor(record.color)) return [];
    if (
      record.scale !== undefined
      && (typeof record.scale !== "number" || !Number.isFinite(record.scale) || record.scale < 0.5 || record.scale > 3)
    ) return [];
    if (record.rowBreakBefore !== undefined && typeof record.rowBreakBefore !== "boolean") return [];
    if (record.rowBreakAfter !== undefined && typeof record.rowBreakAfter !== "boolean") return [];
    timings.push({
      text: record.text,
      start: record.start,
      end: record.end,
      ...(typeof record.color === "string" ? { color: record.color } : {}),
      ...(typeof record.scale === "number" ? { scale: record.scale } : {}),
      ...(typeof record.rowBreakBefore === "boolean" ? { rowBreakBefore: record.rowBreakBefore } : {}),
      ...(typeof record.rowBreakAfter === "boolean" ? { rowBreakAfter: record.rowBreakAfter } : {}),
    });
  }
  return timings;
}

export function captionTextMatchesWordTimings(text: string, wordTimings: readonly CaptionWordTiming[]) {
  const tokens = captionTextTokens(text).map(normalizeCaptionToken);
  const timed = wordTimings.map((word) => normalizeCaptionToken(word.text));
  return tokens.length === timed.length && tokens.every((token, index) => token.length > 0 && token === timed[index]);
}

/**
 * Alignment owns when a word appears; the editable caption owns how it is written.
 * Keep timing/emphasis metadata while reflecting punctuation and case-only edits in
 * word-based render modes.
 */
export function captionTextAppliedToWordTimings(
  text: string,
  wordTimings: readonly CaptionWordTiming[],
) {
  if (!captionTextMatchesWordTimings(text, wordTimings)) return null;
  const tokens = captionTextTokens(text);
  return wordTimings.map((word, index) => ({ ...word, text: tokens[index]! }));
}

export function captionTextEditPatch(
  nextText: string,
  currentProps: Record<string, unknown> | null | undefined,
): { patch: Record<string, unknown>; timingInvalidated: boolean } {
  const timings = normalizeWordTimings(currentProps?.wordTimings);
  if (timings.length === 0) {
    return { patch: { text: nextText }, timingInvalidated: false };
  }
  const updatedTimings = captionTextAppliedToWordTimings(nextText, timings);
  if (updatedTimings) {
    return { patch: { text: nextText, wordTimings: updatedTimings }, timingInvalidated: false };
  }
  return {
    patch: { text: nextText, timingMode: "phrase", wordTimings: [] },
    timingInvalidated: true,
  };
}

function renderedFramesForInterval(start: number, end: number, fps: number) {
  const firstFrame = Math.ceil(start * fps - 1e-9);
  const endExclusive = Math.ceil(end * fps - 1e-9);
  return Math.max(0, endExclusive - firstFrame);
}

export function validateWordTimings(
  text: string,
  duration: number,
  raw: unknown,
  fps = 30,
): { timings: CaptionWordTiming[]; findings: WordTimingFinding[] } {
  const timings = normalizeWordTimings(raw);
  const findings: WordTimingFinding[] = [];
  if (timings.length === 0) {
    findings.push({ code: "missing_word_timings", index: null, message: "Active-word captions require aligned word timings." });
    return { timings, findings };
  }

  timings.forEach((word, index) => {
    if (word.start < 0 || word.end <= word.start) {
      findings.push({ code: "invalid_word_timing", index, message: `Word ${index + 1} must have 0 <= start < end.` });
    }
    if (word.end > duration + 0.0005) {
      findings.push({ code: "word_timing_out_of_range", index, message: `Word ${index + 1} ends after the caption.` });
    }
    if (index > 0 && word.start < timings[index - 1]!.end - 0.0005) {
      findings.push({ code: "word_timing_overlap", index, message: `Word ${index + 1} overlaps the previous word.` });
    }
    if (renderedFramesForInterval(word.start, word.end, fps) === 0) {
      findings.push({ code: "word_timing_no_render_frame", index, message: `Word ${index + 1} is too short to appear at ${fps} fps.` });
    }
  });

  const displayTimings = captionTextAppliedToWordTimings(text, timings);
  if (!displayTimings) {
    findings.push({ code: "word_timing_text_mismatch", index: null, message: "Caption words no longer match the aligned transcript." });
  }
  return { timings: displayTimings ?? timings, findings };
}

export function resolveActiveWordIndex(wordTimings: readonly CaptionWordTiming[], localSeconds: number) {
  for (let index = 0; index < wordTimings.length; index += 1) {
    const word = wordTimings[index]!;
    if (localSeconds >= word.start && localSeconds < word.end) return index;
  }
  return -1;
}

export const SINGLE_WORD_TRANSITION_SECONDS = 0.12;

/**
 * CapCut's Single Line treatment changes words through a quick center squeeze:
 * the incoming word expands from a thin vertical strip and the outgoing word
 * collapses back into one. Short words proportionally shorten the window so
 * they still get a readable hold.
 */
export function resolveSingleWordScaleX(
  word: CaptionWordTiming,
  localSeconds: number,
  transitionSeconds = SINGLE_WORD_TRANSITION_SECONDS,
) {
  const duration = Math.max(0, word.end - word.start);
  if (duration <= 0 || localSeconds < word.start || localSeconds >= word.end) return 0;
  const window = Math.min(Math.max(0, transitionSeconds), duration / 2);
  if (window <= 0) return 1;
  const entering = Math.min(1, Math.max(0, (localSeconds - word.start) / window));
  const exiting = Math.min(1, Math.max(0, (word.end - localSeconds) / window));
  const progress = Math.min(entering, exiting);
  const eased = progress * progress * (3 - 2 * progress);
  return 0.025 + eased * 0.975;
}

export function wordTimingChangeTimes(wordTimings: readonly CaptionWordTiming[]) {
  return [...new Set(wordTimings.flatMap((word) => [word.start, word.end]))].sort((a, b) => a - b);
}

export function splitActiveWordCaptionProps(
  props: Record<string, unknown> | null | undefined,
  duration: number,
  splitLocalSeconds: number,
  fps = 30,
): { left: Record<string, unknown>; right: Record<string, unknown> } | null {
  if (
    props?.timingMode !== "active_word"
    && props?.timingMode !== "single_word"
  ) return null;
  const text = typeof props.text === "string" ? props.text : "";
  const validated = validateWordTimings(text, duration, props.wordTimings, fps);
  if (validated.findings.length > 0) return null;
  const tolerance = 0.5 / fps + 0.0005;
  const splitIndex = validated.timings.findIndex((word, index) => index > 0 && Math.abs(word.start - splitLocalSeconds) <= tolerance);
  if (splitIndex < 1) return null;
  const boundary = validated.timings[splitIndex]!.start;
  const leftWords = validated.timings.slice(0, splitIndex);
  const rightWords = validated.timings.slice(splitIndex).map((word) => ({
    ...word,
    start: Number((word.start - boundary).toFixed(3)),
    end: Number((word.end - boundary).toFixed(3)),
  }));
  return {
    left: { ...props, text: leftWords.map((word) => word.text).join(" "), wordTimings: leftWords },
    right: { ...props, text: rightWords.map((word) => word.text).join(" "), wordTimings: rightWords },
  };
}
