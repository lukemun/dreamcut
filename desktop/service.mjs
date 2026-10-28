import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { authorizeRequest, createLaunchCodes, HEALTH_PATH, LAUNCH_CODE_PATH, safeNextPath, sameSiteRequest, sessionCookie, SESSION_PATH } from './service-policy.mjs';
import { drainHttpServer } from './service-shutdown.mjs';
import { createWorkerCrashGuard } from './worker-crash-guard.mjs';
import { createWorkerOwner, WORKER_OWNER } from './owned-workers.mjs';
import { pendingUpdate, runtimeVersion, UPDATE_PATH } from './runtime-updates.mjs';
import { installRevision } from './install-updates.mjs';

const root = process.env.DREAMCUT_SERVICE_ROOT;
const token = process.env.DREAMCUT_SERVICE_TOKEN;
if (!root || !token) throw new Error('Desktop service configuration is missing.');
process.chdir(root);
// A git install (mcp/install-updates.mjs) names its commit too, so code pulled while it runs is a newer version.
const startedRevision = installRevision(root);
const checkoutVersion = revision => `${runtimeVersion(root)}+${revision.slice(0, 7)}`;
const version = startedRevision ? checkoutVersion(startedRevision) : runtimeVersion(root);
let crashGuard;
const workers = createWorkerOwner({
  onStarted: pid => { crashGuard.started(pid); send({ type: 'worker-started', pid }); },
  onExited: pid => { crashGuard.exited(pid); send({ type: 'worker-exited', pid }); },
});
process[WORKER_OWNER] = workers;
// Existing owned Node workers spawn process.execPath. In a utility process that
// executable is Electron's helper; its children must enter the supported Node mode.
if (process.versions.electron) process.env.ELECTRON_RUN_AS_NODE = '1';
const require = createRequire(path.join(root, 'package.json'));
const next = require('next');
const dev = process.env.DREAMCUT_SERVICE_DEV === '1';
const conf = dev ? undefined : JSON.parse(fs.readFileSync(path.join(root, 'desktop-next-config.json'), 'utf8'));
// DREAMCUT_SERVICE_BUNDLER=webpack selects webpack for development serving (as production builds use),
// e.g. in a git worktree whose node_modules is a symlink Turbopack refuses.
const app = next({ dev, dir: root, conf, hostname: '127.0.0.1', ...(dev && process.env.DREAMCUT_SERVICE_BUNDLER === 'webpack' ? { webpack: true } : {}) });
const handle = app.getRequestHandler();
let upgrade;
let origin;
const launchCodes = createLaunchCodes();
const plain = (response, status, text, headers = {}) => { response.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', ...headers }); response.end(text); };
const json = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
const server = http.createServer((request, response) => {
  if (stopping) { response.writeHead(503, { Connection: 'close' }); response.end(); return; }
  const url = new URL(request.url ?? '/', 'http://service.invalid');
  // Browser sign-in: a single-use code, minted by an authorized caller, becomes the session cookie.
  if (url.pathname === SESSION_PATH) {
    if (!origin || request.method !== 'GET' || !sameSiteRequest(request, origin) || !launchCodes.redeem(url.searchParams.get('code'))) {
      plain(response, 403, 'This DreamCut link has expired or was already used. Ask your agent to open DreamCut again, or run `dreamcut`.');
      return;
    }
    plain(response, 303, '', { 'Set-Cookie': sessionCookie(token), Location: safeNextPath(url.searchParams.get('next')), 'Referrer-Policy': 'no-referrer' });
    return;
  }
  if (!origin || !authorizeRequest(request, origin, token)) {
    plain(response, 403, 'This service is available only through DreamCut.');
    return;
  }
  if (url.pathname === LAUNCH_CODE_PATH && request.method === 'POST') { json(response, launchCodes.mint()); return; }
  if (url.pathname === HEALTH_PATH) { json(response, { ok: true, root, version, pid: process.pid }); return; }
  if (url.pathname === UPDATE_PATH) { update(request, response); return; }
  Promise.resolve(handle(request, response)).catch(error => {
    console.error('Desktop request failed:', error.message);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
server.on('upgrade', (request, socket, head) => {
  if (!origin || !authorizeRequest(request, origin, token)) { socket.destroy(); return; }
  Promise.resolve(upgrade(request, socket, head)).catch(() => socket.destroy());
});
const send = message => process.parentPort?.postMessage(message) ?? process.send?.(message);
/** Code pulled into this git install since the service started: restart from the same folder to run it. */
function pulledUpdate() {
  if (!startedRevision) return null;
  const now = installRevision(root);
  return now && now !== startedRevision ? { version: checkoutVersion(now), root } : null;
}
/**
 * A newer version installed by the launcher (mcp/runtime-updates.mjs), or pulled into a git install. Applying
 * it asks the owner to restart this service from that version, on this port with this session, once no export
 * or analysis worker is running. Only a forked service (the local web app) can restart; the desktop shell cannot.
 */
function update(request, response) {
  const pending = process.send ? pendingUpdate(root) ?? pulledUpdate() : null;
  if (request.method === 'GET') { json(response, { version, available: pending?.version ?? null }); return; }
  if (request.method !== 'POST') { json(response, { error: 'method' }, 405); return; }
  if (!pending) { json(response, { error: 'no_update' }, 409); return; }
  if (workers.size > 0) { json(response, { error: 'busy' }, 409); return; }
  json(response, { version: pending.version }, 202);
  response.once('finish', () => { send({ type: 'restart', root: pending.root }); void stop(); });
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await drainHttpServer(server);
  await workers.stop();
  crashGuard?.close();
  await app.close();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
process.parentPort?.on('message', event => { if (event.data?.type === 'stop') void stop(); });
crashGuard = await createWorkerCrashGuard({ onFailure: () => { void stop(); } });
await app.prepare();
upgrade = app.getUpgradeHandler();
const listen = port => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
// After an update the owner asks for the previous port, so open pages and their session carry on.
const preferredPort = Number(process.env.DREAMCUT_SERVICE_PORT) || 0;
await listen(preferredPort).catch(error => { if (preferredPort && error.code === 'EADDRINUSE') return listen(0); throw error; });
origin = `http://127.0.0.1:${server.address().port}`;
send({ type: 'ready', origin });
