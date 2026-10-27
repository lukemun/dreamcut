import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import readline from 'node:readline';
import { serveWhileInstalling, SETUP_TOOL } from '../packaging/launcher/lib/mcp-bootstrap.mjs';

// A stand-in for the real MCP server: answers initialize once, then echoes each request's method.
const FAKE_SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
let initialized = 0, notified = false;
rl.on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') { initialized += 1; process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'real' }, protocol: m.params.protocolVersion } }) + '\\n'); return; }
  if (m.method === 'notifications/initialized') { notified = true; return; }
  if (m.id != null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { method: m.method, initialized, notified } }) + '\\n');
});`;

function harness({ install }) {
  const input = new PassThrough(), output = new PassThrough();
  const received = [];
  readline.createInterface({ input: output }).on('line', line => received.push(JSON.parse(line)));
  const send = message => input.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const next = predicate => new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const poll = () => {
      const found = received.find(predicate);
      if (found) resolve(found);
      else if (Date.now() > deadline) reject(new Error(`timed out; received ${JSON.stringify(received)}`));
      else setTimeout(poll, 10);
    };
    poll();
  });
  const session = serveWhileInstalling({
    input, output, version: '1.2.3', install, status: () => 'Downloading (40%).',
    start: () => spawn(process.execPath, ['-e', FAKE_SERVER], { stdio: ['pipe', 'pipe', 'inherit'] }),
  });
  return { send, next, session, input, received };
}

test('the agent is answered at once during setup, then handed to the real server', async t => {
  let finish;
  const { send, next, session, input, received } = harness({ install: () => new Promise(resolve => { finish = resolve; }) });
  t.after(() => input.end());
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
  const init = await next(m => m.id === 1);
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.capabilities.tools.listChanged, true);
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  assert.deepEqual((await next(m => m.id === 2)).result.tools.map(tool => tool.name), [SETUP_TOOL]);
  send({ id: 3, method: 'tools/call', params: { name: SETUP_TOOL, arguments: {} } });
  const status = await next(m => m.id === 3);
  assert.match(status.result.content[0].text, /40%/);
  assert.equal(status.result.isError, false);
  send({ id: 4, method: 'tools/call', params: { name: 'timeline_get', arguments: {} } });
  assert.equal((await next(m => m.id === 4)).result.isError, true, 'real tools are not offered before setup');

  finish('/runtime');
  await next(m => m.method === 'notifications/tools/list_changed');
  send({ id: 5, method: 'tools/list' });
  const forwarded = await next(m => m.id === 5);
  assert.deepEqual(forwarded.result, { method: 'tools/list', initialized: 1, notified: true }, 'the real server was initialized with the agent\'s request, once');
  assert.equal(received.some(message => JSON.stringify(message).includes('__dreamcut_bootstrap')), false, 'the replayed initialize answer is never shown to the agent');
  input.end();
  assert.equal(await session.exited, 0);
});

test('requests sent during the hand-over reach the real server', async t => {
  let finish;
  const { send, next, session, input } = harness({ install: () => new Promise(resolve => { finish = resolve; }) });
  t.after(() => input.end());
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  await next(m => m.id === 1);
  finish('/runtime');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(session.child, 'the real server has been started');
  // Sent while the real server is still starting, before it has answered the replayed initialize.
  send({ id: 2, method: 'tools/list' });
  assert.equal((await next(m => m.id === 2)).result.method, 'tools/list');
  input.end();
  await session.exited;
});

test('a failed setup says so and how to see why', async t => {
  const { send, next, input, session } = harness({ install: () => Promise.reject(new Error('Download failed (503).')) });
  t.after(() => input.end());
  send({ id: 1, method: 'initialize', params: {} });
  await next(m => m.id === 1);
  send({ id: 2, method: 'tools/call', params: { name: SETUP_TOOL, arguments: {} } });
  const reply = await next(m => m.id === 2);
  assert.equal(reply.result.isError, true);
  assert.match(reply.result.content[0].text, /503.*npx dreamcut install/s);
  input.end();
  assert.equal(await session.exited, 0);
});
