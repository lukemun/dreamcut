import { wordReadingState, wordSpeakingWindow } from "./caption-reading-states";
import type { CaptionWordTiming } from "./active-word-captions";

/**
 * A shape drawn behind the word being said: a box, an underline, or a bar that grows under the
 * line as it is spoken. It reads the same reading clock as the word states, and both renderers
 * draw it as a span behind the word's glyphs, so no word rectangles need measuring.
 */
export type CaptionWordMarker = "none" | "box" | "underline" | "bar";
/** How the box or underline reaches the next word: a cut, a pop, or a wipe that reads as a slide. */
export type CaptionWordMarkerMotion = "snap" | "pop" | "slide";

export type CaptionWordMarkerStyle = {
  wordMarker: CaptionWordMarker;
  wordMarkerColor: string;
  wordMarkerOpacity: number;
  /** Corner radius, in em. */
  wordMarkerRadiusEm: number;
  /** How far the marker reaches past the word on each side, in em. */
  wordMarkerPadEm: number;
  /** Underline and bar thickness, in em. */
  wordMarkerThicknessEm: number;
  wordMarkerMotion: CaptionWordMarkerMotion;
  /** Seconds the marker takes to move to the next word (0 = cut). */
  wordMarkerSeconds: number;
};

export const CAPTION_WORD_MARKER_KEYS = [
  "wordMarker", "wordMarkerColor", "wordMarkerOpacity", "wordMarkerRadiusEm", "wordMarkerPadEm",
  "wordMarkerThicknessEm", "wordMarkerMotion", "wordMarkerSeconds",
] as const satisfies readonly (keyof CaptionWordMarkerStyle)[];

export const DEFAULT_CAPTION_WORD_MARKER: CaptionWordMarkerStyle = {
  wordMarker: "none",
  wordMarkerColor: "#ffd400",
  wordMarkerOpacity: 1,
  wordMarkerRadiusEm: 0.14,
  wordMarkerPadEm: 0.12,
  wordMarkerThicknessEm: 0.12,
  wordMarkerMotion: "snap",
  wordMarkerSeconds: 0.12,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

export function resolveCaptionWordMarker(raw: Record<string, unknown> | undefined): CaptionWordMarkerStyle {
  const d = DEFAULT_CAPTION_WORD_MARKER;
  const marker = raw?.wordMarker;
  const motion = raw?.wordMarkerMotion;
  return {
    wordMarker: marker === "box" || marker === "underline" || marker === "bar" ? marker : "none",
    wordMarkerColor: color(raw?.wordMarkerColor, d.wordMarkerColor),
    wordMarkerOpacity: clamp(finite(raw?.wordMarkerOpacity, d.wordMarkerOpacity), 0, 1),
    wordMarkerRadiusEm: clamp(finite(raw?.wordMarkerRadiusEm, d.wordMarkerRadiusEm), 0, 0.6),
    wordMarkerPadEm: clamp(finite(raw?.wordMarkerPadEm, d.wordMarkerPadEm), 0, 0.5),
    wordMarkerThicknessEm: clamp(finite(raw?.wordMarkerThicknessEm, d.wordMarkerThicknessEm), 0.02, 1.2),
    wordMarkerMotion: motion === "pop" || motion === "slide" ? motion : "snap",
    wordMarkerSeconds: clamp(finite(raw?.wordMarkerSeconds, d.wordMarkerSeconds), 0, 0.6),
  };
}

/** How the marker is drawn behind one word (or one word space) at this moment. */
export type WordMarkerFrame = {
  /** Horizontal coverage, 0..1, growing from `origin`. */
  width: number;
  scale: number;
  opacity: number;
  origin: "left" | "right" | "center";
};

const smooth = (k: number) => k * k * (3 - 2 * k);

function popScale(k: number) {
  // Rises from 60% past full size and settles, the usual "box pops in" read.
  const c = 1.70158 * 1.4;
  const s = k - 1;
  return 0.6 + 0.4 * (1 + (c + 1) * s * s * s + c * s * s);
}

/** The marker on word `index`, or null when none is drawn there. */
export function wordMarkerFrame(
  style: CaptionWordMarkerStyle,
  timings: readonly CaptionWordTiming[],
  index: number,
  localSeconds: number,
  holdThroughGap: boolean,
): WordMarkerFrame | null {
  if (style.wordMarker === "none") return null;
  const state = wordReadingState(timings, index, localSeconds, holdThroughGap);
  if (style.wordMarker === "bar") {
    if (state.phase === "upcoming") return null;
    if (state.phase === "spoken") return { width: 1, scale: 1, opacity: 1, origin: "left" };
    const window = wordSpeakingWindow(timings, index, holdThroughGap);
    const span = Math.max(1e-3, window.end - window.start);
    return { width: clamp(state.sincePhaseStart / span, 0, 1), scale: 1, opacity: 1, origin: "left" };
  }
  const k = style.wordMarkerSeconds > 0 ? clamp(state.sincePhaseStart / style.wordMarkerSeconds, 0, 1) : 1;
  if (state.phase === "speaking") {
    if (style.wordMarkerMotion === "pop") return { width: 1, scale: popScale(k), opacity: smooth(Math.min(1, k * 2)), origin: "center" };
    if (style.wordMarkerMotion === "slide") return { width: smooth(k), scale: 1, opacity: 1, origin: "left" };
    return { width: 1, scale: 1, opacity: 1, origin: "center" };
  }
  // A slide hands over: the said word's marker leaves toward the next word as that one fills.
  if (state.phase === "spoken" && style.wordMarkerMotion === "slide" && k < 1) {
    return { width: 1 - smooth(k), scale: 1, opacity: 1, origin: "right" };
  }
  return null;
}

/** A bar runs through the space before a word once that word is being said. */
export function wordMarkerGapFrame(
  style: CaptionWordMarkerStyle,
  timings: readonly CaptionWordTiming[],
  nextIndex: number,
  localSeconds: number,
  holdThroughGap: boolean,
): WordMarkerFrame | null {
  if (style.wordMarker !== "bar" || nextIndex <= 0) return null;
  return wordReadingState(timings, nextIndex, localSeconds, holdThroughGap).phase === "upcoming"
    ? null : { width: 1, scale: 1, opacity: 1, origin: "left" };
}

function rgba(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${Math.round(alpha * 1000) / 1000})`;
}

/**
 * CSS for the marker span placed inside a word span (which must be `position: relative` and
 * `isolation: isolate`); `gap` drops the side padding so a bar meets its neighbours.
 */
export function wordMarkerCSS(style: CaptionWordMarkerStyle, frame: WordMarkerFrame, gap = false): Record<string, string | number> {
  const pad = gap ? 0 : style.wordMarkerPadEm;
  const line = style.wordMarker === "underline" || style.wordMarker === "bar";
  const xScale = frame.width * frame.scale;
  return {
    position: "absolute",
    left: `-${pad}em`,
    right: `-${pad}em`,
    ...(line
      ? { bottom: "-0.02em", height: `${style.wordMarkerThicknessEm}em` }
      : { top: "-0.04em", bottom: "-0.04em" }),
    zIndex: -1,
    pointerEvents: "none",
    backgroundColor: rgba(style.wordMarkerColor, style.wordMarkerOpacity * frame.opacity),
    borderRadius: gap ? 0 : `${style.wordMarkerRadiusEm}em`,
    transform: `scale(${round(xScale)}, ${round(line ? 1 : frame.scale)})`,
    transformOrigin: `${frame.origin} center`,
  };
}

/** Fingerprint of the marker's drawn state, for the GPU text cache. */
export function wordMarkerSignature(
  style: CaptionWordMarkerStyle,
  timings: readonly CaptionWordTiming[],
  localSeconds: number,
  holdThroughGap: boolean,
) {
  if (style.wordMarker === "none") return "";
  return timings.map((_, index) => {
    const frame = wordMarkerFrame(style, timings, index, localSeconds, holdThroughGap);
    return frame ? `${round(frame.width)},${round(frame.scale)},${round(frame.opacity)}${frame.origin[0]}` : "-";
  }).join(";");
}

const round = (value: number) => Math.round(value * 1000) / 1000;
