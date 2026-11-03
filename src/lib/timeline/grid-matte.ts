import { z } from "zod";

/** Prepared grayscale keep masks, on the unchanged original source clock. */
export const gridMatteMaskSchema = z.object({
  source_url: z.string().startsWith('/api/projects/'),
  source_start_seconds: z.number().finite().nonnegative(),
  fps: z.number().finite().positive().max(120),
  frame_count: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive(),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type GridMatteMask = z.infer<typeof gridMatteMaskSchema>;
export const GRID_MATTE_DEFAULTS = { grid_matte_cell_size: 90, grid_matte_coverage: 1, grid_matte_line_opacity: 0.25, grid_matte_line_width: 1 };
export type GridMatteField = keyof typeof GRID_MATTE_DEFAULTS;
export const GRID_MATTE_FIELDS = Object.keys(GRID_MATTE_DEFAULTS) as GridMatteField[];
export const GRID_MATTE_RANGES: Record<GridMatteField, [number, number]> = {
  grid_matte_cell_size: [0, 360], grid_matte_coverage: [0, 4], grid_matte_line_opacity: [0, 1], grid_matte_line_width: [0, 8],
};
export function normalizeGridMatte(field: GridMatteField, value: unknown) {
  const n = Number(value), [min,max] = GRID_MATTE_RANGES[field];
  const bounded = Math.max(min, Math.min(max, Number.isFinite(n) ? n : GRID_MATTE_DEFAULTS[field]));
  // Zero disables the effect; positive sizes must keep live SVG work bounded.
  return field === "grid_matte_cell_size" && bounded > 0 ? Math.max(24, bounded) : bounded;
}
export function gridMatteFrameUrl(mask: GridMatteMask, sourceSeconds: number) {
  const relative = sourceSeconds - mask.source_start_seconds;
  if (relative < -1e-5 || relative >= mask.frame_count / mask.fps + 1e-5) throw new Error('Grid matte does not cover this source time. Prepare a longer mask or trim within its handles.');
  const frame = Math.max(0, Math.min(mask.frame_count - 1, Math.floor(relative * mask.fps + 1e-6)));
  return `${mask.source_url}/${String(frame).padStart(5,'0')}.png`;
}
/** Area mean, rather than RGB pixelation: retain sharp picture under fractional cell alpha. */
export function gridMatteCells(rgba: Uint8ClampedArray, width: number, height: number, columns: number, rows: number, coverage: number) {
  const cells: number[] = [];
  for(let y=0;y<rows;y++) for(let x=0;x<columns;x++) {
    const x0=Math.floor(x*width/columns), x1=Math.floor((x+1)*width/columns);
    const y0=Math.floor(y*height/rows), y1=Math.floor((y+1)*height/rows);
    let sum=0;
    for(let yy=y0;yy<y1;yy++) for(let xx=x0;xx<x1;xx++) sum+=rgba[(yy*width+xx)*4]!/255;
    cells.push(Math.min(1,Math.max(0,sum/Math.max(1,(x1-x0)*(y1-y0))*coverage)));
  }
  return cells;
}
