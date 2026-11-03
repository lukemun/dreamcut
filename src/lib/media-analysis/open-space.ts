/**
 * Open space in a frame: the largest clear rectangles inside the safe area once the speaker and any
 * other on-screen elements are set aside, and how much of such a region a piece of text fills.
 * Pure geometry in canvas pixels; the caller supplies what is occupied (see local-store/open-space).
 */

export type Rect = { x: number; y: number; width: number; height: number };
export type OpenRegion = Rect & {
  /** Share of the safe area this region covers. */
  area_fraction: number;
  /** Where the region sits relative to the frame centre. */
  side: "left" | "right" | "top" | "bottom" | "centre";
};

const GRID_COLUMNS = 96;

/**
 * Where a talking head is, from a detected face: the head (a little wider and taller than the face)
 * and the shoulders below it (about 2.7 face-widths across, down to the bottom of the frame). Two
 * blocks rather than one rectangle, so the open wall beside the head stays open. Faces are reliably
 * detected; whole bodies are not.
 */
export function speakerRegionsFromFace(face: Rect, canvas: { width: number; height: number }): Rect[] {
  const cx = face.x + face.width / 2;
  const headTop = Math.max(0, face.y - face.height * 0.35), shouldersTop = Math.min(canvas.height, face.y + face.height * 1.05);
  const head = { x: Math.max(0, cx - face.width * 0.62), y: headTop, width: face.width * 1.24, height: shouldersTop - headTop };
  const left = Math.max(0, cx - face.width * 1.35), right = Math.min(canvas.width, cx + face.width * 1.35);
  return [head, { x: left, y: shouldersTop, width: right - left, height: canvas.height - shouldersTop }];
}

/** How much of an open region emphasis text takes, as a share of the region's width and height. */
export const FILL_LEVELS = { medium: 0.7, large: 0.85, full: 0.95 } as const;
export type FillLevel = keyof typeof FILL_LEVELS;

/**
 * Largest empty axis-aligned rectangles in `safe`, avoiding `occupied` (each grown by `padding` px).
 * Returns up to `limit` regions, largest first, each overlapping earlier picks by at most 25%.
 */
export function findOpenRegions(input: { canvas: { width: number; height: number }; safe: Rect; occupied: Rect[]; padding?: number; limit?: number; minFraction?: number }): OpenRegion[] {
  const { safe } = input, padding = input.padding ?? Math.round(input.canvas.height * 0.03);
  const cell = safe.width / GRID_COLUMNS, rows = Math.max(1, Math.round(safe.height / cell)), cellH = safe.height / rows;
  const blocked = Array.from({ length: rows }, () => new Uint8Array(GRID_COLUMNS));
  for (const box of input.occupied) {
    const x0 = Math.floor((box.x - padding - safe.x) / cell), x1 = Math.ceil((box.x + box.width + padding - safe.x) / cell);
    const y0 = Math.floor((box.y - padding - safe.y) / cellH), y1 = Math.ceil((box.y + box.height + padding - safe.y) / cellH);
    for (let r = Math.max(0, y0); r < Math.min(rows, y1); r++) for (let c = Math.max(0, x0); c < Math.min(GRID_COLUMNS, x1); c++) blocked[r]![c] = 1;
  }
  // Every maximal empty rectangle via the histogram method, keyed by its cells.
  const candidates: Array<{ c0: number; c1: number; r0: number; r1: number; area: number }> = [];
  const heights = new Array<number>(GRID_COLUMNS).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < GRID_COLUMNS; c++) heights[c] = blocked[r]![c] ? 0 : heights[c]! + 1;
    for (let c = 0; c < GRID_COLUMNS; c++) {
      let h = heights[c]!;
      for (let e = c; e < GRID_COLUMNS && h > 0; e++) {
        h = Math.min(h, heights[e]!);
        if (h === 0) break;
        // Keep only rectangles that cannot grow sideways at this height.
        const leftOpen = c > 0 && heights[c - 1]! >= h, rightOpen = e + 1 < GRID_COLUMNS && heights[e + 1]! >= h;
        if (!leftOpen && !rightOpen) candidates.push({ c0: c, c1: e + 1, r0: r - h + 1, r1: r + 1, area: (e + 1 - c) * h });
      }
    }
  }
  candidates.sort((a, b) => b.area - a.area);
  const picked: typeof candidates = [];
  const overlap = (a: typeof candidates[number], b: typeof candidates[number]) =>
    Math.max(0, Math.min(a.c1, b.c1) - Math.max(a.c0, b.c0)) * Math.max(0, Math.min(a.r1, b.r1) - Math.max(a.r0, b.r0));
  const minArea = (input.minFraction ?? 0.04) * GRID_COLUMNS * rows;
  for (const candidate of candidates) {
    if (candidate.area < minArea || picked.length >= (input.limit ?? 3)) break;
    if (picked.some(p => overlap(p, candidate) > 0.25 * candidate.area)) continue;
    picked.push(candidate);
  }
  return picked.map(p => {
    const rect = { x: safe.x + p.c0 * cell, y: safe.y + p.r0 * cellH, width: (p.c1 - p.c0) * cell, height: (p.r1 - p.r0) * cellH };
    const cx = rect.x + rect.width / 2 - input.canvas.width / 2, cy = rect.y + rect.height / 2 - input.canvas.height / 2;
    const side = Math.abs(cx) < input.canvas.width * 0.12 && Math.abs(cy) < input.canvas.height * 0.12 ? "centre"
      : Math.abs(cx) / input.canvas.width >= Math.abs(cy) / input.canvas.height ? (cx < 0 ? "left" : "right") : (cy < 0 ? "top" : "bottom");
    return { ...rect, area_fraction: Number((p.area / (GRID_COLUMNS * rows)).toFixed(4)), side };
  });
}

export type TextFill = {
  /** Share of the region's width the widest line of ink spans. */
  width_fill: number;
  /** Share of the region's height the text block spans. */
  height_fill: number;
  /** The larger of the two: how much of the region the text commands. */
  fill: number;
};

export function textFill(region: Rect, ink: { width: number; height: number }): TextFill {
  const width_fill = ink.width / region.width, height_fill = ink.height / region.height;
  return { width_fill: round3(width_fill), height_fill: round3(height_fill), fill: round3(Math.max(width_fill, height_fill)) };
}

/** Text filling less than this share of its open region in both directions reads as lost in the space. */
export const UNDERFILLED_BELOW = 0.6;

/**
 * Pick the largest measured candidate that fits the region within `target` (0–1) of its width and
 * height. Candidates are the same text measured at different sizes; returns null when none fits.
 */
export function pickFittingSize<T extends { font_size_px: number; ink_width: number; height: number }>(region: Rect, candidates: T[], target: number): T | null {
  const fits = candidates.filter(c => c.ink_width <= region.width * target + 0.5 && c.height <= region.height * target + 0.5);
  return fits.sort((a, b) => b.font_size_px - a.font_size_px)[0] ?? null;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
