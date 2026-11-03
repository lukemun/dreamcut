import { captionLineBreaksBefore } from "./caption-page-layout";
import { isWordAnimationPreset, wordEntranceStyle, type AnimationPreset } from "./animation-presets";
import { validateWordTimings, type CaptionTimingMode, type CaptionWordTiming } from "./active-word-captions";

/**
 * Where a word is in its reading: not said yet, being said, or already said. Every speech-driven
 * word treatment (reveal, karaoke colour, a punch on the word being said, speech-synced word
 * entrances) reads this one clock, so Standard and the GPU raster resolve the same state.
 */
export type WordReadingPhase = "upcoming" | "speaking" | "spoken";

export type WordReadingState = {
  phase: WordReadingPhase;
  /** Seconds since the word entered its current phase (0 for upcoming words). */
  sincePhaseStart: number;
};

/**
 * The window in which word `index` counts as being said. With `holdThroughGap`, a pause before the
 * next word keeps this word speaking, so the treatment never drops out between words.
 */
export function wordSpeakingWindow(
  timings: readonly CaptionWordTiming[],
  index: number,
  holdThroughGap: boolean,
) {
  const word = timings[index]!;
  const next = timings[index + 1];
  const end = holdThroughGap && next && next.start > word.end ? next.start : word.end;
  return { start: word.start, end };
}

export function wordReadingState(
  timings: readonly CaptionWordTiming[],
  index: number,
  localSeconds: number,
  holdThroughGap: boolean,
): WordReadingState {
  const window = wordSpeakingWindow(timings, index, holdThroughGap);
  if (localSeconds < window.start) return { phase: "upcoming", sincePhaseStart: 0 };
  if (localSeconds < window.end) return { phase: "speaking", sincePhaseStart: localSeconds - window.start };
  return { phase: "spoken", sincePhaseStart: localSeconds - window.end };
}

export type CaptionUpcomingWords = "shown" | "dimmed" | "hidden";
/** Whether each word changes state on its own, or a whole line changes together. */
export type CaptionWordStateScope = "word" | "line";

/**
 * The first and last word of the line holding word `index`; lines end at a word's row break, and
 * after every `wordsPerLine` words when the caption sets one (caption-page-layout.ts).
 */
export function captionLineOf(timings: readonly CaptionWordTiming[], index: number, wordsPerLine = 0): [number, number] {
  const breaksBefore = (word: number) => timings[word]!.rowBreakBefore || timings[word - 1]!.rowBreakAfter
    || captionLineBreaksBefore({ wordsPerLine }, word);
  let first = index;
  while (first > 0 && !breaksBefore(first)) first -= 1;
  let last = index;
  while (last < timings.length - 1 && !breaksBefore(last + 1)) last += 1;
  return [first, last];
}

/**
 * Where a word is in its reading under the caption's scope: its own state, or with line scope the
 * state of its whole line (said from its first word's start to its last word's end).
 */
export function captionWordReadingState(
  timings: readonly CaptionWordTiming[],
  index: number,
  localSeconds: number,
  style: Pick<CaptionReadingStyle, "wordStateScope" | "speakingWordHoldsGap" | "wordsPerLine">,
): WordReadingState {
  if (style.wordStateScope !== "line") return wordReadingState(timings, index, localSeconds, style.speakingWordHoldsGap);
  const [first, last] = captionLineOf(timings, index, style.wordsPerLine);
  const start = timings[first]!.start;
  const next = timings[last + 1];
  const end = style.speakingWordHoldsGap && next && next.start > timings[last]!.end ? next.start : timings[last]!.end;
  if (localSeconds < start) return { phase: "upcoming", sincePhaseStart: 0 };
  if (localSeconds < end) return { phase: "speaking", sincePhaseStart: localSeconds - start };
  return { phase: "spoken", sincePhaseStart: localSeconds - end };
}

/** The reading-state controls of a caption (CaptionElementProps owns their defaults and bounds). */
export type CaptionReadingStyle = {
  upcomingWords: CaptionUpcomingWords;
  upcomingWordOpacity: number;
  speakingWordColor: string | null;
  speakingWordScale: number;
  speakingWordLiftEm: number;
  speakingWordOvershoot: number;
  spokenWordColor: string | null;
  wordStateSeconds: number;
  speakingWordHoldsGap: boolean;
  /** Each word changes state on its own, or its whole line changes together. */
  wordStateScope: CaptionWordStateScope;
  /** Blur on words not said yet, in em; it clears as each is said (0 = sharp). */
  upcomingWordBlurEm: number;
  /** Words per line the caption breaks at, which line scope follows (0 = by row breaks only). */
  wordsPerLine?: number;
};

/** True when any reading-state control differs from its neutral value. */
export function captionReadingStatesActive(style: CaptionReadingStyle) {
  return style.upcomingWords !== "shown"
    || style.speakingWordColor !== null
    || style.speakingWordScale !== 1
    || style.speakingWordLiftEm !== 0
    || style.spokenWordColor !== null
    || style.upcomingWordBlurEm > 0;
}

export type WordReadingLook = {
  opacity: number;
  /** null keeps the caption's own colour. */
  color: string | null;
  scale: number;
  liftEm: number;
  /** Blur, in em (0 = sharp). */
  blurEm: number;
};

const smooth = (k: number) => k * k * (3 - 2 * k);

/** Ease out with an optional overshoot past the target (0 = none, 1 = strong). */
function easeOutOvershoot(k: number, amount: number) {
  if (amount <= 0) return smooth(k);
  const c1 = 1.70158 * 1.75 * amount;
  const shifted = k - 1;
  return 1 + (c1 + 1) * shifted * shifted * shifted + c1 * shifted * shifted;
}

/**
 * How one word looks in its reading state. Colours switch at the state change; opacity, size
 * and lift move over `wordStateSeconds` (0 = cut). A word that has been said settles back to
 * full size at full opacity.
 */
export function resolveWordReadingLook(style: CaptionReadingStyle, state: WordReadingState): WordReadingLook {
  const upcomingOpacity = style.upcomingWords === "hidden" ? 0 : style.upcomingWords === "dimmed" ? style.upcomingWordOpacity : 1;
  const k = style.wordStateSeconds > 0 ? Math.min(1, state.sincePhaseStart / style.wordStateSeconds) : 1;
  if (state.phase === "upcoming") return { opacity: upcomingOpacity, color: null, scale: 1, liftEm: 0, blurEm: style.upcomingWordBlurEm };
  if (state.phase === "speaking") {
    const rise = easeOutOvershoot(k, style.speakingWordOvershoot);
    return {
      opacity: upcomingOpacity + (1 - upcomingOpacity) * Math.min(1, smooth(k)),
      color: style.speakingWordColor,
      scale: 1 + (style.speakingWordScale - 1) * rise,
      liftEm: style.speakingWordLiftEm * rise,
      blurEm: style.upcomingWordBlurEm * (1 - smooth(k)),
    };
  }
  const settle = 1 - smooth(k);
  return {
    opacity: 1,
    color: style.spokenWordColor,
    scale: 1 + (style.speakingWordScale - 1) * settle,
    liftEm: style.speakingWordLiftEm * settle,
    blurEm: 0,
  };
}

/**
 * A word entrance (word_fade / word_rise / word_pop / word_flip / word_wipe) on a caption tied to speech: each word comes
 * in when it is said, over `entranceSeconds`, instead of a fixed stagger at the caption's start.
 */
export function speechWordEntranceStyle(
  preset: AnimationPreset,
  word: CaptionWordTiming,
  localSeconds: number,
  entranceSeconds: number,
) {
  const progress = entranceSeconds > 0
    ? Math.min(1, Math.max(0, (localSeconds - word.start) / entranceSeconds))
    : localSeconds >= word.start ? 1 : 0;
  return wordEntranceStyle(preset, progress, 0, 1);
}

/** Seconds between letters of a word entering one letter at a time: quick, and within the word's speech. */
export function letterEntranceStep(word: CaptionWordTiming, letterCount: number) {
  return letterCount > 1 ? Math.min(0.05, Math.max(0, word.end - word.start) / letterCount) : 0;
}

/** One letter of a word entrance played letter by letter on a caption tied to speech. */
export function speechLetterEntranceStyle(
  preset: AnimationPreset,
  word: CaptionWordTiming,
  letterIndex: number,
  letterCount: number,
  localSeconds: number,
  entranceSeconds: number,
) {
  const start = word.start + letterIndex * letterEntranceStep(word, letterCount);
  return speechWordEntranceStyle(preset, { ...word, start }, localSeconds, entranceSeconds);
}

/**
 * A stable fingerprint of every word's drawn state at this moment, for the GPU text cache: it is
 * constant while words hold a settled state and changes on each frame of a transition.
 */
export function captionReadingSignature(
  timings: readonly CaptionWordTiming[],
  localSeconds: number,
  style: CaptionReadingStyle | null,
  entrance: { preset: AnimationPreset; seconds: number; byLetter?: boolean } | null,
) {
  return timings.map((word, index) => {
    let part = "";
    if (style) {
      const state = captionWordReadingState(timings, index, localSeconds, style);
      const look = resolveWordReadingLook(style, state);
      part += `${state.phase}${round(look.opacity)},${round(look.scale)},${round(look.liftEm)},${round(look.blurEm)}`;
    }
    if (entrance) {
      const letters = entrance.byLetter ? Array.from(word.text).length : 1;
      for (let letter = 0; letter < letters; letter += 1) {
        const e = entrance.byLetter
          ? speechLetterEntranceStyle(entrance.preset, word, letter, letters, localSeconds, entrance.seconds)
          : speechWordEntranceStyle(entrance.preset, word, localSeconds, entrance.seconds);
        part += `|${round(e.opacity)},${round(e.scale)},${round(e.translateYEm)},${round(e.rotateXDeg ?? 0)},${round(e.clipRight ?? 0)}`;
      }
    }
    return part;
  }).join(";");
}

/**
 * The aligned words a caption's reading states and speech word entrances follow, or null when it
 * has none that validate. One-word captions draw one word at a time and keep their own flip.
 */
export function captionSpeechWords(
  props: { text: string; timingMode: CaptionTimingMode; wordTimings: unknown },
  duration: number,
  fps: number,
) {
  if (props.timingMode === "single_word" || !Array.isArray(props.wordTimings) || props.wordTimings.length === 0) return null;
  const validation = validateWordTimings(props.text, duration, props.wordTimings, fps);
  return validation.findings.length === 0 ? validation.timings : null;
}

/** Word entrances on a caption tied to speech follow each word's own time (owner decision 2026-11-02). */
export function captionSpeechWordEntrance(props: { animationIn: AnimationPreset; animationInDuration: number; entranceByLetter?: boolean }) {
  return isWordAnimationPreset(props.animationIn)
    ? { preset: props.animationIn, seconds: props.animationInDuration, byLetter: props.entranceByLetter === true }
    : null;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
