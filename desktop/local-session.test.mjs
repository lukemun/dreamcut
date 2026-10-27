import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openLocalSession, toolMessage } from './local-session.mjs';

test('a text-only model gets a note in place of tool images', () => {
  const result = { content: [{ type: 'text', text: 'frame' }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }] };
  assert.equal(toolMessage('a', result).content[1].type, 'image_url');
  const textOnly = toolMessage('a', result, false);
  assert.equal(typeof textOnly.content, 'string');
  assert.deepEqual(JSON.parse(textOnly.content).content, ['frame', '1 image(s) omitted: this model cannot read images.']);
});

const harnessRoot = fileURLToPath(new URL('../', import.meta.url));
const until = async (predicate, events) => { for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(predicate(), JSON.stringify(events)); };

// A scripted OpenAI-compatible server: each request takes the next list of stream chunks.
function fakeServer(script) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body); requests.push(body);
    const chunks = script.shift() ?? [];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ async start(controller) {
      for (const chunk of chunks) {
        if (chunk === 'hang') { await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
    } });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return { fetchImpl, requests };
}
const text = value => ({ choices: [{ delta: { content: value } }] });
const toolCall = (name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

function fixture(script, { models = ['qwen', 'ministral'], ...extra } = { }) {
  extra.prewarmOnOpen ??= false;
  const events = [], journal = [], dispatched = [], acquired = [];
  const server = fakeServer(script);
  const editing = { projectId: 'film', harnessRoot,
    mcp: { list: async () => [{ name: 'timeline_get', description: 'Read', inputSchema: { type: 'object', properties: { project_id: { type: 'string' } } } }],
      call: async (tool, args) => { dispatched.push({ tool, args }); return { content: [{ type: 'text', text: '{"elements":3}' }] }; } },
    journal: { beginTool: async ({ id }) => { journal.push(['begin', id]); }, finishTool: async id => { journal.push(['finish', id]); } } };
  const open = () => openLocalSession({ executable: '/bin/llama-server', projectDirectory: '/tmp/film', projectLease: undefined, editing, harnessRoot, models,
    developerInstructions: 'Edit through DreamCut.', onEvent: event => events.push(event), fetchImpl: server.fetchImpl,
    acquire: async name => { acquired.push(name); return { name, alias: `dreamcut-${name}`, endpoint: 'http://127.0.0.1:9' }; }, release: () => {}, ...extra });
  return { open, events, journal, dispatched, acquired, requests: server.requests };
}

test('a local turn streams text and runs editing tools only through the journaled bridge', async t => {
  const { open, events, journal, dispatched, requests } = fixture([[toolCall('timeline_get', { project_id: 'film' })], [text('The timeline has '), text('3 elements.')]]);
  const session = await open(); t.after(() => session.close());
  await session.send('How many elements?');
  await until(() => events.some(event => event.type === 'completed'), events);
  assert.deepEqual(dispatched, [{ tool: 'timeline_get', args: { project_id: 'film' } }]);
  assert.equal(journal.length, 2);
  assert.deepEqual(events.filter(event => event.type === 'tool').map(event => event.status), ['running', 'done']);
  assert.equal(events.filter(event => event.type === 'text').map(event => event.text).join(''), 'The timeline has 3 elements.');
  assert.equal(events.at(-1).status, 'completed');
  assert.equal(requests[0].model, 'dreamcut-ministral');
  assert.ok(requests[0].tools.some(tool => tool.function.name === 'timeline_get'));
  assert.equal(requests[1].messages.at(-1).role, 'tool');
});

test('Stop interrupts a streaming reply and no tool runs afterwards', async t => {
  const { open, events, dispatched } = fixture([[text('Working'), 'hang']]);
  const session = await open(); t.after(() => session.close());
  await session.send('Do a long edit');
  await until(() => events.some(event => event.type === 'text'), events);
  await session.cancel();
  await until(() => events.some(event => event.type === 'completed'), events);
  assert.equal(events.at(-1).status, 'interrupted');
  assert.deepEqual(dispatched, []);
});

test('the chosen installed model is loaded; others are refused', async t => {
  const { open, events, acquired } = fixture([[text('ok')]]);
  const session = await open(); t.after(() => session.close());
  assert.deepEqual((await session.models()).models.map(item => item.model), ['qwen', 'ministral']);
  await assert.rejects(session.send('hi', 'gpt-oss'), /installed local model/);
  await session.send('hi', 'ministral');
  await until(() => events.some(event => event.type === 'completed'), events);
  assert.deepEqual(acquired, ['ministral']);
});

test('tool calls outside DreamCut editing tools are refused without dispatch', async t => {
  const { open, events, dispatched, requests } = fixture([[toolCall('shell', { command: 'ls' })], [text('Done.')]]);
  const session = await open(); t.after(() => session.close());
  await session.send('List files');
  await until(() => events.some(event => event.type === 'completed'), events);
  assert.deepEqual(dispatched, []);
  assert.match(requests[1].messages.at(-1).content, /TOOL_NOT_REGISTERED/);
});

test('the default local model follows the measured ranking unless overridden', async () => {
  const { defaultLocalModel } = await import('./local-session.mjs');
  assert.equal(defaultLocalModel(['glimmer', 'qwen', 'ministral']), 'ministral');
  assert.equal(defaultLocalModel(['glimmer', 'qwen']), 'glimmer');
  assert.equal(defaultLocalModel(['glimmer', 'qwen', 'ministral'], 'qwen'), 'qwen');
  assert.equal(defaultLocalModel(['qwen'], 'ministral'), 'qwen');
});

test('opening prewarms the model and its instructions/tool prefix; the first message reuses the loaded model', async t => {
  const { open, events, acquired, requests } = fixture([[], [text('ok')]], { prewarmOnOpen: true });
  const session = await open(); t.after(() => session.close());
  await until(() => events.some(event => event.type === 'model-status' && event.state === 'ready'), events);
  assert.deepEqual(events.filter(event => event.type === 'model-status').map(event => event.state), ['loading', 'ready']);
  assert.equal(requests[0].max_tokens, 1);
  assert.equal(requests[0].messages[0].content, 'Edit through DreamCut.');
  assert.ok(requests[0].tools.length > 0);
  await session.send('hi');
  await until(() => events.some(event => event.type === 'completed'), events);
  assert.deepEqual(acquired, ['ministral']);
});

test('choosing another model in the picker loads it ahead of the next message', async t => {
  const { open, events, acquired } = fixture([[], [text('ok')]]);
  const session = await open(); t.after(() => session.close());
  await session.prewarm('qwen');
  await until(() => events.some(event => event.type === 'model-status' && event.state === 'ready'), events);
  await assert.rejects(session.prewarm('gpt-oss'), /installed local model/);
  await session.send('hi');
  await until(() => events.some(event => event.type === 'completed'), events);
  assert.deepEqual(acquired, ['qwen']);
});
