import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopDataEnvironment } from './data-paths.mjs';
test('packaged catalogs and projects use durable data, with explicit workspace and per-library overrides', () => {
  const defaults = desktopDataEnvironment({}, '/user/app-data');
  assert.equal(defaults.TIMELINE_PROJECTS_DIR, '/user/app-data/projects');
  assert.equal(defaults.TIMELINE_SFX_CATALOG_DIR, '/user/app-data/sfx-library');
  const existing = desktopDataEnvironment({ DREAMCUT_WORKSPACE_ROOT: '/existing',
    TIMELINE_MUSIC_CATALOG_DIR: '/shared/music', TIMELINE_PROJECTS_DIR: '  ' }, '/user/app-data');
  assert.equal(existing.TIMELINE_PROJECTS_DIR, '/existing/projects');
  assert.equal(existing.TIMELINE_SFX_CATALOG_DIR, '/existing/sfx-library');
  assert.equal(existing.TIMELINE_MUSIC_CATALOG_DIR, '/shared/music');
});
