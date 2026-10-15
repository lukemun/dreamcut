import { z } from "zod";

const unit = z.number().finite().min(0).max(1);
const bounds = z.tuple([unit, unit, unit, unit]).refine(
  ([x0, y0, x1, y1]) => x1 > x0 && y1 > y0, "Glyph bounds must have positive area",
);
const state = z.object({
  start_frame: z.number().int().nonnegative(),
  end_frame: z.number().int().positive(),
  start_pts: z.number().nonnegative(),
  end_pts: z.number().positive(),
  text: z.string().min(1),
  font: z.object({ family: z.string().nullable(), class: z.string(), weight: z.string(), width: z.string(), case: z.string(), treatment: z.string() }).strict(),
  fill: z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i), method: z.string() }).strict(),
  effects: z.array(z.string()),
  glyph_bounds: bounds.nullable(),
  glyph_height_ratio: unit.nullable(),
  ink_area_ratio: unit.nullable(),
  tracking: z.string().nullable(),
  line_spacing: z.string().nullable(),
  rotation: z.number().finite().nullable(),
  measurement_method: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  limitations: z.array(z.string()),
  evidence: z.array(z.string()).min(1),
}).strict().refine(s => s.end_frame > s.start_frame && s.end_pts > s.start_pts, "State must have a positive interval");

/** Offline reference evidence; does not mutate a timeline or claim exact font identity. */
export const referenceTypographySchema = z.object({
  schema_version: z.literal(1),
  source: z.object({file:z.string(), sha256:z.string().regex(/^[a-f0-9]{64}$/), width:z.number().int().positive(), height:z.number().int().positive(), fps:z.number().positive(), frame_manifest:z.string(), convention:z.string()}).strict(),
  coverage: z.object({intervals:z.array(z.tuple([z.number().int().nonnegative(),z.number().int().positive()])), continuous_playback:z.boolean(), limitations:z.array(z.string())}).strict(),
  elements: z.array(z.object({id:z.string(), role:z.string(), alignment:z.string(), layering:z.string(), states:z.array(state).min(1)}).strict()).min(1),
  relationships: z.array(z.object({description:z.string(), evidence:z.array(z.string()), certainty:z.enum(["observed","inferred"])}).strict()),
  reconstruction: z.array(z.object({source_element:z.string(), source_start_frame:z.number().int(), font_preset:z.string(), text:z.string(), font_size_px:z.number().positive(), anchor:z.tuple([unit,unit]), differences:z.array(z.string())}).strict()),
}).strict().superRefine((record, context) => {
  for (const [index, element] of record.elements.entries()) {
    for (let i = 1; i < element.states.length; i++) {
      if (element.states[i].start_frame < element.states[i - 1].end_frame) context.addIssue({code:"custom",path:["elements",index,"states",i],message:"States for one text track must be ordered and non-overlapping"});
    }
  }
});
