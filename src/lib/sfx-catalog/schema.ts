import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/);
const stringListSchema = z.array(z.string().trim().min(1).max(240)).max(32);

export const sfxCatalogEntrySchema = z.object({
  id: idSchema,
  /** Set only on entries merged from the creator's profile library; never stored in a tracked catalog. */
  personal: z.boolean().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(800).optional(),
  category: z.string().trim().min(1).max(80),
  tags: stringListSchema.default([]),
  good_for: stringListSchema.default([]),
  avoid_for: stringListSchema.default([]),
  file: z.string().trim().min(1).max(500),
  source_status: z.enum(["owned", "licensed", "reference_only"]),
  /** Who may use it: everyone (free, the default) or DreamCut members only. */
  access: z.enum(["free", "members"]).optional(),
  duration_seconds: z.number().finite().gt(0),
  sample_rate_hz: z.number().int().positive(),
  channels: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  source_provider: z.string().trim().min(1).max(240),
  source_url: z.string().url(),
  license_url: z.string().url().optional(),
  clearance_note: z.string().trim().min(1).max(800).optional(),
  acquired_at: z.string().date(),
  analysis: z.object({
    version: z.string().trim().min(1).max(80),
    codec: z.string().trim().min(1).max(80),
    integrated_lufs: z.number().finite().optional(),
    true_peak_dbtp: z.number().finite().optional(),
    loudness_range_lu: z.number().finite().min(0).optional(),
    audibility_status: z.enum(["audible", "sparse", "silent", "too_quiet"]).optional(),
    audible_fraction: z.number().finite().min(0).max(1).optional(),
    active_start_seconds: z.number().finite().min(0),
    active_end_seconds: z.number().finite().min(0),
    peak_time_seconds: z.number().finite().min(0),
    peak_position: z.enum(["front", "center", "tail"]),
    spectral_centroid_hz: z.number().finite().min(0),
    analyzed_at: z.string().datetime(),
  }).optional(),
  editorial: z.object({
    motion: z.enum(["in", "out", "in_out", "hit", "rise", "texture", "other"]),
    intensity: z.enum(["light", "medium", "heavy"]),
    texture: stringListSchema.default([]),
  }).optional(),
});

export const sfxCatalogSchema = z.object({
  schema_version: z.literal(1),
  sound_effects: z.array(sfxCatalogEntrySchema).default([]),
}).superRefine((catalog, context) => {
  const ids = new Set<string>();
  const files = new Set<string>();
  for (const [index, effect] of catalog.sound_effects.entries()) {
    if (ids.has(effect.id)) context.addIssue({ code: "custom", path: ["sound_effects", index, "id"], message: "SFX ids must be unique" });
    if (files.has(effect.file)) context.addIssue({ code: "custom", path: ["sound_effects", index, "file"], message: "SFX files must be unique" });
    ids.add(effect.id);
    files.add(effect.file);
    if (!effect.file.startsWith(`${effect.source_status === "reference_only" ? "reference" : effect.source_status}/`)) {
      context.addIssue({ code: "custom", path: ["sound_effects", index, "file"], message: `File path does not match source_status=${effect.source_status}` });
    }
    if (effect.analysis && effect.analysis.active_end_seconds > effect.duration_seconds + 0.05) {
      context.addIssue({ code: "custom", path: ["sound_effects", index, "analysis", "active_end_seconds"], message: "Active range exceeds file duration" });
    }
  }
});

export type SfxCatalog = z.infer<typeof sfxCatalogSchema>;
export type SfxCatalogEntry = z.infer<typeof sfxCatalogEntrySchema>;
