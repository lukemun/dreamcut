#!/usr/bin/env node
/**
 * Build this platform's DreamCut runtime as two archives: the production editor service, the service
 * process and the `dreamcut` command (the app layer, published with every version), and its traced
 * dependencies (the base layer, node_modules, republished only when its contents change). The npm launcher
 * (packaging/launcher) downloads and verifies both on first run, then keeps the app layer current from the
 * update feed (mcp/runtime-updates.mjs). No Electron, no bundled media tools (FFmpeg comes from the
 * creator's own install), no creator data.
 *
 * Prerequisites: `pnpm desktop:build` then `node desktop/package.mjs --service-only`.
 * Output in dist/web-runtime/: dreamcut-app-<platform>-<arch>-<version>.tar.gz,
 * dreamcut-base-<platform>-<arch>-<id>.tar.gz and latest.json (the update feed, naming each archive's
 * GitHub Release address). Publish them with packaging/publish-release.mjs; publishing is the owner's step.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyRuntime } from '../desktop/copy-runtime.mjs';
import { FROM_MCP, shellFiles } from '../desktop/shell-files.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = path.join(repo, '.desktop-build', 'stage', 'service');
const { version } = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'));
const key = `${process.platform}-${process.arch}`;
const name = `dreamcut-app-${key}-${version}`;
const dist = path.join(repo, 'dist', 'web-runtime');
const out = path.join(dist, name);

await fs.access(path.join(service, 'desktop-next-config.json')).catch(() => {
  throw new Error('No staged service. Run `pnpm desktop:build` and `node desktop/package.mjs --service-only` first.');
});
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
for (const entry of await fs.readdir(dist)) if (entry.startsWith('dreamcut-runtime-')) await fs.rm(path.join(dist, entry), { recursive: true, force: true });
// Windows extraction must not depend on symlink privilege, so its runtime is flattened.
if (process.platform === 'win32') await fs.cp(service, out, { recursive: true, dereference: true });
else { await fs.mkdir(out); await copyRuntime(service, out, { contents: true }); }

// The service process and its relative imports, from this checkout (the same closure the desktop shell ships).
await fs.mkdir(path.join(out, 'desktop'), { recursive: true });
// The watchdog is forked by URL, not imported, so it is an explicit entry (as in the desktop shell's list).
for (const file of await shellFiles(path.join(repo, 'desktop'), ['service.mjs', 'worker-crash-watchdog.mjs'])) {
  await fs.copyFile(path.join(repo, FROM_MCP.has(file) ? 'mcp' : 'desktop', file), path.join(out, 'desktop', file));
}
await fs.mkdir(path.join(out, 'bin'), { recursive: true });
await fs.copyFile(path.join(repo, 'bin', 'dreamcut.mjs'), path.join(out, 'bin', 'dreamcut.mjs'));
// Every distributed copy carries the license and the third-party notices.
for (const file of ['LICENSE', 'docs/legal/THIRD_PARTY_NOTICES.md']) await fs.copyFile(path.join(repo, file), path.join(out, path.basename(file)));
await fs.chmod(path.join(out, 'bin', 'dreamcut.mjs'), 0o755);
for (const file of ['editor-runtime.mjs', 'projects-root.mjs', 'runtime-updates.mjs']) await fs.copyFile(path.join(repo, 'mcp', file), path.join(out, 'mcp', file));

// Electron belongs to the desktop shell only.
await fs.rm(path.join(out, 'node_modules', 'electron'), { recursive: true, force: true });
for (const entry of await fs.readdir(path.join(out, 'node_modules', '.pnpm')).catch(() => [])) {
  if (entry.startsWith('electron@') || entry.startsWith('@electron+') || entry.startsWith('@electron-internal+')) await fs.rm(path.join(out, 'node_modules', '.pnpm', entry), { recursive: true, force: true });
}
await fs.writeFile(path.join(out, 'package.json'), JSON.stringify({ name: 'dreamcut-runtime', version, private: true }, null, 2));

// The base layer's identity is its contents: every path, file's bytes and link target, plus the Node ABI its
// native modules were built for. Unchanged dependencies keep the same id, so updates skip the base download.
async function contentId(dir) {
  const hash = createHash('sha256');
  hash.update(`node-abi:${process.versions.modules}\n`);
  const walk = async relative => {
    const entries = (await fs.readdir(path.join(dir, relative), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const child = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) hash.update(`l ${child} ${await fs.readlink(path.join(dir, child))}\n`);
      else if (entry.isDirectory()) { hash.update(`d ${child}\n`); await walk(child); }
      else hash.update(`f ${child} ${createHash('sha256').update(await fs.readFile(path.join(dir, child))).digest('hex')}\n`);
    }
  };
  await walk('node_modules');
  return hash.digest('hex').slice(0, 16);
}
const baseId = await contentId(out);
const baseName = `dreamcut-base-${key}-${baseId}`;
const baseDir = path.join(dist, baseName);
await fs.rm(baseDir, { recursive: true, force: true });
await fs.mkdir(baseDir);
await fs.rename(path.join(out, 'node_modules'), path.join(baseDir, 'node_modules'));
await fs.writeFile(path.join(out, 'dreamcut-app.json'), JSON.stringify({ version, platform: key, base: baseId }, null, 2));

const sha256Of = file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
async function pack(folder) {
  const archive = path.join(dist, `${folder}.tar.gz`);
  await fs.rm(archive, { force: true });
  execFileSync('tar', ['-czf', archive, '-C', dist, folder], { stdio: 'inherit' });
  return { file: path.basename(archive), sha256: await sha256Of(archive), bytes: (await fs.stat(archive)).size, folder };
}
const feedPath = path.join(dist, 'latest.json');
const feed = JSON.parse(await fs.readFile(feedPath, 'utf8').catch(() => '{}'));
const app = await pack(name);
// An unchanged base keeps its published archive (and checksum).
const previousBase = Object.values(feed.platforms ?? {}).map(entry => entry.base).find(entry => entry?.id === baseId && entry.folder === baseName);
const reuseBase = previousBase && await fs.access(path.join(dist, previousBase.file)).then(() => true, () => false);
// Archives are published as GitHub Release assets (packaging/publish-release.mjs). Each feed entry names its
// own address, so an unchanged base keeps pointing at the release that first attached it.
const releaseRepo = process.env.DREAMCUT_RELEASE_REPO ?? 'lukemun/dreamcut';
const assetUrl = file => `https://github.com/${releaseRepo}/releases/download/v${version}/${file}`;
app.url = assetUrl(app.file);
const base = reuseBase ? { ...previousBase, url: previousBase.url ?? assetUrl(previousBase.file) } : { id: baseId, ...await pack(baseName) };
base.url ??= assetUrl(base.file);
// Run in place for local checks (DREAMCUT_RUNTIME_DIR): the unpacked app layer links its base, as installed.
await fs.symlink(path.join('..', baseName, 'node_modules'), path.join(out, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

const platforms = feed.version === version ? feed.platforms ?? {} : {};
await fs.writeFile(feedPath, JSON.stringify({ version, released_at: new Date().toISOString(), platforms: { ...platforms, [key]: { app, base } } }, null, 2));
await fs.rm(path.join(dist, 'runtime-manifest.json'), { force: true });
const mib = bytes => (bytes / 1024 ** 2).toFixed(0);
console.log(`Built ${app.file} (${mib(app.bytes)} MiB) and ${base.file} (${mib(base.bytes)} MiB); feed: ${path.relative(repo, feedPath)}.`);
