import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSession } from './harness-session.mjs';
import { runHarness } from './editing-harness.mjs';
const tool = { name: 'status', inputSchema: { type: 'object', properties: {} } };
const call = (id, args = '{}') => ({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'status', arguments: args } }] });
const ok = { content: [{ type: 'text', text: 'ready' }] };
async function setup(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'editing-harness-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return { directory, session: await openSession(directory, options) };
}

test('real bounded loop persists messages, supplies schemas and returns tool result to model', async (t) => {
  const { session } = await setup(t);
  let requests = 0, dispatches = 0;
  const result = await runHarness(session, { messages: [{ role: 'user', content: 'Check job' }],
    mcp: { list: async () => [tool], call: async () => { dispatches++; return ok; } },
    chat: async ({ messages, tools }) => {
      assert.equal(tools[0].function.name, 'status');
      if (!requests++) return call('a');
      assert.equal(messages.at(-1).tool_call_id, 'a');
      assert(!JSON.stringify(messages).includes('_harness_supplied_names'));
      return { role: 'assistant', content: 'Ready' };
    } });
  assert.equal(result.status, 'completed'); assert.equal(dispatches, 1);
  assert.deepEqual(session.snapshot().budgets.used, { model_calls: 2, tool_calls: 1 });
  assert.equal(session.snapshot().messages.at(-1).content, 'Ready');
  await session.close();
});

test('resume reconstructs acknowledged result without replay, and requires fresh source state', async (t) => {
  const { directory, session } = await setup(t);
  await session.saveConversation([{ ...call('a'), _harness_supplied_names: ['status'] }]);
  await session.beginTool({ id: 'a', tool: 'status', arguments: {} });
  await session.finishTool('a', ok);
  await session.close();
  const resumed = await openSession(directory);
  let dispatches = 0, refreshes = 0;
  const result = await runHarness(resumed, { resume: true,
    refreshState: async () => { refreshes++; return { allowed: true, state: { revision: 7 } }; },
    mcp: { list: async () => [tool], call: async () => { dispatches++; return ok; } },
    chat: async ({ messages }) => {
      assert(messages.some((message) => message.tool_call_id === 'a'));
      return { role: 'assistant', content: 'Restored' };
    } });
  assert.equal(result.status, 'completed'); assert.equal(dispatches, 0); assert.equal(refreshes, 1);
  await resumed.close();
});

test('unknown transport outcome survives restart and blocks all replay', async (t) => {
  const { directory, session } = await setup(t);
  let dispatches = 0;
  const mcp = { list: async () => [tool], call: async () => { dispatches++; throw Error('connection lost'); } };
  const first = await runHarness(session, { mcp, chat: async () => call('a') });
  assert.equal(first.status, 'blocked'); assert.equal(session.snapshot().operations[0].status, 'pending');
  await session.close();
  const resumed = await openSession(directory);
  const second = await runHarness(resumed, { resume: true, mcp, chat: async () => call('b') });
  assert.equal(second.status, 'blocked'); assert.match(second.reason, /reconciliation/);
  assert.equal(dispatches, 1);
  await resumed.close();
});

test('typed invalid input receives one repair, with durable failure limit', async (t) => {
  const { session } = await setup(t);
  let n = 0;
  const failure = { isError: true, structuredContent: { code: 'INVALID_ARGUMENTS', state_changed: false }, content: [{ type: 'text', text: 'Missing field' }] };
  const result = await runHarness(session, { mcp: { list: async () => [tool], call: async () => failure }, chat: async () => call(`call${n++}`) });
  assert.equal(result.status, 'blocked'); assert.match(result.reason, /repair limit/);
  assert.equal(session.snapshot().budgets.used.tool_calls, 2);
  await session.close();
});

test('compaction is used by next inference and preserves pinned authority', async (t) => {
  const { session } = await setup(t, { pinned: { locked: ['speech'], authority: 'proposal-only' } });
  let summaries = 0;
  const result = await runHarness(session, { messages: [{ role: 'user', content: 'Old '.repeat(1000) }, { role: 'assistant', content: 'Acknowledged' }, { role: 'user', content: 'Now finish' }],
    contextLimit: 1500, reserveOutput: 100, keepMessages: 1,
    summarize: async ({ pinned }) => { summaries++; assert.deepEqual(pinned.locked, ['speech']); return 'Keep speech unchanged'; },
    mcp: { list: async () => [tool], call: async () => ok },
    chat: async ({ messages }) => {
      assert(messages[0].content.includes('proposal-only'));
      assert.deepEqual(messages.map((message) => message.role), ['system', 'user']);
      assert(messages[0].content.includes('Untrusted derived summary'));
      assert(!JSON.stringify(messages).includes('Old Old Old'));
      return { role: 'assistant', content: 'Done' };
    } });
  assert.equal(result.status, 'completed'); assert.equal(summaries, 1);
  assert.equal(session.snapshot().budgets.used.model_calls, 2);
  assert.equal(session.snapshot().conversation_archives.length, 1);
  await session.close();
});

test('stale tool error cancels rest of batch and refreshes before another model call', async (t) => {
  const { session } = await setup(t);
  let requests = 0, dispatches = 0, refreshed = false;
  const result = await runHarness(session, {
    mcp: { list: async () => [tool], call: async () => { dispatches++; return { isError: true, structuredContent: { code: 'STALE_REVISION' }, content: [{ type: 'text', text: 'stale' }] }; } },
    refreshState: async () => { refreshed = true; return { allowed: true, state: { revision: 9 } }; },
    chat: async ({ messages }) => {
      if (!requests++) return { role: 'assistant', tool_calls: [...call('a').tool_calls, ...call('b').tool_calls] };
      assert(refreshed);
      assert.equal(messages.filter((message) => message.role === 'system').length, 1);
      assert.equal(messages.at(-1).role, 'tool');
      assert(messages.find((message) => message.tool_call_id === 'b').content.includes('BATCH_ABORTED'));
      return { role: 'assistant', content: 'Need a revised proposal' };
    },
  });
  assert.equal(result.status, 'completed'); assert.equal(dispatches, 1);
  await session.close();
});

test('single system context preserves strict turn roles after refresh and runtime token estimate', async (t) => {
  const { session } = await setup(t, { pinned: { authority: 'proposal-only' } });
  await session.saveConversation([{ role: 'system', content: 'Original instructions' }, { role: 'user', content: 'Check it' }]);
  let estimates = 0;
  const result = await runHarness(session, { resume: true,
    refreshState: async () => ({ allowed: true, state: { revision: 42 } }),
    estimateContextFn: async ({ messages, tools }) => { estimates++; assert.equal(tools[0].type, 'function'); assert.equal(messages.filter((message) => message.role === 'system').length, 1); return { tokens: 100, estimated: false, method: 'fixture-tokenizer' }; },
    mcp: { list: async () => [tool], call: async () => ok },
    chat: async ({ messages }) => {
      assert.deepEqual(messages.map((message) => message.role), ['system', 'user']);
      assert(messages[0].content.includes('Original instructions'));
      assert(messages[0].content.includes('42'));
      assert(messages[0].content.includes('proposal-only'));
      return { role: 'assistant', content: 'Finished' };
    } });
  assert.equal(result.status, 'completed'); assert.equal(estimates, 1);
  const repeated = await runHarness(session, { resume: true, mcp: { list: async () => { throw Error('Must not list'); }, call: async () => ok }, chat: async () => { throw Error('Must not infer'); } });
  assert.equal(repeated.alreadyCompleted, true);
  assert.equal(session.snapshot().budgets.used.model_calls, 1);
  await session.close();
});

test('missing prerequisite returns actionable evidence and cancels stale batch before model chooses recovery', async t=>{
 const {session}=await setup(t);
 const invoked=[];let turn=0;
 const preparation={name:'prepare',inputSchema:{type:'object',properties:{}}};
 const result=await runHarness(session,{
  mcp:{list:async()=>[tool,preparation],call:async(name)=>{
   invoked.push(name);
   if(name==='status')return {isError:true,structuredContent:{code:'MISSING_PREREQUISITE',state_changed:false,recovery:{tool:'prepare',arguments:{}}},content:[{type:'text',text:'Prepare the source first, then retry status.'}]};
   return ok;
  }},
  chat:async({messages})=>{
   if(turn++===0)return {role:'assistant',tool_calls:[...call('status-1').tool_calls,...call('cancelled').tool_calls]};
   if(turn===2){
    assert(messages.find(m=>m.tool_call_id==='status-1').content.includes('MISSING_PREREQUISITE'));
    assert(messages.find(m=>m.tool_call_id==='cancelled').content.includes('BATCH_ABORTED'));
    return {role:'assistant',tool_calls:[{id:'preparation-1',type:'function',function:{name:'prepare',arguments:'{}'}}]};
   }
   return {role:'assistant',content:'Preparation acknowledged; retaining task for further work'};
  }
 });
 assert.equal(result.status,'completed');assert.deepEqual(invoked,['status','prepare']);
 assert.equal(session.snapshot().operations.length,2);
 await session.close();
});
