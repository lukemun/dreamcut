import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PreparedPreviewJobs} from './prepared-preview-jobs';
import {currentPreparedPreview,preparedRasterScale,preparedPreviewPixelScale,hasLayeredVideo,shouldPreparePlayback,preparedPreviewIdentity,type PreparedPreviewInput} from '../timeline/prepared-preview';
const input:PreparedPreviewInput={width:160,height:160,fps:30,durationInFrames:60,inputProps:{elements:[],externalAudioPreview:true}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-playback-'));
 let dependency='source-and-runtime-v1';
 const pending:Array<{file:string;signal:AbortSignal;resolve:()=>void}>=[];
 const jobs=new PreparedPreviewJobs({directory:()=>root,fingerprint:()=>dependency,render:(_i,_o,file,signal)=>new Promise<void>(resolve=>pending.push({file,signal,resolve:()=>{fs.writeFileSync(file,'encoded-frames');resolve();}}))});
 return {jobs,pending,root,change:()=>{dependency='source-v2';},dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('late superseded work cannot publish or delete its successor; out-of-order requests are refused',async()=>{
 const f=fixture();try{
 const a=f.jobs.start('p','owner',input,'http://localhost',1);
 const changed={...input,durationInFrames:90};
 const b=f.jobs.start('p','owner',changed,'http://localhost',2);
 assert.ok(f.pending[0].signal.aborted);
 assert.throws(()=>f.jobs.start('p','owner',input,'http://localhost',1),/Superseded/);
 f.pending[1].resolve();await tick();f.pending[0].resolve();await tick();
 assert.equal(f.jobs.status('p',a.id).state,'cancelled');
 assert.equal(f.jobs.status('p',b.id).state,'ready');assert.ok(fs.existsSync(f.jobs.file('p',b.id)));
 assert.throws(()=>f.jobs.file('other-project',b.id));
 }finally{f.dispose();}
});
test('dependency edits during preparation fail closed; cached byte replacement and later source edits invalidate ready state',async()=>{
 const f=fixture();try{
 const a=f.jobs.start('p','o',input,'http://localhost');f.change();f.pending[0].resolve();await tick();assert.equal(f.jobs.status('p',a.id).state,'stale');assert.throws(()=>f.jobs.file('p',a.id));
 const b=f.jobs.start('p','o',input,'http://localhost');f.pending[1].resolve();await tick();
 fs.writeFileSync(f.jobs.file('p',b.id),'corrupted');assert.equal(f.jobs.status('p',b.id).state,'stale');assert.throws(()=>f.jobs.file('p',b.id));
 }finally{f.dispose();}
 const g=fixture();try{const c=g.jobs.start('p','o',input,'http://localhost');g.pending[0].resolve();await tick();g.change();assert.equal(g.jobs.status('p',c.id).state,'stale');}finally{g.dispose();}
});
test('one input identity includes proposal/text/ramp/layer/geometry changes and removes stale readiness synchronously',()=>{
 const baseline=preparedPreviewIdentity(input),status={id:'ready',state:'ready' as const,progress:1,url:'/prepared'};
 assert.equal(currentPreparedPreview(baseline,{identity:baseline,status}),status);
 const edits=[{...input,width:320},{...input,durationInFrames:90},{...input,inputProps:{...input.inputProps,laneOrderKeys:['b','a']}},{...input,inputProps:{elements:[{props:{text:'NEW',keyframes:{playback_rate:[{t:1,v:2}]}}} as never]}}];
 for(const edit of edits)assert.equal(currentPreparedPreview(preparedPreviewIdentity(edit),{identity:baseline,status}),null);
 assert.equal(JSON.parse(baseline).inputProps.externalAudioPreview,false);
});
test('only overlapping video layers trigger prepared playback',()=>{
 const a={type:'video_clip',lane_key:'one',timeline_start:0,duration:2} as never;
 assert.equal(hasLayeredVideo([a]),false);
 assert.equal(hasLayeredVideo([a,{...a as object,type:'video_clip',lane_key:'two',timeline_start:1,duration:1} as never]),true);
 assert.equal(hasLayeredVideo([a,{...a as object,type:'video_clip',lane_key:'two',timeline_start:2,duration:1} as never]),false);
});

test("long layered edits retain live playback instead of submitting unsupported preparation",()=>{
 const elements=[{type:"video_clip",lane_key:"a",timeline_start:0,duration:2},{type:"video_clip",lane_key:"b",timeline_start:0,duration:2}] as never[];
 assert.equal(shouldPreparePlayback(elements,1800),true);
 assert.equal(shouldPreparePlayback(elements,1801),false);
});

test('new effect lifetimes never share a cancellable job with an older request',async()=>{
 const f=fixture();try{
 const a=f.jobs.start('p','owner',input,'http://localhost',1);
 assert.equal(f.jobs.start('p','owner',input,'http://localhost',1).id,a.id);
 const b=f.jobs.start('p','owner',input,'http://localhost',2);assert.notEqual(b.id,a.id);
 f.jobs.cancel('p',a.id);f.pending[1].resolve();await tick();
 assert.equal(f.jobs.status('p',b.id).state,'ready');f.pending[0].resolve();await tick();
 }finally{f.dispose();}
});

test('completed previews survive player release and are reused by another owner and service instance',async()=>{
 const f=fixture();try{
 const a=f.jobs.start('p','one',input,'http://localhost');f.pending[0].resolve();await tick();
 const file=f.jobs.file('p',a.id);f.jobs.cancel('p',a.id);assert.ok(fs.existsSync(file));
 const b=f.jobs.start('p','two',input,'http://localhost');assert.equal(b.state,'ready');assert.equal(f.pending.length,1);
 const restarted=new PreparedPreviewJobs({directory:()=>f.root,fingerprint:()=> 'source-and-runtime-v1',render:async()=>{throw new Error('Unexpected rebuild');}});
 const c=restarted.start('p','three',input,'http://localhost');assert.equal(c.state,'ready');assert.equal(restarted.file('p',c.id),file);
 f.jobs.cancel('p',b.id);assert.equal(restarted.status('p',c.id).state,'ready');
 f.change();const d=f.jobs.start('p','two',input,'http://localhost',1);assert.equal(d.state,'preparing');f.pending[1].resolve();await tick();
 }finally{f.dispose();}
});

test('preview raster scale is bounded without changing authored geometry or enlarging small inputs',()=>{
 assert.equal(preparedPreviewPixelScale(1080,1920),.5);
 assert.equal(preparedPreviewPixelScale(3840,2160),.25);
 assert.equal(preparedPreviewPixelScale(160,160),1);
 assert.equal(preparedPreviewPixelScale(1920,1080),.5);
});

test('two tabs share one build and releasing one cannot cancel the other',async()=>{
 const f=fixture();try{
 const a=f.jobs.start('p','one',input,'http://localhost');const b=f.jobs.start('p','two',input,'http://localhost');
 assert.equal(f.pending.length,1);assert.notEqual(a.id,b.id);
 f.jobs.cancel('p',a.id);assert.equal(f.pending[0].signal.aborted,false);
 f.pending[0].resolve();await tick();assert.equal(f.jobs.status('p',b.id).state,'ready');
 assert.equal(f.jobs.status('p',a.id).state,'cancelled');assert.ok(fs.existsSync(f.jobs.file('p',b.id)));
 }finally{f.dispose();}
});

test('a third distinct preview queues and automatically starts when a render slot opens',async()=>{
 const f=fixture();try{
 const a=f.jobs.start('p','one',input,'http://localhost');
 f.jobs.start('p','two',{...input,durationInFrames:90},'http://localhost');
 const c=f.jobs.start('q','three',{...input,durationInFrames:120},'http://localhost');
 assert.equal(c.state,'queued');assert.equal(f.pending.length,2);
 f.pending[0].resolve();await tick();assert.equal(f.pending.length,3);assert.equal(f.jobs.status('q',c.id).state,'preparing');
 f.jobs.cancel('q',c.id);f.pending[2].resolve();f.pending[1].resolve();await tick();
 assert.equal(f.jobs.status('p',a.id).state,'ready');
 }finally{f.dispose();}
});
test('timestamps do not invalidate pictures, but authored changes do',()=>{
 const e={id:'clip',type:'video_clip',created_at:'yesterday',updated_at:'today',props:{text:'Hello'}};
 const a={...input,inputProps:{elements:[e as never]}};
 const b={...input,inputProps:{elements:[{...e,updated_at:'tomorrow'} as never]}};
 assert.equal(preparedPreviewIdentity(a),preparedPreviewIdentity(b));
 assert.notEqual(preparedPreviewIdentity(a),preparedPreviewIdentity({...input,inputProps:{elements:[{...e,props:{text:'Goodbye'}} as never]}}));
});

test('a replacement proxy invalidates prepared picture even without an editorial change',()=>{
 const element={id:'v',type:'video_clip',props:{text:'Hello',runtime_preview_preparation:{state:'preparing'},preview_proxy_validation:{ok:false}}};
 const a={...input,inputProps:{elements:[element as never]}};
 const b={...input,inputProps:{elements:[{...element,props:{text:'Hello',runtime_preview_preparation:{state:'ready'},runtime_source_has_audio:true,runtime_preview_source_url:'/new-proxy.mp4',preview_proxy_validation:{ok:true}}} as never]}};
 assert.notEqual(preparedPreviewIdentity(a),preparedPreviewIdentity(b));
});
test('verified complete media is playable before slow browser teardown releases its render slot',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-teardown-'));let finish:()=>void=()=>{};
 try{
 const jobs=new PreparedPreviewJobs({directory:()=>root,fingerprint:()=> 'same',render:async(_i,_o,file,_signal,_progress,complete)=>{
 fs.writeFileSync(file,'complete encoded picture and audio');complete();await new Promise<void>(r=>{finish=r;});
 }});
 const a=jobs.start('p','one',input,'http://localhost');assert.equal(jobs.status('p',a.id).state,'ready');assert.ok(fs.existsSync(jobs.file('p',a.id)));finish();await tick();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('section dependency changes are recoverable but encoder failures are not',async()=>{
 const {PreviewDependenciesChangedError}=await import('../render/prepared-sections');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-recovery-'));
 try{
  for(const [error,expected] of [[new PreviewDependenciesChangedError('changed'),'stale'],[new Error('encoder failed'),'failed']] as const){
   const jobs=new PreparedPreviewJobs({directory:()=>root,fingerprint:()=> 'fixed',render:async()=>{throw error;}});
   const job=jobs.start('p','o',input,'http://localhost');await tick();
   assert.equal(jobs.status('p',job.id).state,expected);assert.throws(()=>jobs.file('p',job.id));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('worker restart resumes the same persisted job id and ownership sequence',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-journal-'));
 try {
  const deps={directory:()=>root,fingerprint:()=> 'fixed',journal:path.join(root,'journal.json')};
  const original=new PreparedPreviewJobs({...deps,render:async()=>new Promise<void>(()=>{})});
  const job=original.start('p','owner',input,'http://localhost',4);
  const restarted=new PreparedPreviewJobs({...deps,render:async(_input,_origin,file)=>{fs.writeFileSync(file,'recovered');}});
  await tick();await tick();
  assert.equal(restarted.status('p',job.id).state,'ready');
  assert.equal(restarted.start('p','owner',input,'http://localhost',4).id,job.id);
  assert.throws(()=>restarted.start('p','owner',input,'http://localhost',3),/Superseded/);
  assert.throws(()=>restarted.status('another-project',job.id),/not found/);
  restarted.cancel('p',job.id);
  const again=new PreparedPreviewJobs({...deps,render:async()=>{throw new Error('Unexpected render');}});
  assert.equal(again.status('p',job.id).state,'cancelled');await tick();
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});


test('live timeline thumbnails and proposal hydration share prepared picture identity',()=>{
 const row={id:'clip',type:'video_clip',source_url:'/source.mp4',props:{media_scale:1}};
 const proposal={...input,inputProps:{elements:[row as never]}};
 const live={...input,inputProps:{elements:[{...row,props:{...row.props,overflow_hold_frame_url:'data:image/png;base64,editor-end-thumbnail',overflow_hold_start_frame_url:'data:image/png;base64,editor-start-thumbnail',runtime_compound_preview:{url:'/disposable.mp4'},compound_proxy_validation:{ok:true}}} as never]}};
 assert.equal(preparedPreviewIdentity(live),preparedPreviewIdentity(proposal));
 assert.notEqual(preparedPreviewIdentity(live),preparedPreviewIdentity({...input,inputProps:{elements:[{...row,props:{media_scale:1.1}} as never]}}));
});

test('prepared raster honors validated quality without letting alpha reduce the whole picture',()=>{
 const scene={...input,width:1080,height:1920};
 const withProofs=(qualities:string[])=>({...scene,inputProps:{...scene.inputProps,elements:qualities.map((quality,i)=>({...scene.inputProps.elements[0],id:String(i),props:{has_alpha:i>0,preview_proxy_validation:{ok:true,quality}}}))}});
 assert.equal(preparedRasterScale(withProofs(['hd','balanced'])),1);
 assert.equal(preparedRasterScale(withProofs(['balanced'])),.25);
 assert.equal(preparedRasterScale({...withProofs(['uhd']),width:3840,height:2160}),1);
 assert.equal(preparedRasterScale(withProofs(['prepared'])),.5);
 assert.notEqual(preparedPreviewIdentity(withProofs(['hd'])),preparedPreviewIdentity(withProofs(['balanced'])));
 assert.equal(preparedRasterScale(withProofs(['unknown'])),.5);
});
