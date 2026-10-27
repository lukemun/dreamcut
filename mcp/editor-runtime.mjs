import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDataRoot, sameInstallation } from './runtime-updates.mjs';
import { featureToolEnv } from '../scripts/feature-tools.mjs';

/**
 * Start the DreamCut editor service, or reuse the one already running, for the `dreamcut` command and the
 * MCP server. The service binds 127.0.0.1 on a free port and refuses requests without the per-launch
 * session token (desktop/service-policy.mjs). The running service is recorded in a per-user runtime file
 * (0600) so the agent's MCP server and a `dreamcut` command in a terminal share one editor.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
export const EDITOR_ROOT = path.resolve(here, '..');

export const runtimeFile = (env = process.env) => path.join(appDataRoot(env), 'runtime', 'editor.json');
/**
 * The agent app this process runs under, when one does: Claude Code sets CLAUDECODE, Codex sets CODEX_THREAD_ID
 * (CODEX_SANDBOX inside its sandbox). The editor then belongs in that app's built-in browser, not the system one.
 */
export const agentHost = (env = process.env) => (env.CLAUDECODE ? 'Claude' : env.CODEX_THREAD_ID || env.CODEX_SANDBOX ? 'Codex' : null);
/** A packaged runtime ships its production build and config; a checkout runs in development mode. */
export const isPackagedRuntime = (root = EDITOR_ROOT) => fs.existsSync(path.join(root, 'desktop-next-config.json'));
/**
 * Settings shared by the editor service and the MCP server, so both resolve projects identically: until a
 * Library is chosen, a packaged runtime keeps projects in app data, never inside itself.
 */
export function runtimeEnvDefaults(root = EDITOR_ROOT, env = process.env) {
  if (!isPackagedRuntime(root)) return {};
  return {
    ...(!env.DREAMCUT_DEFAULT_PROJECTS_DIR ? { DREAMCUT_DEFAULT_PROJECTS_DIR: path.join(appDataRoot(env), 'projects') } : {}),
    // Subject tracing lives in app data too, so it survives runtime updates (`dreamcut setup-matting`).
    ...(!env.TIMELINE_MATTING_DIR ? { TIMELINE_MATTING_DIR: path.join(appDataRoot(env), 'matting') } : {}),
    // FFmpeg and ffprobe built for DreamCut (media-tools/, with vid.stab) come first; whisper.cpp, uv, Python and
    // MFA that `dreamcut setup` installs come after the system's own.
    ...withShippedMediaTools(featureToolEnv(env), root, env),
  };
}
/** Puts the runtime's own FFmpeg (media-tools/bin) at the front of PATH when this runtime ships one. */
function withShippedMediaTools(toolEnv, root, env) {
  const bin = path.join(root, 'media-tools', 'bin');
  if (!fs.existsSync(bin)) return toolEnv;
  const key = process.platform === 'win32' ? Object.keys(toolEnv).find(name => name.toUpperCase() === 'PATH') ?? Object.keys(env).find(name => name.toUpperCase() === 'PATH') ?? 'Path' : 'PATH';
  const current = (toolEnv[key] ?? env[key] ?? '').split(path.delimiter).filter(dir => dir && dir !== bin);
  return { ...toolEnv, [key]: [bin, ...current].join(path.delimiter) };
}
const cookieHeader = token => ({ Cookie: `dreamcut_desktop_session=${token}` });

function readRuntime(env) {
  try {
    const value = JSON.parse(fs.readFileSync(runtimeFile(env), 'utf8'));
    return typeof value?.origin === 'string' && typeof value?.token === 'string' && Number.isInteger(value?.pid) ? value : null;
  } catch { return null; }
}
function writeRuntime(value, env) {
  const file = runtimeFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

/**
 * The running editor for this installation, if its process is alive and it answers with the recorded token.
 * Launcher-installed versions share one editor: after an update it may run from a newer version than the caller.
 */
export async function runningEditor({ root = EDITOR_ROOT, env = process.env } = {}) {
  const runtime = readRuntime(env);
  if (!runtime || typeof runtime.root !== 'string' || !sameInstallation(runtime.root, root, env) || !alive(runtime.pid)) return null;
  try {
    const response = await fetch(`${runtime.origin}/__dreamcut/health`, { headers: cookieHeader(runtime.token), signal: AbortSignal.timeout(3000) });
    const body = response.ok ? await response.json() : null;
    return body?.ok && body.root === runtime.root ? runtime : null;
  } catch { return null; }
}

/**
 * Reuse a running editor or start one owned by this process (it stops when this process exits). Service
 * logs go to stderr, never stdout, because the MCP server speaks JSON-RPC on stdout. An owned editor asked to
 * update (mcp/runtime-updates.mjs) is restarted from the new version on the same port with the same
 * session token, so signed-in browsers and this process's connection carry on. `stopped` settles when the
 * editor finally stops; `child` is the current service process.
 */
export async function ensureEditor({ root = EDITOR_ROOT, env = process.env, timeoutMs = 180_000 } = {}) {
  const existing = await runningEditor({ root, env });
  if (existing) return { ...existing, owned: false };
  const token = randomBytes(32).toString('hex');
  const launch = (serviceRoot, port) => {
    // A packaged runtime ships its production build and config; a checkout runs the editor in development mode
    // under its own build folder, so it never collides with a separately running `pnpm dev`.
    const production = isPackagedRuntime(serviceRoot);
    const child = fork(path.join(serviceRoot, 'desktop', 'service.mjs'), [], {
      cwd: serviceRoot, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...env, DREAMCUT_SERVICE_ROOT: serviceRoot, DREAMCUT_SERVICE_TOKEN: token, DREAMCUT_SERVICE_DEV: production ? '0' : '1',
        TIMELINE_NEXT_DIST_DIR: production ? '.next-desktop' : '.next-dreamcut', ...(port ? { DREAMCUT_SERVICE_PORT: String(port) } : {}),
        ...runtimeEnvDefaults(serviceRoot, env) },
    });
    child.stdout.on('data', chunk => process.stderr.write(chunk));
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error('The DreamCut editor did not start in time.')); }, timeoutMs);
      const failed = code => { clearTimeout(timer); reject(new Error(`The DreamCut editor stopped while starting (exit ${code}).`)); };
      child.on('message', message => {
        if (message?.type !== 'ready') return;
        clearTimeout(timer);
        child.off('exit', failed);
        resolve({ child, origin: message.origin });
      });
      child.once('exit', failed);
    });
  };

  const handle = { owned: true, token, root };
  let current = await launch(root);
  let resolveStopped;
  handle.stopped = new Promise(resolve => { resolveStopped = resolve; });
  const record = () => {
    Object.assign(handle, { pid: current.child.pid, origin: current.origin, root: handle.root, child: current.child });
    writeRuntime({ pid: handle.pid, origin: handle.origin, token, root: handle.root, started_at: new Date().toISOString() }, env);
  };
  // The service stops when this owner goes away (IPC disconnect); remove the record either way it ends.
  const forget = () => { if (readRuntime(env)?.pid === current.child.pid) fs.rmSync(runtimeFile(env), { force: true }); };
  const supervise = () => {
    let restartInto = null;
    current.child.on('message', message => {
      // Only another installed version of this installation, offered by the service itself.
      if (message?.type === 'restart' && typeof message.root === 'string' && sameInstallation(message.root, handle.root, env)) restartInto = message.root;
    });
    current.child.once('exit', async code => {
      if (!restartInto) { forget(); resolveStopped(code); return; }
      const port = Number(new URL(current.origin).port);
      try {
        current = await launch(restartInto, port);
        handle.root = restartInto;
        record();
        supervise();
      } catch (error) {
        process.stderr.write(`DreamCut could not restart after updating: ${error.message}\n`);
        forget(); resolveStopped(1);
      }
    });
  };
  record();
  supervise();
  process.once('exit', forget);
  handle.stop = () => current.child.kill('SIGTERM');
  return handle;
}

/** A single-use sign-in link for a browser, optionally landing on a path such as /p/<project>. */
export async function signInUrl(runtime, next = '/') {
  const response = await fetch(`${runtime.origin}/__dreamcut/launch-code`, { method: 'POST', headers: cookieHeader(runtime.token), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`The editor refused to create a sign-in link (${response.status}).`);
  const { code, expires_in_seconds } = await response.json();
  const url = new URL('/__dreamcut/session', runtime.origin);
  url.searchParams.set('code', code);
  url.searchParams.set('next', next);
  return { url: url.toString(), expires_in_seconds };
}

const transportCodes = error => [error?.code, error?.cause?.code, ...(Array.isArray(error?.cause?.errors) ? error.cause.errors.map(item => item?.code) : [])];
/** fetch was refused before connecting: nothing listens at the address, so the request never reached an editor. */
export const connectionRefused = error => transportCodes(error).includes('ECONNREFUSED');
/** fetch failed at the transport (not an HTTP status, not a caller's timeout): the editor may have gone away. */
export const connectionLost = error => connectionRefused(error) || (error instanceof TypeError && error.message === 'fetch failed');

/**
 * The autostarted editor connection for the MCP server. `ensure` starts or reuses the editor on first need.
 * - An owned editor keeps its connection until its `stopped` settles; it may restart in place after an update.
 * - A request that may have reached the editor (a lost connection that was not refused) is never resent; for a
 *   reused editor the connection is dropped so the next call finds or starts one.
 * - A refused request reached nothing. Any editor may be restarting in place, and starting another then would
 *   run two editors on one projects folder, so it waits `restartWaitMs` and retries the same editor. If the
 *   connection was dropped meanwhile, or a reused editor is still refused, it goes to the next editor instead.
 */
export function autostartEditorConnection({ ensure = ensureEditor, describe = runtime => runtime, restartWaitMs = 1000 } = {}) {
  let pending = null;
  // Per connection: a replacement's ownership must not change how a request on the old one recovers.
  const ownedBy = new WeakMap();
  const runtimeBy = new WeakMap();
  const get = () => {
    if (pending) return pending;
    const current = ensure().then(runtime => {
      ownedBy.set(current, runtime.owned === true);
      runtimeBy.set(current, runtime);
      runtime.stopped?.then(() => { if (pending === current) pending = null; });
      return describe(runtime);
    });
    current.catch(() => { if (pending === current) pending = null; });
    return (pending = current);
  };
  const lose = (attempt, error) => {
    if (!ownedBy.get(attempt) && pending === attempt) pending = null;
    throw error;
  };
  const request = async send => {
    const attempt = get();
    const connection = await attempt;
    try {
      return await send(connection);
    } catch (error) {
      if (!connectionLost(error)) throw error;
      if (!connectionRefused(error)) lose(attempt, error);
      if (pending === attempt) {
        await new Promise(resolve => setTimeout(resolve, restartWaitMs));
        if (pending === attempt) {
          try {
            return await send(connection);
          } catch (retryError) {
            if (!connectionLost(retryError)) throw retryError;
            if (ownedBy.get(attempt) || !connectionRefused(retryError)) lose(attempt, retryError);
            if (pending === attempt) pending = null;
          }
        }
      }
      return send(await get());
    }
  };
  /**
   * The agent went away: stop the editor this connection started and wait (up to `timeoutMs`) until it has,
   * so its running-editor record is removed. A reused editor belongs to someone else and keeps running.
   */
  const close = async (timeoutMs = 10_000) => {
    const attempt = pending;
    if (!attempt) return;
    try { await attempt; } catch { return; }
    const runtime = runtimeBy.get(attempt);
    if (!ownedBy.get(attempt) || !runtime?.stop) return;
    runtime.stop();
    await Promise.race([runtime.stopped, new Promise(resolve => setTimeout(resolve, timeoutMs).unref?.())]);
  };
  return { get, request, close };
}
