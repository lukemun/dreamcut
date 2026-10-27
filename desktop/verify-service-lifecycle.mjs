import { app, utilityProcess } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { stopDesktopService } from './service-shutdown.mjs';
import { waitForDesktopService } from './service-startup.mjs';

// Engineering-only smoke: no model run, user project writes or external telemetry.
void app.whenReady().then(async () => {
  let service;
  try {
    const root = path.resolve(process.argv[2] || '.desktop-build/stage/service');
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-lifecycle-'));
    service = utilityProcess.fork(path.join(path.dirname(fileURLToPath(import.meta.url)), 'service.mjs'), [], {
      cwd: root, stdio: 'pipe', env: { PATH: process.env.PATH, HOME: process.env.HOME,
        DREAMCUT_SERVICE_ROOT: root, DREAMCUT_SERVICE_TOKEN: randomBytes(32).toString('hex'),
        DREAMCUT_SERVICE_DEV: '0', TIMELINE_PROJECTS_DIR: path.join(scratch, 'projects'),
        DREAMCUT_PROFILE_DIR: path.join(scratch, 'profile'), SENTRY_ENABLED: '0' },
    });
    service.stderr?.on('data', data => process.stderr.write(data));
    const origin = await waitForDesktopService(service, { timeoutMs: 30000 });
    assert.equal((await fetch(origin)).status, 403);
    assert.equal(await stopDesktopService(service), 'graceful');
    await assert.rejects(fetch(origin));
    await fs.rm(scratch, { recursive: true, force: true });
    console.log('Electron utility service started, rejected unauthenticated access and stopped gracefully; owned port is closed.');
    app.exit(0);
  } catch (error) {
    service?.kill();
    console.error(error.message);
    app.exit(1);
  }
});
