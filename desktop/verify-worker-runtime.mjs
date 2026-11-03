import { app, utilityProcess } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';

void app.whenReady().then(async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-worker-runtime-'));
  const root = path.resolve(process.argv[2] || '.desktop-build/stage/service');
  const env = desktopRuntimeEnvironment({ HOME: process.env.HOME, PATH: '/usr/bin:/bin', SENTRY_ENABLED: '0' });
  if (process.argv[3]) env.PATH = path.resolve(process.argv[3]) + ':/usr/bin:/bin';
  const child = utilityProcess.fork(path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker-runtime-probe.cjs'), [root, scratch], {
    cwd: root, env,
  });
  const timeout = setTimeout(() => { child.kill(); console.error('Worker runtime check timed out'); app.exit(1); }, 35000);
  let received = false;
  child.once('exit', code => { if (!received) { clearTimeout(timeout); console.error(`Worker probe exited before returning evidence (${code})`); app.exit(1); } });
  child.on('message', async result => {
    received = true;
    clearTimeout(timeout);
    try {
      assert.equal(result.typedResult.status, 0, result.typedResult.stderr);
      assert.equal(result.typedResult.stdout, '42');
      assert.equal(result.preparation.status, 0, result.preparation.stderr);
      assert.equal(result.lockExists, false);
      assert.equal(result.media.state, 'ready', result.media.error);
      assert.equal(result.media.frameCount, 30);
      assert.ok(Math.abs(result.media.duration - 1) < 0.08);
      assert.equal(result.media.sourceUnchanged, true);
      assert.equal(result.media.previewExists, true);
      assert.ok(result.media.audioRms > 0.01 && result.media.audioRms < 0.2);
      child.kill();
      await fs.rm(scratch, { recursive: true, force: true });
      console.log('Electron worker prepared a 30-frame synthetic video and non-silent audio, preserved the original and released its lock.');
      app.exit(0);
    } catch (error) { child.kill(); console.error(error.message); app.exit(1); }
  });
});
