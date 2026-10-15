export type AlignedCaptionWord = {
  word: string;
  start: number;
  end: number;
};

export type NaturalCaptionGroup = {
  text: string;
  start: number;
  end: number;
  words: AlignedCaptionWord[];
};

export type NaturalCaptionGroupingOptions = {
  minWords?: number;
  preferredWords?: number;
  maxWords?: number;
  strongPauseSeconds?: number;
  phrasePauseSeconds?: number;
  /** Optional fixed-size typography budget. Group words; never shrink type. */
  measureWidth?: (text: string) => number;
  targetWidth?: number;
  maxWidth?: number;
};

const sentenceEnd = /[.!?]["')\]]*$/;
const clauseEnd = /[,;:]["')\]]*$/;

function gapAfter(words: readonly AlignedCaptionWord[], index: number) {
  const next = words[index + 1];
  return next ? Math.max(0, next.start - words[index].end) : Number.POSITIVE_INFINITY;
}

/**
 * Deterministically groups force-aligned words into short spoken phrases.
 *
 * Acoustic silence is authoritative. Punctuation is a semantic hint: it can
 * prefer a boundary, but a comma with no spoken pause does not force a cut.
 * Sentence punctuation and clearly audible pauses are hard boundaries. The
 * dynamic program then prefers three-word captions, permits four to avoid
 * choppy or orphaned fragments, and retains genuinely short utterances.
 */
export function groupAlignedWordsByNaturalBoundaries(
  words: readonly AlignedCaptionWord[],
  options: NaturalCaptionGroupingOptions = {},
): NaturalCaptionGroup[] {
  if (words.length === 0) return [];

  const minWords = Math.max(1, Math.trunc(options.minWords ?? 3));
  const preferredWords = Math.max(minWords, Math.trunc(options.preferredWords ?? 3));
  const maxWords = Math.max(preferredWords, Math.trunc(options.maxWords ?? 4));
  const strongPause = options.strongPauseSeconds ?? 0.32;
  const phrasePause = options.phrasePauseSeconds ?? 0.14;

  const hardBoundary = (index: number) => (
    index === words.length - 1
    || sentenceEnd.test(words[index].word)
    || gapAfter(words, index) >= strongPause
  );

  const boundaryReward = (index: number) => {
    if (index === words.length - 1) return 0;
    const gap = gapAfter(words, index);
    let reward = Math.min(5, gap * 12);
    if (clauseEnd.test(words[index].word)) reward += 2.4;
    if (sentenceEnd.test(words[index].word)) reward += 8;
    if (gap >= phrasePause) reward += 2.8;
    return reward;
  };

  const lengthPenalty = (length: number) => {
    if (length === preferredWords) return 0;
    if (length === preferredWords + 1 && length <= maxWords) return 0.35;
    if (length >= minWords && length <= maxWords) return 0.65;
    if (length === 2) return 2.2;
    return 5.5;
  };

  const count = words.length;
  const cost = new Array<number>(count + 1).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(count + 1).fill(-1);
  cost[0] = 0;

  for (let end = 1; end <= count; end += 1) {
    for (let length = 1; length <= maxWords && end - length >= 0; length += 1) {
      const start = end - length;
      if (!Number.isFinite(cost[start])) continue;
      const width = options.measureWidth?.(words.slice(start, end).map(word => word.word).join(" "));
      if (width != null && options.maxWidth != null && width > options.maxWidth) continue;

      let crossingPenalty = 0;
      for (let index = start; index < end - 1; index += 1) {
        if (hardBoundary(index)) {
          crossingPenalty = Number.POSITIVE_INFINITY;
          break;
        }
        const gap = gapAfter(words, index);
        if (gap >= phrasePause || clauseEnd.test(words[index].word)) {
          crossingPenalty += boundaryReward(index) * 0.7;
        }
      }
      if (!Number.isFinite(crossingPenalty)) continue;

      const endIndex = end - 1;
      const candidate = cost[start]
        + (width != null && options.targetWidth
          ? 5 * Math.pow((width - options.targetWidth) / options.targetWidth, 2)
          : lengthPenalty(length))
        + crossingPenalty
        - boundaryReward(endIndex) * 0.55;
      if (candidate < cost[end] - 1e-9) {
        cost[end] = candidate;
        previous[end] = start;
      }
    }
  }

  if (previous[count] < 0) throw new Error("Unable to group aligned caption words");

  const ranges: Array<[number, number]> = [];
  for (let end = count; end > 0;) {
    const start = previous[end];
    ranges.push([start, end]);
    end = start;
  }

  return ranges.reverse().map(([start, end]) => {
    const groupedWords = words.slice(start, end);
    return {
      text: groupedWords.map((entry) => entry.word).join(" "),
      start: groupedWords[0].start,
      end: groupedWords[groupedWords.length - 1].end,
      words: groupedWords,
    };
  });
}
