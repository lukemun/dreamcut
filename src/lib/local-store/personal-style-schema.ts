/** Saved template (personal style) records, shared by the local store and cloud style sync. */
import { z } from "zod";

const scalar = z.union([z.string().min(1).max(1000), z.number().finite(), z.boolean()]);
export const styleBundleSchema = z.object({
  skill: z.string().regex(/^[a-z0-9-]+$/), recipe_id: z.string().optional(),
  parameters: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/), scalar),
}).strict();
export const styleInputSchema = z.object({
  name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000),
  bundles: z.array(styleBundleSchema).min(1).max(30),
  authorization: z.object({ kind: z.literal("explicit_request"), instruction: z.string().trim().min(1).max(2000) }).strict(),
}).strict();
export const personalStyleSchema = styleInputSchema.extend({
  schema_version: z.literal(1), id: z.string().uuid(), revision: z.number().int().positive(),
  created_at: z.string().datetime(), updated_at: z.string().datetime(),
  source_edit: z.object({ project_id: z.string(), title: z.string(), timeline_revision: z.string() }).strict(),
}).strict();
export type PersonalStyle = z.infer<typeof personalStyleSchema>;
