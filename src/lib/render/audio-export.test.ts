import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {exportAudioMix,runMediaProcess} from "./audio-export";

test("encoded audio clock preserves pitch, applies gain, and produces exact output length",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"dreamcut-audio-proof-"));
 try{
  const source=path.join(root,"tone.wav");
  await runMediaProcess("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=4","-ac","2",source]);
  const measurements=[];
  for(const [index,{rate,gain,preservePitch}] of [{rate:2,gain:1,preservePitch:true},{rate:.5,gain:.5,preservePitch:true},{rate:2,gain:1,preservePitch:false}].entries()){
   const directory=path.join(root,String(index));fs.mkdirSync(directory);
   const frames=Array.from({length:30},(_,frame)=>[{id:"tone",src:source,time:.25+frame/30*rate,volume:gain,rate,preservePitch}]);
   const result=await exportAudioMix(frames,30,directory);
   const pcm=fs.readFileSync(result.output);assert.equal(pcm.length,48000*2*4);
   let crossings=0,energy=0,previous=0;
   for(let sample=4800;sample<43200;sample++){
    const value=pcm.readFloatLE(sample*8);energy+=value*value;
    if(sample>4800&&previous<=0&&value>0)crossings++;previous=value;
   }
   measurements.push({frequency:crossings/.8,rms:Math.sqrt(energy/38400)});
  }
  assert.ok(Math.abs(measurements[0].frequency-440)<3);
  assert.ok(Math.abs(measurements[1].frequency-440)<3);
  assert.ok(Math.abs(measurements[2].frequency-880)<3);
  assert.ok(Math.abs(measurements[1].rms/measurements[0].rms-.5)<.03);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("aborted media process rejects instead of returning an incomplete result",async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(runMediaProcess("ffmpeg",["-version"],controller.signal));
});

test("time stretching retains an audible source tail at the final output frame",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"dreamcut-audio-tail-"));
 try{
  const source=path.join(root,"tail.wav");
  await runMediaProcess("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=3","-af","volume='if(between(t,1.01,1.10),1,0)':eval=frame",source]);
  const frames=Array.from({length:30},(_,frame)=>[{id:"tail",src:source,time:frame/30*1.1,volume:1,rate:1.1,preservePitch:true}]);
  const result=await exportAudioMix(frames,30,root);const pcm=fs.readFileSync(result.output);
  let energy=0;for(let sample=47520;sample<48000;sample++)energy+=pcm.readFloatLE(sample*8)**2;
  assert.ok(Math.sqrt(energy/480)>.02,"the last 10ms of retained source audio were lost");
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("a reversed clip exports its source sound backward",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"dreamcut-audio-reverse-"));
 try{
  // One second of silence, then one second of tone: reversed, the tone comes first.
  const source=path.join(root,"rise.wav");
  await runMediaProcess("ffmpeg",["-v","error","-y","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=2","-ac","2","-af","volume='if(gte(t,1),1,0)':eval=frame",source]);
  const frames=Array.from({length:60},(_,frame)=>[{id:"rise",src:source,time:(59-frame)/30,volume:1,rate:1,preservePitch:true,reverse:true}]);
  const result=await exportAudioMix(frames,30,root);const pcm=fs.readFileSync(result.output);
  assert.equal(pcm.length,96000*2*4);
  const rms=(from:number,to:number)=>{let energy=0;for(let sample=from;sample<to;sample++)energy+=pcm.readFloatLE(sample*8)**2;return Math.sqrt(energy/(to-from));};
  assert.ok(rms(2400,45600)>.05,"the tone should open the reversed clip");
  assert.ok(rms(50400,93600)<.01,"the source's opening silence should close it");
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
