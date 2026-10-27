export const ANIMATION_PRESETS = [
  "none",
  "fade",
  "slide_up",
  "slide_down",
  "slide_left",
  "slide_right",
  "write_on",
  "handwriting",
  "scan_reveal_down",
  "drop_in",
  "focus_settle",
  "pop",
  "spring_pop",
  "rotate_in",
  "word_fade",
  "word_rise",
  "word_pop",
  "type_on",
] as const;

/** Text-only: letters appear one at a time, in place, as if typed. Pictures cannot type. */
export const TEXT_ONLY_ANIMATION_PRESETS = new Set<string>(["type_on"]);

/** How many characters of `text` a type_on entrance shows at `progress` (0–1). */
export function typedCharacterCount(text: string, progress: number) {
  const characters = Array.from(text).length;
  return Math.max(0, Math.min(characters, Math.floor(Math.max(0, Math.min(1, progress)) * characters + 1e-9)));
}

/**
 * Per-word kinetic entrances: the caption's words arrive individually with a
 * stagger instead of the whole block moving as one. Caption-only — the
 * renderer splits text with captionRenderParts (the same split active-word
 * coloring uses) and drives each word from the block's in-progress.
 */
export const WORD_ANIMATION_PRESETS = new Set<string>(["word_fade", "word_rise", "word_pop"]);

export function isWordAnimationPreset(preset: string): boolean {
  return WORD_ANIMATION_PRESETS.has(preset);
}

export type AnimationPreset = (typeof ANIMATION_PRESETS)[number];

export const DROP_IN_EASING_BEZIER = [0.22, 1, 0.36, 1] as const;

function cubicBezierCoordinate(t: number, p1: number, p2: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * p1
    + 3 * inverse * t * t * p2
    + t * t * t;
}

function cubicBezierYAtX(x: number, bezier: readonly [number, number, number, number]) {
  const [x1, y1, x2, y2] = bezier;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (cubicBezierCoordinate(midpoint, x1, x2) < x) low = midpoint;
    else high = midpoint;
  }
  return cubicBezierCoordinate((low + high) / 2, y1, y2);
}

export function resolveDiscretePeakVelocityOffsetSeconds({
  durationSeconds,
  fps,
  bezier = DROP_IN_EASING_BEZIER,
}: {
  durationSeconds: number;
  fps: number;
  bezier?: readonly [number, number, number, number];
}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(fps) || fps <= 0) return 0;
  const frameCount = Math.max(1, Math.round(durationSeconds * fps));
  let peakInterval = 1;
  let peakDistance = Number.NEGATIVE_INFINITY;
  let previous = cubicBezierYAtX(0, bezier);
  for (let frame = 1; frame <= frameCount; frame += 1) {
    const current = cubicBezierYAtX(frame / frameCount, bezier);
    const distance = Math.abs(current - previous);
    if (distance > peakDistance) {
      peakDistance = distance;
      peakInterval = frame;
    }
    previous = current;
  }
  return (peakInterval - 0.5) / fps;
}

const AUDIO_ELEMENT_TYPES = new Set([
  "vo_segment",
  "vo_full",
  "music",
  "sound_effect",
]);

export function isAnimationPreset(value: unknown): value is AnimationPreset {
  return typeof value === "string" && ANIMATION_PRESETS.includes(value as AnimationPreset);
}

export function isAudioElementType(type: string): boolean {
  return AUDIO_ELEMENT_TYPES.has(type);
}

export function presetsForElementType(type: string): readonly AnimationPreset[] {
  if (AUDIO_ELEMENT_TYPES.has(type)) return [];
  // Shapes animate through keyframes (position, scale, rotation, opacity, draw); of the block presets
  // they only fade in and out (shapes.ts SHAPE_ANIMATION_PRESETS).
  if (type === "shape") return ["none", "fade"];
  // Word entrances need splittable text; visual media animates as a block.
  if (type !== "caption_text") return ANIMATION_PRESETS.filter((preset) => !WORD_ANIMATION_PRESETS.has(preset) && !TEXT_ONLY_ANIMATION_PRESETS.has(preset) && preset !== "handwriting");
  return ANIMATION_PRESETS;
}

/** Fraction of a word's window that elapses before the next word starts. */
const WORD_STAGGER = 0.35;

/** easeOutBack: 0 → slight overshoot (~1.1) → 1. The classic pop curve. */
function easeOutBack(progress: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const shifted = progress - 1;
  return 1 + c3 * shifted * shifted * shifted + c1 * shifted * shifted;
}

export type WordEntranceStyle = {
  opacity: number;
  /** Em-based so the motion scales with the font, not the canvas. */
  translateYEm: number;
  scale: number;
};

/**
 * Style for one word at block-entrance `progress` (0..1). Words share the
 * window with a stagger: word i starts when word i−1 is WORD_STAGGER done, and
 * every word completes exactly at progress 1, so the settled frame is
 * identical to the un-animated caption.
 */
export function wordEntranceStyle(
  preset: AnimationPreset,
  progress: number,
  wordIndex: number,
  wordCount: number,
): WordEntranceStyle {
  const clamped = Math.min(1, Math.max(0, progress));
  const count = Math.max(1, wordCount);
  const total = 1 + WORD_STAGGER * (count - 1);
  const local = Math.min(1, Math.max(0, clamped * total - WORD_STAGGER * wordIndex));
  const settled = cubicBezierYAtX(local, DROP_IN_EASING_BEZIER);
  switch (preset) {
    case "word_rise":
      return { opacity: local, translateYEm: (1 - settled) * 0.55, scale: 1 };
    case "word_pop":
      return { opacity: Math.min(1, local * 2.5), translateYEm: 0, scale: Math.max(0, easeOutBack(local)) };
    case "word_fade":
    default:
      return { opacity: settled, translateYEm: 0, scale: 1 };
  }
}

export type ElementAnimationProps = {
  animationIn: AnimationPreset;
  animationOut: AnimationPreset;
  animationInDuration: number;
  animationOutDuration: number;
};

export const DEFAULT_ELEMENT_ANIMATION: ElementAnimationProps = {
  animationIn: "none",
  animationOut: "none",
  animationInDuration: 0.25,
  animationOutDuration: 0.25,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function resolveAnimationProps(
  props: Record<string, unknown> | null | undefined,
): ElementAnimationProps {
  return {
    animationIn: isAnimationPreset(props?.animationIn) ? props.animationIn : DEFAULT_ELEMENT_ANIMATION.animationIn,
    animationOut: isAnimationPreset(props?.animationOut) ? props.animationOut : DEFAULT_ELEMENT_ANIMATION.animationOut,
    animationInDuration: clamp(
      asFiniteNumber(props?.animationInDuration, DEFAULT_ELEMENT_ANIMATION.animationInDuration),
      0,
      props?.animationIn === "handwriting" ? 60 : 2,
    ),
    animationOutDuration: clamp(
      asFiniteNumber(props?.animationOutDuration, DEFAULT_ELEMENT_ANIMATION.animationOutDuration),
      0,
      props?.animationOut === "handwriting" ? 60 : 2,
    ),
  };
}
