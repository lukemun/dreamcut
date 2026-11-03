import { app, utilityProcess } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { openSession } from '../mcp/harness-session.mjs';
import { createCodexToolBridge } from './codex-tool-bridge.mjs';
import { stopDesktopService } from './service-shutdown.mjs';
import { waitForDesktopService } from './service-startup.mjs';
import { desktopRuntimeEnvironment } from './runtime-environment.mjs';
import { discoverCodex } from './codex-discovery.mjs';

// Engineering-only synthetic project. No approval call is made.
void app.whenReady().then(async () => {
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-proposal-bridge-'));
 const root=path.resolve(process.argv[2]||'.desktop-build/stage/service');
 const project=path.join(scratch,'projects/fixture');
 const token=randomBytes(32).toString('hex');
 let service,mcp,journal,editing,modelClient,ownedThread,exitCode=1;
 try{
  await fs.mkdir(project,{recursive:true});
  const elementId='11111111-1111-4111-8111-111111111111';
  const timeline=JSON.stringify({fps:30,elements:[{id:elementId,project_id:'fixture',type:'music',source_url:'/api/projects/fixture/media/tone.wav',props:{},beat_id:null,character_id:null,timeline_start:0,duration:4,lane_key:'music_0',lane_index:0,trim_start:0,trim_end:null,volume:1,fade_in:0,fade_out:0,playback_rate:1,position_locked:false,removed_at:null,removed_reason:null,created_at:'2026-10-01T00:00:00.000Z',updated_at:'2026-10-01T00:00:00.000Z'}],transitions:[]});
  await fs.writeFile(path.join(project,'timeline.json'),timeline);
  await fs.mkdir(path.join(project,'media'));
  const wav=Buffer.alloc(44+8000*4*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
  for(let i=0;i<32000;i++)wav.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
  await fs.writeFile(path.join(project,'media/tone.wav'),wav);
  const env=desktopRuntimeEnvironment({HOME:process.env.HOME,PATH:'/usr/bin:/bin',TIMELINE_PROJECTS_DIR:path.dirname(project),DREAMCUT_PROFILE_DIR:path.join(scratch,'profile'),SENTRY_ENABLED:'0',DREAMCUT_SERVICE_ROOT:root,DREAMCUT_SERVICE_DEV:'0',DREAMCUT_SERVICE_TOKEN:token});
  service=utilityProcess.fork(path.join(path.dirname(fileURLToPath(import.meta.url)),'service.mjs'),[],{cwd:root,stdio:'pipe',env});
  service.stderr?.on('data',chunk=>process.stderr.write(chunk));
  const origin=await waitForDesktopService(service,{timeoutMs:30000});
  const {connectEditingMcp}=await import(pathToFileURL(path.join(root,'mcp/harness-mcp.mjs')).href);
  mcp=await connectEditingMcp({projectId:'fixture',families:['proposal-authoring'],baseUrl:origin,serviceToken:token,projectsDirectory:path.dirname(project)});
  let names=(await mcp.list()).map(tool=>tool.name);
  await mcp.call('capability_catalog',{action:'load',id:'proposal-authoring'},names);
  names=(await mcp.list()).map(tool=>tool.name);
  assert.ok(names.includes('proposal_create'));
  assert.ok(!names.some(name=>/approve|timeline_patch|restore/.test(name)));
  journal=await openSession(path.join(scratch,'journal'),{limits:{tool_calls:8,model_calls:0}});
  const bridge=await createCodexToolBridge({mcp,journal,harnessRoot:root,projectId:'fixture',scope:()=>({active:true,threadId:'fixture-thread',turnId:'fixture-turn'})});
  const revision=createHash('sha256').update(timeline).digest('hex');
  const proposal={schema_version:2,project_id:'fixture',expected_revision:revision,mode:'workshop',decision:'propose',summary:'Lower the synthetic tone.',assumptions:[],unresolved_gaps:[],caps:{max_mutations:24,requested_mutations:1,max_renders:0},options:[{id:'quieter',label:'Quieter',recommended:true,summary:'Set the level to half.',requested_mutations:1,review_controls:[{operation_index:0,target:'patch',field:'volume'}],operations:[{element_id:elementId,patch:{volume:0.5}}]}]};
  const call=(callId,tool,args)=>bridge.call({threadId:'fixture-thread',turnId:'fixture-turn',callId,tool,arguments:args});
  const created=await call('create','proposal_create',{project_id:'fixture',proposal});
  assert.equal(created.success,true,JSON.stringify(created));
  const payload=JSON.parse(created.contentItems.find(item=>item.type==='inputText').text);
  assert.equal(payload.status,'pending');assert.ok(payload.proposal_id);
  assert.equal(await fs.readFile(path.join(project,'timeline.json'),'utf8'),timeline);
  const denied=await call('approve','proposal_approve',{project_id:'fixture',proposal_id:payload.proposal_id});
  assert.equal(denied.success,false);
  const invalid=await call('missing','proposal_create',{project_id:'fixture',proposal:{...proposal,options:[{...proposal.options[0],operations:[{element_id:'22222222-2222-4222-8222-222222222222',patch:{volume:0.5}}]}]}});
  assert.equal(invalid.success,false);
  const stale=await call('stale','proposal_create',{project_id:'fixture',proposal:{...proposal,expected_revision:'0'.repeat(64)}});
  assert.equal(stale.success,true,JSON.stringify(stale));
  const stalePayload=JSON.parse(stale.contentItems.find(item=>item.type==='inputText').text);
  assert.equal(stalePayload.stale,true);
  assert.equal(stalePayload.status,'pending');
  const corrected=await call('correction','proposal_create',{project_id:'fixture',proposal:{...proposal,
    summary:'Use a gentler level reduction.',supersedes_proposal_ids:[payload.proposal_id],
    options:[{...proposal.options[0],operations:[{element_id:elementId,patch:{volume:0.7}}]}]}});
  assert.equal(corrected.success,true,JSON.stringify(corrected));
  const correctedPayload=JSON.parse(corrected.contentItems.find(item=>item.type==='inputText').text);
  assert.equal(correctedPayload.status,'pending');
  assert.deepEqual(correctedPayload.proposal.supersedes_proposal_ids,[payload.proposal_id]);
  assert.equal(await fs.readFile(path.join(project,'timeline.json'),'utf8'),timeline);
  console.log(JSON.stringify({pendingProposal:true,approvalNotExposed:true,missingElementRejected:true,staleDraftFlagged:true,correctionPending:true,timelineUnchanged:true,journaledCalls:journal.snapshot().operations.length}));
  if(process.argv.includes('--codex-owner')){
    const shell=path.resolve(root,'../app');
    const {openDesktopEditingSession}=await import(pathToFileURL(path.join(shell,'editing-session.mjs')).href);
    const {openCodexSession}=await import(pathToFileURL(path.join(shell,'codex-session.mjs')).href);
    const {connectCodex}=await import(pathToFileURL(path.join(shell,'codex-connection.mjs')).href);
    const modelEnv=desktopRuntimeEnvironment({HOME:process.env.HOME,PATH:'/usr/bin:/bin'});
    const found=await discoverCodex({env:modelEnv});assert.equal(found.state,'available');
    const events=[];const userData=path.join(scratch,'model-app');
    editing=await openDesktopEditingSession({executable:found.executable,projectDirectory:project,userData,origin,serviceToken:token,env:modelEnv,harnessRoot:root,onEvent:event=>events.push(event),
      openCodex:options=>openCodexSession({...options,connect:async(executable,connectionOptions)=>{
        modelClient=await connectCodex(executable,connectionOptions);
        return {...modelClient,request:async(method,params)=>{const result=await modelClient.request(method,params);if(method==='thread/start')ownedThread=result.thread.id;return result;}};
      }})});
    await editing.send('Prepare a new proposal setting the existing music clip volume to 0.6. Leave its timing and all other settings unchanged. Do not apply it. This is a synthetic engineering test; no listening judgment is requested.');
    const deadline=Date.now()+180000;
    while(!events.some(event=>event.type==='completed')){
      if(events.some(event=>event.type==='disconnected'))throw Error('Combined editing owner disconnected.');
      if(Date.now()>deadline)throw Error('Combined editing owner timed out.');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(events.at(-1).status,'completed');
    const key=createHash('sha256').update(await fs.realpath(project)).digest('hex');
    const state=JSON.parse(await fs.readFile(path.join(userData,'codex-editing-journals',key,'checkpoint.json'),'utf8'));
    const successful=state.operations.filter(operation=>operation.status==='completed'&&!operation.result?.isError);
    assert.ok(successful.some(operation=>operation.tool==='timeline_get'));
    assert.ok(successful.some(operation=>operation.tool==='editing_feedback_record'));
    const staged=successful.filter(operation=>operation.tool==='proposal_create');assert.equal(staged.length,1);
    const draft=JSON.parse(staged[0].result.content.find(item=>item.type==='text').text);
    assert.equal(draft.status,'pending');
    assert.ok(draft.proposal.options.some(option=>option.operations.some(operation=>operation.element_id===elementId&&operation.patch?.volume===0.6)));
    assert.equal(await fs.readFile(path.join(project,'timeline.json'),'utf8'),timeline);
    console.log(JSON.stringify({combinedOwner:true,modelAuthoredPendingProposal:true,feedbackRecorded:true,timelineUnchanged:true,toolCalls:state.operations.length,failedToolCalls:state.operations.filter(operation=>operation.status!=='completed'||operation.result?.isError).length}));
  }
  exitCode=0;
 }catch(error){console.error(error.protocolMessage || error.message);}
 finally{if(modelClient&&ownedThread)await modelClient.request('thread/archive',{threadId:ownedThread}).catch(()=>{exitCode=1;});if(editing)await editing.close();else if(modelClient)await modelClient.close();if(mcp)await mcp.close();if(journal)await journal.close();await stopDesktopService(service);await fs.rm(scratch,{recursive:true,force:true});app.exit(exitCode);}
});
