import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { visualCatalogSchema } from "@/lib/visual-catalog/schema";

test("checked-in visual catalog is valid", () => {
  const catalog = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "catalogs/visual/catalog.json"), "utf8"));
  const parsed = visualCatalogSchema.safeParse(catalog);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const cash = parsed.data.assets.find((asset) => asset.id === "falling-dollar-bills-chroma-key");
  assert.equal(cash?.has_alpha_channel, true);
  assert.equal(cash?.derivation?.kind, "chroma_key_alpha_v1");
  assert.match(cash?.file ?? "", /\.webm$/);
});

test("visual catalog requires duration for videos and rights-matched paths", () => {
  const base = {
    id: "cash-overlay",
    type: "video_clip",
    title: "Cash overlay",
    description: "Falling cash",
    file: "licensed/cash.mp4",
    sha256: "a".repeat(64),
    width: 1920,
    height: 1080,
    duration_seconds: 5,
    has_alpha_channel: false,
    source: {
      provider: "Example",
      asset_url: "https://example.com/asset",
      license_name: "Example license",
      license_url: "https://example.com/license",
      source_status: "licensed",
      acquired_at: "2026-09-16T00:00:00.000Z",
      acquisition_notes: "Fixture",
    },
    annotation: {
      meaning: "Money falls",
      use_cases: ["Celebration"],
      tone: ["playful"],
      template_structure: "Overlay it",
      cultural_context: "Utility overlay",
      avoid_when: [],
      tags: ["cash"],
      confidence: "high",
      sources: [{ label: "Source", url: "https://example.com/asset", kind: "original_source" }],
    },
  };
  assert.equal(visualCatalogSchema.safeParse({ schema_version: 1, assets: [base] }).success, true);
  assert.equal(visualCatalogSchema.safeParse({ schema_version: 1, assets: [{ ...base, duration_seconds: null }] }).success, false);
  assert.equal(visualCatalogSchema.safeParse({ schema_version: 1, assets: [{ ...base, file: "owned/cash.mp4" }] }).success, false);
  assert.equal(visualCatalogSchema.safeParse({
    schema_version: 1,
    assets: [{
      ...base,
      derivation: {
        kind: "chroma_key_alpha_v1",
        source_file: "licensed/cash-source.mp4",
        source_sha256: "b".repeat(64),
        created_at: "2026-09-16T00:00:00.000Z",
        recipe: {
          key_color: "#00ff00",
          similarity: 0.1,
          blend: 0.05,
          dilation_passes: 1,
          erosion_passes: 1,
          blur_sigma: 0.5,
          output_codec: "libvpx-vp9",
          output_pixel_format: "yuva420p",
        },
      },
    }],
  }).success, false);
});
