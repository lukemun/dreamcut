import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const electron = require('electron');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-host-crash-'));
let child, owned;
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
try {
  child = spawn(electron, [path.join(here, 'verify-service-jobs.mjs'), path.resolve(process.argv[2] || '.desktop-build/stage/service'), '--hold-host-crash'], {
    cwd: path.dirname(here), env: { ...process.env, DREAMCUT_QA_JOBS_DIR: scratch, SENTRY_ENABLED: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  owned = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(Error(`Fixture readiness timed out: ${errors}`)), 45000);
    child.stderr.on('data', data => { errors = (errors + data).slice(-2000); });
    child.stdout.on('data', data => {
      output += data;
      const line = output.split('\n').find(item => item.startsWith('DREAMCUT_QA_OWNED:'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line.slice('DREAMCUT_QA_OWNED:'.length))); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Fixture exited before readiness (${code}): ${errors}`)); });
  });
  for (const pid of Object.values(owned)) assert.ok(Number.isSafeInteger(pid) && pid > 1);
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGKILL');
  await exited;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && (alive(owned.servicePid) || alive(-owned.workerPid))) await new Promise(resolve => setTimeout(resolve, 100));
  const result = { mainKilled: true, serviceExited: !alive(owned.servicePid), workerGroupExited: !alive(-owned.workerPid) };
  console.log(JSON.stringify(result));
  assert.equal(result.serviceExited, true, 'Utility service survived host crash');
  assert.equal(result.workerGroupExited, true, 'Media worker group survived host crash');
} finally {
  if (child?.exitCode === null && child?.signalCode === null) child.kill('SIGKILL');
  // IDs came from the live fixture we launched above, never persisted project locks.
  if (owned) for (const pid of [-owned.workerPid, owned.servicePid]) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  await fs.rm(scratch, { recursive: true, force: true });
}
