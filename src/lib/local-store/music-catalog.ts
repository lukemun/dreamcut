import fs from "node:fs";
import path from "node:path";

import { musicCatalogSchema, type MusicCatalog } from "@/lib/music-catalog/schema";
import {
  isPersonalCatalogFile, mergePersonalEntries, personalCatalogFile, personalLibraryCatalogPath,
  personalLibraryRoot, readPersonalCatalogJson, resolvePersonalLibraryFile,
} from "./personal-library";

export function musicCatalogRoot(): string {
  const fromEnv = process.env.TIMELINE_MUSIC_CATALOG_DIR?.trim();
  return fromEnv && fromEnv.length > 0
    ? path.resolve(fromEnv)
    : path.resolve(process.cwd(), "catalogs/music");
}

export function musicCatalogPath(): string {
  return path.join(musicCatalogRoot(), "catalog.json");
}

function parseMusicCatalog(raw: unknown, catalogPath: string): MusicCatalog {
  const parsed = musicCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid music catalog at ${catalogPath}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return parsed.data;
}

/** The shared catalog only (the repository's or TIMELINE_MUSIC_CATALOG_DIR's). */
export function readSharedMusicCatalog(): MusicCatalog {
  const catalogPath = musicCatalogPath();
  if (!fs.existsSync(catalogPath)) return { schema_version: 1, tracks: [] };
  return parseMusicCatalog(JSON.parse(fs.readFileSync(catalogPath, "utf8")), catalogPath);
}

/** The creator's personal tracks, marked personal, with version files under `_personal/`. */
export function readPersonalMusicCatalog(): MusicCatalog {
  const raw = readPersonalCatalogJson("music");
  if (raw === null) return { schema_version: 1, tracks: [] };
  const catalog = parseMusicCatalog(raw, personalLibraryCatalogPath("music"));
  return {
    ...catalog,
    tracks: catalog.tracks.map((track) => ({
      ...track,
      personal: true,
      versions: track.versions.map((version) => version.file ? { ...version, file: personalCatalogFile(version.file) } : version),
    })),
  };
}

/** Shared catalog plus the creator's personal library. */
export function readMusicCatalog(): MusicCatalog {
  return { schema_version: 1, tracks: mergePersonalEntries(readSharedMusicCatalog().tracks, readPersonalMusicCatalog().tracks) };
}

/** Where browser previews of a catalog file are cached: beside the catalog that owns it. */
export function musicCatalogPreviewDir(relativeFile: string): string {
  return isPersonalCatalogFile(relativeFile) ? path.join(personalLibraryRoot("music"), "previews") : path.join(musicCatalogRoot(), "previews");
}

export function resolveMusicCatalogFile(relativeFile: string): string {
  if (isPersonalCatalogFile(relativeFile)) return resolvePersonalLibraryFile("music", relativeFile);
  const root = musicCatalogRoot();
  const candidate = path.resolve(root, "audio", relativeFile);
  const audioRoot = path.resolve(root, "audio");
  if (candidate === audioRoot || !candidate.startsWith(`${audioRoot}${path.sep}`)) {
    throw new Error("Invalid music catalog file path");
  }
  return candidate;
}

export function musicCatalogFileExists(relativeFile: string): boolean {
  try {
    return fs.statSync(resolveMusicCatalogFile(relativeFile)).isFile();
  } catch {
    return false;
  }
}
