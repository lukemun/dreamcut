import fs from "node:fs";
import path from "node:path";

import { sfxCatalogSchema, type SfxCatalog } from "@/lib/sfx-catalog/schema";
import {
  isPersonalCatalogFile, mergePersonalEntries, personalCatalogFile, personalLibraryCatalogPath,
  readPersonalCatalogJson, resolvePersonalLibraryFile,
} from "./personal-library";
import { profileDir } from "./profile-dir";

export function sfxCatalogRoot(): string {
  const fromEnv = process.env.TIMELINE_SFX_CATALOG_DIR?.trim();
  return fromEnv && fromEnv.length > 0
    ? path.resolve(fromEnv)
    : path.resolve(process.cwd(), "catalogs/sfx");
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

/** The members-only sound list DreamCut Cloud gave a signed-in member (sfx-catalog-cloud.ts). Never tracked. */
export function sfxMembersCatalogPath(): string {
  return path.join(sfxCloudCacheRoot(), "members-catalog.json");
}

function readMembersSfxEntries(): SfxCatalog["sound_effects"] {
  const catalogPath = sfxMembersCatalogPath();
  try {
    return parseSfxCatalog(JSON.parse(fs.readFileSync(catalogPath, "utf8")), catalogPath).sound_effects
      .map((entry) => ({ ...entry, access: "members" as const }));
  } catch {
    return []; // none yet, or unreadable: the next membership check fetches it again
  }
}

/**
 * The shared catalog: the repository's (or TIMELINE_SFX_CATALOG_DIR's) free sounds, plus the members-only list
 * when this signed-in member has one cached. The repository entry wins when both name the same id.
 */
export function readSharedSfxCatalog(): SfxCatalog {
  const catalogPath = sfxCatalogPath();
  const shared = fs.existsSync(catalogPath)
    ? parseSfxCatalog(JSON.parse(fs.readFileSync(catalogPath, "utf8")), catalogPath)
    : { schema_version: 1 as const, sound_effects: [] };
  const ids = new Set(shared.sound_effects.map((entry) => entry.id));
  return { ...shared, sound_effects: [...shared.sound_effects, ...readMembersSfxEntries().filter((entry) => !ids.has(entry.id))] };
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

/** Shared catalog sounds downloaded from DreamCut Cloud (see sfx-catalog-cloud.ts). */
export function sfxCloudCacheRoot(): string {
  return path.join(profileDir(), "cache", "sound-catalog");
}

/** Where a shared catalog file is (or would be) cached; refuses paths outside the cache. */
export function sfxCloudCachePath(relativeFile: string): string {
  const root = path.resolve(sfxCloudCacheRoot());
  const candidate = path.resolve(root, relativeFile);
  if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) throw new Error("Invalid SFX catalog file path");
  return candidate;
}

/** The shared catalog file in this checkout's audio folder, whether or not it exists. */
export function sfxCatalogCheckoutPath(relativeFile: string): string {
  const audioRoot = path.resolve(sfxCatalogRoot(), "audio");
  const candidate = path.resolve(audioRoot, relativeFile);
  if (candidate === audioRoot || !candidate.startsWith(`${audioRoot}${path.sep}`)) {
    throw new Error("Invalid SFX catalog file path");
  }
  return candidate;
}

/** A catalog sound on disk: the checkout's copy, else the DreamCut Cloud cache (which may not hold it yet). */
export function resolveSfxCatalogFile(relativeFile: string): string {
  if (isPersonalCatalogFile(relativeFile)) return resolvePersonalLibraryFile("sfx", relativeFile);
  const checkout = sfxCatalogCheckoutPath(relativeFile);
  if (fs.existsSync(checkout)) return checkout;
  return sfxCloudCachePath(relativeFile);
}

export function sfxCatalogFileExists(relativeFile: string): boolean {
  try {
    return fs.statSync(resolveSfxCatalogFile(relativeFile)).isFile();
  } catch {
    return false;
  }
}
