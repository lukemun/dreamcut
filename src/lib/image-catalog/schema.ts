import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/);
const normalizedRectSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().gt(0).max(1),
  height: z.number().finite().gt(0).max(1),
});

export const imageCatalogSourceSchema = z.object({
  provider: z.string().trim().min(1).max(120),
  asset_url: z.string().url(),
  acquisition_url: z.string().url(),
  acquisition_notes: z.string().trim().min(1).max(500),
  creator: z.string().trim().min(1).max(240),
  creator_url: z.string().url().optional(),
  license_name: z.string().trim().min(1).max(120),
  license_url: z.string().url(),
  source_status: z.enum(["owned", "licensed", "public_domain", "reference_only"]),
  downloaded_at: z.string().datetime(),
});

const imageZoneSchema = z.object({
  id: z.enum(["top_left", "top_center", "top_right", "middle_left", "middle_center", "middle_right", "bottom_left", "bottom_center", "bottom_right"]),
  rect: normalizedRectSchema,
  luminance: z.number().finite().min(0).max(1),
  contrast: z.number().finite().min(0).max(1),
  edge_density: z.number().finite().min(0).max(1),
  saturation: z.number().finite().min(0).max(1),
  low_variation_score: z.number().finite().min(0).max(1),
});

const lowVariationRegionSchema = z.object({
  zone: imageZoneSchema.shape.id,
  rect: normalizedRectSchema,
  score: z.number().finite().min(0).max(1),
  evidence: z.string().trim().min(1).max(300),
});

export const imageCatalogEntrySchema = z.object({
  id: idSchema,
  /** Set only on entries merged from the creator's profile library; never stored in a tracked catalog. */
  personal: z.boolean().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(1200),
  file: z.string().trim().min(1).max(500),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  aspect_ratio: z.string().trim().min(1).max(32),
  orientation: z.enum(["landscape", "portrait", "square"]),
  source: imageCatalogSourceSchema,
  layout: z.object({
    visual_weight: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }),
    zones: z.array(imageZoneSchema).length(9),
    low_variation_regions: z.array(lowVariationRegionSchema).max(3),
  }),
  colors: z.object({
    palette_hex: z.array(z.string().regex(/^#[a-fA-F0-9]{6}$/)).min(1).max(8),
    average_luminance: z.number().finite().min(0).max(1),
    contrast: z.number().finite().min(0).max(1),
    saturation: z.number().finite().min(0).max(1),
    warmth: z.number().finite().min(-1).max(1),
    tone: z.enum(["dark", "mid", "light"]),
  }),
  analysis: z.object({
    extract_version: z.string().trim().min(1).max(80),
    derive_version: z.string().trim().min(1).max(80),
    sample_width: z.number().int().positive(),
    sample_height: z.number().int().positive(),
    analyzed_at: z.string().datetime(),
  }),
});

export const imageCatalogSchema = z.object({
  schema_version: z.literal(1),
  images: z.array(imageCatalogEntrySchema).default([]),
}).superRefine((catalog, context) => {
  const ids = new Set<string>();
  for (const [index, image] of catalog.images.entries()) {
    if (ids.has(image.id)) context.addIssue({ code: "custom", path: ["images", index, "id"], message: "Image ids must be unique" });
    ids.add(image.id);
    if (image.source.source_status === "reference_only") {
      context.addIssue({ code: "custom", path: ["images", index, "source", "source_status"], message: "Reference-only images cannot enter the production catalog" });
    }
    const expectedPrefix = image.source.source_status === "public_domain"
      ? "public-domain/"
      : `${image.source.source_status}/`;
    if (!image.file.startsWith(expectedPrefix)) {
      context.addIssue({ code: "custom", path: ["images", index, "file"], message: `File path must start with ${expectedPrefix} for source_status=${image.source.source_status}` });
    }
  }
});

export type ImageCatalog = z.infer<typeof imageCatalogSchema>;
export type ImageCatalogEntry = z.infer<typeof imageCatalogEntrySchema>;
