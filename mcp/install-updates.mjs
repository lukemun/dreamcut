import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Updates for a DreamCut installed from its public GitHub repository (README, Install): `git clone`, then
 * `pnpm install`. The check fetches the repository's default branch and reports how far this copy is behind,
 * with the commit subjects; the update fast-forwards it and reinstalls dependencies when the lockfile changed.
 *
 * Never touched: a development checkout (contributor hooks set up per docs/development-workflow.md, or
 * `git config dreamcut.updates off`, or DREAMCUT_UPDATES=off), a copy whose `origin` is not the public
 * repository, and any copy with local changes, local commits or another branch checked out. Those report
 * why and change nothing; the check makes no network request for the first two.
 */
export const PUBLIC_REPOSITORY = 'github.com/lukemun/dreamcut';
const FETCH_TIMEOUT_MS = 15_000;
const MERGE_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const CHANGE_LIMIT = 20;
const OFF = new Set(['off', 'false', '0', 'no', 'never']);

/** `https://github.com/a/b.git`, `git@github.com:a/b` and `ssh://git@github.com/a/b/` all read `github.com/a/b`. */
export function repositoryIdentity(url) {
  return String(url ?? '').trim().toLowerCase()
    .replace(/^[a-z+]+:\/\//, '').replace(/^[^@/]+@/, '').replace(/^([^/:]+):(?!\d+\/)/, '$1/').replace(/:\d+\//, '/')
    .replace(/\/+$/, '').replace(/\.git$/, '');
}

// No prompts: an SSH key passphrase or credential request would hang the editor's start.
const gitEnv = env => ({ ...env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes -o ConnectTimeout=10' });

function run(command, args, { cwd, env = process.env, timeoutMs = 10_000 } = {}) {
  return new Promise(resolve => {
    execFile(command, args, { cwd, env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true, shell: process.platform === 'win32' && command !== 'git' },
      (error, stdout, stderr) => resolve({ ok: !error, code: error ? (error.killed ? 'timeout' : error.code ?? 1) : 0, stdout: String(stdout).trim(), stderr: String(stderr).trim() }));
  });
}
const git = (root, args, options = {}) => run('git', ['-C', root, ...args], { ...options, env: gitEnv(options.env ?? process.env) });
const real = value => { try { return fs.realpathSync(value); } catch { return path.resolve(value); } };

function gitSync(root, args, env = process.env) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000, windowsHide: true }).trim(); } catch { return null; }
}

/**
 * Why `root` must never be updated, or null for an ordinary install. Synchronous and local (no network), so
 * the editor service can ask it per request. Not being a git checkout at all is reported by checkForUpdates.
 */
export function updatesOffReason(root, env = process.env) {
  if (OFF.has(String(env.DREAMCUT_UPDATES ?? '').trim().toLowerCase())) return 'DREAMCUT_UPDATES is off';
  if (env.CI) return 'running in CI';
  if (!fs.existsSync(path.join(root, '.git'))) return null;
  const setting = gitSync(root, ['config', '--get', 'dreamcut.updates'], env);
  if (setting && OFF.has(setting.toLowerCase())) return 'git config dreamcut.updates is off';
  // Contributors install the repository's hooks in its own config (docs/development-workflow.md); creators never do.
  if (gitSync(root, ['config', '--local', '--get', 'core.hooksPath'], env)) return 'development checkout (core.hooksPath is set)';
  return null;
}

/** The checked-out commit of a git install that may update, or null (a packaged runtime, a development checkout). */
export function installRevision(root, env = process.env) {
  if (!fs.existsSync(path.join(root, '.git')) || updatesOffReason(root, env)) return null;
  return gitSync(root, ['rev-parse', 'HEAD'], env);
}

/**
 * Whether this copy is behind the public repository. Never throws and never changes the working tree;
 * offline or a slow network reports `offline` within about 15 s. `repository` is for tests.
 */
export async function checkForUpdates({ root, env = process.env, repository = PUBLIC_REPOSITORY, fetch = true } = {}) {
  const off = updatesOffReason(root, env);
  if (off) return { status: 'updates_off', reason: off };
  const top = await git(root, ['rev-parse', '--show-toplevel'], { env });
  if (!top.ok || real(top.stdout) !== real(root)) return { status: 'not_a_git_install', reason: 'DreamCut was not installed with git clone.' };
  // The configured URL, not `remote get-url`, which applies url.*.insteadOf rewrites.
  const origin = await git(root, ['config', '--get', 'remote.origin.url'], { env });
  if (!origin.ok || repositoryIdentity(origin.stdout) !== repositoryIdentity(repository)) {
    return { status: 'not_public_repository', reason: `origin is not ${repository}, so DreamCut does not update this copy.` };
  }
  const defaultRef = await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { env });
  const defaultBranch = defaultRef.ok ? defaultRef.stdout.replace(/^origin\//, '') : 'main';
  if (fetch) {
    const fetched = await git(root, ['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`], { env, timeoutMs: FETCH_TIMEOUT_MS });
    if (!fetched.ok) return { status: 'offline', reason: fetched.code === 'timeout' ? 'GitHub did not answer in time.' : `Could not reach GitHub: ${fetched.stderr.split('\n')[0] || 'git fetch failed'}` };
  }
  const upstream = `refs/remotes/origin/${defaultBranch}`;
  const [head, latest, branch] = await Promise.all([
    git(root, ['rev-parse', 'HEAD'], { env }), git(root, ['rev-parse', upstream], { env }), git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { env }),
  ]);
  if (!head.ok || !latest.ok) return { status: 'offline', reason: `origin/${defaultBranch} is not available yet.` };
  const counts = await git(root, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`], { env });
  const [ahead, behind] = counts.stdout.split(/\s+/).map(Number);
  const base = { current: head.stdout, latest: latest.stdout, branch: branch.ok ? branch.stdout : null, default_branch: defaultBranch, behind, ahead };
  if (!behind) return { status: 'up_to_date', ...base };
  const log = await git(root, ['log', '--no-merges', `--max-count=${CHANGE_LIMIT}`, '--format=%s', `HEAD..${upstream}`], { env });
  const changes = log.stdout ? log.stdout.split('\n') : [];
  const result = { ...base, changes, more_changes: Math.max(0, behind - changes.length) };
  const dirty = await git(root, ['status', '--porcelain', '--untracked-files=no'], { env });
  const blocked = base.branch !== defaultBranch ? `${base.branch ? `the ${base.branch} branch` : 'a detached commit'} is checked out, not ${defaultBranch}`
    : ahead ? `this copy has ${ahead} local commit${ahead === 1 ? '' : 's'} that ${defaultBranch} on GitHub does not`
      : !dirty.ok || dirty.stdout ? 'files in this copy were changed' : null;
  return blocked ? { status: 'blocked', reason: `DreamCut has ${behind} update${behind === 1 ? '' : 's'} but cannot update itself: ${blocked}. Nothing was changed.`, ...result }
    : { status: 'update_available', ...result };
}

/** `pnpm install --frozen-lockfile` in `root`, through corepack when pnpm is not on PATH. */
async function pnpmInstall(root, env) {
  const args = ['install', '--frozen-lockfile'];
  const direct = await run('pnpm', args, { cwd: root, env, timeoutMs: INSTALL_TIMEOUT_MS });
  // Under a shell (Windows) a missing pnpm is an ordinary failure, not ENOENT, so any failure there tries corepack.
  if (direct.ok || (direct.code !== 'ENOENT' && process.platform !== 'win32')) return direct;
  return run('corepack', ['pnpm', ...args], { cwd: root, env, timeoutMs: INSTALL_TIMEOUT_MS });
}

/**
 * Fast-forward an install that checkForUpdates reports `update_available` for, then reinstall dependencies when
 * pnpm-lock.yaml changed. A failed install moves the code back to where it was. Never merges, rebases, stashes
 * or discards anything: every other status is returned as it is, with `updated: false`.
 */
export async function applyUpdate({ root, env = process.env, repository = PUBLIC_REPOSITORY, install = pnpmInstall } = {}) {
  const check = await checkForUpdates({ root, env, repository });
  if (check.status !== 'update_available') return { updated: false, ...check };
  const merged = await git(root, ['merge', '--ff-only', '--quiet', check.latest], { env, timeoutMs: MERGE_TIMEOUT_MS });
  if (!merged.ok) return { updated: false, ...check, status: 'blocked', reason: `git could not fast-forward: ${merged.stderr.split('\n')[0] || merged.code}. Nothing was changed.` };
  const changed = await git(root, ['diff', '--name-only', check.current, check.latest, '--', 'pnpm-lock.yaml'], { env });
  const dependencies = Boolean(changed.stdout);
  if (dependencies) {
    const installed = await install(root, env);
    if (!installed.ok) {
      // The tree was clean before the merge, so --keep returns exactly to the previous commit.
      const back = await git(root, ['reset', '--quiet', '--keep', check.current], { env });
      if (back.ok) await install(root, env);
      const detail = (installed.stderr || installed.stdout).split('\n').slice(-3).join(' ');
      return { updated: false, ...check, status: 'install_failed',
        reason: `pnpm install failed (${detail || installed.code}); ${back.ok ? 'DreamCut was moved back to the version it was on' : `run \`pnpm install\` in ${root}`}.` };
    }
  }
  return { updated: true, status: 'updated', from: check.current, to: check.latest, behind: check.behind, changes: check.changes, more_changes: check.more_changes, dependencies_installed: dependencies };
}

/** One line for a person reading a terminal, or null when there is nothing to say. */
export function describeUpdate(result, command = 'node bin/dreamcut.mjs update') {
  if (result?.status === 'update_available') {
    const list = result.changes.slice(0, 5).map(change => `  - ${change}`).join('\n');
    const more = result.behind - Math.min(5, result.changes.length);
    return `DreamCut has ${result.behind} update${result.behind === 1 ? '' : 's'} on GitHub:\n${list}${more > 0 ? `\n  …and ${more} more` : ''}\nUpdate with \`${command}\`.`;
  }
  if (result?.status === 'blocked') return result.reason;
  return null;
}
