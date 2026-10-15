import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Self-updating local web app. The `dreamcut` launcher installs each editor version as an app layer under
 * <appData>/DreamCut/runtimes/app/<version>-<platform>, sharing a base layer (node_modules) under
 * runtimes/base/, and records the newest complete install in runtimes/latest-installed.json. A running
 * editor offers that version; applying it restarts the editor service from the new app layer on the same
 * address with the same session. The launcher's copies of these names must stay identical
 * (packaging/launcher/bin/dreamcut.mjs; checked by desktop/runtime-updates.test.mjs).
 */
export const UPDATE_PATH = '/__dreamcut/update';
export const INSTALLED_MARKER = '.dreamcut-installed';
export const APP_MANIFEST = 'dreamcut-app.json';

export function appDataRoot(env = process.env) {
  if (env.DREAMCUT_APP_DATA_DIR?.trim()) return path.resolve(env.DREAMCUT_APP_DATA_DIR.trim());
  const home = os.homedir();
  const base = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
    : process.platform === 'win32' ? env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
      : env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  return path.join(base, 'DreamCut');
}
export const runtimesDir = (env = process.env) => path.join(appDataRoot(env), 'runtimes');
export const latestInstalledFile = (env = process.env) => path.join(runtimesDir(env), 'latest-installed.json');

const parse = version => /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/.exec(String(version ?? ''));
/** Semver order for x.y.z[-pre]; a prerelease sorts before its release. Unparseable versions sort first. */
export function compareVersions(a, b) {
  const x = parse(a), y = parse(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 1; i <= 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  if (x[4] === y[4]) return 0;
  if (!x[4]) return 1;
  if (!y[4]) return -1;
  return x[4] < y[4] ? -1 : 1;
}

export function runtimeVersion(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? null; } catch { return null; }
}

// Compare real paths: a running script's own path is resolved (/private/var/… on macOS) while app data may not be.
const real = value => { try { return fs.realpathSync(value); } catch { return path.resolve(value); } };

/** True when `root` is an app layer the launcher installed (not a checkout or the desktop shell). */
export function isInstalledApp(root, env = process.env) {
  return path.dirname(real(root)) === real(path.join(runtimesDir(env), 'app')) && fs.existsSync(path.join(root, INSTALLED_MARKER));
}

/** A newer complete install than the editor running from `root`, or null. */
export function pendingUpdate(root, env = process.env) {
  if (!isInstalledApp(root, env)) return null;
  let latest;
  try { latest = JSON.parse(fs.readFileSync(latestInstalledFile(env), 'utf8')); } catch { return null; }
  if (typeof latest?.dir !== 'string' || typeof latest?.version !== 'string') return null;
  const dir = path.join(runtimesDir(env), 'app', path.basename(latest.dir));
  if (!isInstalledApp(dir, env) || !fs.existsSync(path.join(dir, 'desktop', 'service.mjs'))) return null;
  return compareVersions(latest.version, runtimeVersion(root)) > 0 ? { version: latest.version, root: dir } : null;
}

/** Two editor roots belong to one installation: the same checkout, or two launcher-installed versions. */
export function sameInstallation(a, b, env = process.env) {
  return real(a) === real(b) || (isInstalledApp(a, env) && isInstalledApp(b, env));
}
