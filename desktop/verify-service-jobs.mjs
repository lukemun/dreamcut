import { app, utilityProcess } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { stopDesktopService } from './service-shutdown.mjs';
import { waitForDesktopService } from './service-startup.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { SESSION_COOKIE } from './service-policy.mjs';
import { guardServiceWorkers } from './service-worker-guard.mjs';
import { once } from 'node:events';

// Exercise the compiled Next route and its real worker from Electron. Only the
// generated scratch directory is writable project data; no model/provider calls.
void app.whenReady().then(async () => {
  const scratch = process.env.DREAMCUT_QA_JOBS_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-service-jobs-'));
  const root = path.resolve(process.argv[2] || '.desktop-build/stage/service');
  const project = path.join(scratch, 'projects/fixture');
  const media = path.join(project, 'media');
  const queue = path.join(project, 'preprocess/media-preparation');
  const source = path.join(media, 'fixture.mp4');
  const recordPath = path.join(queue, createHash('sha256').update('fixture.mp4').digest('hex') + '.json');
  const env = desktopRuntimeEnvironment({ HOME: process.env.HOME, PATH: '/usr/bin:/bin',
    TIMELINE_PROJECTS_DIR: path.join(scratch, 'projects'), DREAMCUT_PROFILE_DIR: path.join(scratch, 'profile'),
    SENTRY_ENABLED: '0', DREAMCUT_SERVICE_ROOT: root, DREAMCUT_SERVICE_DEV: '0' });
  const waitUntil = async (condition, label) => {
    const deadline = Date.now() + 30000;
    while (!await condition()) {
      if (Date.now() > deadline) throw Error(`Timed out: ${label}`);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  let service, workerPid, guard;
  let exitCode = 1;
  const start = async () => {
    const token = randomBytes(32).toString('hex');
    service = utilityProcess.fork(path.join(path.dirname(fileURLToPath(import.meta.url)), 'service.mjs'), [], {
      cwd: root, stdio: 'pipe', env: { ...env, DREAMCUT_SERVICE_TOKEN: token },
    });
    guard = guardServiceWorkers(service);
    service.stderr?.on('data', chunk => process.stderr.write(chunk));
    const origin = await waitForDesktopService(service, { timeoutMs: 30000 });
    const response = await fetch(`${origin}/api/projects/fixture/media-preparation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${token}` },
      body: JSON.stringify({ source: 'fixture.mp4' }),
    });
    assert.equal(response.status, 202, await response.text());
  };
  const hash = async () => createHash('sha256').update(await fs.readFile(source)).digest('hex');
  try {
    await fs.mkdir(media, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', source], { env, timeout: 15000 });
    const before = await hash();
    await start();
    await waitUntil(async () => {
      try { workerPid = Number(await fs.readFile(path.join(queue, 'worker.lock'), 'utf8')); return workerPid > 0; } catch { return false; }
    }, 'owned worker lock');
    // Keep this disposable worker in-flight while testing forced shutdown.
    process.kill(-workerPid, 'SIGSTOP');
    assert.equal(JSON.parse(await fs.readFile(recordPath, 'utf8')).state, 'preparing');
    await waitUntil(() => guard.size === 1, 'shell worker registration');
    if (process.argv.includes('--hold-host-crash')) {
      console.log('DREAMCUT_QA_OWNED:' + JSON.stringify({ servicePid: service.pid, workerPid }));
      await new Promise(() => {});
    }
    if (process.argv.includes('--crash')) {
      const exited = once(service, 'exit');
      process.kill(service.pid, 'SIGKILL');
      await exited;
    } else assert.equal(await stopDesktopService(service), 'graceful');
    await waitUntil(() => { try { process.kill(-workerPid, 0); return false; } catch { return true; } }, 'worker group exit');
    workerPid = undefined;
    assert.equal(await hash(), before);
    await start();
    await waitUntil(async () => JSON.parse(await fs.readFile(recordPath, 'utf8')).state === 'ready', 'recovered preview');
    assert.equal(await hash(), before);
    assert.equal(await stopDesktopService(service), 'graceful');
    console.log(`Compiled Next route in Electron owns preparation: service ${process.argv.includes('--crash') ? 'crash' : 'quit'} removes a stopped worker group, and relaunch retries to ready without changing original bytes.`);
    exitCode = 0;
  } catch (error) {
    console.error(error.message);
    exitCode = 1;
  } finally {
    if (workerPid) { try { process.kill(-workerPid, 'SIGKILL'); } catch {} }
    await stopDesktopService(service);
    await fs.rm(scratch, { recursive: true, force: true });
    app.exit(exitCode);
  }
});
