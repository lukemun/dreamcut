import fs from "node:fs";
import path from "node:path";
import { profileDir } from "./editing-memory";
import { readJsonFileStrict, withFileLock, writeJsonFileAtomic } from "./atomic-json";
import { parsePreviewQuality, type PreviewQuality } from "../preview-quality";

type ProjectPreviewSettings = { quality?: unknown; automatic?: unknown };
type StoredPreviewSettings = { projects?: Record<string, ProjectPreviewSettings> };
const settingsPath = () => path.join(profileDir(), "preview-settings.json");

/** The last settings this process read successfully, per file, for reads that fail mid-way. */
const lastGood = new Map<string, StoredPreviewSettings>();

/**
 * The stored settings: `{}` when there is no file yet, null when it exists but cannot be read now.
 * Several editor processes share the profile, so an unreadable file must never read as "no setting".
 */
function readStored(): StoredPreviewSettings | null {
  const file = settingsPath();
  try {
    const stored = readJsonFileStrict<StoredPreviewSettings | null>(file);
    const value = stored && typeof stored === "object" ? stored : {};
    lastGood.set(file, value);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") { lastGood.set(file, {}); return {}; }
    return lastGood.get(file) ?? null;
  }
}

/**
 * Playback quality is chosen per project. `choice` is what the creator picked; `quality` is the
 * size previews are prepared at. Automatic resolves to the size the editor's player last needed.
 * An earlier profile-wide choice no longer applies: every project starts on Automatic.
 * `known` is false only when the settings could not be read; callers then keep what is prepared
 * rather than re-preparing at a size nobody chose.
 */
export function readPreviewSettings(projectId: string) {
  const stored = readStored();
  const project = stored?.projects?.[projectId];
  const choice = parsePreviewQuality(project?.quality);
  const automatic = parsePreviewQuality(project?.automatic);
  return { choice, quality: choice === "prepared" ? automatic : choice, known: stored !== null };
}

function writeProject(projectId: string, change: (current: ProjectPreviewSettings) => ProjectPreviewSettings | null) {
  const file = settingsPath();
  // Read, change and replace under one cross-process lock so concurrent writers never drop each other's projects.
  withFileLock(file, () => {
    // A file that exists but cannot be read is never overwritten with only this project.
    const stored = fs.existsSync(file) ? readJsonFileStrict<StoredPreviewSettings>(file) ?? {} : {};
    const next = change(stored.projects?.[projectId] ?? {});
    if (!next) return;
    const projects = { ...stored.projects, [projectId]: { ...stored.projects?.[projectId], ...next } };
    writeJsonFileAtomic(file, { ...stored, projects });
  });
  return readPreviewSettings(projectId);
}

export function writePreviewSettings(projectId: string, choice: PreviewQuality) {
  return writeProject(projectId, () => ({ quality: choice }));
}

const AUTOMATIC_ORDER: PreviewQuality[] = ["prepared", "economy", "balanced", "detail", "hd", "uhd"];

/**
 * The size Automatic prepares at, from the player's settled size on screen. It only grows: a larger
 * preview plays fine in a smaller player, and re-preparing every video whenever the player shrinks
 * (a split view, a second tab, a narrower pane) cost minutes of encoding each time.
 */
export function writeAutomaticPreviewQuality(projectId: string, quality: PreviewQuality) {
  return writeProject(projectId, (current) => {
    const stored = parsePreviewQuality(current.automatic);
    return AUTOMATIC_ORDER.indexOf(quality) <= AUTOMATIC_ORDER.indexOf(stored) ? null : { automatic: quality };
  });
}
