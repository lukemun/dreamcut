import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { discoverCodex } from './codex-discovery.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { connectCodex } from './codex-connection.mjs';
import { restrictedCodexSession } from './codex-session-policy.mjs';

// Disposable session qualification with synthetic model turns; no user project or tools.
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-codex-session-'));
const env = desktopRuntimeEnvironment({ HOME: process.env.HOME, PATH: '/usr/bin:/bin' });
const found = await discoverCodex({ env });
assert.equal(found.state, 'available');
const completed = new Map();
const active = new Set();
let streamed = '';
let toolCalls = 0;
const client = await connectCodex(await fs.realpath(found.executable), { env, cwd: scratch, experimentalApi: true, onNotification(method, params) {
  if (method === 'turn/completed') completed.set(params.turn.id, params.turn);
  if (method === 'turn/started') active.add(params.turn.id);
  if (method === 'item/agentMessage/delta') streamed = (streamed + params.delta).slice(-4096);
  if (method === 'item/started' && ['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall'].includes(params.item?.type)) toolCalls++;
} });
let ownedThreadId;
try {
  const effective = await client.request('config/read', { includeLayers: false });
  const policy = await restrictedCodexSession({ projectDirectory: scratch, executable: found.executable,
    mcpServerNames: Object.keys(effective.config?.mcp_servers || {}) });
  const { config, permissions } = policy;
  const created = await client.request('thread/start', { cwd: scratch, permissions, approvalPolicy: 'never',
    ephemeral: false, serviceName: 'dreamcut-protocol-qualification', config });
  assert.ok(created.thread?.id);
  ownedThreadId = created.thread.id;
  assert.equal(created.thread.ephemeral, false);
  assert.equal(created.approvalPolicy, 'never');
  assert.equal(created.sandbox?.type, 'readOnly');
  const inventory = await client.request('mcpServerStatus/list', { threadId: ownedThreadId });
  assert.ok(inventory.data.every(server => Object.keys(server.tools || {}).length === 0), 'Unexpected external tools in isolated session');
  const started = await client.request('turn/start', { threadId: ownedThreadId,
    input: [{ type: 'text', text: 'Reply with READY only. Do not use any tools.' }], approvalPolicy: 'never',
    permissions });
  const deadline = Date.now() + 60000;
  while (!completed.has(started.turn.id)) {
    if (Date.now() > deadline) throw Error('Synthetic Codex turn did not finish within one minute.');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(completed.get(started.turn.id).status, 'completed');
  assert.match(streamed, /READY/);
  assert.equal(toolCalls, 0);
  const resumed = await client.request('thread/resume', { threadId: created.thread.id, cwd: scratch,
    permissions, approvalPolicy: 'never', config });
  assert.equal(resumed.thread.id, created.thread.id);
  assert.equal(resumed.sandbox?.type, 'readOnly');
  const cancellable = await client.request('turn/start', { threadId: ownedThreadId,
    input: [{ type: 'text', text: 'Count from 1 to 1000 in words, one number per line. Do not use tools.' }],
    approvalPolicy: 'never', permissions });
  const startDeadline = Date.now() + 15000;
  while (!active.has(cancellable.turn.id)) {
    if (completed.has(cancellable.turn.id)) throw Error('Cancellation fixture ended before becoming active.');
    if (Date.now() > startDeadline) throw Error('Cancellation fixture did not become active.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await client.request('turn/interrupt', { threadId: ownedThreadId, turnId: cancellable.turn.id });
  const interruptDeadline = Date.now() + 15000;
  while (!completed.has(cancellable.turn.id)) {
    if (Date.now() > interruptDeadline) throw Error('Interrupted Codex turn did not reach a terminal state.');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(completed.get(cancellable.turn.id).status, 'interrupted');
  assert.equal(toolCalls, 0);
  console.log(JSON.stringify({ version: found.version, durableStart: true, resume: true, sandbox: 'readOnly', streamedSyntheticTurn: true, cancellation: true, toolCalls }));
} catch (error) { console.error(error.protocolMessage || error.message); process.exitCode = 1; } finally {
  if (ownedThreadId) await client.request('thread/archive', { threadId: ownedThreadId }).catch(() => { console.error('The disposable protocol session could not be archived.'); process.exitCode = 1; });
  await client.close(); await fs.rm(scratch, { recursive: true, force: true }); }
