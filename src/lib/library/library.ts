import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { readJsonFile, writeJsonFileAtomic } from "../local-store/atomic-json";
import { dreamcutAppDataRoot } from "../local-store/profile-dir";

/**
 * The DreamCut Library: one visible folder holding every project, shared by every DreamCut front end
 * (the local web app today, a desktop app later). Contract: docs/standards/library-contract.md.
 * Pure Node; no editor or framework imports, so it can move into a shared package unchanged.
 */
export const LIBRARY_MARKER = "dreamcut-library.json";
export const LIBRARY_FORMAT = "dreamcut-library";
/** Highest Library format this code writes and fully understands. */
export const LIBRARY_FORMAT_VERSION = 1;
export const LIBRARY_DIR_ENV = "DREAMCUT_LIBRARY_DIR";

/** Readers keep fields they do not know, so a newer writer's additions survive an older reader's rewrite. */
export const libraryMarkerSchema = z.object({
  format: z.literal(LIBRARY_FORMAT),
  format_version: z.number().int().min(1),
  min_reader_version: z.number().int().min(1),
  library_id: z.string().uuid(),
  created_at: z.string(),
  created_by: z.string(),
}).passthrough();
export type LibraryMarker = z.infer<typeof libraryMarkerSchema>;

export type Library = {
  root: string;
  marker: LibraryMarker;
  /** read-only when the Library was written by a newer DreamCut that older readers must not modify. */
  access: "read-write" | "read-only";
  reason?: string;
};

export class LibraryError extends Error {
  constructor(message: string, readonly code: "NOT_A_LIBRARY" | "INVALID_MARKER" | "TOO_NEW" | "EXISTS" | "NOT_EMPTY") { super(message); }
}

export const libraryProjectsDir = (root: string) => path.join(root, "projects");
export const libraryMarkerPath = (root: string) => path.join(root, LIBRARY_MARKER);

/** Open an existing Library. A Library from a newer DreamCut opens read-only, or is refused when this version cannot read it. */
export function readLibrary(dir: string): Library {
  const root = path.resolve(dir);
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(libraryMarkerPath(root), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new LibraryError(`${root} is not a DreamCut Library (no ${LIBRARY_MARKER}).`, "NOT_A_LIBRARY");
    throw new LibraryError(`${LIBRARY_MARKER} in ${root} cannot be read: ${(error as Error).message}`, "INVALID_MARKER");
  }
  const parsed = libraryMarkerSchema.safeParse(raw);
  if (!parsed.success) throw new LibraryError(`${LIBRARY_MARKER} in ${root} is not a valid DreamCut Library marker.`, "INVALID_MARKER");
  const marker = parsed.data;
  if (marker.min_reader_version > LIBRARY_FORMAT_VERSION) {
    throw new LibraryError(`This Library needs a newer DreamCut (format ${marker.format_version}, readable from ${marker.min_reader_version}; this version reads ${LIBRARY_FORMAT_VERSION}).`, "TOO_NEW");
  }
  if (marker.format_version > LIBRARY_FORMAT_VERSION) {
    return { root, marker, access: "read-only", reason: `Written by a newer DreamCut (format ${marker.format_version}); opened read-only so this version cannot overwrite its changes.` };
  }
  return { root, marker, access: "read-write" };
}

/** Create a new Library in an empty or missing folder. Refuses a folder that is already a Library or holds other files. */
export function createLibrary(dir: string, createdBy: string): Library {
  const root = path.resolve(dir);
  if (fs.existsSync(libraryMarkerPath(root))) throw new LibraryError(`${root} is already a DreamCut Library.`, "EXISTS");
  if (fs.existsSync(root) && fs.readdirSync(root).some(name => !name.startsWith("."))) {
    throw new LibraryError(`${root} already contains files. Choose an empty folder or an existing DreamCut Library.`, "NOT_EMPTY");
  }
  fs.mkdirSync(libraryProjectsDir(root), { recursive: true });
  const marker: LibraryMarker = { format: LIBRARY_FORMAT, format_version: LIBRARY_FORMAT_VERSION, min_reader_version: 1,
    library_id: randomUUID(), created_at: new Date().toISOString(), created_by: createdBy };
  writeJsonFileAtomic(libraryMarkerPath(root), marker, value => { libraryMarkerSchema.parse(value); });
  return { root, marker, access: "read-write" };
}

export { dreamcutAppDataRoot };

/**
 * Suggested Library location in the user's video folder: user media belongs in user folders, not app data.
 * The creator confirms or changes it; DreamCut never writes there without that choice.
 */
export function defaultLibraryDir(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  const name = "DreamCut Library";
  if (platform === "darwin") return path.join(home, "Movies", name);
  if (platform === "win32") return path.win32.join(env.USERPROFILE ?? home, "Videos", name);
  return path.join(env.XDG_VIDEOS_DIR ?? path.join(home, "Videos"), name);
}

const configSchema = z.object({ library_dir: z.string().min(1).optional() }).passthrough();
export const libraryConfigPath = () => path.join(dreamcutAppDataRoot(), "library.json");

/** The Library the creator chose: the environment override, else the saved choice, else none yet. */
export function configuredLibraryDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env[LIBRARY_DIR_ENV]?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const saved = configSchema.safeParse(readJsonFile<unknown>(libraryConfigPath(), {}));
  return saved.success && saved.data.library_dir ? path.resolve(saved.data.library_dir) : null;
}

/** Save the creator's Library choice, keeping any other settings in the file. */
export function saveLibraryChoice(dir: string) {
  const current = configSchema.safeParse(readJsonFile<unknown>(libraryConfigPath(), {}));
  writeJsonFileAtomic(libraryConfigPath(), { ...(current.success ? current.data : {}), library_dir: path.resolve(dir) });
}
