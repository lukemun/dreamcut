import { z } from "zod";

/** Identical recipes on separate actors keep their layout rigid and editable. */
export const spiralGroupSchema = z.object({
  origin_x: z.number().finite().min(0).max(1),
  origin_y: z.number().finite().min(0).max(1),
  start_seconds: z.number().finite().min(0),
  duration_seconds: z.number().finite().positive().max(60),
  turns: z.number().finite().min(-8).max(8),
}).strict();
export type SpiralGroup = z.infer<typeof spiralGroupSchema>;

export function spiralGroupTransform(recipe: SpiralGroup, seconds: number, width: number, height: number) {
  const p = Math.min(1, Math.max(0, (seconds - recipe.start_seconds) / recipe.duration_seconds));
  const a = p * Math.PI * 2 * recipe.turns;
  const x = recipe.origin_x - .5, y = recipe.origin_y - .5;
  const c = Math.cos(a), s = Math.sin(a), r = 1 - p;
  const px = r * (x * c - y * s), py = r * (x * s + y * c);
  // Normal to the actual screen-space path, with a short roll-in from the label's resting pose.
  const w = Math.PI * 2 * recipe.turns;
  const dx = -(x*c-y*s) + r*w*(-x*s-y*c);
  const dy = -(x*s+y*c) + r*w*(x*c-y*s);
  const raw = Math.atan2(dy*height, dx*width) + Math.PI/2;
  const reference = a + Math.atan2(y*height, x*width) + Math.PI;
  let angle = raw + Math.round((reference-raw)/(2*Math.PI))*2*Math.PI;
  const initialRaw = Math.atan2((-y+w*x)*height, (-x-w*y)*width)+Math.PI/2;
  const initialRef = Math.atan2(y*height,x*width)+Math.PI;
  const initial = initialRaw + Math.round((initialRef-initialRaw)/(2*Math.PI))*2*Math.PI;
  const blend = Math.min(1,p/.1); const smooth = blend*blend*(3-2*blend);
  const halfTurns = Math.round(initial / Math.PI) * Math.PI;
  angle -= halfTurns + (initial-halfTurns)*(1-smooth);
  return {
    x: (px-x)*width, y:(py-y)*height, scale: r,
    rotation: p === 0 ? 0 : angle*180/Math.PI,
  };
}
