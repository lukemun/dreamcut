/**
 * A motion that repeats for as long as an element is on screen: a sway, a float, a pulse or a
 * shake. It is a general block: captions and media clips read it the same way, and a caption can
 * run it per word with each word a little behind the one before. Off by default.
 */
export type LoopMotion = "none" | "sway" | "float" | "pulse" | "shake";

export type LoopMotionProps = {
  loopMotion: LoopMotion;
  /** How strong the motion is, 0..1. */
  loopMotionAmount: number;
  /** Seconds per cycle. */
  loopMotionSeconds: number;
  /** Captions: each word moves on its own, a little behind the word before it. */
  loopMotionPerWord: boolean;
};

export const LOOP_MOTION_KEYS = ["loopMotion", "loopMotionAmount", "loopMotionSeconds", "loopMotionPerWord"] as const satisfies readonly (keyof LoopMotionProps)[];

export const DEFAULT_LOOP_MOTION: LoopMotionProps = {
  loopMotion: "none",
  loopMotionAmount: 0.5,
  loopMotionSeconds: 1.6,
  loopMotionPerWord: false,
};

const LOOP_MOTIONS: readonly LoopMotion[] = ["none", "sway", "float", "pulse", "shake"];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function resolveLoopMotion(raw: Record<string, unknown> | null | undefined): LoopMotionProps {
  const motion = raw?.loopMotion;
  return {
    loopMotion: LOOP_MOTIONS.includes(motion as LoopMotion) ? motion as LoopMotion : "none",
    loopMotionAmount: clamp(finite(raw?.loopMotionAmount, DEFAULT_LOOP_MOTION.loopMotionAmount), 0, 1),
    loopMotionSeconds: clamp(finite(raw?.loopMotionSeconds, DEFAULT_LOOP_MOTION.loopMotionSeconds), 0.2, 8),
    loopMotionPerWord: raw?.loopMotionPerWord === true,
  };
}

export type LoopMotionFrame = { translateX: number; translateY: number; scale: number; rotateZDeg: number };

export const NO_LOOP_MOTION: LoopMotionFrame = { translateX: 0, translateY: 0, scale: 1, rotateZDeg: 0 };

/** Share of a cycle each caption word trails the word before it. */
export const LOOP_WORD_PHASE = 0.18;

const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * The loop's offset at `seconds` since the element started. Distances scale with `size` (the
 * frame height for a whole element, the font size for a word), so the motion reads the same at
 * any resolution. `phase` (in cycles) offsets per-word motion.
 */
export function loopMotionFrame(loop: LoopMotionProps, seconds: number, size: number, phase = 0): LoopMotionFrame {
  if (loop.loopMotion === "none" || loop.loopMotionAmount <= 0) return NO_LOOP_MOTION;
  const amount = loop.loopMotionAmount;
  const angle = 2 * Math.PI * (seconds / loop.loopMotionSeconds - phase);
  switch (loop.loopMotion) {
    case "sway":
      return { translateX: round(Math.sin(angle) * 0.006 * size * amount), translateY: 0, scale: 1, rotateZDeg: round(Math.sin(angle) * 6 * amount) };
    case "float":
      return { translateX: 0, translateY: round(-Math.sin(angle) * 0.012 * size * amount), scale: 1, rotateZDeg: 0 };
    case "pulse":
      return { translateX: 0, translateY: 0, scale: round(1 + 0.06 * amount * (0.5 - 0.5 * Math.cos(angle))), rotateZDeg: 0 };
    case "shake": {
      // Mixed whole harmonics: an irregular jitter inside each cycle that repeats exactly per cycle.
      const x = Math.sin(angle * 4) * 0.6 + Math.sin(angle * 7 + 1.1) * 0.4;
      const y = Math.sin(angle * 5 + 0.4) * 0.6 + Math.sin(angle * 9 + 2.3) * 0.4;
      return { translateX: round(x * 0.008 * size * amount), translateY: round(y * 0.006 * size * amount), scale: 1, rotateZDeg: round(Math.sin(angle * 3 + 0.7) * 2 * amount) };
    }
    default:
      return NO_LOOP_MOTION;
  }
}

/** The whole element moves (a caption with per-word loop moves its words instead). */
export function elementLoopMotionFrame(raw: Record<string, unknown> | null | undefined, seconds: number, height: number): LoopMotionFrame {
  const loop = resolveLoopMotion(raw);
  return loop.loopMotionPerWord ? NO_LOOP_MOTION : loopMotionFrame(loop, seconds, height);
}

/** CSS transform for one caption word's loop, in em so it follows the word's size. */
export function wordLoopTransform(loop: LoopMotionProps, seconds: number, wordIndex: number): string | null {
  if (!loop.loopMotionPerWord || loop.loopMotion === "none" || loop.loopMotionAmount <= 0) return null;
  // Word distances read at the word's size; 1em stands in for the size and scales ×8 so the same
  // amount reads about as strongly on one word as on a whole block.
  const frame = loopMotionFrame(loop, seconds, 8, wordIndex * LOOP_WORD_PHASE);
  return `translate(${frame.translateX}em, ${frame.translateY}em) rotate(${frame.rotateZDeg}deg) scale(${frame.scale})`;
}
