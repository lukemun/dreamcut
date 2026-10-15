import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_MANIFEST, compareVersions, INSTALLED_MARKER, isInstalledApp, pendingUpdate, runtimesDir, sameInstallation } from './runtime-updates.mjs';

test('versions order as semver, prereleases before their release', () => {
  assert.ok(compareVersions('0.1.1', '0.1.0') > 0);
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0, 'numeric, not lexical');
  assert.ok(compareVersions('1.0.0-beta.1', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0-beta.2', '1.0.0-beta.1') > 0);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
  assert.ok(compareVersions('0.0.1', 'garbage') > 0, 'an unparseable version never wins');
});

function fixture() {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut updates '));
  const env = { DREAMCUT_APP_DATA_DIR: appData };
  const install = version => {
    const dir = path.join(runtimesDir(env), 'app', `${version}-test`);
    fs.mkdirSync(path.join(dir, 'desktop'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
    fs.writeFileSync(path.join(dir, 'desktop', 'service.mjs'), '');
    fs.writeFileSync(path.join(dir, INSTALLED_MARKER), '');
    return dir;
  };
  const latest = (version, dir) => fs.writeFileSync(path.join(runtimesDir(env), 'latest-installed.json'), JSON.stringify({ version, dir: path.basename(dir) }));
  return { appData, env, install, latest };
}

test('a running install is offered only a newer complete install', t => {
  const { appData, env, install, latest } = fixture();
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  const current = install('0.1.0');
  assert.equal(pendingUpdate(current, env), null, 'nothing recorded yet');
  latest('0.1.0', current);
  assert.equal(pendingUpdate(current, env), null, 'same version');
  const next = install('0.2.0');
  latest('0.2.0', next);
  assert.deepEqual(pendingUpdate(current, env), { version: '0.2.0', root: next });
  assert.equal(pendingUpdate(next, env), null, 'the newest install has nothing to offer');
  fs.rmSync(path.join(next, INSTALLED_MARKER));
  assert.equal(pendingUpdate(current, env), null, 'an incomplete install is never offered');
});

test('an editor started through a resolved path still finds its update', t => {
  const { appData, env, install, latest } = fixture();
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  const current = install('0.1.0');
  latest('0.2.0', install('0.2.0'));
  // macOS temp and home folders can sit behind symlinks (/var → /private/var); scripts see the resolved path.
  assert.equal(pendingUpdate(fs.realpathSync(current), env)?.version, '0.2.0');
  const linked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut link ')), 'app data');
  fs.symlinkSync(appData, linked);
  t.after(() => fs.rmSync(path.dirname(linked), { recursive: true, force: true }));
  assert.equal(pendingUpdate(fs.realpathSync(current), { DREAMCUT_APP_DATA_DIR: linked })?.version, '0.2.0');
});

test('the record cannot point an editor outside the installed versions', t => {
  const { appData, env, install } = fixture();
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  const current = install('0.1.0');
  const outside = path.join(appData, 'elsewhere', '9.9.9-test');
  fs.mkdirSync(path.join(outside, 'desktop'), { recursive: true });
  fs.writeFileSync(path.join(outside, INSTALLED_MARKER), '');
  fs.writeFileSync(path.join(runtimesDir(env), 'latest-installed.json'), JSON.stringify({ version: '9.9.9', dir: '../../elsewhere/9.9.9-test' }));
  assert.equal(pendingUpdate(current, env), null);
});

test('checkouts and the desktop shell never update themselves', t => {
  const { appData, env, install, latest } = fixture();
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  latest('0.2.0', install('0.2.0'));
  const checkout = path.join(appData, 'checkout');
  fs.mkdirSync(checkout);
  fs.writeFileSync(path.join(checkout, 'package.json'), JSON.stringify({ version: '0.1.0' }));
  assert.equal(isInstalledApp(checkout, env), false);
  assert.equal(pendingUpdate(checkout, env), null);
});

test('installed versions share one editor; a checkout shares only with itself', t => {
  const { appData, env, install } = fixture();
  t.after(() => fs.rmSync(appData, { recursive: true, force: true }));
  const a = install('0.1.0'), b = install('0.2.0');
  assert.equal(sameInstallation(a, b, env), true);
  assert.equal(sameInstallation(a, appData, env), false);
  assert.equal(sameInstallation(appData, appData, env), true);
});

test('the npm launcher mirrors the install names the editor reads', () => {
  const launcher = fs.readFileSync(new URL('../packaging/launcher/bin/dreamcut.mjs', import.meta.url), 'utf8');
  assert.match(launcher, new RegExp(`INSTALLED_MARKER = '${INSTALLED_MARKER.replace('.', '\\.')}'`));
  assert.match(launcher, new RegExp(`APP_MANIFEST = '${APP_MANIFEST.replace('.', '\\.')}'`));
  assert.match(launcher, /'latest-installed\.json'/);
  assert.match(launcher, /path\.join\(runtimes, 'app'\)/);
});
