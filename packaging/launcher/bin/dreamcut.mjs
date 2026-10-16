#!/usr/bin/env node
/**
 * The `dreamcut` npm launcher. It installs this computer's DreamCut runtime (checksum-verified) into
 * DreamCut's app data, keeps it up to date and runs it:
 *
 *   npx dreamcut install   install or update the runtime now (do this before adding the MCP server)
 *   npx dreamcut           start the editor and open it in your browser
 *   npx dreamcut mcp       the MCP server for Claude Code / Codex
 *
 * The runtime is two layers: a base (node_modules), shared by versions until its contents change, and an
 * app layer per version that links to it. The launcher starts the newest installed version at once, then
 * checks the update feed (latest.json at the download location: the latest GitHub release) and installs a newer version in the
 * background; the running editor offers it (mcp/runtime-updates.mjs, whose names this file mirrors).
 * Progress goes to stderr; stdout belongs to the runtime (the MCP server speaks JSON-RPC there).
 */
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { serveWhileInstalling } from '../lib/mcp-bootstrap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundled = JSON.parse(fs.readFileSync(path.join(here, '..', 'runtime-manifest.json'), 'utf8'));
const key = `${process.platform}-${process.arch}`;
const say = message => process.stderr.write(`${message}\n`);
const INSTALLED_MARKER = '.dreamcut-installed';
const APP_MANIFEST = 'dreamcut-app.json';
const CHECK_SECONDS = Number(process.env.DREAMCUT_UPDATE_CHECK_SECONDS) || 6 * 60 * 60;
/** A base this recent may belong to an app layer another launcher is still installing; prune leaves it. */
const BASE_GRACE_MS = 60 * 60 * 1000;

function appDataRoot(env = process.env) {
  if (env.DREAMCUT_APP_DATA_DIR?.trim()) return path.resolve(env.DREAMCUT_APP_DATA_DIR.trim());
  const home = os.homedir();
  const base = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
    : process.platform === 'win32' ? env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
      : env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  return path.join(base, 'DreamCut');
}
const runtimes = path.join(appDataRoot(), 'runtimes');
const appsDir = path.join(runtimes, 'app');
const basesDir = path.join(runtimes, 'base');
const downloadBase = () => (process.env.DREAMCUT_RUNTIME_BASE_URL ?? bundled.base_url ?? '').replace(/\/$/, '');
/**
 * Where one archive downloads from. Feeds published as GitHub Releases name each file's own address (an
 * unchanged base layer stays attached to the release that introduced it); an explicit
 * DREAMCUT_RUNTIME_BASE_URL (a mirror or a local stand-in) always serves every file from that folder.
 */
const archiveUrl = entry => (!process.env.DREAMCUT_RUNTIME_BASE_URL && typeof entry.url === 'string' && /^https:\/\//.test(entry.url))
  ? entry.url
  : `${downloadBase()}/${entry.file}`;

const parse = version => /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/.exec(String(version ?? ''));
function compareVersions(a, b) {
  const x = parse(a), y = parse(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 1; i <= 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  if (x[4] === y[4]) return 0;
  if (!x[4]) return 1;
  if (!y[4]) return -1;
  return x[4] < y[4] ? -1 : 1;
}
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** Complete installs for this platform, newest first. */
function installedApps() {
  if (!fs.existsSync(appsDir)) return [];
  return fs.readdirSync(appsDir)
    .filter(name => name.endsWith(`-${key}`) && fs.existsSync(path.join(appsDir, name, INSTALLED_MARKER)))
    .map(name => ({ dir: path.join(appsDir, name), ...readJson(path.join(appsDir, name, APP_MANIFEST)) }))
    .filter(app => parse(app.version))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The published feed, or the snapshot packed with this launcher when the feed is unreachable. */
async function latestRelease() {
  const base = downloadBase();
  if (base) {
    try {
      const response = await fetch(`${base}/latest.json`, { signal: AbortSignal.timeout(10_000), headers: { 'Cache-Control': 'no-cache' } });
      const feed = response.ok ? await response.json() : null;
      if (feed?.platforms?.[key]?.app && feed.platforms[key].base) return { version: feed.version, ...feed.platforms[key] };
    } catch { /* offline: fall back to the packed snapshot */ }
  }
  const entry = bundled.platforms?.[key];
  return entry ? { version: bundled.version, ...entry } : null;
}

/** Bytes downloaded so far in the current install, for progress reports. */
const progress = { done: 0, total: 0 };
const safeName = value => typeof value === 'string' && /^[\w.-]+$/.test(value) && value !== '.' && value !== '..';
/**
 * Download to `file` and return its SHA-256. Network failures (a dropped or reused connection, a
 * server error) are retried from the start up to three times; a completed download is never retried.
 */
async function download(url, file) {
  for (let attempt = 1; ; attempt += 1) {
    const before = progress.done;
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw Object.assign(new Error(`Download failed (${response.status}).`), { retry: response.status >= 500 });
      const hash = createHash('sha256');
      const counter = new TransformStream({ transform(chunk, controller) { hash.update(chunk); progress.done += chunk.length; controller.enqueue(chunk); } });
      await pipeline(Readable.fromWeb(response.body.pipeThrough(counter)), fs.createWriteStream(file));
      return hash.digest('hex');
    } catch (error) {
      progress.done = before;
      if (attempt >= 3 || error.retry === false) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/** Download, verify and unpack one archive into `parent`, then move its folder to `target` atomically. */
async function installArchive(entry, parent, target, finish = () => {}) {
  if (!safeName(entry?.file) || !safeName(entry?.folder)) throw new Error('The update feed is malformed.');
  const staging = `${target}.download-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    const archive = path.join(staging, entry.file);
    const hash = await download(archiveUrl(entry), archive);
    if (fs.statSync(archive).size !== entry.bytes || hash !== entry.sha256) throw new Error('The download did not match its checksum; nothing was installed.');
    // Asynchronous, so a launcher answering an agent during first-time setup stays responsive.
    await promisify(execFile)('tar', ['-xzf', archive, '-C', staging]);
    const unpacked = `${target}.unpacked-${process.pid}`;
    fs.rmSync(unpacked, { recursive: true, force: true });
    fs.renameSync(path.join(staging, entry.folder), unpacked);
    finish(unpacked);
    fs.mkdirSync(parent, { recursive: true });
    try { fs.renameSync(unpacked, target); }
    catch (error) {
      // Another launcher finished the same install first; keep theirs.
      fs.rmSync(unpacked, { recursive: true, force: true });
      if (!fs.existsSync(target)) throw error;
    }
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
/** Remove downloads and unpacked folders left by an installer that is no longer running. */
function removeAbandonedPartials() {
  for (const dir of [appsDir, basesDir]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      const owner = /\.(?:download|unpacked)-(\d+)$/.exec(name);
      if (owner && !alive(Number(owner[1]))) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }
}

/**
 * First-time setup runs in its own detached process (`dreamcut install --background`), so it survives the
 * agent session that started it. It holds install.lock and reports through install-progress.json, which any
 * later session reads to show progress or wait for it instead of starting a second download.
 */
const lockFile = path.join(runtimes, 'install.lock');
const progressFile = path.join(runtimes, 'install-progress.json');
function takeInstallLock() {
  fs.mkdirSync(runtimes, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); return true; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holder = Number(fs.readFileSync(lockFile, 'utf8'));
      if (holder && alive(holder)) return false;
      fs.rmSync(lockFile, { force: true });
    }
  }
  return false;
}
const releaseInstallLock = () => { try { if (Number(fs.readFileSync(lockFile, 'utf8')) === process.pid) fs.rmSync(lockFile); } catch { /* not ours */ } };
const installerRunning = () => { try { return alive(Number(fs.readFileSync(lockFile, 'utf8'))); } catch { return false; } };
function writeProgress(extra = {}) {
  try { fs.writeFileSync(progressFile, JSON.stringify({ pid: process.pid, done: progress.done, total: progress.total, updated_at: new Date().toISOString(), ...extra })); } catch { /* progress is advisory */ }
}

/** Install a release's base (if this computer lacks it) and app layer. Returns the app folder. */
async function install(release, { quiet = false } = {}) {
  if (!downloadBase()) throw new Error('This DreamCut build has no download location.');
  const log = quiet ? () => {} : say;
  removeAbandonedPartials();
  const baseDir = path.join(basesDir, `${release.base.id}-${key}`);
  const appDir = path.join(appsDir, `${release.version}-${key}`);
  const needBase = !fs.existsSync(path.join(baseDir, INSTALLED_MARKER));
  Object.assign(progress, { done: 0, total: (needBase ? release.base.bytes : 0) + release.app.bytes });
  // Refresh a reused base's marker so a concurrent prune treats it as in use while the app layer installs.
  if (!needBase) { const now = new Date(); try { fs.utimesSync(path.join(baseDir, INSTALLED_MARKER), now, now); } catch { /* checked again below */ } }
  if (needBase) {
    log(`Downloading DreamCut's components for ${key} (${Math.round(release.base.bytes / 1024 ** 2)} MB, once)…`);
    await installArchive(release.base, basesDir, baseDir, dir => fs.writeFileSync(path.join(dir, INSTALLED_MARKER), ''));
  }
  if (!fs.existsSync(path.join(appDir, INSTALLED_MARKER))) {
    log(`Downloading DreamCut ${release.version} (${Math.round(release.app.bytes / 1024 ** 2)} MB)…`);
    await installArchive(release.app, appsDir, appDir, dir => {
      const manifest = readJson(path.join(dir, APP_MANIFEST));
      if (manifest?.version !== release.version || manifest?.base !== release.base.id) throw new Error('The update feed does not match the download.');
      // Windows junctions need absolute targets and no symlink privilege; elsewhere a relative link survives moves.
      if (process.platform === 'win32') fs.symlinkSync(path.join(baseDir, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
      else fs.symlinkSync(path.join('..', '..', 'base', path.basename(baseDir), 'node_modules'), path.join(dir, 'node_modules'), 'dir');
      if (!fs.existsSync(path.join(baseDir, INSTALLED_MARKER))) throw new Error('DreamCut\'s components were removed during the install; run it again.');
      fs.writeFileSync(path.join(dir, INSTALLED_MARKER), '');
    });
  }
  const latest = installedApps()[0];
  if (latest) fs.writeFileSync(path.join(runtimes, 'latest-installed.json'), JSON.stringify({ version: latest.version, dir: path.basename(latest.dir) }));
  log(`DreamCut ${release.version} is installed.`);
  return appDir;
}

/**
 * Keep the two newest versions and any in use, including the shared editor's; remove bases no kept version
 * needs, except recent ones: `install` places a base before its app layer, so a new base may match no app yet.
 */
function prune(inUse) {
  const apps = installedApps();
  const editorRoot = readJson(path.join(appDataRoot(), 'runtime', 'editor.json'))?.root;
  const keep = new Set([...apps.slice(0, 2).map(app => app.dir), ...inUse, ...(typeof editorRoot === 'string' ? [editorRoot] : [])]);
  for (const app of apps) if (!keep.has(app.dir)) fs.rmSync(app.dir, { recursive: true, force: true });
  const neededBases = new Set(installedApps().map(app => `${app.base}-${key}`));
  if (fs.existsSync(basesDir)) for (const name of fs.readdirSync(basesDir)) {
    if (!name.endsWith(`-${key}`) || neededBases.has(name)) continue;
    const dir = path.join(basesDir, name);
    let modified = 0;
    try { modified = fs.statSync(path.join(dir, INSTALLED_MARKER)).mtimeMs; } catch { try { modified = fs.statSync(dir).mtimeMs; } catch { /* already gone */ } }
    if (Date.now() - modified < BASE_GRACE_MS) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let checking = false;
async function checkForUpdate(running) {
  if (checking) return;
  checking = true;
  try {
    const release = await latestRelease();
    const current = installedApps()[0];
    if (release && (!current || compareVersions(release.version, current.version) > 0)) {
      await install(release, { quiet: true });
      say(`DreamCut ${release.version} is ready; choose Update in the editor to switch.`);
    }
    prune([running]);
  } catch (error) { say(`DreamCut could not check for updates: ${error.message}`); }
  finally { checking = false; }
}

const args = process.argv.slice(2);
const keepCurrent = running => {
  // Long-running commands keep the runtime current while they run.
  if (process.env.DREAMCUT_RUNTIME_DIR || (args[0] ?? 'open') === 'status') return;
  void checkForUpdate(running);
  setInterval(() => void checkForUpdate(running), CHECK_SECONDS * 1000).unref();
};
let runtime;
try {
  if (process.env.DREAMCUT_RUNTIME_DIR) {
    runtime = path.resolve(process.env.DREAMCUT_RUNTIME_DIR);
  } else if (args[0] === 'install') {
    if (!takeInstallLock()) {
      say('DreamCut is already being installed by another process; waiting for it to finish…');
      while (installerRunning()) await new Promise(resolve => setTimeout(resolve, 1000));
      if (!installedApps()[0]) throw new Error('The other install did not finish. Run `npx dreamcut install` again.');
      say(`DreamCut ${installedApps()[0].version} is installed.`);
      process.exit(0);
    }
    const reporter = setInterval(writeProgress, 1000);
    try {
      const release = await latestRelease();
      if (!release) throw new Error(`DreamCut has no runtime for ${key} yet.`);
      const current = installedApps()[0];
      if (current && compareVersions(current.version, release.version) >= 0) say(`DreamCut ${current.version} is installed and up to date.`);
      else await install(release, { quiet: args.includes('--background') });
      prune([]);
      writeProgress({ finished: true });
    } catch (error) {
      writeProgress({ error: error.cause?.message ? `${error.message} (${error.cause.message})` : error.message });
      throw error;
    } finally { clearInterval(reporter); releaseInstallLock(); }
    process.exit(0);
  } else {
    runtime = installedApps()[0]?.dir;
    if (!runtime && args[0] === 'mcp') {
      // First run inside an agent app: answer the agent now and download in the background.
      // The download runs in a detached installer so closing this agent session does not stop it.
      const reported = () => readJson(progressFile) ?? {};
      const percent = ({ done = 0, total = 0 }) => (total ? Math.min(99, Math.floor((done / total) * 100)) : 0);
      const session = serveWhileInstalling({
        version: bundled.version,
        status: () => { const now = reported(); return `DreamCut is downloading its editor for this computer (${percent(now)}% of ${Math.round((now.total ?? 0) / 1024 ** 2) || 'about 300'} MB). The download continues if this chat closes.`; },
        install: async () => {
          if (!installerRunning()) {
            fs.mkdirSync(runtimes, { recursive: true });
            fs.rmSync(progressFile, { force: true });
            const log = fs.openSync(path.join(runtimes, 'install.log'), 'a');
            spawn(process.execPath, [fileURLToPath(import.meta.url), 'install', '--background'], { detached: true, stdio: ['ignore', log, log], env: process.env }).unref();
            fs.closeSync(log);
          }
          for (let waited = 0; ; waited += 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const done = installedApps()[0]?.dir;
            if (done && !installerRunning()) return done;
            const now = reported();
            if (now.error) throw new Error(now.error);
            // The installer takes its lock within a few seconds; one that never appears or vanished without installing failed.
            if (waited > 15 && !installerRunning() && !done) throw new Error('the installer stopped; see install.log in DreamCut\'s app data');
          }
        },
        start: dir => {
          keepCurrent(dir);
          return spawn(process.execPath, [path.join(dir, 'bin', 'dreamcut.mjs'), ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
        },
      });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (session.child) session.child.kill(signal); else process.exit(0); });
      process.exit(await session.exited);
    }
    if (!runtime) {
      const release = await latestRelease();
      if (!release) throw new Error(`DreamCut has no runtime for ${key} yet.`);
      runtime = await install(release);
    }
  }
  const child = spawn(process.execPath, [path.join(runtime, 'bin', 'dreamcut.mjs'), ...args], { stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  keepCurrent(runtime);
} catch (error) {
  say(`DreamCut could not start: ${error.message}`);
  process.exit(1);
}
