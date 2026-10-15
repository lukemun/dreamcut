import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/);
const stringListSchema = z.array(z.string().trim().min(1).max(300)).max(32);

const annotationSourceSchema = z.object({
  label: z.string().trim().min(1).max(240),
  url: z.string().url(),
  kind: z.enum(["asset_page", "cultural_reference", "original_source"]),
});

const chromaKeyAlphaDerivationSchema = z.object({
  kind: z.literal("chroma_key_alpha_v1"),
  source_file: z.string().trim().min(1).max(500),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  created_at: z.string().datetime(),
  recipe: z.object({
    key_color: z.string().regex(/^#[a-f0-9]{6}$/),
    similarity: z.number().finite().min(0).max(1),
    blend: z.number().finite().min(0).max(1),
    dilation_passes: z.number().int().min(0).max(8),
    erosion_passes: z.number().int().min(0).max(8),
    blur_sigma: z.number().finite().min(0).max(10),
    output_codec: z.string().trim().min(1).max(80),
    output_pixel_format: z.string().trim().min(1).max(80),
  }),
});

export const visualCatalogAnnotationSchema = z.object({
  meaning: z.string().trim().min(1).max(1200),
  use_cases: stringListSchema.min(1).max(8),
  tone: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  template_structure: z.string().trim().min(1).max(1200),
  cultural_context: z.string().trim().min(1).max(1600),
  avoid_when: stringListSchema.max(8),
  tags: z.array(z.string().trim().min(1).max(80)).min(1).max(32),
  confidence: z.enum(["high", "medium", "low"]),
  sources: z.array(annotationSourceSchema).min(1).max(8),
});

export const visualCatalogEntrySchema = z.object({
  id: idSchema,
  /** Set only on entries merged from the creator's profile library; never stored in a tracked catalog. */
  personal: z.boolean().optional(),
  type: z.enum(["still", "video_clip"]),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(1200),
  file: z.string().trim().min(1).max(500),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration_seconds: z.number().finite().gt(0).nullable().default(null),
  has_alpha_channel: z.boolean().default(false),
  derivation: chromaKeyAlphaDerivationSchema.optional(),
  source: z.object({
    provider: z.string().trim().min(1).max(120),
    asset_url: z.string().url(),
    creator: z.string().trim().min(1).max(240).optional(),
    creator_url: z.string().url().optional(),
    license_name: z.string().trim().min(1).max(160),
    license_url: z.string().url(),
    source_status: z.enum(["owned", "licensed", "public_domain", "reference_only"]),
    acquired_at: z.string().datetime(),
    acquisition_notes: z.string().trim().min(1).max(800),
  }),
  annotation: visualCatalogAnnotationSchema,
}).superRefine((entry, context) => {
  if (entry.type === "video_clip" && entry.duration_seconds == null) {
    context.addIssue({ code: "custom", path: ["duration_seconds"], message: "Videos require duration_seconds" });
  }
  if (entry.type === "still" && entry.duration_seconds != null) {
    context.addIssue({ code: "custom", path: ["duration_seconds"], message: "Stills cannot declare duration_seconds" });
  }
  if (entry.derivation?.kind === "chroma_key_alpha_v1" && !entry.has_alpha_channel) {
    context.addIssue({ code: "custom", path: ["has_alpha_channel"], message: "Chroma-key alpha derivatives must declare an alpha channel" });
  }
});

export const visualCatalogSchema = z.object({
  schema_version: z.literal(1),
  assets: z.array(visualCatalogEntrySchema).default([]),
}).superRefine((catalog, context) => {
  const ids = new Set<string>();
  const files = new Set<string>();
  for (const [index, asset] of catalog.assets.entries()) {
    if (ids.has(asset.id)) context.addIssue({ code: "custom", path: ["assets", index, "id"], message: "Visual catalog ids must be unique" });
    if (files.has(asset.file)) context.addIssue({ code: "custom", path: ["assets", index, "file"], message: "Visual catalog files must be unique" });
    ids.add(asset.id);
    files.add(asset.file);
    const expectedPrefix = asset.source.source_status === "public_domain"
      ? "public-domain/"
      : `${asset.source.source_status}/`;
    if (!asset.file.startsWith(expectedPrefix)) {
      context.addIssue({ code: "custom", path: ["assets", index, "file"], message: `File path must start with ${expectedPrefix}` });
    }
  }
});

export type VisualCatalog = z.infer<typeof visualCatalogSchema>;
export type VisualCatalogEntry = z.infer<typeof visualCatalogEntrySchema>;
