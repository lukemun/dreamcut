/**
 * Release DreamCut from this Mac: the steps in docs/releasing.md, in order, stopping at the first failure.
 * Run only when the owner asks for a release, after bumping package.json's version and adding its
 * CHANGELOG.md section on a clean, pushed main.
 *
 *   pnpm release [--dry-run] [--add-platform] [--repo owner/name]
 *
 * --dry-run builds and verifies everything, then shows what would be published without publishing.
 * --add-platform, run on another computer (Windows, an Intel Mac) after the main release, attaches that
 * computer's download to the same release; publish-release merges it into the update feed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { currentDecision } from './release-gate.mjs';

const dryRun = process.argv.includes('--dry-run');
const addPlatform = process.argv.includes('--add-platform');
const repoArg = process.argv.indexOf('--repo');
const repo = repoArg > 0 ? process.argv[repoArg + 1] : 'lukemun/dreamcut';
// Windows runs pnpm, npm and gh through .cmd shims, which need a shell.
const shell = process.platform === 'win32';
const run = (command, args) => { console.log(`\n$ ${[command, ...args].join(' ')}`); execFileSync(command, args, { stdio: 'inherit', shell }); };
const out = (command, args) => execFileSync(command, args, { encoding: 'utf8', shell }).trim();
const stop = message => { console.error(`\nNot released: ${message}`); process.exit(1); };

const decision = currentDecision(repo, { addPlatform });
console.log(decision.reason);
if (!decision.release && !decision.npm) stop('nothing to publish.');
const { version } = decision;

// What ships must be exactly a commit on main that GitHub already has.
if (out('git', ['status', '--porcelain'])) stop('commit or stash your changes first; the release must match a commit.');
if (out('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') stop('release from main.');
run('git', ['fetch', 'origin', 'main']);
if (out('git', ['rev-parse', 'HEAD']) !== out('git', ['rev-parse', 'origin/main'])) stop('push main first, so the release matches GitHub.');
if (!new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(fs.readFileSync('CHANGELOG.md', 'utf8'))) stop(`add a "## ${version}" section to CHANGELOG.md.`);

if (!process.env.BLOB_READ_WRITE_TOKEN) stop('set BLOB_READ_WRITE_TOKEN for the public Dreamcut.io downloads.');

// A dry run publishes nothing, source maps to Sentry included (desktop/build.mjs reads this).
if (dryRun) process.env.DREAMCUT_RELEASE_DRY_RUN = '1';
run('pnpm', ['editor:build']);
run('node', ['desktop/package.mjs', '--service-only']);
// The FFmpeg the macOS runtime ships, from pinned sources (about 10 minutes; downloads are cached).
if (process.platform === 'darwin') run('node', ['packaging/build-ffmpeg.mjs']);
run('node', ['packaging/build-web-runtime.mjs']);
run('node', ['packaging/pack-launcher.mjs']);
run('node', ['packaging/verify-web-runtime.mjs']);

// Publish verified customer downloads before recording the private release, so an upload failure is retryable.
if (decision.release) run('node', ['packaging/upload-runtime.mjs', '--base-url', 'https://dreamcut.io/downloads/runtime', ...(dryRun ? ['--dry-run'] : [])]);
if (decision.release) run('node', ['packaging/publish-release.mjs', '--repo', repo, ...(dryRun ? ['--dry-run'] : [])]);
if (decision.npm) run('npm', ['publish', `dist/npm/dreamcut-${version}.tgz`, '--access', 'public', ...(dryRun ? ['--dry-run'] : [])]);
console.log(dryRun ? `\nDry run of ${version} complete; nothing was published.` : `\nReleased ${version}. Installed editors offer the update within about 15 minutes.`);
