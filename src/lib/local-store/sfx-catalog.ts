import fs from "node:fs";
import path from "node:path";

import { sfxCatalogSchema, type SfxCatalog } from "@/lib/sfx-catalog/schema";
import {
  isPersonalCatalogFile, mergePersonalEntries, personalCatalogFile, personalLibraryCatalogPath,
  readPersonalCatalogJson, resolvePersonalLibraryFile,
} from "./personal-library";

export function sfxCatalogRoot(): string {
  const fromEnv = process.env.TIMELINE_SFX_CATALOG_DIR?.trim();
  return fromEnv && fromEnv.length > 0
    ? path.resolve(fromEnv)
    : path.resolve(process.cwd(), "sfx-library");
}

export function sfxCatalogPath(): string {
  return path.join(sfxCatalogRoot(), "catalog.json");
}

function parseSfxCatalog(raw: unknown, catalogPath: string): SfxCatalog {
  const parsed = sfxCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid SFX catalog at ${catalogPath}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  // Collection entries are uncut source reels: kept for provenance, never offered for placement.
  return {
    ...parsed.data,
    sound_effects: parsed.data.sound_effects.filter(
      (soundEffect) => soundEffect.category.trim().toLowerCase() !== "collection",
    ),
  };
}

/** The shared catalog only (the repository's or TIMELINE_SFX_CATALOG_DIR's). */
export function readSharedSfxCatalog(): SfxCatalog {
  const catalogPath = sfxCatalogPath();
  if (!fs.existsSync(catalogPath)) return { schema_version: 1, sound_effects: [] };
  return parseSfxCatalog(JSON.parse(fs.readFileSync(catalogPath, "utf8")), catalogPath);
}

/** The creator's personal sounds, marked personal, with files under `_personal/`. */
export function readPersonalSfxCatalog(): SfxCatalog {
  const raw = readPersonalCatalogJson("sfx");
  if (raw === null) return { schema_version: 1, sound_effects: [] };
  const catalog = parseSfxCatalog(raw, personalLibraryCatalogPath("sfx"));
  return { ...catalog, sound_effects: catalog.sound_effects.map((effect) => ({ ...effect, personal: true, file: personalCatalogFile(effect.file) })) };
}

/** Shared catalog plus the creator's personal library. */
export function readSfxCatalog(): SfxCatalog {
  return { schema_version: 1, sound_effects: mergePersonalEntries(readSharedSfxCatalog().sound_effects, readPersonalSfxCatalog().sound_effects) };
}

export function resolveSfxCatalogFile(relativeFile: string): string {
  if (isPersonalCatalogFile(relativeFile)) return resolvePersonalLibraryFile("sfx", relativeFile);
  const audioRoot = path.resolve(sfxCatalogRoot(), "audio");
  const candidate = path.resolve(audioRoot, relativeFile);
  if (candidate === audioRoot || !candidate.startsWith(`${audioRoot}${path.sep}`)) {
    throw new Error("Invalid SFX catalog file path");
  }
  return candidate;
}

export function sfxCatalogFileExists(relativeFile: string): boolean {
  try {
    return fs.statSync(resolveSfxCatalogFile(relativeFile)).isFile();
  } catch {
    return false;
  }
}
