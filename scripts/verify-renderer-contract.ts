/** Portable behavioral contract: every control changes pixels, reset restores them,
 * preview agrees with export, repeated seeks are deterministic, and encoding retains them. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium,type Page} from "playwright-core";
import sharp from "sharp";
import {TIMELINE_TRANSITION_TYPES} from "../src/lib/timeline/contracts";
import {renderContractCases} from "../src/lib/render/effect-render-contract";
import {renderBrowserVideo} from "../src/lib/render/browser-renderer";
import {runMediaProcess} from "../src/lib/render/audio-export";
import { readEnv } from "../src/lib/env-name";
const base=process.env.TIMELINE_EDITOR_BASE_URL??"http://127.0.0.1:3123";
const nativeProjectId=readEnv("VERIFY_NATIVE") === "1" ? "native-render-contract" : undefined;
const output=path.resolve(nativeProjectId ? "testing/results/native-renderer-contract" : "testing/results/renderer-contract");
function sourceUrl(file:string):string{
 if(!nativeProjectId)return `data:video/mp4;base64,${fs.readFileSync(file).toString("base64")}`;
 const root=process.env.TIMELINE_PROJECTS_DIR;if(!root)throw Error("Native verification requires an explicit isolated TIMELINE_PROJECTS_DIR");
 const destination=path.join(root,nativeProjectId,"media",path.basename(file));
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination);
 return `${base}/api/projects/${nativeProjectId}/media/${encodeURIComponent(path.basename(file))}`;
}
const pixels=async(input:Buffer|string)=>(await sharp(input).ensureAlpha().raw().toBuffer());
function difference(a:Buffer,b:Buffer){assert.equal(a.length,b.length);let changed=0,total=0;for(let i=0;i<a.length;i+=4){let max=0;for(let j=0;j<3;j++){const d=Math.abs(a[i+j]-b[i+j]);max=Math.max(max,d);total+=d;}if(max>3)changed++;}return {changed,mean:total/(a.length/4*3)};}
async function verifyLut(page:Page){
 const graded:Buffer[]=[];
 for(const glow of [false,true]){
 const lut=[];
 for(const [enabled,rendering] of [[false,true],[true,true],[true,false]]){
  await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"LutContractFixture",width:160,height:160,fps:30,durationInFrames:60,rendering,inputProps:{enabled,glow}});
  const image=await page.locator("#dreamcut-render-surface").screenshot();
  fs.writeFileSync(path.join(output,`lut-${glow?"glow-":""}${enabled?"on":"off"}-${rendering?"export":"preview"}.png`),image);
  lut.push(await pixels(image));
  if(glow&&!enabled){
   // Identity LUT must preserve the actual inner SVG filter picture, not
   // merely match another path that drops the same effect.
   await page.evaluate(()=>{
    const canvas=document.querySelector<HTMLCanvasElement>('[data-color-grade-lut-output]')!;
    canvas.style.display='none';(canvas.previousElementSibling as HTMLElement).style.opacity='1';
   });
   const original=await page.locator('#dreamcut-render-surface').screenshot();
   fs.writeFileSync(path.join(output,'lut-original-inner-glow.png'),original);
   assert.equal(difference(lut.at(-1)!,await pixels(original)).mean,0,'Identity LUT changed the inner SVG filter picture');
  }
 }
 console.log("LUT differences",JSON.stringify({glow,effect:difference(lut[0],lut[1]),parity:difference(lut[1],lut[2])}));
 assert.ok(difference(lut[0],lut[1]).changed>100,"LUT had no observable effect");assert.ok(difference(lut[1],lut[2]).mean<=.5,"LUT preview/export differs");
 graded.push(lut[1]);
 }
 assert.ok(difference(graded[0],graded[1]).changed>100,'LUT dropped its inner glow filter');
}
async function verifyAccentControls(page:Page){
 const proof=[];
 for(const type of ['film_burn','camera_flash','blackout']){
  const capture=async(params:Record<string,number>,frame:number,rendering=true)=>{
   await page.evaluate(config=>window.__dreamcutRender!.load(config),{fixtureId:'SmearTransitionFixture',width:160,height:160,fps:30,durationInFrames:90,rendering,inputProps:{type,params}});
   await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);
   return pixels(await page.locator('#dreamcut-render-surface').screenshot());
  };
  for(const [field,frame,value] of [['accent_strength',45,1],['accent_hold',36,.6]] as const){
   const neutral={accent_strength:1,accent_hold:0,[field]:0};
   const before=await capture(neutral,frame),params={...neutral,[field]:value};
   const after=await capture(params,frame);
   assert.ok(difference(before,after).changed>100,`${type} ${field} must change pixels`);
   assert.equal(difference(before,await capture(neutral,frame)).changed,0,`${type} ${field} reset`);
   assert.ok(difference(after,await capture(params,frame,false)).mean<=.5,`${type} ${field} preview parity`);
   await capture(params,60);await capture(params,30);
   assert.equal(difference(after,await capture(params,frame)).changed,0,`${type} ${field} seek stability`);
   proof.push({type,field,reset:true,previewParity:true,seekStable:true});
  }
 }
 fs.writeFileSync(path.join(output,'accent-controls.json'),JSON.stringify({passed:true,proof},null,2));
 console.log('PASS accent Strength and Peak hold: visible pixels, reset, preview/export parity, repeated seeks');
}
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const sourcePng=path.join(output,"key-source.png"),sourceMp4=path.join(output,"key-source.mp4");
 await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g"><stop stop-color="#00ff00"/><stop offset=".6" stop-color="#80a090"/><stop offset="1" stop-color="#e04020"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/></svg>')).png().toFile(sourcePng);
 await runMediaProcess("ffmpeg",["-v","error","-y","-loop","1","-i",sourcePng,"-t","3","-r","30","-c:v","libx264","-pix_fmt","yuv420p",sourceMp4]);
 const sourceVideo=sourceUrl(sourceMp4);
 const browserServer=await chromium.launchServer({channel:"chrome",headless:true});
 const scopeProof:Record<string,number|string>[]=[];
 const results:Record<string,unknown>[]=[];const expected:Buffer[]=[];
 let windowOpeningProof:Record<string,unknown> | undefined;
 const smearProof:Record<string,unknown>[]=[];
 const transitionProof:Record<string,unknown>[]=[];
 const smearEncoded = new Map<string, Buffer[]>();
 const smearEncodedParams = new Map<string, Record<string,unknown>>();
 try{
 const browser=await chromium.connect(browserServer.wsEndpoint());
 const page=await browser.newPage({viewport:{width:160,height:160},deviceScaleFactor:1});
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 // The first page of a CI run compiles the render bundle cold; allow for that once.
 await page.goto(`${base}/render-frame`,{waitUntil:"networkidle",timeout:120_000});await page.waitForFunction(()=>Boolean(window.__dreamcutRender),undefined,{timeout:120_000});
 await verifyAccentControls(page);
 if(readEnv("RENDERER_ACCENTS_ONLY")==='1')return;
 if(readEnv("RENDERER_LUT_ONLY")==="1"){await verifyLut(page);fs.writeFileSync(path.join(output,"lut-only.json"),JSON.stringify({passed:true,scope:"LUT preview/export only",date:new Date().toISOString()}));return;}
 if(nativeProjectId){
  const repeated=path.join(output,"repeated-source.mp4");
  await runMediaProcess("ffmpeg",["-v","error","-y","-f","lavfi","-i","testsrc2=s=160x160:r=30:d=3","-c:v","libx264","-pix_fmt","yuv420p",repeated]);
  const url=sourceUrl(repeated),proof:unknown[]=[];
  for(const sharedTitle of [false,true]){
   const requests:Array<Array<{id:string;decoderId:string;time:number}>>=[];
   const record=(request:import("playwright-core").Request)=>{if(request.url().endsWith("/native-frames")&&request.method()==="POST"){const body=request.postDataJSON();if(body.frames?.length)requests.push(body.frames);}};
   page.on("request",record);
   await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"RepeatedSourceFixture",width:160,height:160,fps:30,durationInFrames:30,inputProps:{sourceVideo:url,sharedTitle}});
   const captured:Buffer[]=[];
   for(const frame of [0,1,2,8]){await page.evaluate(frame=>window.__dreamcutRender!.frame(frame),frame);captured.push(await pixels(await page.locator("#dreamcut-render-surface").screenshot()));}
   page.off("request",record);
   // Initial hydration may settle frame zero before the explicit capture.
   assert.ok(requests.length>=4,"Every requested source frame must be decoded");
   const ids=requests[0].map(source=>source.decoderId);
   assert.equal(new Set(ids).size,2,"Repeated source instances must own independent decoders even with equal titles");
   for(const batch of requests){assert.deepEqual(batch.map(source=>source.decoderId),ids,"Mounted source decoder identities changed during playback");assert.ok(batch[0].time>batch[1].time+.9,"Fixture must exercise different source clocks");}
   assert.ok(difference(captured[0],captured[3]).changed>100,"Repeated-source fixture must visibly animate");
   await page.evaluate(config=>window.__dreamcutRender!.load(config),{fixtureId:"RepeatedSourceFixture",width:160,height:160,fps:30,durationInFrames:30,inputProps:{sourceVideo:url,sharedTitle}});
   await page.evaluate(()=>window.__dreamcutRender!.frame(8));
   await sharp(captured[3],{raw:{width:160,height:160,channels:4}}).png().toFile(path.join(output,`repeated-native-${sharedTitle}.png`));
   const parity=difference(captured[3],await pixels(await page.locator("#dreamcut-render-surface").screenshot({path:path.join(output,`repeated-browser-${sharedTitle}.png`)})));
   assert.ok(parity.mean<5,`Repeated-source clocks disagree with browser: ${parity.mean}`);
   proof.push({sharedTitle,frames:[0,1,2,8],independentStableDecoders:true,parity});
  }
  fs.writeFileSync(path.join(output,"repeated-source-proof.json"),JSON.stringify({passed:true,proof},null,2));
  console.log("PASS repeated-source decoder ownership: independent clocks, stable instances, browser parity");
 }
 // SDR video must retain its display code values before grading. This catches
 // a normative transfer conversion that darkens BT.709 relative to Chromium.
 if(nativeProjectId){
  const grayPng=path.join(output,"sdr-gray.png"),grayVideo=path.join(output,"sdr-gray.mp4");
  await sharp({create:{width:160,height:160,channels:3,background:{r:128,g:128,b:128}}}).png().toFile(grayPng);
  await runMediaProcess("ffmpeg",["-v","error","-y","-loop","1","-i",grayPng,"-t","0.2","-r","30","-vf","scale=out_color_matrix=bt709:out_range=tv","-c:v","libx264","-crf","0","-pix_fmt","yuv420p","-colorspace","bt709","-color_primaries","bt709","-color_trc","bt709",grayVideo]);
  await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"MediaClockFixture",width:160,height:160,fps:30,durationInFrames:6,inputProps:{sourceVideo:sourceUrl(grayVideo)}});
  await page.evaluate(()=>window.__dreamcutRender!.frame(0));
  const gray=await pixels(await page.locator("#dreamcut-render-surface").screenshot());
  for(const channel of gray.subarray((80*160+80)*4,(80*160+80)*4+3))assert.ok(Math.abs(channel-128)<=3,`SDR gray128 became ${channel} before grading`);
  console.log("PASS native SDR display transfer: middle gray retained before grading");
 }
 const capture=async(caseIndex:number,variant:number,rendering=true,atFrame=30)=>{
   await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"EffectControlFixture",width:160,height:160,fps:30,durationInFrames:75,rendering,inputProps:{caseIndex,variant,sourceVideo}});
   await page.evaluate(frame=>window.__dreamcutRender!.frame(frame),atFrame);
   if(errors.length) throw new Error(errors.join("\n"));
   return pixels(await page.locator("#dreamcut-render-surface").screenshot({path:path.join(output,`case-${caseIndex}-${variant}-${rendering}.png`)}));
 };
 const windowIndex=renderContractCases().findIndex(entry=>entry.property==="window_open_duration");
 const holdFrames=new Map<number,Buffer>();
 const captureHold=async(frame:number,rendering=true)=>{
   await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"TailHoldMotionFixture",width:160,height:160,fps:30,durationInFrames:45,rendering,inputProps:{sourceVideo}});
   await page.evaluate(frame=>window.__dreamcutRender!.frame(frame),frame);
   return pixels(await page.locator("#dreamcut-render-surface").screenshot({path:path.join(output,`tail-hold-${frame}-${rendering}.png`)}));
 };
 for(const frame of [15,22,30,44]) {
   const exact=await captureHold(frame);holdFrames.set(frame,exact);
   assert.ok(difference(exact,await captureHold(frame,false)).mean<=.5,`Held-source preview parity at ${frame}`);
 }
 assert.ok(difference(holdFrames.get(15)!,holdFrames.get(30)!).changed>1000,"Source hold froze opacity/motion instead of just picture");
 assert.ok(difference(holdFrames.get(22)!,holdFrames.get(30)!).changed>1000,"Source hold does not animate between endpoints");
 assert.equal(difference(holdFrames.get(30)!,holdFrames.get(44)!).changed,0,"Held source does not settle");
 for(const frame of [44,15,30,22]) assert.equal(difference(holdFrames.get(frame)!,await captureHold(frame)).changed,0,`Held-source seek drift at ${frame}`);
 const holdVideo=path.join(output,"tail-hold-motion.mp4");
 await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:holdVideo,width:160,height:160,fps:30,durationInFrames:45,fixtureId:"TailHoldMotionFixture",inputProps:{sourceVideo},concurrency:2});
 await runMediaProcess("ffmpeg",["-v","error","-y","-i",holdVideo,"-vsync","0",path.join(output,"tail-hold-motion-%03d.png")]);
 for(const [frame,expected] of holdFrames) assert.ok(difference(expected,await pixels(path.join(output,`tail-hold-motion-${String(frame+1).padStart(3,"0")}.png`))).mean<8,`Encoded held-source frame ${frame} differs`);
 fs.writeFileSync(path.join(output,"tail-hold-motion-proof.json"),JSON.stringify({sampledFrames:[...holdFrames.keys()],previewParity:true,repeatable:true,encodedParity:true}));
 console.log("PASS source-tail hold: effect clock, preview, seek and encoded parity");
 const windowSamples=new Map<number,Buffer>();
 for(const frame of [0,3,15,30,59,60]) {
   const exact=await capture(windowIndex,1,true,frame),preview=await capture(windowIndex,1,false,frame);
   assert.ok(difference(exact,preview).mean<=.5,`Window preview/export mismatch at ${frame}`);
   windowSamples.set(frame,exact);
 }
 assert.equal(difference(await capture(windowIndex,0,true,0),windowSamples.get(0)!).changed,0,"Window leaks at frame zero");
 assert.ok(difference(windowSamples.get(0)!,windowSamples.get(3)!).changed>0,"Window does not begin opening");
 assert.ok(difference(windowSamples.get(30)!,windowSamples.get(60)!).changed>100,"Window does not finish opening");
 for(const frame of [60,3,30,0,59,15,30]) assert.equal(difference(windowSamples.get(frame)!,await capture(windowIndex,1,true,frame)).changed,0,`Window seek is not repeatable at ${frame}`);
 const windowVideo=path.join(output,"window-opening.mp4");
 await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:windowVideo,width:160,height:160,fps:30,durationInFrames:61,fixtureId:"EffectControlFixture",inputProps:{caseIndex:windowIndex,variant:1,sourceVideo},concurrency:2});
 await runMediaProcess("ffmpeg",["-v","error","-y","-i",windowVideo,"-vsync","0",path.join(output,"window-opening-%03d.png")]);
 const windowProbe=JSON.parse(await runMediaProcess("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=nb_frames","-of","json",windowVideo]));
 assert.equal(Number(windowProbe.streams[0].nb_frames),61);
 const windowDeltas=[];
 for(const [frame,expected] of windowSamples){const delta=difference(expected,await pixels(path.join(output,`window-opening-${String(frame+1).padStart(3,"0")}.png`)));assert.ok(delta.mean<8,`Encoded window frame ${frame} differs`);windowDeltas.push(delta.mean);}
 windowOpeningProof={sampledFrames:[...windowSamples.keys()],repeatable:true,startsClosed:true,previewParity:true,encodedFrames:61,encodedMaxMeanDelta:Math.max(...windowDeltas)};
 for(const [index,entry] of renderContractCases().entries()){
   const baseline=await capture(index,0),effect=await capture(index,1),reset=await capture(index,2),preview=await capture(index,1,false);
   const delta=difference(baseline,effect),restored=difference(baseline,reset),parity=difference(effect,preview);
   assert.ok(delta.changed>=entry.minimumChangedPixels,`${entry.property} has no observable effect (${delta.changed})`);
   assert.equal(restored.changed,0,`${entry.property} reset is not deterministic`);
   assert.ok(parity.mean<=.5,`${entry.property} preview/export differs: ${JSON.stringify(parity)}`);
   expected.push(baseline,effect,reset);results.push({property:entry.property,delta,reset:restored,preview:parity});
   console.log(`PASS ${entry.property}: ${delta.changed} changed pixels; preview delta ${parity.mean.toFixed(3)}`);
 }
 // The waveform borrows the decoded source and the same browser SVG grade.
 // Prove that Canvas2D url filters match displayed opaque pixels, not raw media.

 for(const field of ["grade_exposure_ev","grade_highlights","grade_blacks"]){
   const index=renderContractCases().findIndex(entry=>entry.property===field);
   const displayed=await capture(index,1,false);
   const sampled=await page.evaluate(()=>{
     const actor=document.querySelector('[data-timeline-element-id="contract-subject"]')!;
     const source=actor.querySelector('img')!;
     const filter=(actor.querySelector('[data-color-grade-filter]') as HTMLElement).dataset.colorGradeFilter!;
     const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
     const ctx=canvas.getContext('2d')!;ctx.filter=`url(#${filter})`;ctx.drawImage(source,0,0,160,160);
     return Array.from(ctx.getImageData(0,0,160,160).data);
   });
   let maximum=0,total=0,count=0;
   for(let i=0;i<sampled.length;i+=4) if(sampled[i+3]===255) for(let channel=0;channel<3;channel++) {const delta=Math.abs(sampled[i+channel]!-displayed[i+channel]!);maximum=Math.max(maximum,delta);total+=delta;count++;}
   assert.ok(count>100, "Waveform proof had no opaque samples");
   assert.ok(maximum<=3,`Waveform ${field} disagrees with graded pixels: ${maximum}`);
   scopeProof.push({field,maximum,mean:total/count});
 }
 // Variable-rate video seeks must present the expected decoded source frame.
 const vfrPath=path.join(output,"vfr.mp4");
 await runMediaProcess("ffmpeg",["-v","error","-y","-f","lavfi","-i","testsrc2=size=160x160:rate=10:duration=2","-vf","setpts=if(lt(N\\,10)\\,N/10/TB\\,(1+(N-10)/5)/TB)","-fps_mode","vfr","-c:v","libx264","-pix_fmt","yuv420p",vfrPath]);
 const vfr=sourceUrl(vfrPath);
 await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"MediaClockFixture",width:160,height:160,fps:50,durationInFrames:150,inputProps:{sourceVideo:vfr}});
 const timing=JSON.parse(await runMediaProcess("ffprobe",["-v","error","-select_streams","v:0","-show_entries","frame=best_effort_timestamp_time,duration_time","-of","json",vfrPath]));
 const times=timing.frames.map((entry:{best_effort_timestamp_time:string})=>Number(entry.best_effort_timestamp_time));
 await runMediaProcess("ffmpeg",["-v","error","-y","-i",vfrPath,"-fps_mode","passthrough",path.join(output,"vfr-decoded-%02d.png")]);
 const decoded=await Promise.all(times.map((_:number,index:number)=>pixels(path.join(output,`vfr-decoded-${String(index+1).padStart(2,"0")}.png`))));
 let repeated:Buffer|undefined;
 for(const frame of [16,50,50,101,56,101]){
  await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);
  const actual=await pixels(await page.locator("#dreamcut-render-surface").screenshot());
  const expectedIndex=times.findLastIndex((time:number)=>time<=frame/50);
  // Browser video color conversion differs from FFmpeg's untagged RGB conversion.
  // Identify source content across all decoded frames; color parity has separate proofs.
  const differences=decoded.map((image:Buffer,index:number)=>({index,mean:difference(actual,image).mean})).sort((a:{mean:number},b:{mean:number})=>a.mean-b.mean);
  assert.equal(differences[0].index,expectedIndex,`VFR seek ${frame/50} presented the wrong source frame`);
  assert.ok(differences[1].mean-differences[0].mean>2,"VFR fixture cannot distinguish adjacent source frames");
  if(frame===101){if(repeated)assert.equal(difference(actual,repeated).changed,0,"VFR repeated seek changed picture");repeated=actual;}
 }
 // Natural-duration loops must wrap rather than freeze, also after backward seeks.
 const durationProbe=JSON.parse(await runMediaProcess("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=duration","-of","json",vfrPath]));
 // Reordered VFR samples can extend beyond the stream's declared duration.
 // Use the full decoded presentation interval, not a metadata-truncated tail.
 const loopDuration=Math.max(Number(durationProbe.streams[0].duration),...timing.frames.map((entry:{best_effort_timestamp_time:string;duration_time?:string})=>Number(entry.best_effort_timestamp_time)+Number(entry.duration_time??0)));
 await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"MediaClockFixture",width:160,height:160,fps:50,durationInFrames:500,inputProps:{sourceVideo:vfr,loop:true}});
 // The Standard player wraps at the element's own duration. FFmpeg builds disagree on the
 // muxed tail of this VFR file (7.1 ends it at 2.7 s, the CI runner's build later), so take
 // the wrap point from the player and require it to be the clip's natural end: no earlier
 // than the last frame's start (a muxer that omits the final frame's duration ends the
 // container there; Chrome on the CI runner reports 2.7 s) and no later than one frame
 // past the probed presentation interval.
 const lastStart=Math.max(...times);
 const wrapDuration=nativeProjectId?loopDuration:await page.evaluate(()=>document.querySelector<HTMLVideoElement>("#dreamcut-render-surface video")?.duration??Number.NaN);
 assert.ok(wrapDuration>=lastStart-1e-6&&wrapDuration<=loopDuration+.21,`Loop wraps at ${wrapDuration}s, not the clip's natural end (last frame ${lastStart}s, probed end ${loopDuration}s)`);
 for(const frame of [Math.round((wrapDuration+.32)*50),Math.round((2*wrapDuration+1.12)*50),16]){
  await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);
  const actual=await pixels(await page.locator("#dreamcut-render-surface").screenshot());
  const expectedIndex=times.findLastIndex((time:number)=>time<=frame/50%wrapDuration+1e-6);
  const nearest=decoded.map((image:Buffer,index:number)=>({index,mean:difference(actual,image).mean})).sort((a:{mean:number},b:{mean:number})=>a.mean-b.mean)[0];
  assert.equal(nearest.index,expectedIndex,`Loop ${frame/50}s did not wrap to the correct source frame (wraps at ${wrapDuration}s, probed end ${loopDuration}s)`);
 }
 console.log("PASS natural-duration looping and backward seek");
 // A keyframed control must use the same timeline clock during arbitrary seeks.
 const scaleIndex=renderContractCases().findIndex(entry=>entry.property==="media_scale");
 await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"EffectControlFixture",width:160,height:160,fps:30,durationInFrames:75,inputProps:{caseIndex:scaleIndex,variant:0,animated:true}});
 const animation=[];
 for(const frame of [0,30,15,30]){await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);animation.push(await pixels(await page.locator("#dreamcut-render-surface").screenshot()));}
 assert.ok(difference(animation[0],animation[1]).changed>100,"keyframes did not animate");assert.equal(difference(animation[1],animation[3]).changed,0,"keyframes are not seek deterministic");
 // Flash/glow must interpolate visibly and retain exact identity on backward seeks.
 for(const property of ["subject_flash", "subject_glow", "subject_glow_radius"]){
  const caseIndex=renderContractCases().findIndex(entry=>entry.property===property);
  await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"EffectControlFixture",width:160,height:160,fps:30,durationInFrames:75,inputProps:{caseIndex,variant:0,animated:true,sourceVideo}});
  const samples=[];
  for(const frame of [0,30,15,30,0]){await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);samples.push(await pixels(await page.locator("#dreamcut-render-surface").screenshot()));}
  assert.ok(difference(samples[0],samples[1]).changed>100,`${property} did not animate`);
  assert.ok(difference(samples[0],samples[2]).changed>100,`${property} midpoint is unchanged`);
  assert.equal(difference(samples[1],samples[3]).changed,0,`${property} repeated seek changed`);
  assert.equal(difference(samples[0],samples[4]).changed,0,`${property} backward seek changed identity`);
 }
 await verifyLut(page);
 // Suspended texture loading and the second React renderer must settle before capture.
 await page.setViewportSize({width:320,height:180});
 await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"Title3DFixture",width:320,height:180,fps:30,durationInFrames:60,inputProps:{}});
 const title=[];
 for(const frame of [0,45,15,45]){await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);title.push(await pixels(await page.locator("#dreamcut-render-surface").screenshot({path:path.join(output,`title-${frame}.png`)})));}
 assert.ok(difference(title[0],title[1]).changed>100,"3D camera did not move");assert.equal(difference(title[1],title[3]).changed,0,"3D repeated seek is not deterministic");
 // Nested native transition knobs must change the production composite, survive
 // reset, and keep both sides deterministic at and around the cut.
 await page.setViewportSize({width:160,height:160});
 const captureSmear=async(params:Record<string,unknown>,frame:number,rendering=true)=>{
  await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId,fixtureId:"SmearTransitionFixture",width:160,height:160,fps:30,durationInFrames:90,rendering,inputProps:{params}});
  await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);
  return pixels(await page.locator("#dreamcut-render-surface").screenshot());
 };
 const neutral={smear_zoom_percent:0,smear_travel_percent:0,whip_blur_strength:0};
 const neutralPixels=await captureSmear(neutral,45);
 for(const [field,value] of Object.entries({smear_zoom_percent:35,smear_travel_percent:12,whip_blur_strength:1})){
  const changed=await captureSmear({...neutral,[field]:value},45);
  const delta=difference(neutralPixels,changed);
  assert.ok(delta.changed>100,`Native smear ${field} has no observable effect`);
  assert.equal(difference(neutralPixels,await captureSmear(neutral,45)).changed,0,`Native smear ${field} reset changed pixels`);
  smearProof.push({field,delta});
 }
 const explicit={smear_zoom_percent:35,smear_travel_percent:12,whip_blur_strength:1};
 const transitionPresets: Record<string,Record<string,unknown>> = {legacy:{},neutral,
  "whip-neutral":{motion:"travel",whip_zoom_percent:0,whip_blur_strength:.65},
  "whip-zoom":{motion:"travel",whip_zoom_percent:50,whip_blur_strength:.65}};
 const whipNeutral=await captureSmear(transitionPresets["whip-neutral"],45);
 assert.equal(difference(whipNeutral,await captureSmear({motion:"travel",whip_blur_strength:.65},45)).changed,0,"Whip default must have no zoom");
 assert.ok(difference(whipNeutral,await captureSmear(transitionPresets["whip-zoom"],45)).changed>100,"Whip zoom control must visibly change pixels");
 assert.equal(difference(whipNeutral,await captureSmear(transitionPresets["whip-neutral"],45)).changed,0,"Whip zoom reset must restore pixels");
 for(const [name,params] of Object.entries(transitionPresets)){
  const captures=[];
  for(const frame of [30,45,59,60,45,30]) captures.push(await captureSmear(params,frame));
  assert.ok(difference(captures[0],captures[1]).changed>100,"Native transition midpoint did not move");
  assert.equal(difference(captures[1],captures[4]).changed,0,"Native transition repeated seek differs");
  assert.equal(difference(captures[0],captures[5]).changed,0,"Native transition backward seek differs");
  for(const frame of [30,45,59,60]){
   const actual=await captureSmear(params,frame);
   assert.ok(difference(actual,await captureSmear(params,frame,false)).mean<=.5,"Native transition preview/export differ");
   if(name==="legacy") assert.equal(difference(actual,await captureSmear(explicit,frame)).changed,0,"Native transition legacy defaults changed");
  }
  const encodedSamples=[];
  for(let frame=30;frame<=60;frame++) encodedSamples.push(await captureSmear(params,frame));
  smearEncoded.set(name,encodedSamples);
  smearEncodedParams.set(name,params);
 }
 const transitionVideoPath=path.join(output,"transition-other.mp4");
 await runMediaProcess("ffmpeg",["-v","error","-y","-i",vfrPath,"-vf","hue=h=110,hflip","-c:v","libx264","-pix_fmt","yuv420p",transitionVideoPath]);
 const otherVideo=sourceUrl(transitionVideoPath);
 for(const type of TIMELINE_TRANSITION_TYPES){
  console.log(`Checking video transition ${type}`);
  const samples=new Map<number,Buffer>();
  const captureTransition=async(frame:number,rendering=true,decoder:string|null|undefined=nativeProjectId)=>{
   await page.evaluate(config=>window.__dreamcutRender!.load(config),{nativeProjectId:decoder??undefined,fixtureId:"TransitionVideoFixture",width:160,height:160,fps:30,durationInFrames:120,rendering,inputProps:{type,sourceVideo:vfr,otherVideo}});
   await page.evaluate(n=>window.__dreamcutRender!.frame(n),frame);return pixels(await page.locator("#dreamcut-render-surface").screenshot());
  };
  for(const frame of [29,30,45,59,60,89]){
   const exact=await captureTransition(frame);samples.set(frame,exact);
   assert.ok(difference(exact,await captureTransition(frame,false)).mean<=.5,`${type} preview/export mismatch at${frame}`);
   if(nativeProjectId)assert.ok(difference(exact,await captureTransition(frame,true,null)).mean<6,`${type} native/Standard composition mismatch at${frame}`);
  }
  assert.ok(difference(samples.get(30)!,samples.get(45)!).changed>100,`${type} transition is not visibly moving`);
  for(const frame of [59,30,89,45])assert.equal(difference(samples.get(frame)!,await captureTransition(frame)).changed,0,`${type} random seek changed the transition`);
  const video=path.join(output,`transition-${type}.mp4`);
  await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:video,width:160,height:160,fps:30,durationInFrames:120,frameRange:[29,60],fixtureId:"TransitionVideoFixture",inputProps:{type,sourceVideo:vfr,otherVideo},concurrency:2,crf:12});
  await runMediaProcess("ffmpeg",["-v","error","-y","-i",video,"-fps_mode","passthrough",path.join(output,`transition-${type}-%03d.png`)]);
  for(const frame of [29,30,45,59,60])assert.ok(difference(samples.get(frame)!,await pixels(path.join(output,`transition-${type}-${String(frame-28).padStart(3,"0")}.png`))).mean<8,`${type} encoded transition differs at${frame}`);
  transitionProof.push({type,frames:[...samples.keys()],repeatable:true,previewExport:true,encoded:true});console.log(`PASS video transition ${type}`);
 }
 assert.equal(errors.length,0,errors.join("\n"));
 }catch(error){console.error("Renderer stage failed before browser cleanup:",error);throw error;}finally{await browserServer.kill();}
 const video=path.join(output,"effects.mp4");
 await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:video,width:160,height:160,fps:30,durationInFrames:expected.length,fixtureId:"EffectControlFixture",inputProps:{sourceVideo},concurrency:2,crf:12});
 await runMediaProcess("ffmpeg",["-v","error","-y","-i",video,"-vsync","0",path.join(output,"encoded-%03d.png")]);
 const encoded=[];
 for(let frame=0;frame<expected.length;frame++){
   const delta=difference(expected[frame],await pixels(path.join(output,`encoded-${String(frame+1).padStart(3,"0")}.png`)));
   assert.ok(delta.mean<8,`Encoded frame ${frame} diverges: ${JSON.stringify(delta)}`);encoded.push(delta.mean);
 }
 for(const [name,samples] of smearEncoded){
  const video=path.join(output,`smear-${name}.mp4`);
  await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:video,width:160,height:160,fps:30,durationInFrames:90,frameRange:[30,60],fixtureId:"SmearTransitionFixture",inputProps:{params:smearEncodedParams.get(name)},concurrency:2,crf:12});
  await runMediaProcess("ffmpeg",["-v","error","-y","-i",video,"-fps_mode","passthrough",path.join(output,`smear-${name}-%03d.png`)]);
  const deltas=[];
  for(const [index,expected] of samples.entries()){
   const delta=difference(expected,await pixels(path.join(output,`smear-${name}-${String(index+1).padStart(3,"0")}.png`)));
   assert.ok(delta.mean<8,`Encoded native transition ${name} frame ${index} diverges`);deltas.push(delta.mean);
  }
  smearProof.push({preset:name,encodedFrames:samples.length,encodedMaxMeanDelta:Math.max(...deltas),repeatable:true,previewParity:true});
 }
 // Cancellation must preserve any previous delivered file and publish no partial.
 const cancelled=path.join(output,"cancelled.mp4");fs.writeFileSync(cancelled,"previous delivery");
 const controller=new AbortController();
 await assert.rejects(renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:cancelled,width:160,height:160,fps:30,durationInFrames:75,fixtureId:"EffectControlFixture",inputProps:{sourceVideo},signal:controller.signal,onProgress:()=>controller.abort()}));
 assert.equal(fs.readFileSync(cancelled,"utf8"),"previous delivery");assert.equal(fs.existsSync(`${cancelled}.partial`),false);fs.unlinkSync(cancelled);
 const missing=path.join(output,"missing.mp4");
 fs.rmSync(missing,{force:true});fs.rmSync(`${missing}.partial`,{force:true});
 await assert.rejects(renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:missing,width:160,height:160,fps:30,durationInFrames:3,fixtureId:"EffectControlFixture",inputProps:{caseIndex:renderContractCases().findIndex(entry=>entry.media==="video"),variant:1,sourceVideo:`${base}/missing-contract-source.mp4`}}));
 assert.equal(fs.existsSync(missing),false);assert.equal(fs.existsSync(`${missing}.partial`),false);
 const windowed=path.join(output,"windowed.mp4");
 await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:windowed,width:160,height:160,fps:30,durationInFrames:75,frameRange:[1,3],fixtureId:"EffectControlFixture",inputProps:{sourceVideo},concurrency:2});
 const probe=JSON.parse(await runMediaProcess("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=nb_frames","-of","json",windowed]));assert.equal(Number(probe.streams[0].nb_frames),3);
 fs.writeFileSync(path.join(output,"latest.json"),JSON.stringify({passed:true,sourceDecoder:nativeProjectId?"rust-ffmpeg":"browser",sdrDisplayTransfer:nativeProjectId?true:undefined,naturalDurationLoop:true,transitions:transitionProof,windowOpening:windowOpeningProof,nativeSmear:smearProof,waveformGradeParity:scopeProof,variableRateSourceSeeks:true,lutParity:true,keyframesRepeatable:true,cancellationPreservesDelivery:true,missingMediaFailsClosed:true,inclusiveFrameWindow:true,effectCases:results,title3d:{moving:true,repeatable:true},encodedFrames:expected.length,encodedMaxMeanDelta:Math.max(...encoded)},null,2));
 console.log(`Renderer contract PASS: ${results.length} effects, 3D, ${expected.length} encoded frames`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
