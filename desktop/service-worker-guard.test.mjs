import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { guardServiceWorkers } from './service-worker-guard.mjs';

test('service exit kills only still-registered groups from its private channel', () => {
  const service = Object.assign(new EventEmitter(), { pid: 900 });
  const killed = [];
  const guard = guardServiceWorkers(service, { kill: (...args) => killed.push(args) });
  for (const pid of [0, -10, 1, 1.5, '234', process.pid, service.pid]) service.emit('message', { type: 'worker-started', pid });
  service.emit('message', { type: 'unknown', pid: 999 });
  service.emit('message', { type: 'worker-started', pid: 901 });
  service.emit('message', { type: 'worker-started', pid: 902 });
  service.emit('message', { type: 'worker-exited', pid: 901 });
  assert.equal(guard.size, 1);
  service.emit('exit', 1);
  assert.deepEqual(killed, [[-902, 'SIGKILL']]);
  assert.equal(guard.size, 0);
  assert.equal(service.listenerCount('message'), 0);
});

test('already-exited worker groups do not prevent cleanup of other groups', () => {
  const service = new EventEmitter();
  let signals = 0;
  guardServiceWorkers(service, { kill() { signals++; throw Object.assign(Error(), { code: 'ESRCH' }); },
    onFailure() { assert.fail('missing groups are already stopped'); } });
  service.emit('message', { type: 'worker-started', pid: 901 });
  service.emit('message', { type: 'worker-started', pid: 902 });
  service.emit('exit', 1);
  assert.equal(signals, 2);
});
