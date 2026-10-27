/**
 * Whether `pnpm release` (packaging/release.mjs) publishes this checkout's version: only a version that is
 * neither held in packaging/release-hold.json nor already a GitHub Release. With `addPlatform` (run on
 * another computer, e.g. Windows), an existing release gains this platform's download when it lacks it.
 * The npm launcher is published only when npm lacks that version.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/** Pure decision, so tests need no network. */
export function releaseDecision({ version, held = [], released, onNpm, addPlatform = null, platformPublished = false }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || '')) throw Error(`Invalid version: ${version}`);
  if (held.includes(version)) return { release: false, npm: false, reason: `${version} is held in packaging/release-hold.json.` };
  if (addPlatform) {
    if (!released) return { release: false, npm: false, reason: `${version} is not released yet; release it first, then add ${addPlatform}.` };
    if (platformPublished) return { release: false, npm: false, reason: `${version} already has a ${addPlatform} download.` };
    return { release: true, npm: false, reason: `${version} gains a ${addPlatform} download.` };
  }
  if (released) return { release: false, npm: !onNpm, reason: `${version} is already released.` };
  return { release: true, npm: !onNpm, reason: `${version} is new.` };
}

// Windows runs gh, npm and pnpm through their .cmd shims, which need a shell.
const exists = (command, args) => { try { execFileSync(command, args, { stdio: 'ignore', shell: process.platform === 'win32' }); return true; } catch { return false; } };

/** The decision for this checkout, asking GitHub (gh) and npm what is already published. */
export function currentDecision(repo = 'lukemun/dreamcut', { addPlatform = false } = {}) {
  const { name, version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const held = JSON.parse(fs.readFileSync('packaging/release-hold.json', 'utf8')).held ?? [];
  const platform = `${process.platform}-${process.arch}`;
  return { version, ...releaseDecision({
    version, held,
    released: exists('gh', ['release', 'view', `v${version}`, '--repo', repo]),
    onNpm: exists('npm', ['view', `${name}@${version}`, 'version']),
    addPlatform: addPlatform ? platform : null,
    platformPublished: addPlatform && releasedPlatforms(repo, version).includes(platform),
  }) };
}

/** Platforms the release's update feed already lists. */
function releasedPlatforms(repo, version) {
  try {
    const feed = JSON.parse(execFileSync('gh', ['release', 'download', `v${version}`, '--repo', repo, '--pattern', 'latest.json', '--output', '-'], { encoding: 'utf8', shell: process.platform === 'win32' }));
    return Object.keys(feed.platforms ?? {});
  } catch { return []; }
}
