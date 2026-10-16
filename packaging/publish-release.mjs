#!/usr/bin/env node
/**
 * Publish the built runtime as a GitHub Release of the public repository. Installed launchers read the
 * feed from the latest release (`https://github.com/<repo>/releases/latest/download/latest.json`) and
 * download each archive from the address the feed names, so the release stays a draft until every new
 * archive and the feed are attached; publishing it then makes the feed live in one step.
 *
 *   node packaging/publish-release.mjs [--dry-run] [--repo owner/name]
 *
 * Uses the GitHub CLI (`gh`, signed in with permission to create releases). Rules:
 * - Only archives whose feed address belongs to this version's release are attached. A base layer reused
 *   from an earlier release must still be attached there.
 * - Attached archives never change: one already attached with the same name and size is kept; a
 *   different size stops the publish (bump the version and rebuild instead).
 * - Platforms built on other machines for the same version are merged from the release's own feed.
 * - Release notes come from this version's section of CHANGELOG.md.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareVersions } from '../mcp/runtime-updates.mjs';
import { feedArchives, mergeFeeds, sha256File } from './upload-runtime.mjs';

const say = message => process.stderr.write(`${message}\n`);
const releaseUrl = (repo, tag) => `https://github.com/${repo}/releases/download/${tag}/`;

/**
 * What to attach for one release: archives addressed to this release (new or already attached), archives
 * reused from earlier releases (to check), and the merged feed. Pure, so tests need no network.
 */
export function planRelease({ feed, repo, tag, published = null, attached = new Map() }) {
  const merged = mergeFeeds(feed, published);
  const own = releaseUrl(repo, tag);
  const upload = [], keep = [], reused = [];
  for (const archive of feedArchives(merged)) {
    if (typeof archive.url !== 'string' || !archive.url.startsWith('https://')) {
      throw new Error(`${archive.file} has no download address in latest.json. Rebuild the runtime.`);
    }
    if (!archive.url.startsWith(own)) { reused.push(archive); continue; }
    if (archive.url !== `${own}${archive.file}`) throw new Error(`${archive.file} has a mismatched address in latest.json.`);
    const size = attached.get(archive.file);
    if (size === undefined) upload.push(archive);
    else if (size === archive.bytes) keep.push(archive);
    else throw new Error(`${archive.file} is already attached to ${tag} with a different size. Attached archives never change: bump the version and rebuild.`);
  }
  return { feed: merged, upload, keep, reused };
}

/** This version's section of CHANGELOG.md, for the release notes. */
export function changelogSection(text, version) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`).test(line));
  if (start < 0) return `DreamCut ${version}`;
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim() || `DreamCut ${version}`;
}

const gh = (args, options = {}) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });

async function main() {
  const option = name => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : undefined; };
  const dryRun = process.argv.includes('--dry-run');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dist = path.join(repoRoot, 'dist', 'web-runtime');
  const repo = option('repo') ?? process.env.DREAMCUT_RELEASE_REPO ?? 'lukemun/dreamcut';
  const { version } = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const feed = JSON.parse(await fs.readFile(path.join(dist, 'latest.json'), 'utf8'));
  if (feed.version !== version) throw new Error(`dist/web-runtime is ${feed.version}, but package.json is ${version}. Rebuild the runtime.`);
  const tag = `v${version}`;

  // Check every local archive against the feed before touching GitHub.
  for (const archive of feedArchives(feed).filter(archive => archive.url?.startsWith(releaseUrl(repo, tag)))) {
    const file = path.join(dist, archive.file);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) throw new Error(`${archive.file} is in latest.json but not in ${dist}. Rebuild the runtime.`);
    if (stat.size !== archive.bytes || await sha256File(file) !== archive.sha256) throw new Error(`${archive.file} does not match latest.json. Rebuild the runtime.`);
  }

  let exists = false, attached = new Map(), published = null;
  let release = null;
  try {
    release = JSON.parse(gh(['release', 'view', tag, '--repo', repo, '--json', 'assets'], { stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    // Only a missing release means "create it"; sign-in, network or a missing gh must stop the publish.
    if (!/release not found/i.test(String(error.stderr ?? ''))) throw new Error(`Could not read ${repo} release ${tag}: ${String(error.stderr || error.message).trim()}`);
  }
  if (release) {
    exists = true;
    attached = new Map(release.assets.map(asset => [asset.name, asset.size]));
    if (attached.has('latest.json')) {
      const scratch = await fs.mkdtemp(path.join(dist, '.release-feed-'));
      try {
        gh(['release', 'download', tag, '--repo', repo, '--pattern', 'latest.json', '--dir', scratch]);
        published = JSON.parse(await fs.readFile(path.join(scratch, 'latest.json'), 'utf8'));
      } finally { await fs.rm(scratch, { recursive: true, force: true }); }
    }
  }

  // Launchers follow the latest release, so an older version must never become it.
  let latestTag = null;
  try { latestTag = JSON.parse(gh(['release', 'view', '--repo', repo, '--json', 'tagName'], { stdio: ['ignore', 'pipe', 'pipe'] })).tagName; }
  catch (error) { if (!/release not found/i.test(String(error.stderr ?? ''))) throw new Error(`Could not read ${repo}'s latest release: ${String(error.stderr || error.message).trim()}`); }
  if (latestTag && latestTag !== tag && compareVersions(version, latestTag.replace(/^v/, '')) < 0) {
    throw new Error(`${repo}'s latest release is ${latestTag}, newer than ${tag}. Nothing was changed.`);
  }
  const plan = planRelease({ feed, repo, tag, published, attached });
  for (const archive of plan.reused) {
    const response = await fetch(archive.url, { method: 'HEAD', redirect: 'follow' });
    if (!response.ok) throw new Error(`${archive.file} is reused from an earlier release but ${archive.url} is not downloadable (${response.status}).`);
    say(`${archive.file}: reused from an earlier release.`);
  }
  for (const archive of plan.keep) say(`${archive.file}: already attached to ${tag}.`);
  const mib = bytes => (bytes / 1024 ** 2).toFixed(0);
  if (dryRun) {
    for (const archive of plan.upload) say(`${archive.file}: would attach ${mib(archive.bytes)} MiB to ${tag}.`);
    say(`Would ${exists ? 'update' : 'create'} ${repo} release ${tag} with latest.json (${Object.keys(plan.feed.platforms).join(', ')}).`);
    return;
  }

  if (!exists) {
    const notes = changelogSection(await fs.readFile(path.join(repoRoot, 'CHANGELOG.md'), 'utf8').catch(() => ''), version);
    gh(['release', 'create', tag, '--repo', repo, '--draft', '--title', `DreamCut ${version}`, '--notes', notes]);
    say(`Created draft release ${tag}.`);
  }
  for (const archive of plan.upload) {
    say(`${archive.file}: attaching ${mib(archive.bytes)} MiB…`);
    gh(['release', 'upload', tag, path.join(dist, archive.file), '--repo', repo], { stdio: 'inherit' });
  }
  // The feed goes up last, replacing any earlier copy on this release; the local feed keeps the merged result.
  await fs.writeFile(path.join(dist, 'latest.json'), `${JSON.stringify(plan.feed, null, 2)}\n`);
  gh(['release', 'upload', tag, path.join(dist, 'latest.json'), '--repo', repo, '--clobber'], { stdio: 'inherit' });
  gh(['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
  say(`Published DreamCut ${version} (${Object.keys(plan.feed.platforms).join(', ')}): https://github.com/${repo}/releases/tag/${tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { say(`Publish stopped: ${error.message}`); process.exit(1); });
}
