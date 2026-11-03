import { getHandwritingPack } from '../timeline/handwriting-packs';

export type HandwritingRevealMode = 'saved_strokes' | 'line_mask';
export function lineMaskGuide(fontId: string, character: string, strokeIndex = 0) {
  return getHandwritingPack(fontId, 'line_mask')?.lineStrokes?.[character]?.[strokeIndex];
}

/** A continuous vector nib. Its nib front rotates with the curve's tangent.
 * Progress is evaluated on the composition frame clock, including backwards
 * erasing/seeking. The original filled contour remains the final ink authority.
 */
export function LineHandwritingMask({ fontId, character, progress, strokeIndex=0, maskId="line-region" }: {
  fontId: string; character: string; progress: number; strokeIndex?: number; maskId?: string;
}) {
  const guide = lineMaskGuide(fontId, character, strokeIndex);
  if (!guide || progress <= 0) return null;
  const p = Math.max(0, Math.min(1, progress));
  const total = guide.segments.reduce((n, s) => n + s.length, 0);
  let start = 0;
  return <>
    {guide.region ? <defs><clipPath id={maskId}><path d={guide.region}/></clipPath></defs> : null}
    <g clipPath={guide.region ? `url(#${maskId})` : undefined}>{guide.segments.map((segment, index) => {
    const local = Math.max(0, Math.min(1, (p * total - start) / segment.length));
    start += segment.length;
    return local > 0 ? <path key={index} data-line-mask d={segment.d} fill="none" stroke="white"
      strokeWidth={segment.width} strokeLinecap="round" strokeLinejoin="round"
      pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - local} /> : null;
  })}</g></>;
}
