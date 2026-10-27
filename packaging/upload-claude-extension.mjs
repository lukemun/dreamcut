#!/usr/bin/env node
/**
 * Publish the built Claude desktop extension to Vercel Blob under dreamcut/claude/: the versioned
 * dreamcut-<version>.mcpb (never replaced with different bytes; bump the version instead), its .sha256, then
 * dreamcut.mcpb, the stable copy the site links to (dreamcut.io/downloads/claude/dreamcut.mcpb, short cache).
 *
 *   node --env-file=.env.local packaging/upload-claude-extension.mjs [--dry-run]
 *
 * Build first with packaging/build-claude-extension.mjs. The token comes from the environment only and is
 * never printed. Publishing is the owner's step.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const prefix = 'dreamcut/claude';
const { version } = JSON.parse(await fs.readFile(path.join(repo, 'dist', 'npm', 'dreamcut', 'package.json'), 'utf8'));
const name = `dreamcut-${version}.mcpb`;
const bytes = await fs.readFile(path.join(repo, 'dist', 'claude-extension', name));
const sha256 = createHash('sha256').update(bytes).digest('hex');
console.log(`${name}: ${bytes.length} bytes, sha256 ${sha256}`);
if (dryRun) process.exit(0);

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not set (run with --env-file=.env.local).');
const { head, put, BlobNotFoundError } = await import('@vercel/blob');
const existing = await head(`${prefix}/${name}`, { token }).catch(error => { if (error instanceof BlobNotFoundError) return null; throw error; });
const YEAR = 365 * 24 * 60 * 60;
const options = { access: 'public', addRandomSuffix: false, token, contentType: 'application/zip' };
if (existing) {
  const published = await fetch(existing.url).then(response => response.arrayBuffer());
  if (createHash('sha256').update(Buffer.from(published)).digest('hex') !== sha256) {
    throw new Error(`${name} is already published with different bytes. Bump the version and rebuild.`);
  }
  console.log(`${name} is already published.`);
} else {
  await put(`${prefix}/${name}`, bytes, { ...options, cacheControlMaxAge: YEAR });
  await put(`${prefix}/${name}.sha256`, `${sha256}  ${name}\n`, { access: 'public', addRandomSuffix: false, token, contentType: 'text/plain', cacheControlMaxAge: YEAR });
  console.log(`Published ${name}.`);
}
// The stable copy last, so the site's link only ever names a complete, published version.
const stable = await put(`${prefix}/dreamcut.mcpb`, bytes, { ...options, cacheControlMaxAge: 60, allowOverwrite: true });
console.log(`Published dreamcut.mcpb → ${stable.url}`);
