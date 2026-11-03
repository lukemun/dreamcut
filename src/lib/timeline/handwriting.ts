import script from './handwriting/script.json';

export type PenStroke = { d: string; length: number; start: number; x: number; y: number };
export type PenFallback = { text: string; x: number; y: number; start: number };
const glyphs = script as Record<string, { d: string; o: number }>;
const PEN_LIFT = 3;
export const HANDWRITING_LINE_HEIGHT = 32;

/** Stroke fonts contain pen trajectories, not the outlines of filled letters. */
export function handwritingUnsupported(text: string): string[] {
  return [...new Set([...text].filter(c => !/\s/.test(c) && !glyphs[c]))];
}

export function layoutHandwriting(text: string, maxWidth = Infinity, align: 'left' | 'center' | 'right' = 'left') {
  const strokes: PenStroke[] = [];
  const fallback: PenFallback[] = [];
  const lines: { from: number; fallbackFrom: number; width: number }[] = [];
  let x = 0, y = 0, clock = 0, from = 0, fallbackFrom = 0;
  const finishLine = () => {
    lines.push({ from, fallbackFrom, width: x });
    from = strokes.length; fallbackFrom = fallback.length; x = 0; y += HANDWRITING_LINE_HEIGHT;
  };
  for (const c of [...text]) {
    if (c === '\n') { finishLine(); continue; }
    const glyph = glyphs[c];
    const advance = /\s/.test(c) ? 12 : glyph ? glyph.o + 10 : 24;
    if (x && x + advance > maxWidth) finishLine();
    if (/\s/.test(c)) { x += advance; clock += PEN_LIFT * 2; continue; }
    if (!glyph) { fallback.push({ text: c, x, y, start: clock }); clock += 24; x += advance; continue; }
    for (const part of glyph.d.split(/(?=M)/).filter(Boolean)) {
      const coordinates = part.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      let length = 0;
      for (let i = 2; i < coordinates.length; i += 2) length += Math.hypot(coordinates[i] - coordinates[i - 2], coordinates[i + 1] - coordinates[i - 1]);
      if (length > 0) { strokes.push({ d: part, length, start: clock, x, y }); clock += length + PEN_LIFT; }
    }
    x += advance;
  }
  finishLine();
  const width = Math.max(1, ...lines.map(l => l.width)) + 4;
  lines.forEach((line, i) => {
    const shift = align === 'center' ? (width - line.width) / 2 : align === 'right' ? width - line.width : 2;
    for (let j = line.from; j < (lines[i + 1]?.from ?? strokes.length); j++) strokes[j].x += shift;
    for (let j = line.fallbackFrom; j < (lines[i + 1]?.fallbackFrom ?? fallback.length); j++) fallback[j].x += shift;
  });
  return { strokes, fallback, width, height: Math.max(32, y), duration: Math.max(1, clock - PEN_LIFT) };
}

export function penStrokeProgress(stroke: PenStroke, clock: number) {
  if (clock >= stroke.start + stroke.length - 1e-9) return 1;
  return Math.min(1, Math.max(0, (clock - stroke.start) / stroke.length));
}
