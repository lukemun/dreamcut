import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { discoverCodex } from './codex-discovery.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { connectCodex } from './codex-connection.mjs';
import { openCodexSession } from './codex-session.mjs';

// Synthetic inference only. The transport wrapper observes the owned test thread
// solely for cleanup; the product adapter never accepts caller-supplied thread IDs.
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-codex-adapter-'));
const env = desktopRuntimeEnvironment({ HOME: process.env.HOME, PATH: '/usr/bin:/bin' });
let client, session, ownedThread, text = '', toolCalls = 0;
const events = [];
async function waitFor(predicate) {
  const deadline = Date.now() + 60000;
  while (!predicate()) {
    if (events.some(event => event.type === 'disconnected' || event.type === 'error')) throw Error('Adapter reported a connection error.');
    if (Date.now() > deadline) throw Error('Adapter qualification timed out.');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
try {
  const found = await discoverCodex({ env });
  assert.equal(found.state, 'available');
  const openSession = () => openCodexSession({ executable: found.executable, projectDirectory: scratch, userData: path.join(scratch, 'app-data'), env,
    onEvent(event) { events.push(event); if (event.type === 'text') text += event.text; },
    async connect(executable, options) {
      client = await connectCodex(executable, { ...options, onNotification(method, params) {
        if (method === 'item/started' && ['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall'].includes(params.item?.type)) toolCalls++;
        options.onNotification(method, params);
      } });
      return { ...client, async request(method, params) {
        const result = await client.request(method, params);
        if (method === 'thread/start') ownedThread = result.thread?.id;
        if (method === 'thread/resume') assert.equal(result.thread.id, ownedThread);
        return result;
      } };
    } });
  session = await openSession();
  await session.send('Reply with READY only. Do not use tools.');
  await waitFor(() => events.some(event => event.type === 'completed'));
  assert.equal(events.at(-1).status, 'completed');
  assert.match(text, /READY/);
  await session.close();
  events.length = 0;
  session = await openSession();
  const history = events.find(event => event.type === 'history');
  assert.ok(history?.messages.some(message => message.role === 'user' && message.text.includes('READY')));
  assert.ok(history?.messages.some(message => message.role === 'assistant' && message.text.includes('READY')));
  await session.send('Count from 1 to 1000 in words, one per line. Do not use tools.');
  await session.cancel();
  await waitFor(() => events.some(event => event.type === 'completed'));
  assert.equal(events.at(-1).status, 'interrupted');
  assert.equal(toolCalls, 0);
  console.log(JSON.stringify({ version: found.version, adapterStreaming: true, adapterCancellation: true, persistedResume: true, restoredHistory: true, toolCalls }));
} finally {
  if (client && ownedThread) await client.request('thread/archive', { threadId: ownedThread }).catch(() => { process.exitCode = 1; console.error('Could not archive the disposable adapter session.'); });
  if (session) await session.close(); else if (client) await client.close();
  await fs.rm(scratch, { recursive: true, force: true });
}
