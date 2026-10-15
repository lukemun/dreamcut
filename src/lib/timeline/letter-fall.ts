/** Independent glyph clocks, released from both ends of each line toward its
 * center. Every glyph has the same gravitational acceleration; mass does not
 * change gravity. Duration determines virtual scene scale, as with object drop.
 *
 * This module is the single owner of letter-fall timing for every renderer:
 * Standard's LetterFallText and the Browser GPU caption raster both evaluate
 * glyph offsets through `letterFallGlyphOffsetPx`, and GPU raster reuse is keyed
 * by `letterFallRasterElapsed`. */
export type LetterFallOrder = "outside_in" | "left_to_right" | "right_to_left";
export const LETTER_FALL_ORDERS: readonly LetterFallOrder[] = ["outside_in", "left_to_right", "right_to_left"];
export const LETTER_FALL_DEFAULT_SECONDS = .45;
export const LETTER_FALL_DEFAULT_STAGGER_SECONDS = .04;
/** Glyphs stop moving once they are this many canvas heights below rest. */
export const LETTER_FALL_MAX_CANVAS_HEIGHTS = 3;
export const LETTER_FALL_PROPS = ["letter_fall_start_seconds", "letter_fall_seconds", "letter_fall_stagger_seconds", "letter_fall_order"] as const;

export type LetterFallSettings = { start: number; seconds: number; stagger: number; order: LetterFallOrder };

/** Letter fall is active only when its release clock is authored. Defaults match
 * the inspector and agent contract. */
export function readLetterFall(props: Record<string, unknown> | null | undefined): LetterFallSettings | null {
  if (typeof props?.letter_fall_start_seconds !== "number") return null;
  return {
    start: props.letter_fall_start_seconds,
    seconds: Number(props.letter_fall_seconds ?? LETTER_FALL_DEFAULT_SECONDS),
    stagger: Number(props.letter_fall_stagger_seconds ?? LETTER_FALL_DEFAULT_STAGGER_SECONDS),
    order: (props.letter_fall_order ?? "outside_in") as LetterFallOrder,
  };
}

export function letterFallState(index: number, count: number, elapsed: number, seconds: number, stagger: number, order: LetterFallOrder = "outside_in") {
  const ring = order === "left_to_right" ? index : order === "right_to_left" ? count - 1 - index : Math.min(index, count - 1 - index);
  const age = Math.max(0, elapsed - ring * stagger);
  return { releaseSeconds: ring * stagger, yCanvasHeights: (age / seconds) ** 2 };
}

/** Vertical glyph displacement in composition pixels. */
export function letterFallGlyphOffsetPx(state: { yCanvasHeights: number }, canvasHeight: number) {
  return Math.min(LETTER_FALL_MAX_CANVAS_HEIGHTS, state.yCanvasHeights) * canvasHeight;
}

export function letterFallLastRelease(text: string, stagger: number, order: LetterFallOrder = "outside_in") {
  if (order !== "outside_in") return Math.max(0, ...text.split("\n").map(line => Math.max(0,Array.from(line).filter(c=>!/\s/.test(c)).length-1)*stagger));
  return Math.max(0, ...text.split("\n").map(line =>
    Math.floor(Math.max(0, Array.from(line).filter(c => !/\s/.test(c)).length - 1) / 2) * stagger));
}

/** Clip-local time when the final glyph has fallen one canvas height. Agent and
 * inspector timing bounds require this to stay within the text clip. */
export function letterFallFinishSeconds(text: string, fall: LetterFallSettings) {
  return fall.start + letterFallLastRelease(text, fall.stagger, fall.order) + fall.seconds;
}

/** Elapsed fall time after which every glyph sits at its maximum offset. A small
 * margin keeps floating-point residue at the clamp out of the settled state. */
export function letterFallSettledElapsed(text: string, fall: LetterFallSettings) {
  return letterFallLastRelease(text, fall.stagger, fall.order) + fall.seconds * (Math.sqrt(LETTER_FALL_MAX_CANVAS_HEIGHTS) + .01) + 1e-6;
}

/** Fall clock for raster reuse. Pixels are constant before release and after
 * settling, so those spans collapse to one value each; between them every
 * frame is distinct. */
export function letterFallRasterElapsed(text: string, fall: LetterFallSettings, localSeconds: number) {
  return Math.min(letterFallSettledElapsed(text, fall), Math.max(0, localSeconds - fall.start));
}
