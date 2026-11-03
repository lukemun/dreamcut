import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readEnv } from "../env-name";

// The creator's profile folder: personal style, settings and the personal media library.
// Kept dependency-free so catalog loaders and repository checks can resolve it cheaply.
export function migrateLegacyProfileDirectory(current: string, legacy: string) {
  if (fs.existsSync(current) || !fs.existsSync(legacy)) return current;
  try {
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.renameSync(legacy, current);
    return current;
  } catch {
    // A read-only or cross-device profile root should remain usable under its
    // legacy name instead of making personal preferences disappear.
    return legacy;
  }
}

/** Per-user application data for DreamCut (settings, profiles, agent sessions); never creator media. */
export function dreamcutAppDataRoot(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  if (env.DREAMCUT_APP_DATA_DIR?.trim()) return path.resolve(env.DREAMCUT_APP_DATA_DIR.trim());
  const base = platform === "darwin" ? path.join(home, "Library", "Application Support")
    : platform === "win32" ? env.LOCALAPPDATA ?? path.join(home, "AppData", "Local")
      : env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
  return path.join(base, "DreamCut");
}

export function profileDir() {
  const configured = readEnv("PROFILE_DIR");
  if (configured) return path.resolve(configured);
  const appData = dreamcutAppDataRoot();
  const current = path.join(appData, "profiles", "default");
  // A configured app-data folder is used exactly; earlier products never wrote there.
  if (process.env.DREAMCUT_APP_DATA_DIR?.trim()) return current;
  // Earlier product names sit beside DreamCut's own folder, newest first; the first one that exists moves to DreamCut.
  for (const name of ["OpenEdit", "OpenSequence"]) {
    const legacy = path.join(path.dirname(appData), name, "profiles", "default");
    if (fs.existsSync(legacy)) return migrateLegacyProfileDirectory(current, legacy);
  }
  return current;
}
