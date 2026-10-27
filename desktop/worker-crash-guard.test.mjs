import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWorkerCrashGuard } from './worker-crash-guard.mjs';

test('IPC lease closure removes a registered resistant process group', async () => {
  const guard = await createWorkerCrashGuard();
  const worker = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000); console.log("ready")'], {
    detached: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
  try {
    await once(worker.stdout, 'data');
    guard.started(worker.pid);
    const exit = once(worker, 'exit');
    guard.close();
    const [, signal] = await exit;
    assert.equal(signal, 'SIGKILL');
    assert.throws(() => guard.started(worker.pid), /unavailable/);
  } finally { guard.close(); try { process.kill(-worker.pid, 'SIGKILL'); } catch {} }
});

test('released groups are not terminated when the IPC lease closes', async () => {
  const guard = await createWorkerCrashGuard();
  const worker = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000); console.log("ready")'], {
    detached: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
  try {
    await once(worker.stdout, 'data');
    guard.started(worker.pid);
    guard.exited(worker.pid);
    guard.close();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.doesNotThrow(() => process.kill(worker.pid, 0));
  } finally { guard.close(); try { process.kill(-worker.pid, 'SIGKILL'); } catch {} }
});
