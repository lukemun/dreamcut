import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { autostartEditorConnection } from './editor-runtime.mjs';

async function editorServer(handler = (_req, res) => res.end('ok')) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
/** An address that refuses connections: a port that was just listening and is now closed. */
async function closedOrigin() {
  const editor = await editorServer();
  await editor.close();
  return editor.origin;
}
const fetchText = ({ origin }) => fetch(origin, { method: 'POST' }).then(response => response.text().then(text => `${response.status} ${text}`));

test('a reused editor that goes away is replaced, and the refused request is sent once to the new one', async () => {
  const first = await editorServer();
  const second = await editorServer((_req, res) => res.end('second'));
  const runtimes = [{ origin: first.origin, owned: false }, { origin: second.origin, owned: true }];
  let ensures = 0;
  const connection = autostartEditorConnection({ ensure: async () => runtimes[ensures++], restartWaitMs: 20 });
  assert.equal(await connection.request(fetchText), '200 ok');
  assert.equal(await connection.request(fetchText), '200 ok');
  assert.equal(ensures, 1, 'a live editor is reused');
  await first.close();
  await new Promise(resolve => setTimeout(resolve, 50)); // the client sees its idle keep-alive socket close, as it does when an editor process exits
  assert.equal(await connection.request(fetchText), '200 second');
  assert.equal(ensures, 2);
  await second.close();
});

test('an owned editor that stops is forgotten before the next call', async () => {
  let stop;
  let ensures = 0;
  const connection = autostartEditorConnection({ ensure: async () => ({ origin: `editor-${++ensures}`, stopped: ensures === 1 ? new Promise(resolve => { stop = resolve; }) : new Promise(() => {}) }) });
  assert.equal((await connection.get()).origin, 'editor-1');
  stop(0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await connection.get()).origin, 'editor-2');
});

test('a connection lost after sending is not retried, but the next call reconnects', async () => {
  let hits = 0;
  const dropping = await editorServer(req => { hits += 1; req.socket.destroy(); });
  const healthy = await editorServer();
  const runtimes = [{ origin: dropping.origin }, { origin: healthy.origin }];
  let ensures = 0;
  const connection = autostartEditorConnection({ ensure: async () => runtimes[ensures++] });
  await assert.rejects(connection.request(fetchText), /fetch failed/);
  assert.equal(hits, 1, 'the request that may have reached the editor is sent once');
  assert.equal(ensures, 1);
  assert.equal(await connection.request(fetchText), '200 ok');
  assert.equal(ensures, 2);
  await dropping.close();
  await healthy.close();
});

test('HTTP error statuses and failed starts do not keep a stale connection or reconnect needlessly', async () => {
  const failing = await editorServer((_req, res) => { res.statusCode = 500; res.end('no'); });
  let ensures = 0;
  const connection = autostartEditorConnection({ ensure: async () => { ensures += 1; if (ensures === 1) throw new Error('did not start'); return { origin: failing.origin }; } });
  await assert.rejects(connection.get(), /did not start/);
  assert.equal(await connection.request(fetchText), '500 no');
  assert.equal(await connection.request(fetchText), '500 no');
  assert.equal(ensures, 2);
  await failing.close();
});

test('an owned editor restarting in place keeps its connection; a refused request waits and retries it', async () => {
  const editor = await editorServer((_req, res) => res.end('restarted'));
  const port = new URL(editor.origin).port;
  await editor.close();
  let ensures = 0;
  const connection = autostartEditorConnection({ ensure: async () => { ensures += 1; return { origin: `http://127.0.0.1:${port}`, owned: true, stopped: new Promise(() => {}) }; }, restartWaitMs: 300 });
  // The editor is down mid-restart; it comes back on the same port before the retry.
  setTimeout(() => editor.server.listen(port, '127.0.0.1'), 100);
  assert.equal(await connection.request(fetchText), '200 restarted');
  assert.equal(ensures, 1, 'no second editor is started while the owned one restarts');
  await editor.close();
});

test('a reused editor restarting in place is retried before another is looked for', async () => {
  const editor = await editorServer((_req, res) => res.end('back'));
  const port = new URL(editor.origin).port;
  await editor.close();
  let ensures = 0;
  const connection = autostartEditorConnection({ ensure: async () => { ensures += 1; return { origin: `http://127.0.0.1:${port}`, owned: false }; }, restartWaitMs: 300 });
  setTimeout(() => editor.server.listen(port, '127.0.0.1'), 100);
  assert.equal(await connection.request(fetchText), '200 back');
  assert.equal(ensures, 1, 'its owner restarted it; no editor of our own is started');
  await editor.close();
});

test('an owned editor that stops while a refused request waits sends it to the next editor', async () => {
  const next = await editorServer((_req, res) => res.end('next'));
  let stop, ensures = 0;
  const runtimes = [
    { origin: await closedOrigin(), owned: true, stopped: new Promise(resolve => { stop = resolve; }) },
    { origin: next.origin, owned: true, stopped: new Promise(() => {}) },
  ];
  const connection = autostartEditorConnection({ ensure: async () => runtimes[ensures++], restartWaitMs: 200 });
  setTimeout(() => stop(), 50);
  assert.equal(await connection.request(fetchText), '200 next');
  assert.equal(ensures, 2);
  await next.close();
});

test('concurrent refused requests to a vanished reused editor share one replacement', async () => {
  const next = await editorServer((_req, res) => res.end('next'));
  let ensures = 0;
  const runtimes = [{ origin: await closedOrigin(), owned: false }, { origin: next.origin, owned: true, stopped: new Promise(() => {}) }];
  const connection = autostartEditorConnection({ ensure: async () => runtimes[ensures++], restartWaitMs: 50 });
  assert.deepEqual(await Promise.all([connection.request(fetchText), connection.request(fetchText)]), ['200 next', '200 next']);
  assert.equal(ensures, 2, 'one replacement for both');
  await next.close();
});

test('closing stops an editor this connection started and leaves a reused one running', async () => {
  const fake = owned => {
    let resolveStopped;
    const runtime = { owned, origin: 'http://127.0.0.1:1', stops: 0, stopped: new Promise(resolve => { resolveStopped = resolve; }) };
    runtime.stop = () => { runtime.stops += 1; resolveStopped(0); };
    return runtime;
  };
  const owned = fake(true);
  const startedHere = autostartEditorConnection({ ensure: async () => owned });
  await startedHere.close(); // nothing started yet: nothing to stop
  assert.equal(owned.stops, 0);
  await startedHere.get();
  await startedHere.close();
  assert.equal(owned.stops, 1);

  const reused = fake(false);
  const someoneElses = autostartEditorConnection({ ensure: async () => reused });
  await someoneElses.get();
  await someoneElses.close();
  assert.equal(reused.stops, 0);
});
