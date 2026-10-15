import fs from "node:fs";
import path from "node:path";

import { profileDir } from "./profile-dir";

/**
 * The creator's personal media library lives in the profile, outside the repository:
 * `<profile>/library/<kind>/catalog.json` uses the same entry schema as the matching
 * repository catalog, and `<profile>/library/<kind>/files/` holds the managed copies.
 *
 * Catalog loaders merge it into the shared catalog. Merged personal entries carry
 * `personal: true` and a file path under the reserved `_personal/` segment, so every
 * existing media URL and resolver keeps one string identity per file.
 */
export const PERSONAL_LIBRARY_KINDS = ["images", "visuals", "music", "sfx"] as const;
export type PersonalLibraryKind = (typeof PERSONAL_LIBRARY_KINDS)[number];

export const PERSONAL_FILE_PREFIX = "_personal/";

export function personalLibraryDir(): string {
  return path.join(profileDir(), "library");
}

export function personalLibraryRoot(kind: PersonalLibraryKind): string {
  return path.join(personalLibraryDir(), kind);
}

export function personalLibraryCatalogPath(kind: PersonalLibraryKind): string {
  return path.join(personalLibraryRoot(kind), "catalog.json");
}

export function personalLibraryFilesRoot(kind: PersonalLibraryKind): string {
  return path.join(personalLibraryRoot(kind), "files");
}

export function isPersonalCatalogFile(file: string): boolean {
  return /^_personal[\\/]/.test(file);
}

/** The merged-catalog file identity for a path stored relative to the personal files root. */
export function personalCatalogFile(file: string): string {
  return `${PERSONAL_FILE_PREFIX}${file}`;
}

/** Resolves a `_personal/...` catalog file inside the personal files root, refusing escapes. */
export function resolvePersonalLibraryFile(kind: PersonalLibraryKind, file: string): string {
  if (!isPersonalCatalogFile(file)) throw new Error("Not a personal library file");
  const root = path.resolve(personalLibraryFilesRoot(kind));
  const candidate = path.resolve(root, file.slice(PERSONAL_FILE_PREFIX.length));
  if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) throw new Error("Invalid personal library file path");
  return candidate;
}

/** Raw personal catalog JSON, or null when the creator has no personal library of this kind. */
export function readPersonalCatalogJson(kind: PersonalLibraryKind): unknown | null {
  const catalogPath = personalLibraryCatalogPath(kind);
  if (!fs.existsSync(catalogPath)) return null;
  return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

/**
 * Appends personal entries after shared ones. A personal entry whose id is already in the
 * shared catalog is skipped so ids stay unique for every consumer.
 */
export function mergePersonalEntries<T extends { id: string }>(shared: T[], personal: T[]): T[] {
  const ids = new Set(shared.map((entry) => entry.id));
  return [...shared, ...personal.filter((entry) => !ids.has(entry.id))];
}
