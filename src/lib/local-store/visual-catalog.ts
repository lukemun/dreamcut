import fs from "node:fs";
import path from "node:path";

import { visualCatalogSchema, type VisualCatalog } from "@/lib/visual-catalog/schema";
import {
  isPersonalCatalogFile, mergePersonalEntries, personalCatalogFile, personalLibraryCatalogPath,
  personalLibraryFilesRoot, readPersonalCatalogJson, resolvePersonalLibraryFile,
} from "./personal-library";

export function visualCatalogRoot(): string {
  const fromEnv = process.env.TIMELINE_VISUAL_CATALOG_DIR?.trim();
  return fromEnv && fromEnv.length > 0
    ? path.resolve(fromEnv)
    : path.resolve(process.cwd(), "catalogs/visual");
}

export function visualCatalogPath(): string {
  return path.join(visualCatalogRoot(), "catalog.json");
}

function parseVisualCatalog(raw: unknown, catalogPath: string): VisualCatalog {
  const parsed = visualCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid visual catalog at ${catalogPath}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return parsed.data;
}

/** The shared catalog only (the repository's or TIMELINE_VISUAL_CATALOG_DIR's). */
export function readSharedVisualCatalog(): VisualCatalog {
  const catalogPath = visualCatalogPath();
  if (!fs.existsSync(catalogPath)) return { schema_version: 1, assets: [] };
  return parseVisualCatalog(JSON.parse(fs.readFileSync(catalogPath, "utf8")), catalogPath);
}

/** The creator's personal stills and clips, marked personal, with files under `_personal/`. */
export function readPersonalVisualCatalog(): VisualCatalog {
  const raw = readPersonalCatalogJson("visuals");
  if (raw === null) return { schema_version: 1, assets: [] };
  const catalog = parseVisualCatalog(raw, personalLibraryCatalogPath("visuals"));
  return { ...catalog, assets: catalog.assets.map((asset) => ({ ...asset, personal: true, file: personalCatalogFile(asset.file) })) };
}

/** Shared catalog plus the creator's personal library. */
export function readVisualCatalog(): VisualCatalog {
  return { schema_version: 1, assets: mergePersonalEntries(readSharedVisualCatalog().assets, readPersonalVisualCatalog().assets) };
}

/** The directory a catalog file must stay inside. */
export function visualCatalogMediaRoot(relativeFile: string): string {
  return isPersonalCatalogFile(relativeFile) ? personalLibraryFilesRoot("visuals") : path.resolve(visualCatalogRoot(), "media");
}

export function resolveVisualCatalogFile(relativeFile: string): string {
  if (isPersonalCatalogFile(relativeFile)) return resolvePersonalLibraryFile("visuals", relativeFile);
  const mediaRoot = path.resolve(visualCatalogRoot(), "media");
  const candidate = path.resolve(mediaRoot, relativeFile);
  if (candidate === mediaRoot || !candidate.startsWith(`${mediaRoot}${path.sep}`)) {
    throw new Error("Invalid visual catalog file path");
  }
  return candidate;
}

export function visualCatalogFileExists(relativeFile: string): boolean {
  try { return fs.statSync(resolveVisualCatalogFile(relativeFile)).isFile(); } catch { return false; }
}
