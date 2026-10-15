import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const launcherDir = fileURLToPath(new URL('../packaging/launcher/', import.meta.url));
const key = `${process.platform}-${process.arch}`;
const MARKER = '.dreamcut-installed';

test('prune keeps a freshly installed base whose app layer is still installing', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-prune-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  // A packed launcher: bin + lib + a manifest with no download location, so `install` stays offline.
  const pkg = path.join(tmp, 'launcher');
  fs.cpSync(path.join(launcherDir, 'bin'), path.join(pkg, 'bin'), { recursive: true });
  fs.cpSync(path.join(launcherDir, 'lib'), path.join(pkg, 'lib'), { recursive: true });
  const entry = { file: 'x.tgz', folder: 'x', bytes: 1, sha256: '0' };
  fs.writeFileSync(path.join(pkg, 'runtime-manifest.json'), JSON.stringify({
    version: '1.0.0', base_url: '', platforms: { [key]: { app: entry, base: { ...entry, id: 'b1' } } },
  }));

  const appData = path.join(tmp, 'data');
  const runtimes = path.join(appData, 'runtimes');
  const app = path.join(runtimes, 'app', `1.0.0-${key}`);
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'dreamcut-app.json'), JSON.stringify({ version: '1.0.0', base: 'b1' }));
  fs.writeFileSync(path.join(app, MARKER), '');
  const base = id => {
    const dir = path.join(runtimes, 'base', `${id}-${key}`);
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, MARKER), '');
    return dir;
  };
  const used = base('b1');
  const installing = base('b2'); // another launcher placed it and is still downloading its app layer
  const stale = base('b0');
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(path.join(stale, MARKER), old, old);
  fs.utimesSync(stale, old, old);

  execFileSync(process.execPath, [path.join(pkg, 'bin', 'dreamcut.mjs'), 'install'], {
    env: { ...process.env, DREAMCUT_APP_DATA_DIR: appData, DREAMCUT_RUNTIME_BASE_URL: '' },
    stdio: 'pipe',
  });

  assert.ok(fs.existsSync(used), 'the base an installed app uses is kept');
  assert.ok(fs.existsSync(installing), 'a recent base without its app yet is kept');
  assert.ok(!fs.existsSync(stale), 'an old unused base is removed');
});
