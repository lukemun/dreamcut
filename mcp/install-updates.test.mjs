import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyUpdate, checkForUpdates, describeUpdate, installRevision, repositoryIdentity, updatesOffReason } from './install-updates.mjs';

const PUBLIC_URL = 'https://github.com/lukemun/dreamcut.git';
// Isolated from the machine's git config and from CI's own environment.
const env = { ...process.env, CI: '', DREAMCUT_UPDATES: '', GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' }).trim();

/** A bare "GitHub" with two commits, and an install cloned at the first, whose origin is the public URL. */
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-updates-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const upstream = path.join(dir, 'upstream.git'), work = path.join(dir, 'work'), install = path.join(dir, 'install');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', upstream], { env });
  execFileSync('git', ['clone', '-q', upstream, work], { env });
  fs.writeFileSync(path.join(work, 'pnpm-lock.yaml'), 'lock: 1\n');
  fs.writeFileSync(path.join(work, 'editor.txt'), 'one\n');
  git(work, 'add', '.'); git(work, 'commit', '-qm', 'First version'); git(work, 'push', '-q', 'origin', 'HEAD:main');
  execFileSync('git', ['clone', '-q', upstream, install], { env });
  git(install, 'remote', 'set-url', 'origin', PUBLIC_URL);
  // Fetches of the public URL reach the local upstream instead.
  git(install, 'config', `url.${upstream}.insteadOf`, PUBLIC_URL);
  const publish = (subject, files) => {
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(work, name), text);
    git(work, 'commit', '-qam', subject); git(work, 'push', '-q', 'origin', 'HEAD:main');
    return git(work, 'rev-parse', 'HEAD');
  };
  return { dir, upstream, install, publish };
}
const installs = [];
const fakeInstall = (ok = true) => async root => { installs.push(root); return { ok, code: ok ? 0 : 1, stdout: '', stderr: ok ? '' : 'ERR_PNPM_FAKE' }; };

test('repository identity ignores protocol, user, port, .git and trailing slash', () => {
  for (const url of ['https://github.com/lukemun/dreamcut', 'https://github.com/lukemun/dreamcut.git', 'git@github.com:lukemun/dreamcut.git',
    'ssh://git@github.com/lukemun/dreamcut/', 'ssh://git@github.com:22/lukemun/dreamcut.git', 'https://token@github.com/LukeMun/DreamCut']) {
    assert.equal(repositoryIdentity(url), 'github.com/lukemun/dreamcut', url);
  }
  assert.notEqual(repositoryIdentity('https://github.com/someone/dreamcut'), 'github.com/lukemun/dreamcut');
});

test('a clean install that is behind reports the changes and fast-forwards, reinstalling when the lockfile changed', async t => {
  const { install, publish } = setup(t);
  assert.equal((await checkForUpdates({ root: install, env })).status, 'up_to_date');
  publish('Fix captions', { 'editor.txt': 'two\n' });
  const latest = publish('Faster export', { 'pnpm-lock.yaml': 'lock: 2\n' });
  const check = await checkForUpdates({ root: install, env });
  assert.equal(check.status, 'update_available');
  assert.equal(check.behind, 2);
  assert.deepEqual(check.changes, ['Faster export', 'Fix captions']);
  assert.match(describeUpdate(check), /2 updates[\s\S]*Faster export/);
  installs.length = 0;
  const result = await applyUpdate({ root: install, env, install: fakeInstall() });
  assert.equal(result.status, 'updated');
  assert.equal(result.dependencies_installed, true);
  assert.deepEqual(installs, [install]);
  assert.equal(git(install, 'rev-parse', 'HEAD'), latest);
  assert.equal(fs.readFileSync(path.join(install, 'editor.txt'), 'utf8'), 'two\n');
  assert.equal(installRevision(install, env), latest);
});

test('no reinstall when the lockfile did not change', async t => {
  const { install, publish } = setup(t);
  publish('Fix captions', { 'editor.txt': 'two\n' });
  installs.length = 0;
  const result = await applyUpdate({ root: install, env, install: fakeInstall() });
  assert.equal(result.updated, true);
  assert.equal(result.dependencies_installed, false);
  assert.deepEqual(installs, []);
});

test('a failed dependency install moves the code back', async t => {
  const { install, publish } = setup(t);
  const before = git(install, 'rev-parse', 'HEAD');
  publish('New dependency', { 'pnpm-lock.yaml': 'lock: 2\n' });
  const result = await applyUpdate({ root: install, env, install: fakeInstall(false) });
  assert.equal(result.status, 'install_failed');
  assert.match(result.reason, /ERR_PNPM_FAKE[\s\S]*moved back/);
  assert.equal(git(install, 'rev-parse', 'HEAD'), before);
  assert.equal(git(install, 'status', '--porcelain'), '');
});

test('local changes, local commits and another branch block the update and change nothing', async t => {
  const { install, publish } = setup(t);
  publish('Fix captions', { 'editor.txt': 'two\n' });
  const before = git(install, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(install, 'editor.txt'), 'my own edit\n');
  let result = await applyUpdate({ root: install, env, install: fakeInstall() });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /files in this copy were changed/);
  assert.equal(fs.readFileSync(path.join(install, 'editor.txt'), 'utf8'), 'my own edit\n');
  git(install, 'checkout', '-q', '--', 'editor.txt');

  fs.writeFileSync(path.join(install, 'mine.txt'), 'x\n');
  git(install, 'add', 'mine.txt'); git(install, 'commit', '-qm', 'My commit');
  const mine = git(install, 'rev-parse', 'HEAD');
  result = await applyUpdate({ root: install, env, install: fakeInstall() });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /1 local commit/);
  assert.equal(git(install, 'rev-parse', 'HEAD'), mine);
  git(install, 'reset', '-q', '--hard', before);

  git(install, 'checkout', '-q', '-b', 'experiment');
  result = await applyUpdate({ root: install, env, install: fakeInstall() });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /experiment branch is checked out/);
  assert.equal(git(install, 'rev-parse', 'HEAD'), before);
});

test('a development checkout or an opted-out copy is never fetched or updated', async t => {
  const { install, upstream, publish } = setup(t);
  publish('Fix captions', { 'editor.txt': 'two\n' });
  const before = git(install, 'rev-parse', 'HEAD');
  // Point fetches nowhere: any network use would fail the check differently.
  git(install, 'config', `url.${upstream}-missing.insteadOf`, PUBLIC_URL);
  git(install, 'config', '--unset', `url.${upstream}.insteadOf`);

  git(install, 'config', 'core.hooksPath', '.githooks');
  assert.match(updatesOffReason(install, env), /development checkout/);
  assert.equal((await applyUpdate({ root: install, env })).status, 'updates_off');
  assert.equal(installRevision(install, env), null);
  git(install, 'config', '--unset', 'core.hooksPath');

  git(install, 'config', 'dreamcut.updates', 'off');
  assert.equal((await checkForUpdates({ root: install, env })).status, 'updates_off');
  git(install, 'config', '--unset', 'dreamcut.updates');

  assert.equal((await checkForUpdates({ root: install, env: { ...env, DREAMCUT_UPDATES: 'off' } })).status, 'updates_off');
  assert.equal((await checkForUpdates({ root: install, env: { ...env, CI: 'true' } })).status, 'updates_off');
  assert.equal(git(install, 'rev-parse', 'HEAD'), before);

  // Unreachable GitHub: reported, nothing changed.
  const offline = await checkForUpdates({ root: install, env });
  assert.equal(offline.status, 'offline');
});

test('a fork or a folder that is not a git install is left alone', async t => {
  const { install, dir } = setup(t);
  git(install, 'remote', 'set-url', 'origin', 'https://github.com/someone/dreamcut.git');
  assert.equal((await checkForUpdates({ root: install, env })).status, 'not_public_repository');
  const plain = path.join(dir, 'plain');
  fs.mkdirSync(plain);
  assert.equal((await checkForUpdates({ root: plain, env: { ...env, GIT_CEILING_DIRECTORIES: dir } })).status, 'not_a_git_install');
  // A folder inside a checkout is not that checkout's root.
  const nested = path.join(install, 'nested');
  fs.mkdirSync(nested);
  assert.equal((await checkForUpdates({ root: nested, env })).status, 'not_a_git_install');
});
