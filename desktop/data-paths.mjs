import fs from 'node:fs';
import path from 'node:path';

// User data must live outside the replaceable application bundle. An explicitly
// selected workspace can reuse existing projects and libraries without copying.
export function desktopDataEnvironment(env, userData, exists = fs.existsSync) {
  const root = path.resolve(env.DREAMCUT_WORKSPACE_ROOT?.trim() || userData);
  const result = { TIMELINE_PROJECTS_DIR: path.resolve(env.TIMELINE_PROJECTS_DIR?.trim() || path.join(root, 'projects')) };
  // App data keeps its original catalog folders; a workspace that is a source checkout keeps them under
  // catalogs/. Whichever exists is used, and new app data uses the original names.
  for (const [key, folder, checkoutFolder] of [
    ['TIMELINE_SFX_CATALOG_DIR', 'sfx-library', 'catalogs/sfx'],
    ['TIMELINE_MUSIC_CATALOG_DIR', 'music-catalog', 'catalogs/music'],
    ['TIMELINE_IMAGE_CATALOG_DIR', 'image-catalog', 'catalogs/images'],
    ['TIMELINE_VISUAL_CATALOG_DIR', 'visual-catalog', 'catalogs/visual'],
  ]) {
    const original = path.join(root, folder), checkout = path.join(root, checkoutFolder);
    result[key] = path.resolve(env[key]?.trim() || (!exists(original) && exists(checkout) ? checkout : original));
  }
  return result;
}
