#!/usr/bin/env node
/**
 * Publish the built runtime to Vercel Blob: every archive named by dist/web-runtime/latest.json, then the
 * update feed itself. Installed launchers read the feed (mcp/runtime-updates.mjs), so it goes up last and
 * only after every archive it names is in place and the right size.
 *
 *   BLOB_READ_WRITE_TOKEN=… node packaging/upload-runtime.mjs [--dry-run] [--prefix dreamcut/runtime] [--base-url https://dreamcut.io/downloads/runtime]
 *   node --env-file=.env.local packaging/upload-runtime.mjs
 *
 * The token comes from the environment only and is never printed. Rules:
 * - A published archive never changes. Each has a `<file>.sha256` beside it; an archive already published
 *   with the same checksum is skipped, and one with a different checksum stops the upload (bump the
 *   version and rebuild instead), because launchers verify downloads against the feed.
 * - The feed is merged with the published one: platforms built on other machines for the same version
 *   are kept. A published feed with a newer version is never replaced.
 * - Archives are public, immutable and cached for a year; the feed is cached for a minute.
 * Prints the download location to pass to `packaging/pack-launcher.mjs --base-url`.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareVersions } from '../mcp/runtime-updates.mjs';

const YEAR = 365 * 24 * 60 * 60;
const say = message => process.stderr.write(`${message}\n`);

export const sha256File = file => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});

/** Every archive the feed names, once each, after checking each entry's shape. */
export function feedArchives(feed) {
  const seen = new Map();
  for (const [platform, entry] of Object.entries(feed.platforms ?? {})) {
    // media_source (FFmpeg's corresponding source) is optional; the launcher never downloads it.
    for (const layer of ['base', 'app', 'media_source']) {
      if (layer === 'media_source' && !entry?.[layer]) continue;
      const archive = entry?.[layer];
      if (!archive?.file || !/^[\w.-]+$/.test(archive.file) || !Number.isInteger(archive.bytes) || !/^[0-9a-f]{64}$/.test(archive.sha256 ?? '')) {
        throw new Error(`latest.json has a malformed ${layer} entry for ${platform}.`);
      }
      seen.set(archive.file, archive);
    }
  }
  return [...seen.values()];
}

/** The feed to publish: local platforms win; same-version platforms built elsewhere are kept. */
export function mergeFeeds(local, published) {
  if (!published?.version) return local;
  const order = compareVersions(local.version, published.version);
  if (order < 0) throw new Error(`The published feed is ${published.version}, newer than this build (${local.version}). Nothing was changed.`);
  if (order > 0) return local;
  return { ...local, platforms: { ...published.platforms, ...local.platforms } };
}

/**
 * Upload with an injected store, so tests can run without a network or token. `store` has `head(pathname)`
 * (null when absent), `put(pathname, body, options)` (returns `{ url }`) and `read(pathname)` (text or null).
 */
export async function publishRuntime({ dist, prefix, store, publicBaseUrl, dryRun = false, log = say }) {
  const feed = JSON.parse(await fs.readFile(path.join(dist, 'latest.json'), 'utf8'));
  const archives = feedArchives(feed);
  const key = name => `${prefix}/${name}`;

  // Check every local file against the feed before touching the store.
  for (const archive of archives) {
    const file = path.join(dist, archive.file);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) throw new Error(`${archive.file} is in latest.json but not in ${dist}. Rebuild the runtime.`);
    if (stat.size !== archive.bytes || await sha256File(file) !== archive.sha256) throw new Error(`${archive.file} does not match latest.json. Rebuild the runtime.`);
  }

  const publishedText = await store.read(key('latest.json'));
  const merged = mergeFeeds(feed, publishedText ? JSON.parse(publishedText) : null);
  const dropped = Object.keys(JSON.parse(publishedText ?? '{}').platforms ?? {}).filter(platform => !merged.platforms[platform]);
  if (dropped.length) log(`Note: ${merged.version} replaces the published feed; it has no runtime for ${dropped.join(', ')} yet.`);

  let location = null;
  for (const archive of archives) {
    const existing = await store.head(key(archive.file));
    if (existing) {
      const publishedSha = (await store.read(key(`${archive.file}.sha256`)))?.trim();
      if (publishedSha && publishedSha !== archive.sha256) {
        throw new Error(`${archive.file} is already published with different contents. Published archives never change: bump the version and rebuild.`);
      }
      if (existing.size === archive.bytes && publishedSha === archive.sha256) {
        log(`${archive.file}: already published.`);
        location ??= existing.url;
        continue;
      }
      // A partial or unverified earlier upload of the same name: replace it.
    }
    if (dryRun) { log(`${archive.file}: would upload ${(archive.bytes / 1024 ** 2).toFixed(0)} MiB.`); continue; }
    log(`${archive.file}: uploading ${(archive.bytes / 1024 ** 2).toFixed(0)} MiB…`);
    let reported = -1;
    const result = await store.put(key(archive.file), createReadStream(path.join(dist, archive.file)), {
      contentType: 'application/gzip', cacheControlMaxAge: YEAR, multipart: true, allowOverwrite: Boolean(existing),
      onUploadProgress: ({ percentage }) => { const step = Math.floor(percentage / 10) * 10; if (step > reported) { reported = step; log(`  ${step}%`); } },
    });
    await store.put(key(`${archive.file}.sha256`), `${archive.sha256}\n`, { contentType: 'text/plain', cacheControlMaxAge: YEAR, allowOverwrite: true });
    location ??= result.url;
  }

  const baseUrl = publicBaseUrl?.replace(/\/$/, '') ?? (location ? location.slice(0, location.lastIndexOf('/')) : null);
  // Rebase every platform, including shared archives; custom stores default to their actual address.
  if (baseUrl) {
    feedArchives(merged);
    for (const entry of Object.values(merged.platforms)) {
      // media_source too: FFmpeg's licence needs its source downloadable wherever the runtime is.
      for (const layer of ['app', 'base', 'media_source']) if (entry[layer]) entry[layer].url = `${baseUrl}/${entry[layer].file}`;
    }
  }
  if (dryRun) { log(`Would publish latest.json for ${merged.version} (${Object.keys(merged.platforms).join(', ')}).`); return { feed: merged, baseUrl: null }; }
  for (const archive of feedArchives(merged)) {
    const published = await store.head(key(archive.file));
    if (published?.size !== archive.bytes) throw new Error(`${archive.file} is not in place after uploading; latest.json was not changed.`);
  }
  await store.put(key('latest.json'), `${JSON.stringify(merged, null, 2)}\n`, { contentType: 'application/json', cacheControlMaxAge: 60, allowOverwrite: true });
  log(`Published DreamCut ${merged.version} (${Object.keys(merged.platforms).join(', ')}).`);
  return { feed: merged, baseUrl };
}

/** The Vercel Blob store behind `publishRuntime`. Public, fixed names (no random suffix). */
export async function vercelBlobStore(token) {
  const { head, put, BlobNotFoundError } = await import('@vercel/blob');
  return {
    async head(pathname) {
      try { const result = await head(pathname, { token }); return { size: result.size, url: result.url }; }
      catch (error) { if (error instanceof BlobNotFoundError) return null; throw error; }
    },
    put: (pathname, body, options) => put(pathname, body, { ...options, access: 'public', addRandomSuffix: false, token }),
    async read(pathname) {
      const found = await this.head(pathname);
      if (!found) return null;
      // Bypass caches: the feed and checksum must be current.
      const response = await fetch(`${found.url}?check=${Date.now()}`, { cache: 'no-store' });
      return response.ok ? response.text() : null;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const option = name => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : undefined; };
  const dryRun = process.argv.includes('--dry-run');
  const prefix = (option('prefix') ?? 'dreamcut/runtime').replace(/^\/+|\/+$/g, '');
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) { say('Set BLOB_READ_WRITE_TOKEN (Vercel → Storage → your Blob store → .env.local), then run again.'); process.exit(2); }
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'web-runtime');
  try {
    const { baseUrl, feed } = await publishRuntime({ dist, prefix, publicBaseUrl: option('base-url'), store: await vercelBlobStore(token), dryRun });
    if (baseUrl) {
      const live = await fetch(`${baseUrl}/latest.json?check=${Date.now()}`, { cache: 'no-store' }).then(response => (response.ok ? response.json() : null), () => null);
      say(live?.version === feed.version ? `Feed is live: ${baseUrl}/latest.json (${live.version}).`
        : `Uploaded ${feed.version}; ${baseUrl}/latest.json still shows ${live?.version ?? 'nothing'} until its one-minute cache expires.`);
      console.log(`Download location for the launcher:\n  node packaging/pack-launcher.mjs --base-url ${baseUrl}`);
    }
  } catch (error) {
    say(`Upload stopped: ${error.message}`);
    process.exit(1);
  }
}
