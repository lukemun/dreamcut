import { app, utilityProcess } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { SESSION_COOKIE } from './service-policy.mjs';
import { waitForDesktopService } from './service-startup.mjs';
import { stopDesktopService } from './service-shutdown.mjs';

const require = createRequire(import.meta.url);
const WebSocket = require('next/dist/compiled/ws');
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.dirname(here);
const scratch = await fs.mkdtemp(path.join(repository, '.desktop-build/dev-refresh-'));
app.setPath('userData', path.join(scratch, 'user-data'));
// Service/transport evidence only: no browser automation or visual/state-retention claim.
void app.whenReady().then(async () => {
  let service, socket, exitCode = 1;
  try {
    await fs.mkdir(path.join(scratch, 'pages'));
    await fs.symlink(path.join(repository, 'node_modules'), path.join(scratch, 'node_modules'));
    await fs.writeFile(path.join(scratch, 'package.json'), '{"private":true}');
    await fs.writeFile(path.join(scratch, 'next.config.mjs'), `export default { devIndicators: false, turbopack: { root: ${JSON.stringify(repository)} } };`);
    await fs.writeFile(path.join(scratch, 'pages/_app.jsx'), 'import "./fixture.css"; export default function App({Component,pageProps}) { return <Component {...pageProps}/>; }');
    const page = text => `export default function Fixture() { return <main>${text}</main>; }`;
    await fs.writeFile(path.join(scratch, 'pages/index.jsx'), page('before-refresh'));
    await fs.writeFile(path.join(scratch, 'pages/fixture.css'), 'main { color: rgb(12, 34, 56); }');
    const token = randomBytes(32).toString('hex');
    service = utilityProcess.fork(path.join(here, 'service.mjs'), [], { cwd: scratch, stdio: 'pipe', env: {
      HOME: process.env.HOME, PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
      DREAMCUT_SERVICE_ROOT: scratch, DREAMCUT_SERVICE_TOKEN: token, DREAMCUT_SERVICE_DEV: '1',
      NEXT_TELEMETRY_DISABLED: '1', SENTRY_ENABLED: '0',
    } });
    service.stderr.on('data', data => process.stderr.write(data));
    const origin = await waitForDesktopService(service, { timeoutMs: 45000 });
    const headers = { Cookie: `${SESSION_COOKIE}=${token}` };
    assert.equal((await fetch(origin)).status, 403);
    const before = await fetch(origin, { headers }).then(response => response.text());
    assert.ok(before.includes('before-refresh'));
    const cssHref = before.match(/href="([^"]+\.css[^"]*)"/)?.[1];
    assert.ok(cssHref, 'Fixture stylesheet is linked');
    const cssBefore = await fetch(new URL(cssHref, origin), { headers }).then(response => response.text());
    assert.match(cssBefore, /12,?\s*34,?\s*56|#0c2238/i);
    const wsUrl = origin.replace('http:', 'ws:') + '/_next/hmr';
    await new Promise((resolve, reject) => {
      const denied = new WebSocket(wsUrl, { origin, handshakeTimeout: 5000 });
      denied.once('open', () => { denied.terminate(); reject(Error('Unauthenticated refresh connection accepted')); });
      denied.once('error', resolve);
    });
    const events = [];
    socket = new WebSocket(wsUrl, { origin, headers, handshakeTimeout: 5000 });
    socket.on('message', data => { try { events.push(JSON.parse(data.toString())); } catch {} });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    async function waitBuild(start) {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const built = events.slice(start).find(event => (event.action === 'built' || event.type === 'built'));
        if (built) { assert.equal(built.errors?.length ?? 0, 0, JSON.stringify(built.errors)); return; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw Error(`Refresh build event missing: ${JSON.stringify(events.slice(start))}`);
    }
    let start = events.length;
    await fs.writeFile(path.join(scratch, 'pages/index.jsx'), page('after-refresh'));
    await waitBuild(start);
    const after = await fetch(origin, { headers }).then(response => response.text());
    assert.ok(after.includes('after-refresh'));
    start = events.length;
    await fs.writeFile(path.join(scratch, 'pages/fixture.css'), 'main { color: rgb(65, 43, 21); }');
    await waitBuild(start);
    let cssAfter;
    const cssDeadline = Date.now() + 30000;
    do {
      const updatedHtml = await fetch(origin, { headers }).then(response => response.text());
      const updatedHref = updatedHtml.match(/href="([^"]+\.css[^"]*)"/)?.[1];
      assert.ok(updatedHref);
      cssAfter = await fetch(new URL(updatedHref, origin), { headers }).then(response => response.text());
      if (cssAfter !== cssBefore) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < cssDeadline);
    assert.notEqual(cssAfter, cssBefore);
    assert.match(cssAfter, /65,?\s*43,?\s*21|#412b15/i);
    const stop = await stopDesktopService(service, { timeoutMs: 10000 });
    assert.equal(stop, 'graceful');
    await assert.rejects(fetch(origin));
    console.log(JSON.stringify({ authenticatedRefreshSocket: true, unauthenticatedSocketRejected: true,
      reactRecompiled: true, cssRecompiled: true, shutdownWithOpenRefreshSocket: stop,
      visualRefreshVerified: false, componentStateRetentionVerified: false }));
    exitCode = 0;
  } catch (error) { console.error(error); }
  finally {
    socket?.terminate();
    if (service?.pid) await stopDesktopService(service);
    await fs.rm(scratch, { recursive: true, force: true });
    app.exit(exitCode);
  }
});
