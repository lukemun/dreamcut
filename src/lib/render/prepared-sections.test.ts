import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {previewSections, renderPreparedSections, assemblePreparedSections} from './prepared-sections';
import {runMediaProcess} from './audio-export';
import type {PreparedPreviewInput} from '../timeline/prepared-preview';
const row = (id: string, start: number) => ({id,type:'video_clip',source_url:`/${id}.mp4`,timeline_start:start,duration:1,lane_key:'a',props:{},lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:null,fade_in:0,fade_out:0});
const input: PreparedPreviewInput = {width:160,height:160,fps:30,durationInFrames:150,inputProps:{elements:[row('first',0),row('last',4)],laneOrderKeys:['a']}};
test('sections include exact tail and retain full render clocks; local edits invalidate only affected section', () => {
 const before=previewSections(input);
 const changed=structuredClone(input);changed.inputProps.elements[1].props={media_scale:2};
 const after=previewSections(changed);
 assert.deepEqual(before.map(s=>s.range),[[0,59],[60,119],[120,149]]);
 assert.equal(JSON.stringify(before[0]),JSON.stringify(after[0]));
 assert.notEqual(JSON.stringify(before[2]),JSON.stringify(after[2]));
 assert.equal(input.inputProps.elements.length,2);
});
test('unknown cross-row effects and transitions conservatively invalidate every section',()=>{
 const changed=structuredClone(input);changed.inputProps.elements[1].props={unknown_binding:'first'};
 assert.ok(previewSections(changed).every(s=>s.input.inputProps.elements.length===2));
});
test('isolated and grouped windows share exact sections, but never shifted frame windows',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'section-window-reuse-'));let rendered=0;
 const deps={fingerprint:()=> 'fixed',render:async(range:[number,number],video:string,pcm:string)=>{
  rendered++;fs.writeFileSync(video,String(range));fs.writeFileSync(pcm,Buffer.alloc((range[1]-range[0]+1)*1600*8));
 },assemble:async()=>{}};
 const run=(value:PreparedPreviewInput)=>renderPreparedSections(value,path.join(dir,'output.mp4'),new AbortController().signal,()=>{},deps);
 try{
  await run({...input,frameRange:[60,119]});assert.equal(rendered,1);
  assert.equal((await run(input)).reused,1);assert.equal(rendered,3);
  assert.equal((await run({...input,frameRange:[0,119]})).reused,2);assert.equal(rendered,3);
  assert.equal((await run({...input,frameRange:[61,119]})).reused,0);assert.equal(rendered,4);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('persistent reuse, local edit, corrupted section, source change and cancellation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sections-test-'));
 let rendered=0, dependency='source-v1';
 const controller=new AbortController();
 const deps={fingerprint:()=>dependency,render:async(range:[number,number],video:string,pcm:string)=>{
  rendered++;fs.writeFileSync(video,`video-${range}`);fs.writeFileSync(pcm,Buffer.alloc((range[1]-range[0]+1)*1600*8));
 },assemble:async()=>{}};
 try {
  const run=(value=input)=>renderPreparedSections(value,path.join(dir,'output.mp4'),controller.signal,()=>{},deps);
  assert.equal((await run()).reused,0);assert.equal(rendered,3);
  assert.equal((await run()).reused,3);assert.equal(rendered,3);
  const edited=structuredClone(input);edited.inputProps.elements[1].props={media_scale:2};
  assert.equal((await run(edited)).reused,1);assert.equal(rendered,5);
  for(const file of fs.readdirSync(path.join(dir,'sections')).filter(f=>f.endsWith('.f32')))fs.writeFileSync(path.join(dir,'sections',file),'corrupt');
  assert.equal((await run()).reused,3); // Picture survives an audio-only corruption.
  dependency='source-v2';assert.equal((await run()).reused,0);
  controller.abort();await assert.rejects(run(),/abort/i);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real section assembly preserves frame count and continuous lossless audio at boundaries',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'section-join-'));const signal=new AbortController().signal;
 try{
  const files=[];
  for(let i=0;i<2;i++){
   const video=path.join(dir,`${i}.mp4`),pcm=path.join(dir,`${i}.f32`);
   await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i',`color=c=${i?'blue':'red'}:s=32x32:r=30`,'-frames:v','60','-c:v','libx264','-pix_fmt','yuv420p',video]);
   const audio=new Float32Array(96000*2);for(let j=0;j<96000;j++)audio[j*2]=audio[j*2+1]=.2*Math.sin(2*Math.PI*440*(j+i*96000)/48000);
   fs.writeFileSync(pcm,Buffer.from(audio.buffer));files.push({video,pcm});
  }
  const output=path.join(dir,'joined.mp4');await assemblePreparedSections(files,output,4,signal);
  const probe=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',output]));
  assert.equal(probe.streams.find((s:any)=>s.codec_type==='video').nb_read_frames,'120');
  const decoded=path.join(dir,'decoded.f32');await runMediaProcess('ffmpeg',['-v','error','-y','-i',output,'-map','0:a','-f','f32le',decoded]);
  const bytes=fs.readFileSync(decoded);const samples=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
  let mse=0;for(let i=95000;i<97000;i++)mse+=(samples[i*2]-.2*Math.sin(2*Math.PI*440*i/48000))**2;
  assert.ok(mse/2000<.0001,`audio boundary error ${mse/2000}`);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('concurrent requests share completed sections and cancelled work keeps earlier sections reusable',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'section-race-'));let count=0;
 const a=new AbortController(),b=new AbortController();
 const deps={fingerprint:()=> 'fixed',render:async(range:[number,number],video:string,pcm:string)=>{
  count++;await new Promise(resolve=>setTimeout(resolve,5));
  fs.writeFileSync(video,String(range));fs.writeFileSync(pcm,Buffer.alloc((range[1]-range[0]+1)*1600*8));
 },assemble:async()=>{}};
 try{
  const results=await Promise.all([a,b].map((c,i)=>renderPreparedSections(input,path.join(dir,`${i}.mp4`),c.signal,()=>{},deps)));
  assert.equal(count,3);assert.equal(results.reduce((n,r)=>n+r.reused,0),3);
  fs.rmSync(path.join(dir,'sections'),{recursive:true});count=0;
  await assert.rejects(renderPreparedSections(input,path.join(dir,'c.mp4'),a.signal,p=>{if(p>0)a.abort();},deps),/abort/i);
  assert.equal((await renderPreparedSections(input,path.join(dir,'d.mp4'),b.signal,()=>{},deps)).reused,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('sound-only changes reuse every picture section and refresh only the audio artifacts',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'section-audio-'));let pictures=0,audio=0;
 const source=structuredClone(input);source.inputProps.elements.push({...row('sound',0),type:'sound_effect',lane_key:'sound_effect_0',volume:1});
 source.inputProps.laneOrderKeys!.push('sound_effect_0');
 const pcm=(range:[number,number],file:string)=>fs.writeFileSync(file,Buffer.alloc((range[1]-range[0]+1)*1600*8));
 const deps={fingerprint:()=> 'fixed',render:async(range:[number,number],video:string,file:string)=>{pictures++;fs.writeFileSync(video,'picture');pcm(range,file);},
 renderAudio:async(range:[number,number],file:string)=>{audio++;pcm(range,file);},assemble:async()=>{}};
 try {
  const run=(value=source)=>renderPreparedSections(value,path.join(dir,'output.mp4'),new AbortController().signal,()=>{},deps);
  await run();assert.equal(pictures,3);
  const changed=structuredClone(source);changed.inputProps.elements.at(-1)!.volume=.2;changed.inputProps.elements.at(-1)!.source_url='/another.wav';
  const result=await run(changed);assert.equal(result.reused,3);assert.equal(pictures,3);assert.equal(audio,3);
  changed.inputProps.elements[0].props={media_scale:2};await run(changed);assert.ok(pictures>3,'A picture edit must invalidate picture');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('transient browser failures retry twice; deterministic failures and cancellation never retry',async()=>{
 const {retryTransientPreparation}=await import('./prepared-sections');let calls=0;
 assert.equal(await retryTransientPreparation(async()=>{if(++calls<3)throw new Error('Execution context was destroyed');return 'ready';},new AbortController().signal),'ready');
 assert.equal(calls,3);calls=0;
 await assert.rejects(retryTransientPreparation(async()=>{calls++;throw new Error('Missing source');},new AbortController().signal),/Missing/);assert.equal(calls,1);
 const controller=new AbortController();controller.abort();
 await assert.rejects(retryTransientPreparation(async()=>{calls++;},controller.signal),/abort/i);assert.equal(calls,1);
});

test('bounded parallel sections finish out of order but assemble in frame order with monotonic progress',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parallel-sections-'));let active=0,peak=0;
 const progress:number[]=[],finished:number[]=[];
 let releaseFirst!:()=>void;const firstWait=new Promise<void>(r=>{releaseFirst=r;});
 try {
  await renderPreparedSections(input,path.join(dir,'out.mp4'),new AbortController().signal,p=>progress.push(p),{
   concurrency:2,fingerprint:()=> 'fixed',render:async(range,video,pcm,report)=>{
    active++;peak=Math.max(peak,active);report(.4);
    if(range[0]===0)await firstWait;else releaseFirst();
    fs.writeFileSync(video,String(range[0]));fs.writeFileSync(pcm,Buffer.alloc((range[1]-range[0]+1)*1600*8));finished.push(range[0]);active--;
   },assemble:async(files)=>{assert.deepEqual(files.map(f=>fs.readFileSync(f.video,'utf8')),['0','60','120']);}
  });
  assert.equal(peak,2);assert.equal(finished[0],60);
  assert.ok(progress.every((p,i)=>i===0||p>=progress[i-1]));assert.equal(progress.at(-1),1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('parallel failure drains active sections and never assembles partial output',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parallel-failure-'));let drained=false,assembled=false;
 try {
  await assert.rejects(renderPreparedSections(input,path.join(dir,'out.mp4'),new AbortController().signal,()=>{},{
   concurrency:2,fingerprint:()=> 'fixed',render:async(range,video,pcm)=>{
    if(range[0]===0)throw new Error('deterministic failure');
    await new Promise(r=>setTimeout(r,10));fs.writeFileSync(video,'ok');fs.writeFileSync(pcm,Buffer.alloc((range[1]-range[0]+1)*1600*8));drained=true;
   },assemble:async()=>{assembled=true;}
  }),/deterministic failure/);
  assert.equal(drained,true);assert.equal(assembled,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
