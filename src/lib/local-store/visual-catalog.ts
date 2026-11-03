import fs from "node:fs";
import path from "node:path";

import { visualCatalogSchema, type VisualCatalog } from "@/lib/visual-catalog/schema";
import {
  isPersonalCatalogFile, mergePersonalEntries, personalCatalogFile, personalLibraryCatalogPath,
  personalLibraryFilesRoot, readPersonalCatalogJson, resolvePersonalLibraryFile,
} from "./personal-library";
import { profileDir } from "./profile-dir";

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

/** Shared catalog clips downloaded from DreamCut Cloud (see visual-catalog-cloud.ts). */
export function visualCloudCacheRoot(): string {
  return path.join(profileDir(), "cache", "visual-catalog");
}

function insideRoot(root: string, relativeFile: string): string {
  const candidate = path.resolve(root, relativeFile);
  if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error("Invalid visual catalog file path"), { status: 400 });
  return candidate;
}

/** Where a shared catalog file is (or would be) cached; refuses paths outside the cache. */
export function visualCloudCachePath(relativeFile: string): string {
  return insideRoot(path.resolve(visualCloudCacheRoot()), relativeFile);
}

/** The shared catalog file in this checkout's media folder, whether or not it exists. */
export function visualCatalogCheckoutPath(relativeFile: string): string {
  return insideRoot(path.resolve(visualCatalogRoot(), "media"), relativeFile);
}

/** The directory a catalog file must stay inside: personal library, this checkout, or the Cloud cache. */
export function visualCatalogMediaRoot(relativeFile: string): string {
  if (isPersonalCatalogFile(relativeFile)) return personalLibraryFilesRoot("visuals");
  const checkoutRoot = path.resolve(visualCatalogRoot(), "media");
  // A path that escapes the catalog keeps the checkout root, so the caller's confinement check refuses it.
  let downloaded = false;
  try { downloaded = !fs.existsSync(visualCatalogCheckoutPath(relativeFile)) && fs.existsSync(visualCloudCachePath(relativeFile)); } catch { /* escapes */ }
  return downloaded ? path.resolve(visualCloudCacheRoot()) : checkoutRoot;
}

/** A catalog file on disk: personal library, this checkout's copy, else the DreamCut Cloud cache (which may not hold it yet). */
export function resolveVisualCatalogFile(relativeFile: string): string {
  if (isPersonalCatalogFile(relativeFile)) return resolvePersonalLibraryFile("visuals", relativeFile);
  const checkout = visualCatalogCheckoutPath(relativeFile);
  return fs.existsSync(checkout) ? checkout : visualCloudCachePath(relativeFile);
}

export function visualCatalogFileExists(relativeFile: string): boolean {
  try { return fs.statSync(resolveVisualCatalogFile(relativeFile)).isFile(); } catch { return false; }
}

/** Whether the Library can offer an entry: shared ones download from DreamCut Cloud on first use; personal ones must be here. */
export function visualCatalogEntryAvailable(entry: { file: string; personal?: boolean }): boolean {
  return !entry.personal || visualCatalogFileExists(entry.file);
}
