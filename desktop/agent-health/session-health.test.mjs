// Local-only session health (`pnpm agent:health`). No model and no editor server: the real
// harness MCP client, MCP server, journal and tool bridge, driven with the mistakes models make.
// Invariant: a bad call is a readable tool error, the bridge never throws, and the journal is
// left with nothing pending or unknown, so the creator's next message can always continue.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { connectEditingMcp } from '../../mcp/harness-mcp.mjs';
import { openSession } from '../../mcp/harness-session.mjs';
import { createEditingToolBridge } from '../codex-tool-bridge.mjs';
import { openDesktopEditingSession } from '../editing-session.mjs';
import { editorAgentFamilies } from '../../mcp/capability-catalog.mjs';

const unsettled = journal => journal.snapshot().operations.filter(operation => ['pending', 'unknown'].includes(operation.status));
const scratch = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-agent-health-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; };

async function realBridge(t, provider) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-agent-health-'));
  const mcp = await connectEditingMcp({ projectId: 'fixture', families: editorAgentFamilies(), projectsDirectory: dir });
  const journal = await openSession(path.join(dir, 'journal'), { limits: { tool_calls: 100, model_calls: 10 } });
  t.after(async () => { await mcp.close(); await journal.close(); await fs.rm(dir, { recursive: true, force: true }); });
  for (const id of editorAgentFamilies()) await mcp.call('capability_catalog', { action: 'load', id }, (await mcp.list()).map(tool => tool.name));
  let call = 0;
  const bridge = await createEditingToolBridge({ mcp, journal, projectId: 'fixture', provider, scope: () => ({ active: true, threadId: 'thread', turnId: 'turn' }) });
  const send = (tool, args) => bridge.call({ threadId: 'thread', turnId: 'turn', callId: `call-${++call}`, tool, arguments: args });
  return { mcp, journal, send };
}

// Each request is something a model has sent, or plausibly will. Nothing here may reach a project.
const MISTAKES = [
  ['an instrument flag outside the allowlist', 'run_instrument', { project_id: 'fixture', instrument: 'frame-state', extra_args: ['--out', 'x'] }],
  ['a malformed sample time', 'run_instrument', { project_id: 'fixture', instrument: 'frame-state', extra_args: ['--at', 'soon'] }],
  ['an unknown instrument', 'run_instrument', { project_id: 'fixture', instrument: 'render' }],
  ['an empty proposal', 'proposal_create', { project_id: 'fixture', proposal: {} }],
  ['another project', 'timeline_get', { project_id: 'someone-else' }],
  ['a tool outside the session', 'element_delete', { project_id: 'fixture' }],
  ['arguments of the wrong shape', 'proposal_get', { project_id: 'fixture', proposal_id: 42 }],
];

for (const provider of ['claude', 'codex']) {
  test(`${provider}: model mistakes are tool errors and leave the conversation usable`, async t => {
    const { journal, send } = await realBridge(t, provider);
    for (const [label, tool, args] of MISTAKES) {
      const result = await send(tool, args).catch(error => assert.fail(`${label} threw instead of returning a tool error: ${error.message}`));
      const failed = provider === 'codex' ? result.success === false : result.isError === true;
      assert.ok(failed, `${label} should be reported to the model as an error`);
      assert.deepEqual(unsettled(journal), [], `${label} left an unresolved call`);
    }
  });
}

test('instrument flags the tool advertises reach the server instead of being refused by the harness', async t => {
  const { mcp } = await realBridge(t, 'claude');
  const names = (await mcp.list()).map(tool => tool.name);
  // `--at` with a bad value: only the server's allowlist explains the value, so the message proves the flag got through.
  const result = await mcp.call('run_instrument', { project_id: 'fixture', instrument: 'frame-state', extra_args: ['--at', 'soon'] }, names);
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result), /--at needs a valid value/);
});

test('sending after an interrupted call continues and tells the agent to check first', async t => {
  const dir = await scratch(t);
  const project = path.join(dir, 'projects', 'fixture');
  const userData = path.join(dir, 'data');
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'timeline.json'), '{}');
  const real = await fs.realpath(project);
  // The previous run dispatched a call and died before its result came back.
  const { createHash } = await import('node:crypto');
  const journalDir = path.join(userData, 'claude-editing-journals', createHash('sha256').update(real).digest('hex'));
  const { EDITING_INSTRUCTIONS_VERSION } = await import('../editing-session.mjs');
  const previous = await openSession(journalDir, { pinned: { projectId: 'fixture', project: real, instructionsVersion: EDITING_INSTRUCTIONS_VERSION, provider: 'claude' }, limits: { tool_calls: 10, model_calls: 10 } });
  await previous.beginTool({ id: 'lost', tool: 'proposal_create', arguments: { project_id: 'fixture' } });
  await previous.close();

  const sent = [];
  const fakeMcp = { list: async () => [{ name: 'capability_catalog' }, { name: 'timeline_get' }], call: async () => ({ content: [] }), close: async () => {} };
  const session = await openDesktopEditingSession({ provider: 'claude', projectDirectory: project, userData, origin: 'http://127.0.0.1:1', env: {},
    connectMcp: async () => fakeMcp,
    openClaude: async ({ editing }) => {
      assert.deepEqual(unsettled(editing.journal), [], 'the provider must open with nothing unresolved');
      return { models: async () => ({ models: [] }), send: async text => { sent.push(text); }, cancel: async () => {}, close: async () => {} };
    } });
  try {
    assert.deepEqual(session.interrupted, ['proposal_create']);
    await session.send('Keep going.');
    await session.send('And then?');
    assert.match(sent[0], /interrupted[\s\S]*proposal_create[\s\S]*before repeating/);
    assert.match(sent[0], /Keep going\.$/);
    assert.equal(sent[1], 'And then?', 'the note is sent once');
  } finally { await session.close(); }
  const settled = JSON.parse(await fs.readFile(path.join(journalDir, 'checkpoint.json'), 'utf8')).operations[0];
  assert.equal(settled.status, 'unconfirmed');
});
