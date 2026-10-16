import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { imageCatalogSchema } from "@/lib/image-catalog/schema";

test("an empty image catalog is valid", () => {
  assert.deepEqual(imageCatalogSchema.parse({ schema_version: 1, images: [] }), { schema_version: 1, images: [] });
});

test("the checked-in image catalog stays schema-valid", () => {
  const catalog = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "catalogs/images/catalog.json"), "utf8"));
  assert.equal(imageCatalogSchema.safeParse(catalog).success, true);
});

test("reference-only images are refused from the production catalog", () => {
  const catalog = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "catalogs/images/catalog.json"), "utf8"));
  catalog.images[0].source.source_status = "reference_only";
  assert.equal(imageCatalogSchema.safeParse(catalog).success, false);
});

test("rights status must agree with the catalog folder", () => {
  const catalog = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "catalogs/images/catalog.json"), "utf8"));
  catalog.images[0].source.source_status = "owned";
  assert.equal(imageCatalogSchema.safeParse(catalog).success, false);
});
