import fs from "node:fs";
import path from "node:path";

import { imageCatalogSchema, type ImageCatalog } from "@/lib/image-catalog/schema";
import {
  isPersonalCatalogFile, mergePersonalEntries, personalCatalogFile, personalLibraryCatalogPath,
  personalLibraryFilesRoot, readPersonalCatalogJson, resolvePersonalLibraryFile,
} from "./personal-library";

export function imageCatalogRoot(): string {
  const fromEnv = process.env.TIMELINE_IMAGE_CATALOG_DIR?.trim();
  return fromEnv && fromEnv.length > 0
    ? path.resolve(fromEnv)
    : path.resolve(process.cwd(), "image-catalog");
}

export function imageCatalogPath(): string {
  return path.join(imageCatalogRoot(), "catalog.json");
}

function parseImageCatalog(raw: unknown, catalogPath: string): ImageCatalog {
  const parsed = imageCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid image catalog at ${catalogPath}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return parsed.data;
}

/** The shared catalog only (the repository's or TIMELINE_IMAGE_CATALOG_DIR's). */
export function readSharedImageCatalog(): ImageCatalog {
  const catalogPath = imageCatalogPath();
  if (!fs.existsSync(catalogPath)) return { schema_version: 1, images: [] };
  return parseImageCatalog(JSON.parse(fs.readFileSync(catalogPath, "utf8")), catalogPath);
}

/** The creator's personal images, marked personal, with files under `_personal/`. */
export function readPersonalImageCatalog(): ImageCatalog {
  const raw = readPersonalCatalogJson("images");
  if (raw === null) return { schema_version: 1, images: [] };
  const catalog = parseImageCatalog(raw, personalLibraryCatalogPath("images"));
  return { ...catalog, images: catalog.images.map((image) => ({ ...image, personal: true, file: personalCatalogFile(image.file) })) };
}

/** Shared catalog plus the creator's personal library. */
export function readImageCatalog(): ImageCatalog {
  return { schema_version: 1, images: mergePersonalEntries(readSharedImageCatalog().images, readPersonalImageCatalog().images) };
}

/** The directory a catalog file must stay inside. */
export function imageCatalogMediaRoot(relativeFile: string): string {
  return isPersonalCatalogFile(relativeFile) ? personalLibraryFilesRoot("images") : path.resolve(imageCatalogRoot(), "images");
}

export function resolveImageCatalogFile(relativeFile: string): string {
  if (isPersonalCatalogFile(relativeFile)) return resolvePersonalLibraryFile("images", relativeFile);
  const root = imageCatalogRoot();
  const imageRoot = path.resolve(root, "images");
  const candidate = path.resolve(imageRoot, relativeFile);
  if (candidate === imageRoot || !candidate.startsWith(`${imageRoot}${path.sep}`)) throw new Error("Invalid image catalog file path");
  return candidate;
}

export function imageCatalogFileExists(relativeFile: string): boolean {
  try { return fs.statSync(resolveImageCatalogFile(relativeFile)).isFile(); } catch { return false; }
}
