import { Fragment } from "react";
import { letterFallGlyphOffsetPx, letterFallState, type LetterFallOrder } from "../timeline/letter-fall";

/** Native editable copy; glyphs are separate moving actors, not a raster pass.
 * Inline layout keeps original font, line breaks, alignment and spaces. */
export function LetterFallText({ text, elapsed, seconds, stagger, height, order = "outside_in" }: {
  text: string; elapsed: number; seconds: number; stagger: number; height: number; order?: LetterFallOrder;
}) {
  return <>{text.split("\n").map((line, row) => {
    const glyphs = Array.from(line);
    const count = glyphs.filter(c => !/\s/.test(c)).length;
    let index = 0;
    return <Fragment key={row}>{row > 0 && <br />}{glyphs.map((glyph, column) => {
      if (/\s/.test(glyph)) return <Fragment key={column}>{glyph}</Fragment>;
      const state = letterFallState(index++, count, elapsed, seconds, stagger, order);
      return <span key={column} data-letter-fall="true" style={{ display: "inline-block",
        transform: `translateY(${letterFallGlyphOffsetPx(state, height)}px)` }}>{glyph}</span>;
    })}</Fragment>;
  })}</>;
}
