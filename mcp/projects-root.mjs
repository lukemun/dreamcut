import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Plain-JS mirror of `projectsRoot()` in src/lib/local-store/paths.ts and the Library resolver in
 * src/lib/library/library.ts, for MCP code that cannot import TypeScript. library.test.ts checks that both
 * resolve identically. Precedence: TIMELINE_PROJECTS_DIR, then the chosen DreamCut Library once its marker
 * exists, then <editorRoot>/projects. A Library this version must not write is refused, never bypassed.
 */
const LIBRARY_FORMAT_VERSION = 1;

function appDataRoot(env) {
  if (env.DREAMCUT_APP_DATA_DIR?.trim()) return path.resolve(env.DREAMCUT_APP_DATA_DIR.trim());
  const home = os.homedir();
  const base = process.platform === "darwin" ? path.join(home, "Library", "Application Support")
    : process.platform === "win32" ? env.LOCALAPPDATA ?? path.join(home, "AppData", "Local")
      : env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
  return path.join(base, "DreamCut");
}

function chosenLibrary(env) {
  if (env.DREAMCUT_LIBRARY_DIR?.trim()) return path.resolve(env.DREAMCUT_LIBRARY_DIR.trim());
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(appDataRoot(env), "library.json"), "utf8"));
    return typeof saved?.library_dir === "string" && saved.library_dir ? path.resolve(saved.library_dir) : null;
  } catch { return null; }
}

/** Same rules as `libraryMarkerSchema` in src/lib/library/library.ts. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validMarker(marker) {
  return marker?.format === "dreamcut-library"
    && Number.isInteger(marker.format_version) && marker.format_version >= 1
    && Number.isInteger(marker.min_reader_version) && marker.min_reader_version >= 1
    && typeof marker.library_id === "string" && UUID.test(marker.library_id)
    && typeof marker.created_at === "string" && typeof marker.created_by === "string";
}

export function projectsRootFor(editorRoot, env = process.env) {
  if (env.TIMELINE_PROJECTS_DIR?.trim()) return path.resolve(editorRoot, env.TIMELINE_PROJECTS_DIR.trim());
  const library = chosenLibrary(env);
  const marker = library && path.join(library, "dreamcut-library.json");
  if (marker && fs.existsSync(marker)) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(marker, "utf8")); } catch { throw new Error(`The DreamCut Library marker in ${library} cannot be read.`); }
    if (!validMarker(parsed)) throw new Error(`${library} has an invalid DreamCut Library marker.`);
    if (parsed.format_version > LIBRARY_FORMAT_VERSION || parsed.min_reader_version > LIBRARY_FORMAT_VERSION) {
      throw new Error(`The DreamCut Library in ${library} was written by a newer DreamCut. Update DreamCut to edit it.`);
    }
    return path.join(library, "projects");
  }
  if (env.DREAMCUT_DEFAULT_PROJECTS_DIR?.trim()) return path.resolve(env.DREAMCUT_DEFAULT_PROJECTS_DIR.trim());
  return path.join(editorRoot, "projects");
}
