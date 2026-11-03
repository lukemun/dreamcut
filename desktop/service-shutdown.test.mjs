import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { stopDesktopService, drainHttpServer } from './service-shutdown.mjs';
test('normal service shutdown requests a stop and waits for exit without killing', async () => {
  const service = Object.assign(new EventEmitter(), { pid: 1, kill() { assert.fail('unexpected kill'); },
    postMessage(message) { assert.deepEqual(message, { type: 'stop' }); queueMicrotask(() => this.emit('exit', 0)); } });
  assert.equal(await stopDesktopService(service), 'graceful');
  assert.equal(service.listenerCount('exit'), 0);
  assert.equal(await stopDesktopService({}), 'already-stopped');
});
test('unresponsive or disconnected services have a bounded shutdown', async () => {
  for (const disconnected of [false, true]) {
    let kills = 0;
    const service = Object.assign(new EventEmitter(), { pid: 1, kill() { kills++; queueMicrotask(() => this.emit('exit', 0)); },
      postMessage() { if (disconnected) throw Error('closed'); } });
    assert.equal(await stopDesktopService(service, { timeoutMs: 10 }), 'forced');
    assert.equal(kills, 1);
    assert.equal(service.listenerCount('exit'), 0);
  }
});
test('HTTP shutdown lets an in-flight response finish and closes the listener', async () => {
  let release;
  let received;
  const started = new Promise(resolve => { received = resolve; });
  const server = http.createServer((_request, response) => { release = () => response.end('saved'); received(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = fetch(url).then(response => response.text());
  await started;
  const stopped = drainHttpServer(server);
  release();
  assert.equal(await request, 'saved');
  assert.equal(await stopped, 'drained');
  await assert.rejects(fetch(url));
});


test('forced shutdown waits for observed exit and rejects unconfirmed termination', async () => {
  let killed, completed = false;
  const signalled = new Promise(resolve => { killed = resolve; });
  const service = Object.assign(new EventEmitter(), {pid:1, postMessage(){}, kill(){killed();return true;}});
  const stop = stopDesktopService(service, {timeoutMs:5,forceTimeoutMs:1000}).then(result=>{completed=true;return result;});
  await signalled;assert.equal(completed,false);
  service.emit('exit',0);assert.equal(await stop,'forced');
  assert.equal(service.listenerCount('exit'),0);
  for(const refused of [false,true]) {
    const stuck = Object.assign(new EventEmitter(), {pid:1,postMessage(){throw Error('closed');},kill(){return !refused;}});
    await assert.rejects(stopDesktopService(stuck,{forceTimeoutMs:10}), /did not exit|could not be terminated/);
    assert.equal(stuck.listenerCount('exit'),0);
  }
});
