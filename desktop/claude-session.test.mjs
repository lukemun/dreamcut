import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openClaudeSession } from './claude-session.mjs';

const MODELS = [{ value: 'default', displayName: 'Default (recommended)' }, { value: 'opus', displayName: 'Opus' }, { value: 'sonnet', displayName: 'Sonnet' }];

// A scripted stand-in for the Agent SDK. Tests push SDK messages and read prompts.
function fakeSdk({ account = { tokenSource: 'claude.ai' }, history = [] } = {}) {
  const calls = { setModel: [], interrupts: 0, closed: 0, prompts: [] };
  let push, finish;
  const outgoing = []; let wake;
  push = message => { outgoing.push(message); wake?.(); };
  finish = () => { outgoing.push(null); wake?.(); };
  const sdk = {
    calls, push, finish,
    getSessionMessages: async (id, options) => { calls.history = { id, options }; return history; },
    query({ prompt, options }) {
      calls.options = options;
      (async () => { for await (const message of prompt) calls.prompts.push(message); })();
      return {
        initializationResult: async () => ({ models: MODELS, account }),
        setModel: async model => { calls.setModel.push(model); },
        interrupt: async () => { calls.interrupts++; },
        close: () => { calls.closed++; finish(); },
        async *[Symbol.asyncIterator]() {
          for (;;) {
            if (!outgoing.length) await new Promise(resolve => { wake = resolve; });
            wake = undefined;
            const next = outgoing.shift();
            if (next === null) return;
            if (next) yield next;
          }
        },
      };
    },
  };
  return sdk;
}

const init = (extra = {}) => ({ type: 'system', subtype: 'init', session_id: 'session-1', tools: [],
  mcp_servers: [{ name: 'dreamcut', status: 'connected', source: 'sdk' }], apiKeySource: 'none', model: 'claude-opus-5-5', ...extra });
const delta = text => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const until = async (predicate, events) => { for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(predicate(), JSON.stringify(events)); };

async function fixture(t, { sdk = fakeSdk(), saved, env = {}, editing } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-session-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'); const userData = path.join(root, 'data');
  await fs.mkdir(project);
  if (saved) {
    const { codexSessionStore } = await import('./codex-session-store.mjs');
    await (await codexSessionStore(userData, project, 'claude-sessions')).save(saved, null);
  }
  const events = [];
  const session = await openClaudeSession({ projectDirectory: project, userData, env, sdk, editing, developerInstructions: 'Edit only through DreamCut.', onEvent: event => events.push(event) });
  t.after(() => session.close());
  return { session, sdk, events, userData, project };
}

test('Claude Code runs with no built-in tools, no user settings and no API credentials', async t => {
  const { sdk } = await fixture(t, { env: { PATH: '/bin', HOME: '/home/user', ANTHROPIC_API_KEY: 'sk-ant-secret', ANTHROPIC_BASE_URL: 'https://proxy.example' } });
  const options = sdk.calls.options;
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.settingSources, []);
  assert.equal(options.strictMcpConfig, true);
  assert.equal(options.permissionMode, 'dontAsk');
  assert.deepEqual(Object.keys(options.mcpServers), ['dreamcut']);
  assert.equal(options.mcpServers.dreamcut.type, 'sdk');
  assert.equal(options.systemPrompt, 'Edit only through DreamCut.');
  assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(options.env.ANTHROPIC_BASE_URL, undefined);
  assert.equal(options.env.PATH, '/bin');
  assert.equal(options.cwd.includes(`${path.sep}claude-workspaces${path.sep}`), true);
  assert.deepEqual(await options.canUseTool('Bash', {}, {}), { behavior: 'deny', message: 'Only DreamCut editing tools are available in this session.' });
});

test('an API key billing source is refused before any message is sent', async t => {
  await assert.rejects(fixture(t, { sdk: fakeSdk({ account: { apiKeySource: 'ANTHROPIC_API_KEY' } }) }), /subscription sign-in only/);
});

test('models come from Claude Code and switching applies before the message', async t => {
  const { session, sdk, events } = await fixture(t);
  assert.deepEqual(await session.models(), { models: [
    { model: 'default', label: 'Default (recommended)', isDefault: true }, { model: 'opus', label: 'Opus', isDefault: false },
    { model: 'sonnet', label: 'Sonnet', isDefault: false }], selected: 'default' });
  await assert.rejects(session.send('hello', 'gpt-5'), /available Claude model/);
  await session.send('Tighten the intro', 'sonnet');
  assert.deepEqual(sdk.calls.setModel, ['sonnet']);
  await until(() => sdk.calls.prompts.length === 1);
  assert.deepEqual(sdk.calls.prompts[0].message.content, [{ type: 'text', text: 'Tighten the intro' }]);
  sdk.push(init()); sdk.push(delta('Reading ')); sdk.push(delta('the timeline.'));
  sdk.push({ type: 'result', subtype: 'success', is_error: false });
  await until(() => events.some(event => event.type === "completed"), events);
  assert.deepEqual(events.map(event => event.type), ['started', 'text', 'text', 'completed']);
  assert.equal(events.filter(event => event.type === 'text').map(event => event.text).join(''), 'Reading the timeline.');
  assert.equal(events.at(-1).status, 'completed');
  await session.send('Again', 'sonnet');
  assert.deepEqual(sdk.calls.setModel, ['sonnet']);
});

test('typed slash text is sent as conversation text, not a Claude Code command', async t => {
  const { session, sdk } = await fixture(t);
  await session.send('/logout please');
  await until(() => sdk.calls.prompts.length === 1);
  assert.equal(sdk.calls.prompts[0].message.content[0].text, '​/logout please');
});

test('a session that loads tools or servers beyond DreamCut disconnects', async t => {
  const { session, sdk, events } = await fixture(t);
  await session.send('hello');
  sdk.push(init({ tools: ['Bash'] }));
  await until(() => events.some(event => event.type === 'disconnected'));
  await assert.rejects(session.send('again'), /closed/);
});

test('Stop interrupts Claude and reports an interrupted response', async t => {
  const { session, sdk, events } = await fixture(t);
  await session.send('Make a long edit');
  await session.cancel();
  assert.equal(sdk.calls.interrupts, 1);
  sdk.push(init()); sdk.push({ type: 'result', subtype: 'error_during_execution', is_error: true });
  await until(() => events.some(event => event.type === "completed"), events);
  assert.equal(events.at(-1).status, 'interrupted');
});

test('sign-in failures surface as a readable error and a failed response', async t => {
  const { session, sdk, events } = await fixture(t);
  await session.send('hello');
  sdk.push(init()); sdk.push({ type: 'assistant', error: 'authentication_failed', message: { content: [] }, parent_tool_use_id: null });
  sdk.push({ type: 'result', subtype: 'success', is_error: true });
  await until(() => events.some(event => event.type === "completed"), events);
  assert.match(events.find(event => event.type === 'error').message, /signed out/);
  assert.equal(events.at(-1).status, 'failed');
});

test('a saved conversation resumes by session id and replays visible text only', async t => {
  const history = [
    { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: 'Trim the intro' } },
    { type: 'assistant', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'tool_use', name: 'x' }, { type: 'text', text: 'Proposal ready.' }] } },
    { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', content: 'secret evidence' }] } },
    { type: 'assistant', parent_tool_use_id: null, message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'Not logged in · Please run /login' }] } },
  ];
  const { sdk, events } = await fixture(t, { sdk: fakeSdk({ history }), saved: 'session-1' });
  assert.equal(sdk.calls.options.resume, 'session-1');
  assert.equal(sdk.calls.history.id, 'session-1');
  assert.deepEqual(events[0], { type: 'history', truncated: false, messages: [{ role: 'user', text: 'Trim the intro' }, { role: 'assistant', text: 'Proposal ready.' }] });
});

test('tool calls reach the shared bridge only inside an active turn and are journaled', async t => {
  const journal = [], dispatched = [];
  const editing = { projectId: 'project',
    mcp: { list: async () => [{ name: 'timeline_get', description: 'Read', inputSchema: { type: 'object', properties: { project_id: { type: 'string' } } } }],
      call: async (name, args) => { dispatched.push([name, args]); return { content: [{ type: 'text', text: 'revision abc' }] }; } },
    journal: { snapshot: () => ({ operations: [] }), beginTool: async ({ id }) => { journal.push(['begin', id]); }, finishTool: async id => { journal.push(['finish', id]); } } };
  const { session, sdk } = await fixture(t, { editing });
  assert.deepEqual(sdk.calls.options.allowedTools, ['mcp__dreamcut__timeline_get']);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await sdk.calls.options.mcpServers.dreamcut.instance.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  t.after(() => client.close());
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['timeline_get']);
  const outside = await client.callTool({ name: 'timeline_get', arguments: { project_id: 'project' } });
  assert.equal(outside.isError, true);
  assert.deepEqual(dispatched, []);
  await session.send('Read it');
  sdk.push(init({ tools: ['mcp__dreamcut__timeline_get'] }));
  await until(() => true);
  await new Promise(resolve => setTimeout(resolve, 20));
  const inside = await client.callTool({ name: 'timeline_get', arguments: { project_id: 'project' } });
  assert.equal(inside.isError, false);
  assert.deepEqual(inside.content, [{ type: 'text', text: 'revision abc' }]);
  assert.deepEqual(dispatched, [['timeline_get', { project_id: 'project' }]]);
  assert.deepEqual(journal.map(([phase]) => phase), ['begin', 'finish']);
  assert.ok(journal[0][1].startsWith('session-1:'));
});

test('summarized reasoning streams to the chat while a turn runs', async t => {
  const { session, sdk, events } = await fixture(t);
  assert.deepEqual(sdk.calls.options.thinking, { type: 'adaptive', display: 'summarized' });
  await session.send('Tighten the intro');
  sdk.push(init());
  sdk.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', content_block: { type: 'thinking' } } });
  sdk.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Checking the first cut.' } } });
  sdk.push(delta('Done.'));
  sdk.push({ type: 'result', subtype: 'success', is_error: false });
  await until(() => events.some(event => event.type === 'completed'), events);
  assert.deepEqual(events.filter(event => event.type.startsWith('reasoning')), [{ type: 'reasoning-start' }, { type: 'reasoning', text: 'Checking the first cut.' }]);
});
