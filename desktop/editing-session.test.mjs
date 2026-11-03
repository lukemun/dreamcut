import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CODEX_TOOL_OUTPUT_INSTRUCTIONS } from './codex-tool-bridge.mjs';
import { openDesktopEditingSession } from './editing-session.mjs';

test('editing owner pins native project authority, loads tools and closes dependencies once', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-editing-owner-'));
 const project=path.join(root,'project.v2');await fs.mkdir(project);
 const events=[];let supplied;
 try{
  const session=await openDesktopEditingSession({executable:'/codex',projectDirectory:project,userData:path.join(root,'app'),origin:'http://127.0.0.1:9999',serviceToken:'host-secret',
   openJournal:async(_directory,options)=>({snapshot:()=>({pinned:options.pinned}),charge:async kind=>events.push(kind),close:async()=>events.push('journal-close')}),
   connectMcp:async options=>{assert.equal(options.projectId,'project.v2');assert.equal(options.serviceToken,'host-secret');assert.equal(options.projectsDirectory,await fs.realpath(root));return {list:async()=>[{name:'capability_catalog'}],call:async()=>({}),close:async()=>events.push('mcp-close')};},
   openCodex:async options=>{supplied=options;return {send:async text=>events.push(text),cancel:async()=>events.push('cancel'),close:async()=>events.push('codex-close')};},
  });
  assert.equal(supplied.serviceToken,undefined);
  assert.match(supplied.developerInstructions,/creator approves/);
  assert.ok(supplied.developerInstructions.includes(CODEX_TOOL_OUTPUT_INSTRUCTIONS));
  assert.equal(supplied.editing.projectId,'project.v2');
  await session.send('lower the music');await session.cancel();await session.close();await session.close();
  assert.deepEqual(events,['model_calls','lower the music','cancel','codex-close','mcp-close','journal-close']);
  await assert.rejects(session.send('again'),/closed/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('partial startup failure releases the acquired journal', async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-owner-fail-'));let closed=false;
 try{
  await assert.rejects(openDesktopEditingSession({executable:'/codex',projectDirectory:root,userData:root,
   openJournal:async(_dir,options)=>({snapshot:()=>({pinned:options.pinned}),close:async()=>{closed=true;}}),
   connectMcp:async()=>{throw Error('service unavailable');},
  }),/service unavailable/);
  assert.equal(closed,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('cancelling during fresh-context preparation prevents later inference', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-context-stop-'));
 let started,finish,called=0,charged=0;
 const reading=new Promise(resolve=>{started=resolve;});
 const context=new Promise(resolve=>{finish=resolve;});
 let session;
 try {
  session=await openDesktopEditingSession({executable:'/codex',projectDirectory:root,userData:path.join(root,'app'),
   openJournal:async(_dir,options)=>({snapshot:()=>({pinned:options.pinned}),charge:async()=>{charged++;},close:async()=>{}}),
   connectMcp:async()=>({list:async()=>[{name:'capability_catalog'}],call:async name=>{if(name==='timeline_get'){started();await context;}return {};},close:async()=>{}}),
   openCodex:async()=>({send:async()=>{called++;},cancel:async()=>{},close:async()=>{}}),
  });
  const send=session.send('cancel before inference');await reading;
  await session.cancel();finish();await send;
  assert.equal(called,0);assert.equal(charged,0);
  await session.send('new request');assert.equal(called,1);assert.equal(charged,1);
 }finally{finish?.();await session?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('closing during context preparation drains without charging or starting inference', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-context-close-'));
 let started,finish,called=0,charged=0,closed=0;
 const reading=new Promise(resolve=>{started=resolve;});
 const context=new Promise(resolve=>{finish=resolve;});let session;
 try {
  session=await openDesktopEditingSession({executable:'/codex',projectDirectory:root,userData:path.join(root,'app'),
   openJournal:async(_dir,options)=>({snapshot:()=>({pinned:options.pinned}),charge:async()=>{charged++;},close:async()=>{closed++;}}),
   connectMcp:async()=>({list:async()=>[{name:'capability_catalog'}],call:async name=>{if(name==='timeline_get'){started();await context;}return {};},close:async()=>{finish();}}),
   openCodex:async()=>({send:async()=>{called++;},cancel:async()=>{},close:async()=>{}}),
  });
  const send=session.send('pending context');await reading;
  await session.close();await send;
  assert.equal(called,0);assert.equal(charged,0);assert.equal(closed,1);
  await assert.rejects(session.send('closed'),/closed/);
 }finally{finish?.();await session?.close();await fs.rm(root,{recursive:true,force:true});}
});

test('Claude and Codex sessions offer delegation with restricted, non-persistent helpers; local sessions do not', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-delegation-owner-'));
 const project=path.join(root,'project');await fs.mkdir(project);
 try{
  for(const provider of ['claude','codex','local']){
   const supplied=[];
   const open=async options=>{supplied.push(options);return {models:async()=>({selected:'m'}),send:async(_text,model)=>{options.onEvent?.({type:'text',text:`done with ${model}`});options.onEvent?.({type:'completed',status:'completed'});},cancel:async()=>{},close:async()=>{}};};
   const session=await openDesktopEditingSession({provider,executable:'/agent',models:['ministral'],projectDirectory:project,userData:path.join(root,'app'),origin:'http://127.0.0.1:9999',
    openJournal:async(_directory,options)=>({snapshot:()=>({pinned:options.pinned,operations:[]}),charge:async()=>{},close:async()=>{}}),
    connectMcp:async()=>({list:async()=>[{name:'capability_catalog'},{name:'timeline_get'}],call:async()=>({}),close:async()=>{}}),
    openClaude:open,openCodex:open,openLocal:open});
   const [main]=supplied;
   if(provider==='local'){
    assert.deepEqual(main.editing.hostTools,[]);
    assert.doesNotMatch(main.developerInstructions,/agent_delegate/);
   }else{
    assert.deepEqual(main.editing.hostTools.map(tool=>tool.name),['agent_delegate']);
    assert.match(main.developerInstructions,/agent_delegate/);
    const tools=(await session.contract()).tools.map(tool=>tool.name);
    assert.ok(tools.includes('agent_delegate'));
    const result=await main.editing.hostTools[0].call({project_id:'project',tasks:[{label:'clip 1',instructions:'check clip 1'}]});
    assert.match(result.content[0].text,/done with m/);
    const helper=supplied[1];
    assert.equal(helper.projectLease,main.projectLease);
    assert.ok(helper.editing.allow.has('timeline_get') && !helper.editing.allow.has('proposal_create'));
    assert.equal(helper.editing.hostTools,undefined);
    assert.match(helper.developerInstructions,/helper agent/);
    if(provider==='claude'){assert.equal(helper.persist,false);assert.ok(helper.userData);}
    else{assert.equal(helper.ephemeral,true);assert.equal(helper.userData,undefined);}
   }
   await session.close();
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
