import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireProjectLease } from './project-lease.mjs';
import { openCodexSession } from './codex-session.mjs';

async function fixture({ projectLease, external = false, early = false, ambiguous = false, turnTimeoutMs, connectGate, closeGate, onConnect = () => {} } = {}) {
  const calls = [], events = [];
  let notify, disconnect, closeCount = 0;
  const session = await openCodexSession({ projectLease, executable: '/codex', projectDirectory: '/project', onEvent: event => events.push(event), turnTimeoutMs,
    makePolicy: async () => ({ connectionExecutable: '/real/codex', cwd: '/project', config: {}, permissions: 'restricted', approvalPolicy: 'never' }),
    connect: async (executable, options) => {
      onConnect();
      if (connectGate) await connectGate;
      assert.equal(executable, '/real/codex'); notify = options.onNotification; disconnect = options.onDisconnect;
      return { close: async () => { closeCount++; if (closeGate) await closeGate; }, request: async (method, params) => {
        calls.push({ method, params });
        if (method === 'config/read') { assert.equal(params.cwd, '/project', 'resolve inherited tools in the actual project'); return { config: { mcp_servers: {} } }; }
        if (method === 'thread/start') return { thread: { id: 'owned' }, sandbox: { type: 'readOnly' } };
        if (method === 'mcpServerStatus/list') return { data: external ? [{ tools: { unsafe: {} } }] : [] };
        if (method === 'model/list') return { data: [{model:'available-model',displayName:'Available model',isDefault:true},{model:'hidden-model',displayName:'Hidden',hidden:true}], nextCursor:null };
        if (method === 'turn/start') {
          if (ambiguous) throw Error('connection lost');
          if (early) notify('turn/started', { threadId: 'owned', turn: { id: 'turn' } });
          return { turn: { id: 'turn' } };
        }
        return {};
      } };
    } });
  return { session, calls, events, notify: (...args) => notify(...args), closeCount: () => closeCount, disconnect: () => disconnect() };
}

test('session owns protocol scope and queues cancel until the accepted turn becomes active', async () => {
  const f = await fixture();
  assert.deepEqual(Object.keys(f.session).sort(), ['cancel', 'close', 'models', 'send']);
  await assert.rejects(f.session.send(''), /Message/);
  await assert.rejects(f.session.send('x'.repeat(64001)), /Message/);
  await f.session.send('Hello');
  await assert.rejects(f.session.send('overlap'), /current response/);
  await f.session.cancel();
  assert.equal(f.calls.filter(call => call.method === 'turn/interrupt').length, 0);
  f.notify('turn/started', { threadId: 'foreign', turn: { id: 'turn' } });
  assert.equal(f.events.length, 0);
  f.notify('turn/started', { threadId: 'owned', turn: { id: 'turn' } });
  const stop = f.calls.find(call => call.method === 'turn/interrupt');
  assert.deepEqual(stop.params, { threadId: 'owned', turnId: 'turn' });
  f.notify('item/agentMessage/delta', { threadId: 'owned', turnId: 'other', delta: 'foreign' });
  f.notify('item/agentMessage/delta', { threadId: 'owned', turnId: 'turn', delta: 'hello' });
  f.notify('turn/completed', { threadId: 'owned', turn: { id: 'turn', status: 'interrupted' } });
  assert.deepEqual(f.events, [{ type: 'started' }, { type: 'text', text: 'hello' }, { type: 'completed', status: 'interrupted' }]);
  const start = f.calls.find(call => call.method === 'turn/start');
  assert.equal(start.params.permissions, 'restricted');
  assert.equal(start.params.approvalPolicy, 'never');
  await f.session.close();
  await assert.rejects(f.session.send('closed'), /closed/);
});

test('early start events are correlated and unexpected inherited tools prevent session exposure', async () => {
  const f = await fixture({ early: true });
  await f.session.send('hello'); await f.session.cancel();
  assert.equal(f.calls.filter(call => call.method === 'turn/interrupt').length, 1);
  await f.session.close();
  await assert.rejects(fixture({ external: true }), /unexpected external tools/);
});

test('ambiguous start closes the session instead of permitting duplicate inference', async () => {
  const f = await fixture({ ambiguous: true });
  await assert.rejects(f.session.send('hello'), /connection lost/);
  await assert.rejects(f.session.send('retry'), /closed/);
  assert.equal(f.closeCount(), 1);
});

 test('disconnect and response deadlines stop further messages without retrying', async () => {
  const disconnected = await fixture();
  await disconnected.session.send('hello');
  disconnected.disconnect();
  await assert.rejects(disconnected.session.send('again'), /closed/);
  assert.equal(disconnected.events.at(-1).type, 'disconnected');
  await disconnected.session.close();
  const timed = await fixture({ turnTimeoutMs: 20 });
  await timed.session.send('hello');
  await new Promise(resolve => setTimeout(resolve, 40));
  await assert.rejects(timed.session.send('again'), /closed/);
  assert.match(timed.events.at(-1).message, /time limit/);
  assert.equal(timed.closeCount(), 1);
  assert.equal(timed.calls.filter(call => call.method === 'turn/start').length, 1);
});

test('only one host session can own a project and close releases its lease', async () => {
  const first = await fixture();
  await assert.rejects(fixture(), /already has an open/);
  // A rejected contender must not release the first session's lease.
  await assert.rejects(fixture(), /already has an open/);
  await first.session.close();
  const replacement = await fixture();
  await replacement.session.close();
  // Old close calls cannot accidentally release a later session's lease.
  const current = await fixture();
  await first.session.close();
  await assert.rejects(fixture(), /already has an open/);
  await current.session.close();
});

 test('project lease covers asynchronous connection startup and process shutdown', async () => {
  let releaseConnect, entered, releaseClose;
  const connectGate = new Promise(resolve => { releaseConnect = resolve; });
  const connectEntered = new Promise(resolve => { entered = resolve; });
  const closeGate = new Promise(resolve => { releaseClose = resolve; });
  const pending = fixture({ connectGate, closeGate, onConnect: entered });
  await connectEntered;
  await assert.rejects(fixture(), /already has an open/);
  releaseConnect();
  const owner = await pending;
  const closing = owner.session.close();
  await assert.rejects(fixture(), /already has an open/);
  releaseClose(); await closing;
  const next = await fixture(); await next.session.close();
});


test('editing-owner lease remains held after Codex closes until its journal owner releases it', async () => {
  const lease = acquireProjectLease('/project');
  try {
    const f = await fixture({ projectLease: lease });
    await f.session.close();
    await assert.rejects(fixture(), /open Codex session/);
  } finally { lease.release(); }
  const reopened = await fixture(); await reopened.session.close();
});

test('model choice comes from Codex and overrides the turn without changing permissions', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.session.models(), {models:[{model:'available-model',label:'Available model',isDefault:true}],selected:'available-model'});
    await assert.rejects(f.session.send('hello','invented-model'), /available Codex model/);
    assert.equal(f.calls.filter(call=>call.method==='turn/start').length,0);
    await f.session.send('hello','available-model');
    const turn=f.calls.find(call=>call.method==='turn/start');
    assert.equal(turn.params.model,'available-model');
    assert.equal(turn.params.permissions,'restricted');
    assert.equal(turn.params.approvalPolicy,'never');
  } finally { await f.session.close(); }
});
