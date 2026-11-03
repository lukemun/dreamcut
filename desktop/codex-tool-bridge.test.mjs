import test from 'node:test';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { createCodexToolBridge } from './codex-tool-bridge.mjs';

async function fixture({ fail = false } = {}) {
  const events = [], calls = new Set();
  const png = (await sharp({ create: { width: 2, height: 2, channels: 3, background: '#f00' } }).png().toBuffer()).toString('base64');
  const bridge = await createCodexToolBridge({ projectId: 'project', scope: () => ({ active: true, threadId: 'thread', turnId: 'turn' }),
    mcp: { list: async () => [{ name: 'proposal_create', inputSchema: { type: 'object' } }], call: async () => {
      events.push('dispatch'); if (fail) throw Error('unknown transport outcome');
      return { content: [{ type: 'text', text: 'draft' }, { type: 'image', mimeType: 'image/png', data: png }] };
    } },
    journal: { beginTool: async ({id}) => { if(calls.has(id))throw Error('Duplicate operation');calls.add(id);events.push('before'); }, finishTool: async () => { events.push('after'); } },
  });
  return { bridge, events, input: { threadId: 'thread', turnId: 'turn', callId: 'call', tool: 'proposal_create', arguments: { project_id: 'project' } } };
}

test('bridge rejects out-of-scope and unregistered requests before dispatch', async () => {
  const {bridge,events,input}=await fixture();
  for(const changed of [{threadId:'other'},{turnId:'other'},{tool:'proposal_approve'},{arguments:{project_id:'other'}},{namespace:'other'}]){
    assert.equal((await bridge.call({...input,...changed})).success,false);
  }
  assert.deepEqual(events,[]);
});

test('bridge journals before dispatch and after acknowledgement and never replays a call', async () => {
  const {bridge,events,input}=await fixture();
  const result=await bridge.call(input);
  assert.deepEqual(events,['before','dispatch','after']);
  assert.equal(result.contentItems[1].type,'inputImage');
  await assert.rejects(bridge.call(input),/Duplicate/);
  assert.deepEqual(events,['before','dispatch','after']);
});

test('unknown tool outcome remains pending and is never acknowledged as non-execution', async () => {
  const {bridge,events,input}=await fixture({fail:true});
  await assert.rejects(bridge.call(input),/unknown/);
  assert.deepEqual(events,['before','dispatch']);
});

test('cancellation while the intent is being saved prevents dispatch', async () => {
  let active = true, dispatched = false, recorded;
  const bridge = await createCodexToolBridge({ projectId: 'project', scope: () => ({ active, threadId: 'thread', turnId: 'turn' }),
    mcp: { list: async () => [{ name: 'proposal_create', inputSchema: {} }], call: async () => { dispatched = true; } },
    journal: { beginTool: async () => { active = false; }, finishTool: async (_id, result) => { recorded = result; } },
  });
  const result = await bridge.call({ threadId: 'thread', turnId: 'turn', callId: 'cancelled', tool: 'proposal_create', arguments: { project_id: 'project' } });
  assert.equal(result.success, false); assert.equal(dispatched, false); assert.equal(recorded.isError, true);
});

test('Codex registration uses portable schemas without mutating the authoritative MCP schema', async () => {
  const unit = { type: 'number', minimum: 0, maximum: 1 };
  const schema = { type: 'object', properties: { bezier: { type: 'array', items: [unit, unit, unit, unit] } } };
  const original = structuredClone(schema);
  const bridge = await createCodexToolBridge({ projectId: 'project', scope: () => null, journal: {},
    mcp: { list: async () => [{ name: 'proposal_create', inputSchema: schema }], call: async () => {} } });
  assert.deepEqual(bridge.tools[0].inputSchema.properties.bezier, { type: 'array', items: unit, minItems: 4, maxItems: 4 });
  assert.deepEqual(schema, original);
});

test('invalid evidence retains acknowledged execution and never claims a mutation did not run', async () => {
  let acknowledged, calls = 0;
  const bridge = await createCodexToolBridge({ projectId: 'project', scope: () => ({ active: true, threadId: 't', turnId: 'u' }),
    mcp: { list: async () => [{ name: 'proposal_create', inputSchema: { type: 'object' } }], call: async () => {
      calls++; return { content: [{ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }] };
    } }, journal: { beginTool: async () => {}, finishTool: async (_id, result) => { acknowledged = result; } },
  });
  const result = await bridge.call({ threadId: 't', turnId: 'u', callId: 'c', tool: 'proposal_create', arguments: {} });
  assert.equal(calls, 1); assert.equal(result.success, false);
  const report = JSON.parse(result.contentItems[0].text);
  assert.equal(report.tool_execution_completed, true); assert.equal(report.state_changed, undefined);
  assert.equal(acknowledged._meta.dreamcut_delivery.status, 'unavailable');
});

test('the chat sees each tool start and finish, without its arguments or results', async () => {
  const activity = [];
  const bridge = await createCodexToolBridge({ projectId: 'project', scope: () => ({ active: true, threadId: 'thread', turnId: 'turn' }), onActivity: event => activity.push(event),
    mcp: { list: async () => [{ name: 'timeline_get', inputSchema: {} }], call: async () => ({ isError: true, content: [{ type: 'text', text: 'secret' }] }) },
    journal: { beginTool: async () => {}, finishTool: async () => {} } });
  await bridge.call({ threadId: 'thread', turnId: 'turn', callId: 'one', tool: 'timeline_get', arguments: { project_id: 'project' } });
  assert.deepEqual(activity, [{ id: 'thread:one', tool: 'timeline_get', status: 'running' }, { id: 'thread:one', tool: 'timeline_get', status: 'failed' }]);
});
