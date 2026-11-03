import test from 'node:test';
import assert from 'node:assert/strict';
import { DELEGATE_TOOL, HELPER_TOOLS, createDelegation, helperInstructions, supportsDelegation } from './agent-delegation.mjs';
import { createEditingToolBridge } from './codex-tool-bridge.mjs';

const journalStub = opened => async (directory, options) => { opened.push({ directory, options }); return { close: async () => { opened.push('journal-close'); } }; };

// A scripted helper: replies with text and a tool step after `delayMs`, or never finishes.
function helpers({ delayMs = 5, hang = false, fail } = {}) {
  const log = { opened: 0, live: 0, peak: 0, models: [], closed: 0, cancelled: 0 };
  const openHelper = async ({ onEvent }) => {
    log.opened++; log.live++; log.peak = Math.max(log.peak, log.live);
    let timer;
    return {
      async send(text, model) {
        log.models.push(model);
        if (fail?.(text)) throw Error('helper could not start');
        if (hang) return;
        timer = setTimeout(() => {
          onEvent({ type: 'tool', id: `${text}:1`, tool: 'visual_analyze', status: 'running' });
          onEvent({ type: 'text', text: `report for ${text}` });
          onEvent({ type: 'completed', status: 'completed' });
        }, delayMs);
      },
      async cancel() { log.cancelled++; },
      async close() { clearTimeout(timer); log.live--; log.closed++; },
    };
  };
  return { log, openHelper };
}

const parse = result => JSON.parse(result.content[0].text);

test('runs tasks in parallel up to the provider limit and returns reports in task order', async () => {
  const opened = [], forwarded = [];
  const { log, openHelper } = helpers();
  const delegation = createDelegation({ provider: 'claude', projectId: 'p', openHelper, openJournal: journalStub(opened), journalRoot: '/journals/delegates',
    model: async () => 'opus', onEvent: event => forwarded.push(event) });
  const result = await delegation.call({ project_id: 'p', tasks: ['a', 'b', 'c'].map(label => ({ label, instructions: label })) });
  const body = parse(result);
  assert.equal(result.isError, false);
  assert.deepEqual(body.results.map(item => [item.label, item.status, item.report, item.tool_calls]), [['a', 'completed', 'report for a', 1], ['b', 'completed', 'report for b', 1], ['c', 'completed', 'report for c', 1]]);
  assert.equal(log.peak, 3);
  assert.deepEqual(log.models, ['opus', 'opus', 'opus']);
  assert.equal(log.closed, 3);
  // Each helper has its own journal under this run; helper tool steps reach the main activity, their text does not.
  const directories = opened.filter(item => item.directory).map(item => item.directory);
  assert.equal(new Set(directories).size, 3);
  assert.ok(directories.every(directory => directory.startsWith(`/journals/delegates/${body.run_id}/`)));
  assert.ok(opened.filter(item => item.options).every(item => item.options.pinned.delegate === true));
  assert.deepEqual(forwarded.map(event => event.type), ['tool', 'tool', 'tool']);
});

test('local models do not delegate', () => {
  assert.equal(supportsDelegation('local'), false);
  assert.equal(supportsDelegation('claude'), true);
  assert.equal(supportsDelegation('codex'), true);
  assert.throws(() => createDelegation({ provider: 'local', projectId: 'p' }));
});

test('rejects invalid task lists before opening any helper', async () => {
  const { log, openHelper } = helpers();
  const delegation = createDelegation({ provider: 'codex', projectId: 'p', openHelper, openJournal: journalStub([]), journalRoot: '/j' });
  for (const tasks of [[], [{ label: 'a' }], [{ label: '', instructions: 'x' }], Array.from({ length: 5 }, () => ({ label: 'a', instructions: 'x' }))]) {
    const result = await delegation.call({ tasks });
    assert.equal(result.isError, true);
    assert.equal(parse(result).code, 'INVALID_ARGUMENTS');
  }
  assert.equal(log.opened, 0);
});

test('a helper past the deadline is cancelled and reported, others still return', async () => {
  const { log, openHelper } = helpers({ hang: true });
  const delegation = createDelegation({ provider: 'codex', projectId: 'p', openHelper, openJournal: journalStub([]), journalRoot: '/j',
    limits: { maxTasks: 4, concurrency: 4, deadlineMs: 30 } });
  const result = await delegation.call({ tasks: [{ label: 'slow', instructions: 'x' }] });
  assert.equal(result.isError, true);
  assert.equal(parse(result).results[0].status, 'timed_out');
  assert.equal(log.cancelled, 1);
  assert.equal(log.closed, 1);
});

test('stopping the main turn interrupts running helpers', async () => {
  const { log, openHelper } = helpers({ hang: true });
  let active = true;
  const delegation = createDelegation({ provider: 'claude', projectId: 'p', openHelper, openJournal: journalStub([]), journalRoot: '/j', pollMs: 5 });
  setTimeout(() => { active = false; }, 20);
  const body = parse(await delegation.call({ tasks: [{ label: 'a', instructions: 'x' }, { label: 'b', instructions: 'y' }] }, { active: () => active }));
  assert.deepEqual(body.results.map(item => item.status), ['interrupted', 'interrupted']);
  assert.equal(log.cancelled, 2);
  assert.equal(log.closed, 2);
});

test('one failing helper does not fail the others', async () => {
  const { openHelper } = helpers({ fail: text => text === 'bad' });
  const delegation = createDelegation({ provider: 'claude', projectId: 'p', openHelper, openJournal: journalStub([]), journalRoot: '/j' });
  const body = parse(await delegation.call({ tasks: [{ label: 'good', instructions: 'good' }, { label: 'bad', instructions: 'bad' }] }));
  assert.deepEqual(body.results.map(item => item.status), ['completed', 'failed']);
  assert.match(body.results[1].error, /could not start/);
});

test('helper allowlist excludes staging, feedback writes and delegation itself', () => {
  for (const name of ['proposal_create', 'editing_feedback_record', 'editing_feedback_disposition', 'proposal_work_record', 'asset_generation_prepare', 'capability_catalog', 'run_instrument', DELEGATE_TOOL]) {
    assert.equal(HELPER_TOOLS.has(name), false, name);
  }
  assert.match(helperInstructions('p', 'claude'), /cannot create proposals/);
});

test('bridge narrows editing tools and journals host tools like any other call', async () => {
  const events = [];
  const bridge = await createEditingToolBridge({ provider: 'claude', projectId: 'p', scope: () => ({ active: true, threadId: 't', turnId: 'u' }),
    allow: new Set(['timeline_get']),
    hostTools: [{ name: DELEGATE_TOOL, description: 'd', inputSchema: { type: 'object' }, call: async (args, { active }) => { events.push(['host', args.tasks, active()]); return { content: [{ type: 'text', text: 'ok' }] }; } }],
    mcp: { list: async () => [{ name: 'timeline_get', inputSchema: { type: 'object' } }, { name: 'proposal_create', inputSchema: { type: 'object' } }], call: async name => { events.push(['mcp', name]); return { content: [] }; } },
    journal: { beginTool: async ({ tool }) => events.push(['begin', tool]), finishTool: async () => events.push(['finish']) } });
  assert.deepEqual(bridge.tools.map(tool => tool.name), ['timeline_get', DELEGATE_TOOL]);
  const call = (tool, callId) => bridge.call({ threadId: 't', turnId: 'u', callId, tool, arguments: { project_id: 'p', tasks: 1 } });
  assert.equal((await call('proposal_create', 'a')).isError, true);
  assert.equal((await call(DELEGATE_TOOL, 'b')).isError, false);
  assert.deepEqual(events, [['begin', DELEGATE_TOOL], ['host', 1, true], ['finish']]);
});
