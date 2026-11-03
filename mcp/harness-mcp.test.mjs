import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {connectEditingMcp} from './harness-mcp.mjs';

// Pre-dispatch refusals are definite non-execution, never thrown unknown outcomes.
const refused=(result,pattern)=>{assert.equal(result.isError,true);assert.equal(result.structuredContent.state_changed,false);assert.match(result.structuredContent.message,pattern);};

test('SDK MCP client loads actual schemas and confines synthetic fixture',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'oe-harness-mcp-'));
 const c=await connectEditingMcp({probeReceipt:path.join(dir,'probe.json')});
 try{
  const initial=await c.list();assert.ok(!initial.some(t=>t.name==='cutout_status'));
  refused(await c.call('cutout_status',{},initial.map(t=>t.name)),/not supplied/);
  await c.call('capability_catalog',{action:'load',id:'cutout-preparation'},initial.map(t=>t.name));
  const loaded=await c.list();assert.ok(loaded.some(t=>t.name==='cutout_status'));
  const result=await c.call('cutout_status',{project_id:'refresh-probe',job_id:'probe-job'},loaded.map(t=>t.name));
  assert.match(JSON.stringify(result),/probe_nonce/);
 }finally{await c.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('production client requires explicit project and local authority',async()=>{
 await assert.rejects(connectEditingMcp(),/explicit nonempty/);
 await assert.rejects(connectEditingMcp({projectId:'x',families:['capability-discovery'],baseUrl:'https://remote.invalid'}),/local HTTP/);
 const c=await connectEditingMcp({projectId:'x',families:['capability-discovery']});
 try{assert.deepEqual((await c.list()).map(t=>t.name),['capability_catalog']);
 refused(await c.call('capability_catalog',{project_id:'other'},['capability_catalog']),/outside/);
 }finally{await c.close();}
});

test('surface tracking is exposed to the operator without granting timeline writes',async()=>{
 const c=await connectEditingMcp({projectId:'fixture',families:['surface-tracking']});
 try{
  const initial=(await c.list()).map(t=>t.name);
  await c.call('capability_catalog',{action:'load',id:'surface-tracking'},initial);
  const names=(await c.list()).map(t=>t.name);
  assert.ok(names.includes('surface_track_prepare'));assert.ok(names.includes('surface_track_status'));
  assert.ok(!names.some(n=>/approve|timeline_patch|restore/.test(n)));
  refused(await c.call('surface_track_status',{project_id:'other',job_id:'x'},names),/outside/);
 }finally{await c.close();}
});

// Since 2026-10-12 the editor agent may submit a staged draft after the creator approves it in chat
// (asset_generation_submit). The server refuses unless an open Generate form displayed that draft and the creator's
// words are supplied, so a headless operator cannot spend credits; approval tools stay absent.
test('generation operator can stage a draft and submit only within its project, never approve',async()=>{
 const c=await connectEditingMcp({projectId:'fixture',families:['media-intake-generation']});
 try{
  const initial=(await c.list()).map(t=>t.name);
  await c.call('capability_catalog',{action:'load',id:'media-intake-generation'},initial);
  const names=(await c.list()).map(t=>t.name);
  assert.ok(names.includes('asset_generation_prepare'));
  assert.ok(names.includes('asset_generation_submit'));
  assert.ok(!names.some(n=>n!=='asset_generation_submit'&&/submit|approve|generate_image|browser|shell|exec/.test(n)));
  refused(await c.call('asset_generation_submit',{project_id:'other',staged_id:'00000000-0000-4000-8000-000000000000',approval:'yes'},names),/outside/);
  refused(await c.call('asset_generation_prepare',{project_id:'other',draft:{}},names),/outside/);
 }finally{await c.close();}
});

test('desktop harness authenticates to its private service without changing tool authority', async () => {
 const {createServer}=await import('node:http');
 const token='d'.repeat(64); let authorized=0;
 const server=createServer((request,response)=>{
  if(request.headers.cookie!==`dreamcut_desktop_session=${token}`){response.writeHead(403);response.end('{}');return;}
  authorized++; response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({fixture:true}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let client;
 try{
  client=await connectEditingMcp({projectId:'fixture',families:['editing-context','proposal-authoring'],serviceToken:token,baseUrl:`http://127.0.0.1:${server.address().port}`});
  let names=(await client.list()).map(tool=>tool.name);
  await client.call('capability_catalog',{action:'load',id:'editing-context'},names);
  names=(await client.list()).map(tool=>tool.name);
  const result=await client.call('timeline_get',{project_id:'fixture'},names);
  assert.notEqual(result.isError,true); assert.match(JSON.stringify(result),/fixture/);
  assert.ok(authorized>=2);
  assert.ok(!JSON.stringify(result).includes(token));
  await client.call('capability_catalog',{action:'load',id:'proposal-authoring'},names);
  const schemas=await client.list(); names=schemas.map(tool=>tool.name);
  const proposalSchema=schemas.find(tool=>tool.name==='proposal_create').inputSchema.properties.proposal;
  assert.ok(proposalSchema.required.includes('expected_revision'));
  const invalid=await client.call('proposal_create',{project_id:'fixture',proposal:{}},names);
  assert.equal(invalid.isError,true);assert.equal(invalid.structuredContent.code,'INVALID_ARGUMENTS');
  refused(await client.call('timeline_get',{project_id:'other'},names),/outside/);
  assert.ok(!names.some(name=>/approve|timeline_patch|restore/.test(name)));
 }finally{if(client)await client.close();await new Promise(resolve=>server.close(resolve));}
});
