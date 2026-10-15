import path from 'node:path';

// User data must live outside the replaceable application bundle. An explicitly
// selected workspace can reuse existing projects and libraries without copying.
export function desktopDataEnvironment(env, userData) {
  const root = path.resolve(env.DREAMCUT_WORKSPACE_ROOT?.trim() || userData);
  const result = {};
  for (const [key, folder] of Object.entries({
    TIMELINE_PROJECTS_DIR: 'projects',
    TIMELINE_SFX_CATALOG_DIR: 'sfx-library',
    TIMELINE_MUSIC_CATALOG_DIR: 'music-catalog',
    TIMELINE_IMAGE_CATALOG_DIR: 'image-catalog',
    TIMELINE_VISUAL_CATALOG_DIR: 'visual-catalog',
  })) result[key] = path.resolve(env[key]?.trim() || path.join(root, folder));
  return result;
}
