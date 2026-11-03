import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// Release source maps: uploaded to DreamCut's Sentry project so error stack traces read as source, then
// deleted so no map ships. Only desktop/build.mjs calls this, in the isolated build source.
export const SOURCE_MAP_DIRS = ['.next-desktop/static', '.next-desktop/server', 'workers', 'mcp'];
const CODE = /\.(?:[cm]?js)$/;
// The map comment can sit before the debug ID line Sentry's inject adds; that line stays (it pairs errors with maps).
const MAP_COMMENT = /^\/\/# sourceMappingURL=\S+\.map[ \t]*\n?/gm;

/** Sentry's command-line tool, installed with @sentry/nextjs. */
export function sentryCli(root) {
  const require = createRequire(path.join(root, 'package.json'));
  const nested = createRequire(require.resolve('@sentry/nextjs'));
  return path.join(path.dirname(nested.resolve('@sentry/cli/package.json')), 'bin', 'sentry-cli');
}

/** Gives each compiled file and its map a shared debug ID, then uploads the maps under the release. */
export function uploadSourceMaps(root, { token, org, project, release, dirs = SOURCE_MAP_DIRS, run = execFileSync, cli = sentryCli(root) }) {
  const present = dirs.filter(dir => { try { return statSync(path.join(root, dir)).isDirectory(); } catch { return false; } });
  const env = { ...process.env, SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJECT: project };
  run(cli, ['sourcemaps', 'inject', ...present], { cwd: root, env, stdio: 'inherit' });
  // sentry-cli does not retry a chunk upload that drops mid-transfer (TLS "bad record mac", connection reset).
  for (let attempt = 1; ; attempt += 1) {
    try { run(cli, ['sourcemaps', 'upload', '--org', org, '--project', project, '--release', release, ...present], { cwd: root, env, stdio: 'inherit' }); break; }
    catch (error) { if (attempt >= 3) throw error; console.warn(`Source map upload failed (attempt ${attempt} of 3); retrying.`); }
  }
  return present;
}

/** Deletes every .map file under the folders and the comments that point at them. Returns files removed. */
export async function removeSourceMaps(root, dirs = SOURCE_MAP_DIRS) {
  let removed = 0;
  const walk = async folder => {
    const entries = await fs.readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') await walk(file); continue; }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.map')) { await fs.rm(file); removed += 1; continue; }
      if (CODE.test(entry.name)) {
        const text = await fs.readFile(file, 'utf8');
        const stripped = text.replace(MAP_COMMENT, '');
        if (stripped !== text) await fs.writeFile(file, stripped);
      }
    }
  };
  for (const dir of dirs) await walk(path.join(root, dir));
  return removed;
}

/** Map files anywhere in a staged package outside node_modules (third-party maps stay). */
export async function shippedSourceMaps(dir) {
  const found = [];
  const walk = async folder => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') await walk(file); }
      else if (entry.isFile() && entry.name.endsWith('.map')) found.push(path.relative(dir, file));
    }
  };
  await walk(dir);
  return found;
}
