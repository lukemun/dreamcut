import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nativeSourceClock,nativeClockPosition,nativeSourceDuration} from './source-clock';
import {nativeSourceDimensions} from './source-metadata';

test('reordered VFR clock follows displayed frames, excluding discard packets and preserving the tail',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'dreamcut-native-vfr-tail-'));
 try {
  const file=path.join(dir,'vfr.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x160:rate=10:duration=2','-vf','setpts=if(lt(N\\,10)\\,N/10/TB\\,(1+(N-10)/5)/TB)','-fps_mode','vfr','-c:v','libx264','-pix_fmt','yuv420p',file]);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time,duration_time','-of','json',file],{encoding:'utf8'}));
  const expected=probe.frames.map((f:{best_effort_timestamp_time:string})=>Number(f.best_effort_timestamp_time));
  const clock=await nativeSourceClock(file,'vfr-tail');
  assert.deepEqual(clock,expected,'packet counts alone cannot establish displayed frame identity');
  const metadata=await nativeSourceDimensions(file,'vfr-tail');
  const end=Math.max(metadata.duration,...probe.frames.map((f:{best_effort_timestamp_time:string;duration_time:string})=>Number(f.best_effort_timestamp_time)+Number(f.duration_time)));
  assert.equal(nativeSourceDuration(clock,metadata.duration),end);
  assert.equal(nativeClockPosition(clock,end-.001).source_index,expected.length-1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('native metadata identifies VP8 and VP9 by the stream, not the filename',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'dreamcut-native-codec-'));
 try {
  for(const [codec,encoder] of [['vp8','libvpx'],['vp9','libvpx-vp9']]){
   const file=path.join(dir,`${codec}.mkv`);
   execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:s=16x16:r=30','-frames:v','2','-c:v',encoder,file]);
   const metadata=await nativeSourceDimensions(file,String(statSync(file).mtimeMs));
   assert.equal(metadata.codec,codec);
   assert.equal(metadata.width,16);
   assert.equal(metadata.height,16);
   assert.ok(metadata.duration>0);
   const [clock,shared]=await Promise.all([nativeSourceClock(file,codec),nativeSourceClock(file,codec)]);
   assert.strictEqual(clock,shared,'concurrent staging decoders share one immutable index');
   assert.equal(nativeClockPosition(clock,.034).source_index,1);
   assert.equal(nativeClockPosition(clock,0).source_index,0);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
