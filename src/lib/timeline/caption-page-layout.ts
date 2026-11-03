/**
 * How a caption page sits: tilted a few degrees (each caption leaning its own way, so a run of
 * captions reads hand-placed) and how many words fit on a line before it breaks. Both are read at
 * render time from the caption's own props and id, so a tilt survives re-timing and splitting.
 */
export type CaptionPageTilt = "none" | "lean" | "scatter";

export type CaptionPageLayout = {
  /** lean: each caption tilts left or right by pageTiltDeg; scatter: anywhere in between. */
  pageTilt: CaptionPageTilt;
  /** Most a page tilts, in degrees. */
  pageTiltDeg: number;
  /** Break the line after this many words (0 = wrap by width only). */
  wordsPerLine: number;
};

export const CAPTION_PAGE_LAYOUT_KEYS = ["pageTilt", "pageTiltDeg", "wordsPerLine"] as const satisfies readonly (keyof CaptionPageLayout)[];

export const DEFAULT_CAPTION_PAGE_LAYOUT: CaptionPageLayout = { pageTilt: "none", pageTiltDeg: 4, wordsPerLine: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function resolveCaptionPageLayout(raw: Record<string, unknown> | null | undefined): CaptionPageLayout {
  const tilt = raw?.pageTilt;
  return {
    pageTilt: tilt === "lean" || tilt === "scatter" ? tilt : "none",
    pageTiltDeg: clamp(finite(raw?.pageTiltDeg, DEFAULT_CAPTION_PAGE_LAYOUT.pageTiltDeg), 0, 20),
    wordsPerLine: Math.round(clamp(finite(raw?.wordsPerLine, 0), 0, 12)),
  };
}

/** A stable 0..1 value from a caption's id. */
function idUnit(id: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  // Finish so short ids still spread across the whole range (murmur3 fmix32).
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
}

/** The tilt this caption's page takes, in degrees. */
export function captionPageTiltDeg(layout: Pick<CaptionPageLayout, "pageTilt" | "pageTiltDeg">, elementId: string) {
  if (layout.pageTilt === "none" || layout.pageTiltDeg <= 0) return 0;
  const unit = idUnit(elementId);
  const deg = layout.pageTilt === "lean" ? (unit < 0.5 ? -1 : 1) * layout.pageTiltDeg : (unit * 2 - 1) * layout.pageTiltDeg;
  return Math.round(deg * 100) / 100;
}

/** True when a line break goes before word `wordIndex`. */
export function captionLineBreaksBefore(layout: Pick<CaptionPageLayout, "wordsPerLine">, wordIndex: number) {
  return layout.wordsPerLine > 0 && wordIndex > 0 && wordIndex % layout.wordsPerLine === 0;
}
