import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocalEditingAgent } from './run-editing-agent.mjs';
import { qualify } from './qualify-local-model.mjs';

const privateRoot = fileURLToPath(new URL('../private/', import.meta.url));
async function fixture(t) {
  await fs.mkdir(privateRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(privateRoot, 'harness-lifecycle-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, projectId: 'synthetic', model: 'test-model', endpoint: 'http://127.0.0.1:1', task: 'Original task', skills: [] };
}
function dependencies(overrides = {}) {
  return {
    createUsageExporter: () => ({ record: async () => {}, flush: async () => {} }),
    connectEditingMcp: async () => ({ list: async () => [{ name: 'timeline_get' }], call: async () => ({ content: [] }), close: async () => {} }),
    createLlamaAdapter: () => ({}),
    runHarness: async () => ({ status: 'completed', message: { role: 'assistant', content: 'Fixture done' } }),
    ...overrides,
  };
}
async function noLease(directory) { await assert.rejects(fs.stat(path.join(directory, 'session.lease')), { code: 'ENOENT' }); }

test('non-resume requires fresh session; resume requires existing original task', async (t) => {
  const options = await fixture(t);
  await assert.rejects(runLocalEditingAgent({ ...options, resume: true }, dependencies()), /does not exist/);
  await runLocalEditingAgent(options, dependencies());
  await assert.rejects(runLocalEditingAgent({ ...options, task: 'New task' }, dependencies()), /already exists/);
  await assert.rejects(runLocalEditingAgent({ ...options, task: 'New task', resume: true }, dependencies()), /cannot change/);
  await noLease(options.directory);
  const result = await runLocalEditingAgent({ ...options, resume: true }, dependencies());
  assert.equal(result.status, 'completed');
});

test('exporter initialization failure releases the file session lease', async (t) => {
  const options = await fixture(t);
  await assert.rejects(runLocalEditingAgent(options, dependencies({ createUsageExporter: () => { throw Error('exporter failed'); } })), /exporter failed/);
  await noLease(options.directory);
});

test('all cleanup owners run when exporter and MCP shutdown fail', async (t) => {
  const options = await fixture(t);
  const closed = [];
  await assert.rejects(runLocalEditingAgent({ ...options, langgraph: true }, dependencies({
    createUsageExporter: () => ({ flush: async () => { closed.push('exporter'); throw Error('flush failed'); } }),
    connectEditingMcp: async () => ({ list: async () => [], call: async () => ({ content: [] }), close: async () => { closed.push('mcp'); throw Error('mcp close failed'); } }),
    loadCoordinator: async () => (session) => ({ ...session, reconcileRecorded: async () => {}, close: async () => { closed.push('coordinator'); throw Error('coordinator close failed'); } }),
  })), /coordinator close failed/);
  assert.deepEqual(closed, ['exporter', 'mcp', 'coordinator']);
  await noLease(options.directory);
});

test('optional coordinator reconciles before loop and initialization failure releases lease', async (t) => {
  const options = await fixture(t);
  let reconciled = false;
  const result = await runLocalEditingAgent({ ...options, langgraph: true }, dependencies({
    loadCoordinator: async () => (session, { databasePath }) => {
      assert.equal(databasePath, path.join(options.directory, 'execution.sqlite'));
      return { ...session, marker: true, reconcileRecorded: async () => { reconciled = true; }, close: session.close };
    },
    runHarness: async (session) => { assert(reconciled); assert(session.marker); return { status: 'completed' }; },
  }));
  assert.equal(result.status, 'completed');
  await noLease(options.directory);
  await assert.rejects(runLocalEditingAgent({ ...options, langgraph: true, resume: true }, dependencies({ loadCoordinator: async () => { throw Error('SQLite unavailable'); } })), /SQLite unavailable/);
  await noLease(options.directory);
});

test('qualification rejects previous manifest or case state before making requests', async (t) => {
  const options = await fixture(t);
  const receipt = path.join(options.directory, 'qualification.json');
  await fs.writeFile(receipt, 'preserved');
  await assert.rejects(qualify({ endpoint: 'invalid://must-not-fetch', model: 'test', output: options.directory }), { code: 'EEXIST' });
  assert.equal(await fs.readFile(receipt, 'utf8'), 'preserved');
  await fs.rm(receipt);
  await fs.mkdir(path.join(options.directory, 'discovery'));
  await assert.rejects(qualify({ endpoint: 'invalid://must-not-fetch', model: 'test', output: options.directory }), /prior run state/);
});


test('resume preserves coordinator mode and private session cannot escape through a symlink', async (t) => {
  const options = await fixture(t);
  await runLocalEditingAgent(options, dependencies());
  await assert.rejects(runLocalEditingAgent({...options, resume:true, langgraph:true},dependencies()), /preserve coordinator/);
  await noLease(options.directory);
  const outside = await fs.mkdtemp('/tmp/dreamcut-private-boundary-');
  t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  const link=path.join(options.directory,'escape');
  await fs.symlink(outside,link);
  await assert.rejects(runLocalEditingAgent({...options,directory:path.join(link,'session')},dependencies()),/resolves outside/);
  assert.deepEqual(await fs.readdir(outside),[]);
});

test('initial packet carries explicit preferences without duplicating full timeline evidence',async t=>{
 const options=await fixture(t);
 const timeline={elements:[{id:'clip',props:{locked:true},_peaks:[0.1,0.2]}],editing_context:{preferences:[{text:'Keep original timing'}],feedback:[{text:'Earlier correction'}],precedence:'request wins'}};
 const response={content:[{type:'text',text:JSON.stringify(timeline,null,2)}]};
 await runLocalEditingAgent(options,dependencies({
  connectEditingMcp:async()=>({list:async()=>[{name:'timeline_get'}],call:async()=>response,close:async()=>{}}),
  runHarness:async(_session,{messages,mcp})=>{
   const initial=JSON.parse(messages[1].content).current_context;
   assert.deepEqual(initial.preferences,timeline.editing_context.preferences);
   assert.match(initial.notice,/must be read with timeline_get/);
   assert.equal(initial.elements,undefined);
   const result=await mcp.call('timeline_get',{},['timeline_get']);
   const projected=JSON.parse(result.content[1].text);
   assert.deepEqual(projected.editing_context,timeline.editing_context);
   assert.equal(projected.elements[0]._peaks,undefined);
   assert.equal(projected.elements[0].props.locked,true);
   return {status:'completed'};
  }
 }));
 assert.deepEqual(JSON.parse(response.content[0].text),timeline);
});


test('context limit is bounded and pinned across resume',async t=>{
 const options=await fixture(t);
 await assert.rejects(runLocalEditingAgent({...options,contextLimit:1000000},dependencies()),/context must be/);
 await runLocalEditingAgent({...options,contextLimit:32768},dependencies());
 await assert.rejects(runLocalEditingAgent({...options,resume:true},dependencies()),/preserve context limit/);
 await noLease(options.directory);
});

test('isolated editor origin is passed to tools and pinned across resume',async(t)=>{
 const options={...await fixture(t),baseUrl:'http://127.0.0.1:3142'};let received;
 await runLocalEditingAgent(options,dependencies({connectEditingMcp:async config=>{received=config;return {list:async()=>[],call:async()=>({content:[]}),close:async()=>{}};}}));
 assert.equal(received.baseUrl,options.baseUrl);assert.ok(received.families.includes('surface-tracking'));
 await assert.rejects(runLocalEditingAgent({...options,resume:true,baseUrl:'http://127.0.0.1:3123'},dependencies()),/preserve editor URL/);
 await assert.rejects(runLocalEditingAgent({...options,baseUrl:'https://example.com'},dependencies()),/loopback/);
});
