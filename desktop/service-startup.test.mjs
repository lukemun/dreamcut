import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForDesktopService } from './service-startup.mjs';

test('startup accepts a loopback handshake and releases its listeners', async () => {
  const service = new EventEmitter();
  const ready = waitForDesktopService(service);
  service.emit('message', { type: 'progress' });
  service.emit('message', { type: 'ready', origin: 'http://127.0.0.1:43210' });
  assert.equal(await ready, 'http://127.0.0.1:43210');
  assert.deepEqual(service.eventNames(), []);
});

test('startup rejects invalid endpoints, early exit and timeout without retaining listeners', async () => {
  for (const origin of ['https://example.com', 'http://127.0.0.1:0', 'http://127.0.0.1:1234/path',
    'http://user@127.0.0.1:1234', 'http://127.0.0.1:99999', null, 'exit', 'timeout']) {
    const service = new EventEmitter();
    const ready = waitForDesktopService(service, { timeoutMs: 10 });
    if (origin === 'exit') service.emit('exit', 1);
    else if (origin !== 'timeout') service.emit('message', { type: 'ready', origin });
    await assert.rejects(ready);
    assert.deepEqual(service.eventNames(), []);
  }
});
