/** Synthetic alpha playback regression; never reads/writes a creator's timeline. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chromium} from 'playwright-core';
import {runMediaProcess} from '../src/lib/render/audio-export';
import {renderBrowserVideo} from '../src/lib/render/browser-renderer';
import type {CompositionElement} from '../src/lib/render/composition-adapters';
import { readEnv } from '../src/lib/env-name';
const nativeProjectId=readEnv("VERIFY_NATIVE")==='1'?'native-alpha-contract':undefined;
const dir=path.resolve(nativeProjectId?'testing/results/native-alpha-preview':'testing/results/alpha-preview');fs.mkdirSync(dir,{recursive:true});
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
/** Native sources have no video element or rVFC; test the published whole scene. */
async function verifyNativeAlpha(elements:CompositionElement[],sourceTimes:number[]){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const samples:Array<{label:string;red:number;blue:number;white:number;center:number}>=[];
 try{
  const page=await browser.newPage({viewport:{width:180,height:180}});
  await page.goto(`${base}/playback-proof`);await page.waitForFunction(()=>!!window.__dreamcutPlayback);
  await page.evaluate(c=>window.__dreamcutPlayback!.load(c),{nativeProjectId,elements,durationInFrames:60,laneOrderKeys:['visual_1','visual_0']});
  const ready=async(frame:number)=>{
   await page.waitForFunction(f=>{const s=window.__dreamcutPlayback!.snapshot();return s.nativeFrame===f||!!s.nativeError;},frame,{timeout:15000});
   assert.equal((await page.evaluate(()=>window.__dreamcutPlayback!.snapshot())).nativeError,null);
  };
  const inspect=async(label:string)=>{
   const bytes=await page.locator('[data-dreamcut-player]').screenshot();
   const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
   let red=0,blue=0,white=0,sumX=0;
   for(let i=0;i<data.length;i+=info.channels){const[r,g,b]=[data[i],data[i+1],data[i+2]];if(r>140&&g<100&&b<100){red++;sumX+=(i/info.channels)%info.width;}if(b>140&&r<80)blue++;if(r>220&&g>220&&b>220)white++;}
   assert.ok(red>2000,`${label}: missing alpha subject`);assert.ok(blue>8000,`${label}: lost transparent background`);assert.ok(white>100,`${label}: missing outline`);
   const result={label,red,blue,white,center:sumX/red};samples.push(result);fs.writeFileSync(path.join(dir,`${label}.png`),bytes);return result;
  };
  for(let cycle=0;cycle<3;cycle++){
   await page.evaluate(()=>window.__dreamcutPlayback!.seek(0));await ready(0);
   await page.evaluate(()=>window.__dreamcutPlayback!.play());
   for(const frame of [12,30,48]){await page.waitForFunction(f=>(window.__dreamcutPlayback!.snapshot().nativeFrame??-1)>=f,frame);await inspect(`run-${cycle}-${frame}`);}
   await page.waitForFunction(()=>{const s=window.__dreamcutPlayback!.snapshot();return !s.playing&&s.nativeFrame===59;});
  }
  const centers=new Map<number,number>();
  for(const frame of [15,45,6,30,45,15]){
   await page.evaluate(f=>window.__dreamcutPlayback!.seek(f),frame);await ready(frame);
   const result=await inspect(`seek-${frame}`);
   const sourceIndex=sourceTimes.findLastIndex(t=>t<=frame/30+1e-9);
   const expected=40+Math.round(15*Math.sin(sourceIndex/8))+29.5;
   assert.ok(Math.abs(result.center-expected)<1,`Seek ${frame}: stale/wrong source geometry ${result.center} vs ${expected}`);
   if(centers.has(frame))assert.equal(result.center,centers.get(frame),'Repeated seek changed source geometry');centers.set(frame,result.center);
  }
  assert.ok(Math.max(...centers.values())-Math.min(...centers.values())>15,'Alpha subject never moved');
  assert.ok(await page.locator('canvas[data-native-source]').count()>0,'No native sources');
  // A caption must obey the same lane order as native transparent video.
  const caption:CompositionElement={...elements[0],id:'between-layers',type:'caption_text',source_url:null,lane_key:'captions_0',lane_index:2,props:{text:'MMMM',fontPreset:'sans',fontSizePx:42,fontSizing:'fixed',textColor:'#00ff00',textAlign:'left',absX:.05,absY:.4,maxWidth:.95,singleLine:true,animationPreset:'none'}};
  const layered=[...elements,caption],middle=['visual_1','captions_0','visual_0'];
  await page.goto(`${base}/render-frame`);await page.waitForFunction(()=>!!window.__dreamcutRender);
  const layerCapture=async(order:string[],frame:number)=>{
   await page.evaluate(c=>window.__dreamcutRender!.load(c),{nativeProjectId,width:160,height:160,fps:30,durationInFrames:60,inputProps:{elements:layered,laneOrderKeys:order}});
   await page.evaluate(f=>window.__dreamcutRender!.frame(f),frame);
   const buffer=await page.locator('#dreamcut-render-surface').screenshot({path:path.join(dir,`layers-${order.join('-')}-${frame}.png`)});
   const pixels=await sharp(buffer).removeAlpha().raw().toBuffer();let green=0;
   for(let i=0;i<pixels.length;i+=3)if(pixels[i+1]>140&&pixels[i]<100&&pixels[i+2]<100)green++;
   return {pixels,green};
  };
  const front=await layerCapture(['captions_0','visual_1','visual_0'],15),between=await layerCapture(middle,15),behind=await layerCapture(['visual_1','visual_0','captions_0'],15);
  assert.ok(front.green>200,'Caption fixture has no visible glyphs');
  assert.ok(between.green>100&&front.green-between.green>100,'Native alpha must cover part of the interleaved caption');
  assert.equal(behind.green,0,'Opaque background failed to cover caption behind it');
  const comparisons=new Map<number,Buffer>();
  for(const frame of [0,15,45,15]){const sample=await layerCapture(middle,frame);if(comparisons.has(frame))assert.equal(Buffer.compare(sample.pixels,comparisons.get(frame)!),0,'Interleaved text seek changed');comparisons.set(frame,sample.pixels);}
  const layeredVideo=path.join(dir,'interleaved.mp4');
  await renderBrowserVideo({baseUrl:base,nativeProjectId,width:160,height:160,fps:30,durationInFrames:60,inputProps:{elements:layered,laneOrderKeys:middle},outputLocation:layeredVideo});
  const rawPath=path.join(dir,'interleaved.rgb');await runMediaProcess('ffmpeg',['-v','error','-y','-i',layeredVideo,'-pix_fmt','rgb24','-f','rawvideo',rawPath]);
  const encoded=fs.readFileSync(rawPath);assert.equal(encoded.length,60*160*160*3);
  let maximumEncodedMeanError=0;
  for(const [frame,rawExpected] of comparisons){
   // Saturated small glyphs lose chroma detail in yuv420p. Compare against the
   // independently captured scene passed through the same encoder conversion.
   const still=path.join(dir,`layers-${middle.join('-')}-${frame}.png`),reference=path.join(dir,`layer-reference-${frame}.mp4`),referenceRgb=path.join(dir,`layer-reference-${frame}.rgb`);
   await runMediaProcess('ffmpeg',['-v','error','-y','-i',still,'-frames:v','1','-c:v','libx264','-preset','fast','-crf','18','-vf','scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709','-pix_fmt','yuv420p',reference]);
   await runMediaProcess('ffmpeg',['-v','error','-y','-i',reference,'-pix_fmt','rgb24','-f','rawvideo',referenceRgb]);
   const expected=fs.readFileSync(referenceRgb);assert.equal(expected.length,rawExpected.length);
   const actual=encoded.subarray(frame*expected.length,(frame+1)*expected.length);let sum=0;for(let i=0;i<actual.length;i++)sum+=Math.abs(actual[i]-expected[i]);const mean=sum/actual.length;
   assert.ok(mean<3,`Interleaved export differs at ${frame}: ${mean}`);maximumEncodedMeanError=Math.max(maximumEncodedMeanError,mean);
  }
  fs.writeFileSync(path.join(dir,'attempt.json'),JSON.stringify({passed:true,sourceDecoder:'rust-ffmpeg',samples,fullReplayCycles:3,exactSeeks:[15,45,6,30,45,15],movingSourceGeometry:true,interleavedText:{frontPixels:front.green,middlePixels:between.green,behindPixels:behind.green,repeatedSeekExact:true,encodedFrames:60,sampledFrames:[...comparisons.keys()],maximumEncodedMeanError}},null,2));
 }finally{await browser.close();}
}
async function main(){
 for(let i=0;i<60;i++) await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect x="${40+Math.round(15*Math.sin(i/8))}" y="40" width="60" height="80" rx="12" fill="#ed241e"/></svg>`)).png().toFile(path.join(dir,`${String(i).padStart(3,'0')}.png`));
 const source=path.join(dir,'alpha.webm');await runMediaProcess('ffmpeg',['-v','error','-y','-framerate','30','-i',path.join(dir,'%03d.png'),'-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0','-g','15',source]);
 let url=`data:video/webm;base64,${fs.readFileSync(source).toString('base64')}`;
 if(nativeProjectId){
  const root=process.env.TIMELINE_PROJECTS_DIR;if(!root)throw Error('Native alpha proof requires an isolated project root');
  const target=path.join(root,nativeProjectId,'media','alpha.webm');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  url=`${base}/api/projects/${nativeProjectId}/media/alpha.webm`;
 }
 const bg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#123bdc"/></svg>');
 const common={timeline_start:0,duration:2,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0};
 const elements=[{...common,id:'background',type:'still',source_url:bg,props:{}},{...common,id:'alpha',lane_key:'visual_1',lane_index:1,type:'video_clip',source_url:url,props:{preview_source_url:url,preview_proxy_validation:{contract:"preview-proxy-v1",url,ok:true,width:160,height:160},has_alpha:true,source_duration_seconds:2,source_width:160,source_height:160,sticker_outline:true,sticker_outline_width:4,sticker_outline_color:'#ffffff',subject_glow:0,subject_flash:0,subject_glow_radius:10,keyframes:{subject_glow:[{t:0,v:1},{t:.4,v:0}]}}}] as CompositionElement[];
 const sourceTimes:number[]=nativeProjectId?JSON.parse(await runMediaProcess('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',source])).frames.map((f:{best_effort_timestamp_time:string})=>Number(f.best_effort_timestamp_time)):[];
 if(nativeProjectId)await verifyNativeAlpha(elements,sourceTimes);
 else {
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const samples:unknown[]=[];
 try{const page=await browser.newPage({viewport:{width:180,height:180}});await page.goto(`${base}/playback-proof`);await page.waitForFunction(()=>Boolean(window.__dreamcutPlayback));await page.evaluate(c=>window.__dreamcutPlayback!.load(c),{elements,durationInFrames:60,laneOrderKeys:['visual_1','visual_0']});
 const inspect=async(label:string)=>{const bytes=await page.locator('[data-dreamcut-player]').screenshot();const {data,info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});await fs.promises.writeFile(path.join(dir,`${label}.png`),bytes);let red=0,blue=0,white=0;for(let i=0;i<data.length;i+=info.channels){const[r,g,b]=[data[i],data[i+1],data[i+2]];if(r>140&&g<100&&b<100)red++;if(b>140&&r<80)blue++;if(r>220&&g>220&&b>220)white++;}assert.ok(red>2000,`${label}: missing subject (${red})`);assert.ok(blue>8000,`${label}: missing transparent background (${blue})`);assert.ok(white>100,`${label}: missing outline (${white})`);samples.push({label,red,blue,white});await fs.promises.writeFile(path.join(dir,`${label}.png`),bytes);};
 for(let cycle=0;cycle<3;cycle++){await page.evaluate(()=>{window.__dreamcutPlayback!.seek(0);window.__dreamcutPlayback!.play();});for(const frame of [12,30,48]){await page.waitForFunction(f=>window.__dreamcutPlayback!.snapshot().frame>=f,frame,{timeout:10000});await inspect(`run-${cycle}-${frame}`);}await page.evaluate(()=>window.__dreamcutPlayback!.pause());}
 for(const frame of [15,45,6,30]){await page.evaluate(f=>window.__dreamcutPlayback!.seek(f),frame);await page.waitForFunction(f=>{const m=window.__dreamcutPlayback!.snapshot().media[0];return m?.ready>=2&&!m.seeking&&Math.abs(m.time-f/30)<.04;},frame);await inspect(`seek-${frame}`);}
 const playbackState=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
 assert.equal(playbackState.nodes,1);assert.equal(playbackState.loads,1);
 // Paused seeking must repaint even when Chrome does not deliver another rVFC.
 await page.evaluate(()=>{
   HTMLVideoElement.prototype.requestVideoFrameCallback = () => 0;
 });
 // Reload the fixture to register callbacks against the suppressed presentation API.
 await page.evaluate(c=>window.__dreamcutPlayback!.load(c),{elements,durationInFrames:60,laneOrderKeys:['visual_1','visual_0']});
 for(const frame of [45,6,30,15]){
   await page.evaluate(f=>window.__dreamcutPlayback!.seek(f),frame);
   await page.waitForFunction(f=>{const m=window.__dreamcutPlayback!.snapshot().media[0];return m?.ready>=2&&!m.seeking&&Math.abs(m.time-f/30)<.01;},frame);
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))));
   const difference=await page.evaluate(()=>{
     const video=document.querySelector('video')!;
     const actual=document.querySelector<HTMLCanvasElement>('[data-dreamcut-effect-output="alpha-video"]')!;
     const expected=document.createElement('canvas');expected.width=video.videoWidth;expected.height=video.videoHeight;
     expected.getContext('2d')!.drawImage(video,0,0);
     if(actual.width!==expected.width||actual.height!==expected.height)return Infinity;
     const a=actual.getContext('2d')!.getImageData(0,0,actual.width,actual.height).data;
     const b=expected.getContext('2d')!.getImageData(0,0,expected.width,expected.height).data;
     let error=0;for(let i=0;i<a.length;i++)error+=Math.abs(a[i]-b[i]);return error/a.length;
   });
   assert.equal(difference,0,`Paused seek ${frame}: compositor retained a different decoded frame`);
   samples.push({label:`paused-without-rvfc-${frame}`,difference});
 }
 // Exercise the same callback starvation while the source is playing, as can
 // happen when an already-decoded hidden premount first enters the scene.
 await page.evaluate(c=>{window.__dreamcutPlayback!.load(c);window.__dreamcutPlayback!.play();},{elements:[elements[0],{...elements[1],timeline_start:.5,duration:1.5,trim_start:.5}],durationInFrames:60,laneOrderKeys:['visual_1','visual_0']});
 const liveErrors:number[]=[];
 for(let index=0;index<65;index++){
   await page.waitForTimeout(25);
   const delta=await page.evaluate(()=>{
     const video=document.querySelector('video')!;
     const actual=document.querySelector<HTMLCanvasElement>('[data-dreamcut-effect-output="alpha-video"]')!;
     if(window.__dreamcutPlayback!.snapshot().frame<17||video.seeking||video.readyState<2||!actual.width)return null;
     const expected=document.createElement('canvas');expected.width=video.videoWidth;expected.height=video.videoHeight;
     expected.getContext('2d')!.drawImage(video,0,0);
     const centers:number[]=[];
     for(const c of [actual,expected]){const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let x=0,n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>200&&d[i]>140&&d[i+1]<100){x+=(i/4)%c.width;n++;}centers.push(n?x/n:NaN);}
     return Math.abs(centers[0]-centers[1]);
   });
   if(delta!=null)liveErrors.push(delta);
 }
 await page.evaluate(()=>window.__dreamcutPlayback!.pause());
 assert.ok(liveErrors.length>=30,'Missing live callback-starvation observations');
 assert.ok(liveErrors.every(error=>Number.isFinite(error)&&error<4),`Stale moving canvas during callback starvation: ${Math.max(...liveErrors)}px`);
 samples.push({label:'playing-without-rvfc',observations:liveErrors.length,maxCenterError:Math.max(...liveErrors)});
 const state=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());assert.equal(state.nodes,1);assert.equal(state.loads,1);fs.writeFileSync(path.join(dir,'attempt.json'),JSON.stringify({samples,state,playbackState},null,2));console.log('Alpha preview PASS: subject, background and outline survive repeated playback and random seeks');
 }finally{await browser.close();}
 }
 await renderBrowserVideo({baseUrl:base,nativeProjectId,width:160,height:160,fps:30,durationInFrames:60,inputProps:{elements,laneOrderKeys:['visual_1','visual_0']},outputLocation:path.join(dir,'alpha-proof.mp4')});
 await runMediaProcess('ffmpeg',['-v','error','-y','-i',path.join(dir,'alpha-proof.mp4'),'-vf','select=eq(n\\,30)','-frames:v','1',path.join(dir,'encoded-30.png')]);
 const decoded=await sharp(path.join(dir,'encoded-30.png')).raw().toBuffer({resolveWithObject:true});
 let subject=0,background=0,outline=0;
 for(let i=0;i<decoded.data.length;i+=decoded.info.channels){const r=decoded.data[i],g=decoded.data[i+1],b=decoded.data[i+2];if(r>140&&g<100&&b<100)subject++;if(b>140&&r<80)background++;if(r>220&&g>220&&b>220)outline++;}
 assert.ok(subject>2000&&background>8000&&outline>100,'Encoded alpha composition lost subject, background or outline');
 const receipt=JSON.parse(fs.readFileSync(path.join(dir,'attempt.json'),'utf8'));receipt.encoded={subject,background,outline,frames:60};fs.writeFileSync(path.join(dir,'attempt.json'),JSON.stringify(receipt,null,2));
 if(nativeProjectId){
  const decodedPath=path.join(dir,'encoded.rgb');
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',path.join(dir,'alpha-proof.mp4'),'-map','0:v:0','-pix_fmt','rgb24','-f','rawvideo',decodedPath]);
  const all=fs.readFileSync(decodedPath),frameBytes=160*160*3;assert.equal(all.length,60*frameBytes,'Encoded alpha frame count');
  let maximumCenterError=0;
  for(let frame=0;frame<60;frame++){
   let sum=0,count=0,background=0;
   const pixels=all.subarray(frame*frameBytes,(frame+1)*frameBytes);
   for(let i=0;i<pixels.length;i+=3){const[r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];if(r>140&&g<100&&b<100){sum+=(i/3)%160;count++;}if(b>140&&r<80)background++;}
   assert.ok(count>2000&&background>8000,`Encoded alpha lost layers at ${frame}`);
   const sourceIndex=sourceTimes.findLastIndex(t=>t<=frame/30+1e-9);
   assert.ok(sourceIndex>=0,`No source timestamp for ${frame}`);
   const error=Math.abs(sum/count-(40+Math.round(15*Math.sin(sourceIndex/8))+29.5));
   assert.ok(error<1,`Encoded alpha has stale/wrong source at ${frame}: ${error}px`);maximumCenterError=Math.max(maximumCenterError,error);
  }
  receipt.encodedMotion={checkedFrames:60,maximumCenterError};fs.writeFileSync(path.join(dir,'attempt.json'),JSON.stringify(receipt,null,2));
 }
 fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify({...receipt,completedAt:new Date().toISOString()},null,2));
 console.log('Encoded alpha composition PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});
