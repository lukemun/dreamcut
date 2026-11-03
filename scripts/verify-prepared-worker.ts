/** Synthetic preparation proof: restart recovery, catalog sound, audio-only reuse. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {preparedWorker} from '../src/lib/render/prepared-client';
import {ensurePreparedRuntime,preparedRuntimeRoot} from '../src/lib/render/prepared-runtime';
import {runMediaProcess} from '../src/lib/render/audio-export';
import type {PreparedPreviewInput} from '../src/lib/timeline/prepared-preview';
const project='prepared-worker-proof-'+randomUUID();
const output=path.resolve('testing/results/prepared-worker');fs.mkdirSync(output,{recursive:true});
fs.mkdirSync(preparedRuntimeRoot(),{recursive:true});
const fixtures=fs.mkdtempSync(path.join(preparedRuntimeRoot(),'proof-'));
process.env.TIMELINE_PROJECTS_DIR=path.join(fixtures,'projects');
process.env.TIMELINE_SFX_CATALOG_DIR=path.join(fixtures,'sfx');
const audio=path.join(fixtures,'sfx/audio/licensed/tone.wav');fs.mkdirSync(path.dirname(audio),{recursive:true});
const wait=()=>new Promise(r=>setTimeout(r,300));
async function main(){
 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=5',audio]);
 const input:PreparedPreviewInput={width:160,height:160,fps:30,durationInFrames:121,inputProps:{laneOrderKeys:['sound_effect_0'],elements:[{id:'tone',type:'sound_effect',lane_key:'sound_effect_0',lane_index:0,source_url:'/api/sfx-catalog/media/licensed/tone.wav',props:{},timeline_start:0,duration:121/30,volume:.2,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0}]}};
 const version=await ensurePreparedRuntime(),directory=path.join(preparedRuntimeRoot(),version);
 const start=()=>preparedWorker.start(project,randomUUID(),input,'http://127.0.0.1:3123',1);
 const recoveryStarted=performance.now();
 const job=await start();let killed=false;
 const deadline=Date.now()+180_000;
 while(Date.now()<deadline){
  const status=await preparedWorker.status(project,job.id);
  // Parallel captures can report >one section's progress before either section
  // commits. Interrupt after a durable picture receipt, not aggregate progress.
  const sections=path.join(fixtures,'projects',project,'instruments','.prepared-playback',version,'sections');
  const committedPicture=fs.existsSync(sections)&&fs.readdirSync(sections).some(file=>file.endsWith('.mp4.json'));
  if(!killed && status.state==='preparing' && committedPicture){
   const worker=JSON.parse(fs.readFileSync(path.join(directory,'process.json'),'utf8'));
   process.kill(worker.pid,'SIGKILL');killed=true;await wait();
  }
  if(status.state==='ready')break;
  assert.ok(['queued','preparing'].includes(status.state),JSON.stringify(status));await wait();
 }
 assert.ok(killed,'Must interrupt after a completed section');
 assert.equal((await preparedWorker.status(project,job.id)).state,'ready');
 const file=await preparedWorker.file(project,job.id),receipt=JSON.parse(fs.readFileSync(file+'.sections.json','utf8'));
 assert.ok(receipt.reused>=1,'Restart discarded a completed picture section');
 const recoveryMs=Math.round(performance.now()-recoveryStarted);
 const versionBefore=await ensurePreparedRuntime();
 // An unrelated file outside the renderer graph cannot change the generation.
 const unrelated=path.resolve('src/lib/render/prepared-proof-unrelated.tmp');fs.writeFileSync(unrelated,'unrelated editor work');
 try{assert.equal(await ensurePreparedRuntime(),versionBefore);}finally{fs.rmSync(unrelated);}
 input.inputProps.elements[0].volume=.6;
 const audioStarted=performance.now();
 const changed=await start();
 while(Date.now()<deadline){const status=await preparedWorker.status(project,changed.id);if(status.state==='ready')break;assert.ok(['queued','preparing'].includes(status.state),JSON.stringify(status));await wait();}
 assert.equal((await preparedWorker.status(project,changed.id)).state,'ready');
 const audioEditMs=Math.round(performance.now()-audioStarted);
 const changedFile=await preparedWorker.file(project,changed.id),changedReceipt=JSON.parse(fs.readFileSync(changedFile+'.sections.json','utf8'));
 assert.equal(changedReceipt.rendered,0,'Audio edit rendered picture frames');assert.equal(changedReceipt.reused,3);
 const probe=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',changedFile]));
 assert.equal(probe.streams.find((s:any)=>s.codec_type==='video').nb_read_frames,'121');
 const amplitudes=[];
 for(const [index,source] of [file,changedFile].entries()){
  const pcm=path.join(fixtures,`decoded-${index}.f32`);await runMediaProcess('ffmpeg',['-v','error','-y','-i',source,'-map','0:a','-f','f32le',pcm]);
  const b=fs.readFileSync(pcm),samples=new Float32Array(b.buffer,b.byteOffset,b.length/4);let sum=0;for(let n=48000;n<96000;n++)sum+=samples[n]**2;amplitudes.push(Math.sqrt(sum/48000));
 }
 assert.ok(Math.abs(amplitudes[1]/amplitudes[0]-3)<.1,'Changed audio gain was not encoded');
 fs.writeFileSync(path.join(output,'latest.json'),JSON.stringify({sameJobRecovered:job.id,recoveryMs,audioEditMs,recovery:receipt,audioEdit:changedReceipt,frames:121,gainRatio:amplitudes[1]/amplitudes[0],unrelatedFilePreservesRuntime:true},null,2));
 console.log('PASS detached worker recovery, catalog audio, zero picture renders on gain change, encoded gain and frame count');
 const worker=JSON.parse(fs.readFileSync(path.join(directory,'process.json'),'utf8'));process.kill(worker.pid,'SIGTERM');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(fixtures,{recursive:true,force:true}));
