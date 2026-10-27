import { CAPTION, FPS, isAllowedCaptionGapFrames } from "@/lib/qc/standards";

export type TranscriptWord = { word: string; start: number; end: number };
export type CaptionCue = { text: string; start: number; end: number; words?: TranscriptWord[] };

const clean = (word: string) => word.trim().replace(/\s+/g, " ");
export const DEFAULT_CAPTION_MAX_WORDS = 3;

const weakCueEndWords = new Set([
  "a", "an", "and", "are", "as", "at", "but", "by", "can", "could", "for", "from",
  "has", "have", "he", "her", "his", "i", "in", "into", "is", "it", "its", "my",
  "of", "on", "or", "our", "she", "should", "that", "the", "their", "they", "this",
  "to", "was", "we", "were", "while", "will", "with", "would", "you", "your",
]);
const phraseStarterWords = new Set(["and", "but", "meanwhile", "or", "so", "then", "while", "which"]);

function lexicalWord(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9']+$/g, "");
}

/**
 * Product-default social caption grammar.
 *
 * Timing and geometry remain hard gates. Among valid plans, prefer a sentence/clause end,
 * then a complete semantic fragment, then the fullest cue up to the word ceiling. Penalizing
 * function words at the right edge avoids mechanical chunks such as “creative writing while”
 * when “your creative writing” is available.
 */
function semanticBoundaryScore(group: TranscriptWord[], next: TranscriptWord | undefined, duration: number): number {
  const last = group.at(-1)!.word;
  const lexicalLast = lexicalWord(last);
  const lexicalNext = next ? lexicalWord(next.word) : "";
  const terminal = /[.!?]["')\]]*$/u.test(last);
  const clause = /[,;:]["')\]]*$/u.test(last);
  return -30
    + (terminal ? 100 : clause ? 45 : 0)
    + (phraseStarterWords.has(lexicalNext) ? 24 : 0)
    + (weakCueEndWords.has(lexicalLast) ? -50 : 0)
    + (group.length === 3 ? 14 : group.length === 2 ? 6 : 0)
    + (duration < 0.3 ? -120 : duration < 0.5 ? -35 : 0);
}

export function validateAlignment(raw: unknown): TranscriptWord[] {
  if (!Array.isArray(raw)) throw new Error("Alignment must be a JSON array of {word,start,end}.");
  let previousEnd = 0;
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Alignment word ${index} is not an object.`);
    const item = entry as Record<string, unknown>;
    const word = typeof item.word === "string" ? clean(item.word) : "";
    const start = item.start;
    const end = item.end;
    if (!word || typeof start !== "number" || typeof end !== "number" || start < 0 || end <= start) {
      throw new Error(`Alignment word ${index} has invalid word/start/end.`);
    }
    if (start < previousEnd - 0.001) throw new Error(`Alignment word ${index} overlaps the previous word.`);
    previousEnd = end;
    return { word, start, end };
  });
}

export function breakCaptionLines(text: string, maxCharsPerLine: number = CAPTION.maxCharsPerLine): string | null {
  if (text.length <= maxCharsPerLine) return text;
  if (text.length > maxCharsPerLine * CAPTION.maxLines) return null;
  const spaces = [...text.matchAll(/ /g)].map((match) => match.index ?? 0);
  const viable = spaces.filter((at) => at <= maxCharsPerLine && text.length - at - 1 <= maxCharsPerLine);
  if (!viable.length) return null;
  const split = viable.sort((a, b) => Math.abs(a - text.length / 2) - Math.abs(b - text.length / 2))[0];
  return `${text.slice(0, split)}\n${text.slice(split + 1)}`;
}

function cueFits(words: TranscriptWord[], maxCharsPerLine: number): boolean {
  const text = words.map((word) => word.word).join(" ");
  const duration = words.at(-1)!.end - words[0].start;
  return breakCaptionLines(text, maxCharsPerLine) != null
    && duration <= CAPTION.maxDurationSeconds
    && text.length / Math.max(duration, 1 / FPS) <= CAPTION.maxCharsPerSecond;
}

/**
 * The frame a cue actually leaves the screen.
 *
 * A cue holds until the next one arrives — but Netflix's allowed gap set is
 * {exactly 2 frames} ∪ {>= 15 frames}, and butting cues end-to-start yields a 0-frame gap,
 * which is BELOW the stated 2-frame minimum. So when the pause to the next cue is short, we
 * end 2 frames early; when it is already a real pause (>= 15 frames), we end on the last
 * spoken word and let the silence be silent.
 *
 * The PLANNER and the EMITTER both call this, so a cue is never planned against one end time
 * and then shipped with another — which is how a caption could otherwise be planned at the
 * 20-frame minimum, shortened by 2 on emit, and land under the floor the planner just checked.
 */
function displayEnd(
  group: TranscriptWord[],
  nextStart: number | null,
  endBoundary: number | undefined,
): number {
  const lastSpokenEnd = group.at(-1)!.end;
  if (nextStart == null) return endBoundary ?? lastSpokenEnd;
  const naturalGapFrames = Math.round((nextStart - lastSpokenEnd) * FPS);
  if (naturalGapFrames >= CAPTION.longGapMinFrames) return lastSpokenEnd;
  return nextStart - CAPTION.minGapFrames / FPS;
}

/**
 * Groups exact MFA word boundaries; it never invents or estimates a timing.
 *
 * `allowFastVerbatim` drops the reading-speed (CPS) constraint — and ONLY that one. Use it
 * when the speaker simply talks faster than the limit and the text must stay verbatim.
 *
 * WHY IT IS OPT-IN AND NEVER A FALLBACK: Netflix's 20 CPS governs SUBTITLES — text that
 * substitutes for audio the viewer cannot hear or understand. Burned-in social captions are a
 * REDUNDANT channel: the viewer hears the same words. Whether the limit should apply to them
 * is a real question that NO source in docs/research/2026-07-12-video-editing-failure-modes/
 * answers — so we do not quietly assume an answer. Default: refuse and name the conflict.
 * Opt in, and every over-speed cue is marked and reported by the QC gate.
 */
export function captionsFromAlignment(words: TranscriptWord[], options: { maxCharsPerLine?: number; maxWordsPerCue?: number; endBoundary?: number; allowFastVerbatim?: boolean; allowRapidFragments?: boolean; includeWordTimings?: boolean } = {}): CaptionCue[] {
  const maxCharsPerLine = Math.min(options.maxCharsPerLine ?? CAPTION.maxCharsPerLine, CAPTION.maxCharsPerLine);
  const maxWordsPerCue = options.maxWordsPerCue ?? DEFAULT_CAPTION_MAX_WORDS;
  if (!Number.isInteger(maxWordsPerCue) || maxWordsPerCue < 1) throw new Error("maxWordsPerCue must be a positive integer.");
  const memo = new Map<number, { groups: TranscriptWord[][]; score: number } | null>();
  const segment = (start: number): { groups: TranscriptWord[][]; score: number } | null => {
    if (start === words.length) return { groups: [], score: 0 };
    if (memo.has(start)) return memo.get(start)!;
    let best: { groups: TranscriptWord[][]; score: number } | null = null;
    const finalEnd = Math.min(words.length, start + maxWordsPerCue);
    for (let end = start + 1; end <= finalEnd; end += 1) {
      const group = words.slice(start, end);
      const text = group.map((word) => word.word).join(" ");
      const cueEnd = displayEnd(group, end < words.length ? words[end].start : null, options.endBoundary);
      const duration = cueEnd - group[0].start;
      const tooFast = text.length / duration > CAPTION.maxCharsPerSecond;
      if (
        breakCaptionLines(text, maxCharsPerLine) == null
        || (duration < CAPTION.minDurationFrames / FPS && !options.allowRapidFragments)
        || duration > CAPTION.maxDurationSeconds
        || (tooFast && !options.allowFastVerbatim)
      ) continue;
      const rest = segment(end);
      if (rest) {
        const candidate = {
          groups: [group, ...rest.groups],
          score: semanticBoundaryScore(group, words[end], duration) + rest.score,
        };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
    memo.set(start, best);
    return best;
  };
  const plan = segment(0);
  if (!plan) throw new Error(`Speech at ${words[0]?.start.toFixed(3) ?? "0"}s cannot satisfy the caption limits without editing the text.`);
  const groups = plan.groups;

  return groups.map((group, index) => ({
    text: breakCaptionLines(group.map((word) => word.word).join(" "), maxCharsPerLine)!,
    start: group[0].start,
    end: displayEnd(
      group,
      index < groups.length - 1 ? groups[index + 1][0].start : null,
      options.endBoundary,
    ),
    ...(options.includeWordTimings ? { words: group.map((word) => ({ ...word })) } : {}),
  }));
}

export function likelyProperNouns(text: string): string[] {
  const known = new Set(["I", "Amazon", "TikTok", "Instagram", "Facebook", "YouTube"]);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const found = new Set<string>();
  for (const sentence of sentences) {
    const words = sentence.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
    for (const word of words.slice(1)) if (/^[A-Z]/.test(word) && !known.has(word)) found.add(word);
  }
  return [...found].sort();
}
