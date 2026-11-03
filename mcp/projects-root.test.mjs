import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { libraryRequired } from './projects-root.mjs';

test('a packaged runtime needs a Library before it creates a project; a checkout never does', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'library-required-'));
  try {
    const appData = path.join(temp, 'app data'), fallback = path.join(appData, 'projects'), library = path.join(temp, 'Library');
    const packaged = { DREAMCUT_APP_DATA_DIR: appData, DREAMCUT_DEFAULT_PROJECTS_DIR: fallback };
    assert.equal(libraryRequired(temp, {}), false, 'source checkout');
    assert.equal(libraryRequired(temp, { ...packaged, TIMELINE_PROJECTS_DIR: path.join(temp, 'p') }), false, 'explicit projects folder');
    assert.equal(libraryRequired(temp, packaged), true, 'fresh install');
    fs.mkdirSync(path.join(fallback, 'older-project'), { recursive: true });
    assert.equal(libraryRequired(temp, packaged), false, 'an install already keeping projects in app data carries on');
    fs.rmSync(fallback, { recursive: true });
    fs.mkdirSync(library, { recursive: true });
    fs.writeFileSync(path.join(appData, 'library.json'), JSON.stringify({ library_dir: library }));
    assert.equal(libraryRequired(temp, packaged), true, 'a chosen folder without its marker is not a Library yet');
    fs.writeFileSync(path.join(library, 'dreamcut-library.json'), '{}');
    assert.equal(libraryRequired(temp, packaged), false, 'Library set up');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
