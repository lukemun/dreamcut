import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWorkerOwner } from './owned-workers.mjs';

test('desktop shutdown terminates a resistant worker and its child process group', async () => {
  const owner = createWorkerOwner({ graceMs: 50 });
  const child = owner.spawn(process.execPath, ['-e', `
    const { spawn } = require('node:child_process');
    process.on('SIGTERM', () => {});
    const nested = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); console.log('ready')"], {stdio:['ignore','pipe','ignore']});
    nested.stdout.once('data', () => console.log(nested.pid));
    setInterval(()=>{},1000);
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await once(child.stdout, 'data');
    assert.equal(owner.size, 1);
    const stopping = owner.stop();
    assert.strictEqual(owner.stop(), stopping);
    assert.throws(() => owner.spawn(process.execPath, [], {}), /shutting down/);
    await stopping;
    assert.equal(owner.size, 0);
    assert.equal(child.signalCode, 'SIGKILL');
    // macOS may need a moment to reap the orphaned grandchild after group kill.
    for (let attempt = 0; attempt < 100; attempt++) {
      try { process.kill(-child.pid, 0); } catch (error) { assert.equal(error.code, 'ESRCH'); return; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Worker process group survived shutdown');
  } finally { await owner.stop(); }
});

test('completed and failed launches release ownership', async () => {
  const owner = createWorkerOwner();
  const completed = owner.spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await once(completed, 'exit');
  assert.equal(owner.size, 0);
  const missing = owner.spawn('/nonexistent/dreamcut-worker', [], { stdio: 'ignore' });
  await once(missing, 'error');
  assert.equal(owner.size, 0);
  await owner.stop();
});
