/** Real-time decoder/transport proof on synthetic media; no project mutation. */
import fs from 'node:fs';
import {hydrateCaptionFill} from '../src/lib/local-store/timeline-payload';
import sharp from 'sharp';
import {createServer} from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {runMediaProcess} from '../src/lib/render/audio-export';
import {renderBrowserVideo} from '../src/lib/render/browser-renderer';
import {resolveSpeedStepSegments,speedStepFrame} from '../src/lib/timeline/speed-steps';
import {compileProposalSpeedRamp} from '../src/lib/agent/proposal-speed-ramp';
import type {CompositionElement} from '../src/lib/render/composition-adapters';
import { readEnv } from '../src/lib/env-name';
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
const nativeExport=process.argv.includes('--native-export-only');
const nativePlayback=process.argv.includes('--native');
const nativeProjectId=nativeExport||nativePlayback?'native-audio-contract':undefined;
const gpu=process.argv.includes('--gpu');
const mixed=process.argv.includes('--mixed');
const blend=process.argv.includes('--blend');
const inverseCaption=process.argv.includes('--inverse-caption');
const slide=process.argv.includes('--slide');
const captionGeometry=process.argv.includes('--caption-geometry');
const cameraReveal=process.argv.includes('--camera-reveal');
if(cameraReveal&&(!gpu||nativeProjectId||process.argv.includes('--ramp')))throw Error('Camera reveal playback proof requires browser GPU speed-step mode');
const scorecard=process.argv.includes('--scorecard');
if(scorecard&&(!gpu||nativeProjectId))throw Error('Scorecard playback proof requires browser GPU mode');
const springCaption=process.argv.includes('--spring-caption')||captionGeometry;
if(springCaption&&(!gpu||nativeProjectId))throw Error('Spring caption playback proof requires browser GPU mode');
const transitionBlur=process.argv.includes('--transition-blur');
if(transitionBlur&&(!gpu||nativeProjectId))throw Error('Transition blur playback proof requires browser GPU mode');
const standaloneVideoFill=process.argv.includes('--video-fill-standalone');
const videoFill=process.argv.includes('--video-fill')||standaloneVideoFill;
if(videoFill&&(!gpu||nativeProjectId||process.argv.includes('--image-fill')))throw Error('Video-fill proof requires browser GPU mode without image-fill');
const imageFill=process.argv.includes('--image-fill');
if(imageFill&&(!gpu||nativeProjectId))throw Error('Image-fill playback proof requires browser GPU mode');
if(slide&&!gpu)throw Error('Slide playback proof requires GPU mode');
if(inverseCaption&&!gpu)throw Error('Inverse caption playback proof requires GPU mode');
if(blend&&!gpu)throw Error('Blend playback proof requires GPU mode');
const ramp=process.argv.includes('--ramp');
if(slide&&(nativeProjectId||ramp))throw Error('Slide playback proof requires the browser GPU speed-step fixture');
const output=path.resolve(gpu?(cameraReveal?'testing/results/playback-contract/gpu-camera-reveal':scorecard?'testing/results/playback-contract/gpu-scorecard':captionGeometry?'testing/results/playback-contract/gpu-caption-geometry':springCaption?'testing/results/playback-contract/gpu-spring-caption':transitionBlur?'testing/results/playback-contract/gpu-transition-blur':standaloneVideoFill?'testing/results/playback-contract/gpu-video-fill-standalone':videoFill?'testing/results/playback-contract/gpu-video-fill':imageFill?'testing/results/playback-contract/gpu-image-fill':slide?'testing/results/playback-contract/gpu-slide':inverseCaption?'testing/results/playback-contract/gpu-inverse':blend?'testing/results/playback-contract/gpu-blend':mixed?'testing/results/playback-contract/gpu-mixed':'testing/results/playback-contract/gpu'):(nativeExport||nativePlayback)?`testing/results/${nativePlayback?'native-playback-live':'native-playback-export'}/${ramp?'ramp':'steps'}-${mixed?'mixed':'embedded'}`:process.argv.includes('--surface')?'testing/results/playback-contract/surface':process.argv.includes('--cold-start')?'testing/results/playback-contract/cold-start':ramp?(mixed?'testing/results/playback-contract/ramp-mixed':'testing/results/playback-contract/ramp'):mixed?'testing/results/playback-contract/mixed':'testing/results/playback-contract');
let mediaServer: ReturnType<typeof createServer> | undefined;
async function verifyAudio(destination:string, duration:number){
 const decoded=path.join(output,'decoded-audio.f32');
 await runMediaProcess('ffmpeg',['-v','error','-y','-i',destination,'-vn','-ac','1','-ar','48000','-f','f32le',decoded]);
 const bytes=fs.readFileSync(decoded), samples=bytes.length/4;
 assert.ok(Math.abs(samples/48000-duration)<1/30,'Encoded audio duration differs from picture');
 const windows=[.2,1.5,2.1,2.7,4,6,7.5].filter(time=>time+.03<duration).map(time=>{
  let sum=0,peak=0;const count=1440,start=Math.round(time*48000);
  for(let i=start;i<start+count;i++){const value=bytes.readFloatLE(i*4);sum+=value*value;peak=Math.max(peak,Math.abs(value));}
  const rms=Math.sqrt(sum/count);assert.ok(rms>.001&&peak<.1,`Retimed tone missing or invalid at ${time}s: RMS ${rms}, peak ${peak}`);return {time,rms,peak};
 });
 const result={durationSeconds:samples/48000,windows};fs.writeFileSync(path.join(output,'audio-check.json'),JSON.stringify(result,null,2));return result;
}
async function main(){
 fs.mkdirSync(output,{recursive:true});
 if(process.argv.includes('--check-audio')) {await verifyAudio(path.join(output,'speed-steps.mp4'),233/30);console.log('Retimed audio checks PASS');return;}
 const source=path.join(output,'source.mp4');
 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x160:rate=30:duration=5','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=5','-c:v','libx264','-g','15','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
 const bytes=fs.readFileSync(source);
 const coldImage=await sharp({create:{width:160,height:160,channels:3,background:'#ef3020'}}).png().toBuffer();
 mediaServer=createServer(async(request,response)=>{
  if(request.url?.startsWith('/cold-')) await new Promise(resolve=>setTimeout(resolve,900));
  if(request.url?.startsWith('/cold-image')) {
   response.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});response.end(coldImage);return;
  }
  const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
  if(start>=bytes.length){response.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});response.end();return;}
  response.writeHead(range?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*',...(range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});response.end(bytes.subarray(start,end+1));
 });
 await new Promise<void>(resolve=>mediaServer!.listen(0,'127.0.0.1',resolve));
 let url=`http://127.0.0.1:${(mediaServer.address() as {port:number}).port}/source.mp4`;
 if(nativeProjectId||gpu){
  const fixtureProjectId=nativeProjectId??'gpu-audio-contract';
  const root=process.env.TIMELINE_PROJECTS_DIR;if(!root)throw Error('Native/GPU proof requires an explicit isolated project root');
  if(fs.existsSync(path.join(root,fixtureProjectId,'timeline.json')))throw Error('Refusing to overwrite media in an existing editor project');
  const target=path.join(root,fixtureProjectId,'media','source.mp4');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  url=`${base}/api/projects/${fixtureProjectId}/media/source.mp4`;
 }
 const props={source_duration_seconds:5,...(gpu?{}:{source_width:160,source_height:160}),preview_source_url:url,preview_proxy_validation:{contract:'preview-proxy-v1',url,ok:true,width:160,height:160},keyframes:{playback_rate:[{t:2,source_t:1,v:4},{t:2.25,source_t:2,v:1},{t:3.25,source_t:3,v:.25},{t:7.25,source_t:4,v:2}]}};
 let element:CompositionElement={id:'speed-proof',type:'video_clip',source_url:url,props,timeline_start:0,duration:7.75,lane_key:'visual_0',lane_index:0,volume:.2,playback_rate:.5,trim_start:0,trim_end:0,fade_in:0,fade_out:0};
 if(ramp){
  const compiled=compileProposalSpeedRamp({element_id:element.id,patch:{timeline_start:0,duration:2,trim_start:0,trim_end:1,playback_rate:1.5},props:{playback_ramp_start_rate:1.5,playback_ramp_end_rate:2.5,playback_ramp_source_duration_seconds:5}});
  const points=compiled.props!.playback_speed_steps as Array<{source_t:number;v:number}>;
  let source=0,timeline=0,rate=1.5;
  const frames=points.map(point=>{timeline+=(point.source_t-source)/rate;source=point.source_t;rate=point.v;return {t:timeline,source_t:source,v:rate};});
  element={...element,duration:2,playback_rate:1.5,trim_end:compiled.patch!.trim_end!,props:{...props,keyframes:{playback_rate:frames}}};
 }
 if(transitionBlur)element={...element,props:{...element.props,transition_blur:12,directional_blur_x:24,keyframes:{...(element.props?.keyframes as object??{}),transition_blur:[{t:0,v:0},{t:.5,v:40},{t:1,v:0},{t:2,v:20},{t:4,v:0}]}}};
 if(blend)element={...element,props:{...element.props,media_blend_mode:'difference'}};
 const elements:CompositionElement[]=mixed?[{...element,volume:0},{...element,id:'audio-proof',type:'vo_full' as const,lane_key:'audio_0'}]:[element];
 if(cameraReveal){
  const media=path.join(process.env.TIMELINE_PROJECTS_DIR!,'gpu-audio-contract','media');
  await sharp({create:{width:32,height:32,channels:3,background:'#ee2050'}}).png().toFile(path.join(media,'camera-fill.png'));
  // The reveal exercises live composition; the source-identity oracle samples
  // before/after its opaque background, while packet checks cover every live layer.
  elements.push({...element,id:'camera-reveal-proof',type:'caption_text',source_url:null,timeline_start:.4,duration:1.4,lane_key:'captions_0',props:{text:'OPEN',styleVariant:'camera_reveal',fontPreset:'display_serif',mediaFillUrls:[url.replace(/source\.mp4$/,'camera-fill.png')],cameraRevealDurationSeconds:1.1,cameraRevealBlurSamples:4}});
 }
 if(scorecard)elements.push({...element,id:'scorecard-proof',type:'caption_text',source_url:null,timeline_start:.4,duration:6,lane_key:'captions_0',props:{text:'Synthetic scores\nFirst 91 | Second 87',styleVariant:'benchmark_card',fontSizePx:18,maxWidth:.8,absX:.1,absY:.1,benchmark_winner:'Second',source_note:'Synthetic fixture',benchmarkRotationDeg:-3.5,animationInDuration:.8}});
 if(springCaption)elements.push({...element,id:'spring-caption-proof',type:'caption_text',source_url:null,timeline_start:.4,duration:6,lane_key:'captions_0',props:{text:'SPRING',fontPreset:'classic_serif',styleVariant:'bold_outline',fontSizePx:20,absX:.1,absY:.1,maxWidth:.8,animationIn:'spring_pop',animationOut:'spring_pop',animationInDuration:.6,animationOutDuration:.6}});
 if(captionGeometry)for(const [index,preset] of ['pop','rotate_in'].entries())elements.push({...elements.find(e=>e.id==='spring-caption-proof')!,id:`${preset}-caption-proof`,props:{text:preset==='pop'?'POP':'ROTATE',fontPreset:'classic_serif',styleVariant:'bold_outline',fontSizePx:16,absX:.1,absY:.4+index*.3,maxWidth:.8,animationIn:preset,animationOut:preset,animationInDuration:.6,animationOutDuration:.6}});
 if(inverseCaption)elements.push({...element,id:'inverse-caption-proof',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'INVERSE',styleVariant:'inverse',fontSizePx:14,absX:.1,absY:.1,maxWidth:.8,inverseMaskMotion:'drift',inverseMaskDriftXPercent:12,inverseMaskDriftYPercent:-12,inverseMaskSweepIntensity:.7,inverseMaskSweepCycles:2,animationIn:'fade',animationInDuration:.4,animationOut:'fade',animationOutDuration:.4}});
 if(slide){
  const silentSource=path.join(process.env.TIMELINE_PROJECTS_DIR!,'gpu-audio-contract','media','silent.mp4');
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',source,'-c:v','copy','-an',silentSource]);
  const silentUrl=url.replace(/source\.mp4$/,'silent.mp4');
  // A small independent pair preserves the base source-timestamp oracle while
  // exercising overlapping requests at a different source clock and lane.
  const first:CompositionElement={...element,id:'slide-a',source_url:silentUrl,lane_key:'visual_1',duration:3,volume:0,playback_rate:1,trim_start:1,trim_end:1,props:{...props,preview_source_url:silentUrl,preview_proxy_validation:{...props.preview_proxy_validation,url:silentUrl},runtime_source_has_audio:false,keyframes:{},media_scale:.1,media_offset_x:-.4,media_offset_y:-.4}};
  const second:CompositionElement={...first,id:'slide-b',timeline_start:3,trim_start:0,trim_end:2};
  const transition={id:'slide-join',project_id:'synthetic',from_element_id:first.id,to_element_id:second.id,type:'slide' as const,duration_seconds:.4,params:{direction:'from-right' as const,motion:'travel' as const},removed_at:null,removed_reason:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
  elements.push({...first,transition_out:transition},{...second,transition_in:transition});
 }
 if(imageFill){
  const media=path.join(process.env.TIMELINE_PROJECTS_DIR!,'gpu-audio-contract','media');
  await sharp({create:{width:32,height:32,channels:3,background:'#ee2050'}}).png().toFile(path.join(media,'fill-one.png'));
  await sharp({create:{width:32,height:32,channels:3,background:'#10dca0'}}).png().toFile(path.join(media,'fill-two.png'));
  elements.push({...element,id:'image-fill-proof',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'FILL',styleVariant:'image_fill',fontSizePx:14,absX:.1,absY:.1,maxWidth:.8,mediaFillUrls:['fill-one.png','fill-two.png'].map(name=>url.replace(/source\.mp4$/,name)),mediaFillSecondsPerImage:.5,mediaFillCrossfadeSeconds:.2,mediaFillScale:1.3,mediaFillPanPercent:20,animationIn:'handwriting',animationInDuration:.4,animationOut:'handwriting',animationOutDuration:.4}});
 }
 if(videoFill)elements.push({...element,id:'video-fill-proof',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'VIDEO',styleVariant:'image_fill',fontSizePx:14,absX:.1,absY:.1,maxWidth:.8,mediaFillVideoUrl:url,mediaFillVideoPreviewUrl:url,mediaFillVideoPlaybackRate:.5,animationIn:'handwriting',animationInDuration:.4,animationOut:'handwriting',animationOutDuration:.4}});
 if(standaloneVideoFill){
  const media=path.join(process.env.TIMELINE_PROJECTS_DIR!,'gpu-audio-contract','media');
  fs.copyFileSync(path.join(media,'source.mp4'),path.join(media,'standalone-fill.mp4'));
  const fillUrl='/api/projects/gpu-audio-contract/media/standalone-fill.mp4',actor=elements.find(e=>e.id==='video-fill-proof')!;
  actor.props={...actor.props,mediaFillVideoUrl:fillUrl,mediaFillVideoPreviewUrl:fillUrl};
  actor.props.runtime_media_fill_preview=hydrateCaptionFill(actor.props,'detail');
 }
 const surfaceProof=process.argv.includes('--surface');
 if(surfaceProof) elements.push({...element,id:'tracked-note',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'NOTE',fontSizePx:24,surface_track:{version:1,id:'playback-surface',parentId:element.id,sourceUrl:url,sourceSha256:'a'.repeat(64),width:160,height:160,referenceTime:0,visibleFrom:0,visibleTo:5,samples:Array.from({length:151},(_,i)=>({t:i/30,quad:[[.1+i/1000,.2],[.7+i/1000,.2],[.7+i/1000,.5],[.1+i/1000,.5]],visible:true,confidence:1}))}}});
 const segments=resolveSpeedStepSegments(element),durationInFrames=Math.round(segments.at(-1)!.timelineEnd*30);
 const browserServer=nativeExport?null:await chromium.launchServer({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const browser=browserServer?await chromium.connect(browserServer.wsEndpoint()):null;
 let startupMs:number|undefined;let compositorEngine:string|null=null;const cycles:unknown[]=[];const runId=new Date().toISOString().replace(/[:.]/g,'-');
 try{if(browser){
  const page=await browser.newPage();page.setDefaultTimeout(30000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  if(nativePlayback)await page.addInitScript(()=>{
   const original=CanvasRenderingContext2D.prototype.drawImage;
   (window as any).__nativeEffectDraws=0;
   CanvasRenderingContext2D.prototype.drawImage=function(...args:any[]){
    if(this.canvas.dataset.dreamcutEffectOutput==='alpha-video')(window as any).__nativeEffectDraws++;
    return (original as any).apply(this,args);
   } as typeof original;
  });
  if(gpu&&(process.argv.includes('--gpu-lifecycle')||(process.argv.includes('--gpu-device-loss')||process.argv.includes('--gpu-context-loss'))))await page.addInitScript(()=>{
   const getContext=OffscreenCanvas.prototype.getContext;
   (window as any).__gpuProofWebGL=[];
   OffscreenCanvas.prototype.getContext=function(...args:any[]){
    const context=(getContext as any).apply(this,args);
    if(context&&(args[0]==='webgl2'||args[0]==='webgl'))(window as any).__gpuProofWebGL.push(context);
    return context;
   } as typeof getContext;
   const original=GPUAdapter.prototype.requestDevice;
   (window as any).__gpuProofDevices=[];
   GPUAdapter.prototype.requestDevice=async function(...args){
    const device=await original.apply(this,args);(window as any).__gpuProofDevices.push(device);return device;
   };
  });
  await page.goto(`${base}/playback-proof`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__dreamcutPlayback)).catch(error=>{throw Error(`Playback fixture initialization failed: ${errors.join("; ")||String(error)}`);});
  if(nativePlayback){
   await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{nativeProjectId,elements,durationInFrames,mixed});
   for(const frame of [90,25,180,0]){
    await page.evaluate(f=>window.__dreamcutPlayback!.seek(f),frame);
    await page.waitForFunction(f=>{const s=window.__dreamcutPlayback!.snapshot();return s.nativeFrame===f||!!s.nativeError;},Math.min(frame,durationInFrames-1),{timeout:15000});
    const snapshot=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());assert.equal(snapshot.nativeError,null);
   }
   await new Promise(resolve=>setTimeout(resolve,100));
   const idleStart=await page.evaluate(()=>(window as any).__nativeEffectDraws);
   await new Promise(resolve=>setTimeout(resolve,250));
   assert.equal(await page.evaluate(()=>(window as any).__nativeEffectDraws),idleStart,'Settled native scenes must not redraw continuously while paused');
   assert.ok(idleStart>0,'Native source pixels must have reached their effect canvas');
   for(let cycle=0;cycle<4;cycle++){
    const transportRate=cycle===3?2:1;
    await page.evaluate(rate=>{window.__dreamcutPlayback!.rate(rate);window.__dreamcutPlayback!.seek(0);window.__dreamcutPlayback!.play();},transportRate);
    const began=Date.now(),lags:number[]=[],displayed=new Set<number>();let last=-1;
    for(;;){
     const s=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());assert.equal(s.nativeError,null);
     if(s.nativeFrame!=null){lags.push((s.frame-s.nativeFrame)/30);displayed.add(s.nativeFrame);last=s.nativeFrame;}
     if(!s.playing&&s.frame===durationInFrames-1)break;
     assert.ok(Date.now()-began<durationInFrames/30*1000+10000,'Native playback stalled');
     await new Promise(resolve=>setTimeout(resolve,16));
    }
    lags.sort((a,b)=>a-b);const result={cycle,transportRate,elapsedMs:Date.now()-began,uniquePresentedFrames:displayed.size,lastPresentedFrame:last,p95LagSeconds:lags[Math.floor(lags.length*.95)],maximumLagSeconds:lags.at(-1)};
    cycles.push(result);console.log('Native playback measurement',JSON.stringify(result));
    assert.ok(result.p95LagSeconds<=.1,'Native presentation lags transport by more than100ms');
   }
  }else{
  if(process.argv.includes('--cold-start')) {
   const coldProof=[];
   // A new paused decoder must seek its trim once metadata arrives, without
   // requiring a playhead change or Play to trigger another composition render.
   const trimmedUrl=url.replace('/source.mp4','/cold-video.mp4?paused-trim');
   const trimmed={...element,id:'paused-trim',volume:0,playback_rate:1,duration:2,trim_start:1.5,trim_end:1.5,
    source_url:trimmedUrl,props:{source_width:160,source_height:160,source_duration_seconds:5,
     preview_source_url:trimmedUrl,preview_proxy_validation:{contract:'preview-proxy-v1',url:trimmedUrl,ok:true,width:160,height:160}}};
   await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements:[trimmed],durationInFrames:60});
   await page.waitForFunction(()=>{const m=window.__dreamcutPlayback!.snapshot().media[0];return m?.ready>=2&&!m.seeking&&Math.abs(m.time-1.5)<.035;});
   const pausedTrim=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   assert.equal(pausedTrim.frame,0,'Paused metadata readiness advanced the timeline');
   coldProof.push({type:'paused-trim',state:pausedTrim});
   for(const type of ['still','video_clip','layered']) {
    const imageCase=type!=='video_clip';
    const coldUrl=url.replace('/source.mp4',imageCase?`/cold-image.png?${type}`:'/cold-video.mp4');
    const cold={...element,id:`cold-${type}`,type:imageCase?'still':'video_clip',source_url:coldUrl,volume:0,playback_rate:1,duration:2,
     props:{source_width:160,source_height:160,source_duration_seconds:5,preview_source_url:coldUrl,
      preview_proxy_validation:{contract:'preview-proxy-v1',url:coldUrl,ok:true,width:160,height:160}}};
    const coldElements=type==='layered'?[{...element,props:{...props,keyframes:undefined},playback_rate:1,duration:2},{...cold,lane_key:'visual_1',lane_index:1}]:[cold];
    await page.evaluate(config=>{window.__dreamcutPlayback!.load(config);window.__dreamcutPlayback!.play();},{elements:coldElements,durationInFrames:60});
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().waits>0);
    const held=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    assert.ok(held.frame<=1,`Cold ${type} advanced without its visual`);
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().frame>=6);
    await page.evaluate(()=>window.__dreamcutPlayback!.pause());
    const resumed=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    assert.equal(resumed.waits,resumed.resumes,`Cold ${type} did not resume`);
    const capture=await page.locator('[data-dreamcut-player]').screenshot({path:path.join(output,`cold-${type}.png`)});
    const stats=await sharp(capture).stats();
    assert.ok(stats.channels.slice(0,3).some(c=>c.mean>20),`Cold ${type} resumed with black pixels`);
    coldProof.push({type,held,resumed});
   }
   fs.writeFileSync(path.join(output,'cold-start.json'),JSON.stringify({passed:true,coldProof},null,2));
   console.log('Cold-start PASS: delayed still, silent video, and layered video hold then resume with visible pixels');
   return;
  }
  if(gpu&&(process.argv.includes('--gpu-lifecycle')||(process.argv.includes('--gpu-device-loss')||process.argv.includes('--gpu-context-loss')))) {
   const lifecycle:any[]=[];
   for(const fault of ((process.argv.includes('--gpu-device-loss')||process.argv.includes('--gpu-context-loss'))?[]:['network','codec','timeout']) as Array<'network'|'codec'|'timeout'>){
    const heldRoutes:Array<import('playwright-core').Route>=[];
    await page.route(url,async route=>{
     if(fault==='network')await route.abort('failed');
     else if(fault==='codec')await route.fulfill({status:200,contentType:'video/mp4',body:'invalid video bytes'});
     else heldRoutes.push(route);
    });
    const began=Date.now();
    await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,gpu:true});
    try{await page.waitForFunction(()=>!!window.__dreamcutPlayback!.snapshot().nativeError,undefined,{timeout:40000});}
    catch(error){
     console.error('GPU acquisition failure observation',JSON.stringify({fault,state:await page.evaluate(()=>window.__dreamcutPlayback?.snapshot()),errors}));throw error;
    }
    const failed=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    assert.equal(failed.gpuFrame,null,`${fault}: incomplete picture was published`);
    if(fault==='timeout')assert.match(failed.nativeError??'',/timed out/);
    await page.unroute(url);
    await Promise.all(heldRoutes.map(route=>route.abort().catch(()=>{})));
    await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,gpu:true});
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===0,undefined,{timeout:30000});
    const recovered=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    assert.equal(recovered.nativeError,null,'Old failure contaminated replacement session');
    lifecycle.push({fault,elapsedMs:Date.now()-began,failed,recovered});
   }
   // Destroy the actual adapter-created device, not a mocked error callback.
   await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,gpu:true});
   await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===0);
   await page.evaluate(()=>window.__dreamcutPlayback!.seek(45));
   await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===45);
   const held=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   await page.evaluate(()=>{
    const devices=(window as any).__gpuProofDevices as GPUDevice[];
    if(!devices?.length)throw Error('No actual GPU device captured');
    devices.at(-1)!.destroy();
   });
   await page.waitForFunction(()=>!!window.__dreamcutPlayback!.snapshot().nativeError);
   const lost=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   assert.match(lost.nativeError??'',/GPU|device|destroy/i);
   await page.evaluate(()=>window.__dreamcutPlayback!.seek(90));
   await page.waitForTimeout(200);
   const afterSeek=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   assert.equal(afterSeek.gpuFrame,held.gpuFrame,'Failed session submitted another picture');
   assert.equal(afterSeek.nativeError,lost.nativeError,'Late decode replaced the device-loss error');
   await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,gpu:true});
   await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===0);
   const replaced=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   assert.equal(replaced.nativeError,null);
   lifecycle.push({fault:'device-loss',held,lost,afterSeek,replaced});
   const compositor=await page.locator('[data-gpu-preview]').getAttribute('data-gpu-compositor');
   compositorEngine=compositor;
   if(readEnv("EXPECT_GPU_COMPOSITOR"))assert.equal(compositor,readEnv("EXPECT_GPU_COMPOSITOR"),'Wrong compositor under test');
   if(compositor==='canvaskit'){
    await page.evaluate(()=>window.__dreamcutPlayback!.seek(45));
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===45);
    const contextHeld=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    await page.evaluate(()=>{
     const contexts=(window as any).__gpuProofWebGL as WebGL2RenderingContext[];
     const context=contexts.findLast(context=>!context.isContextLost());
     const extension=context?.getExtension('WEBGL_lose_context');if(!extension)throw Error('Actual CanvasKit context-loss extension unavailable');
     extension.loseContext();
    });
    // Paused context loss must report without needing another frame or Play.
    await page.waitForFunction(()=>/CanvasKit GPU context lost/.test(window.__dreamcutPlayback!.snapshot().nativeError??''),undefined,{timeout:5000});
    const contextLost=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    await page.evaluate(()=>window.__dreamcutPlayback!.seek(90));await page.waitForTimeout(200);
    const contextAfterSeek=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    assert.equal(contextAfterSeek.gpuFrame,contextHeld.gpuFrame,'Lost CanvasKit context published another picture');
    assert.equal(contextAfterSeek.nativeError,contextLost.nativeError,'Late work replaced context-loss error');
    await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,gpu:true});
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===0);
    const contextReplaced=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());assert.equal(contextReplaced.nativeError,null);
    lifecycle.push({fault:'webgl-context-loss',held:contextHeld,lost:contextLost,afterSeek:contextAfterSeek,replaced:contextReplaced});
    // Fail before creating a giant GPU surface: its base reservation alone is
    // above the actual compositor budget. No altered budgets or fake callbacks.
    await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements:[],durationInFrames:30,gpu:true,width:4097,height:4097});
    await page.waitForFunction(()=>!!window.__dreamcutPlayback!.snapshot().nativeError);
    const overBudget=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());assert.match(overBudget.nativeError??'',/surface exceeds budget/);assert.equal(overBudget.gpuFrame,null);
    await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,gpu:true});
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===0);
    const budgetReplaced=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());assert.equal(budgetReplaced.nativeError,null);
    lifecycle.push({fault:'surface-budget',failed:overBudget,replaced:budgetReplaced});
   }

   for(let i=0;i<5;i++){
    await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,gpu:true});
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===0);
    await page.evaluate(()=>window.__dreamcutPlayback!.seek(45));
    await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===45);
    const state=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    assert.equal(state.nativeError,null);assert.equal(state.nodes,0);
    assert.equal(await page.locator('[data-gpu-preview]').count(),1,'GPU canvases leaked across mounts');
    lifecycle.push({mount:i,state});
   }
   fs.writeFileSync(path.join(output,'lifecycle.json'),JSON.stringify({passed:true,compositor,lifecycle,scope:'Actual GPU acquisition/device loss; CanvasKit WebGL context loss and surface budget when selected; terminal presentation and replacement mounts. Editor fallback separately verified.'},null,2));
   console.log('GPU lifecycle PASS: acquisition faults (when selected), actual device/context loss, budget failure, terminal presentation and replacement recovery');
   return;
  }
  const startupBegan=Date.now();
  await page.evaluate(config=>window.__dreamcutPlayback!.load(config),{elements,durationInFrames,mixed,gpu});
  if(cameraReveal){await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().gpuFrame===0);startupMs=Date.now()-startupBegan;}
  if(gpu){
   await page.waitForFunction(()=>{const s=window.__dreamcutPlayback!.snapshot();return s.gpuFrame===0||!!s.nativeError;},undefined,{timeout:30000});
   assert.equal((await page.evaluate(()=>window.__dreamcutPlayback!.snapshot())).nativeError,null,'GPU initialization failed');
   startupMs=Date.now()-startupBegan;
   compositorEngine=await page.locator('[data-gpu-preview]').getAttribute('data-gpu-compositor');
   if(readEnv("EXPECT_GPU_COMPOSITOR"))assert.equal(compositorEngine,readEnv("EXPECT_GPU_COMPOSITOR"),'Wrong compositor under test');
  }
  await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().media[0]?.ready>=3);
  if(process.argv.includes('--recovery')) {
   await page.evaluate(()=>window.__dreamcutPlayback!.play());
   await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().frame>=10);
   const before=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   await page.evaluate(() => { (window as unknown as {__name: (fn: unknown) => unknown}).__name = fn => fn; });
   await page.evaluate(mixed=>{
    const media=document.querySelector<HTMLMediaElement>(mixed?'audio[data-timeline-preview-audio-id="audio-proof"]':'video');
    if(!media)throw new Error('Recovery fixture active media is missing');
    const load=media.load.bind(media);
    // Fault injection: reproduce an idle metadata-only decoder. Recovery must
    // use the actual adapter, reload, restore trim and resume the real player.
    Object.defineProperty(media,'readyState',{configurable:true,get:()=>1});
    Object.defineProperty(media,'networkState',{configurable:true,get:()=>1});
    Object.defineProperty(media,'seeking',{configurable:true,get:()=>true});
    media.load=()=>{delete (media as unknown as Record<string,unknown>).readyState;delete (media as unknown as Record<string,unknown>).networkState;delete (media as unknown as Record<string,unknown>).seeking;media.load=load;load();};
   },mixed);
   await page.waitForFunction(()=>window.__dreamcutPlayback!.snapshot().waits>0);
   await page.waitForFunction(()=>{const s=window.__dreamcutPlayback!.snapshot();return s.resumes>0&&s.frame>30;},undefined,{timeout:10000});
   const after=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   await page.evaluate(()=>window.__dreamcutPlayback!.pause());
   assert.equal(after.loads,before.loads+1,'Idle recovery must reload only the stalled decoder once');
   assert.equal(after.waits,after.resumes,'Idle decoder did not release playback wait');
   const injectedEvents=after.waitEvents.slice(before.waitEvents.length);
   assert.ok(injectedEvents.some(event=>event.type==='waiting'&&event.mediaReady.some(media=>media.ready===1&&media.seeking)),'Injected stall missing from wait diagnostics');
   assert.ok(injectedEvents.some(event=>event.type==='resume'),'Recovery missing from wait diagnostics');
   assert.ok(injectedEvents.every((event,index)=>index===0||event.atMs>=injectedEvents[index-1].atMs),'Wait diagnostics must be chronological');
   assert.ok(after.media.every(m=>m.ready>=3),'Recovery resumed before playable data');
   assert.deepEqual(errors,[]);
   fs.writeFileSync(path.join(output,'recovery.json'),JSON.stringify({passed:true,mixed,before,after},null,2));
   console.log('Recovery PASS: idle decoder reloaded once, restored source position, and resumed');
   return;
  }
  for(const frame of (ramp?[50,10,30,0]:[180,25,90,0])){
   await page.evaluate(f=>window.__dreamcutPlayback!.seek(f),frame);
   const target=speedStepFrame(segments,frame,30).sourceTimeSeconds;
   try { await page.waitForFunction(t=>{const s=window.__dreamcutPlayback!.snapshot();return !s.media[0]?.seeking&&Math.abs(s.media[0]?.time-t)<.035;},target,{timeout:5000}); } catch(error) { console.error({frame,target,state:await page.evaluate(()=>window.__dreamcutPlayback!.snapshot())});throw error; }
  }
  for(let cycle=0;cycle<3;cycle++){
   const transportRate=cycle===2?2:1;
   await page.evaluate(rate=>{window.__dreamcutPlayback!.rate(rate);window.__dreamcutPlayback!.seek(0);window.__dreamcutPlayback!.play();},transportRate);
   const start=Date.now();const drifts:number[]=[],steadyDrifts:number[]=[];const samples:unknown[]=[];let maximumNodes=0,surfaceSamples=0,slideOverlapSamples=0;
   for(;;){
    const s=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
    if(gpu){
     assert.equal(s.nativeError,null,'GPU playback failed');
     const packet=s.gpuPresentation as {frame:number;textActors:string[];sourceFrames:Array<{slot:string;sourceKey:string;requestedUs:number;timestampUs:number;durationUs:number}>}|null;
     if(packet){
      const expectedText=elements.filter(actor=>actor.type==='caption_text'&&packet.frame>=Math.round(actor.timeline_start*30)&&packet.frame<Math.round((actor.timeline_start+actor.duration)*30)).map(actor=>actor.id).sort();
      assert.deepEqual([...packet.textActors].sort(),expectedText,'GPU fixture omitted a caption actor');
      const expectedSources=new Map([[element.id,Math.round(speedStepFrame(segments,packet.frame,30).sourceTimeSeconds*1e6)]]);
      if(standaloneVideoFill)assert.notEqual(packet.sourceFrames.find(source=>source.slot===element.id)?.sourceKey,packet.sourceFrames.find(source=>source.slot==='video-fill-proof')?.sourceKey,'Standalone fill reused the picture source identity');
      if(videoFill)expectedSources.set('video-fill-proof',Math.round(packet.frame/30*.5*1e6));
      if(slide){
       if(packet.frame<90)expectedSources.set('slide-a',Math.round((1+packet.frame/30)*1e6));
       else if(packet.frame<180)expectedSources.set('slide-b',Math.round((packet.frame-90)/30*1e6));
       if(packet.frame>=78&&packet.frame<90){expectedSources.set('@gpu-transition:slide-join',0);slideOverlapSamples++;}
      }
      assert.deepEqual(packet.sourceFrames.map(source=>source.slot).sort(),[...expectedSources.keys()].sort(),'GPU packet omitted or added a source');
      for(const source of packet.sourceFrames){const expected=expectedSources.get(source.slot)!;assert.equal(source.requestedUs,expected);assert.ok(source.timestampUs<=expected&&expected<source.timestampUs+source.durationUs,'GPU source timestamp mismatch');}
     }
    }
    if(surfaceProof){
     const pair=await page.evaluate(()=>({picture:document.querySelector<HTMLElement>('canvas[data-presented-source-time]')?.dataset.presentedSourceTime,text:document.querySelector<HTMLElement>('[data-tracked-surface]')?.dataset.presentedSourceTime}));
     if(pair.picture!=null){assert.equal(pair.text,pair.picture,'Text moved independently of the presented video frame');surfaceSamples++;}
    }
    maximumNodes=Math.max(maximumNodes,s.nodes);
    if(s.media[0]&&s.frame>0){
     const expected=speedStepFrame(segments,s.frame,30);const drift=Math.abs(s.media[0].time-expected.sourceTimeSeconds)/expected.playbackRate;drifts.push(drift);if(drift>.1)samples.push({...s,expected,drift});
     // At a speed-step boundary the transport changes rate one sample before the media
     // element does; on a slow runner that race reads as one large sample (0.31 s in CI).
     // The maximum guards sustained desync away from boundaries; p95 still covers every sample.
     if(!segments.some(segment=>Math.abs(s.frame/30-segment.timelineStart)<.1))steadyDrifts.push(drift);
    }
    if(!s.playing&&s.frame===durationInFrames-1&&(!gpu||s.gpuFrame===durationInFrames-1)) break;
    assert.ok(Date.now()-start<11000,'Playback stalled or failed to finish');
    await new Promise(resolve=>setTimeout(resolve,33));
   }
   drifts.sort((a,b)=>a-b);steadyDrifts.sort((a,b)=>a-b);const state=await page.evaluate(()=>window.__dreamcutPlayback!.snapshot());
   if(slide)assert.ok(slideOverlapSamples>0,'No slide overlap was observed during playback');
   if(surfaceProof) assert.ok(surfaceSamples>20,'Insufficient moving surface playback samples');
   const result={transportRate,samples:samples.slice(0,12),surfaceSamples,slideOverlapSamples,cycle,elapsedMs:Date.now()-start,maximumNodes,p95DriftSeconds:drifts[Math.floor(drifts.length*.95)],maxDriftSeconds:drifts.at(-1),maxSteadyDriftSeconds:steadyDrifts.at(-1)??0,...state};
   cycles.push(result);
   assert.equal(maximumNodes,gpu?0:1,'A speed boundary mounted extra HTML video decoders');
   assert.equal(state.loads,mixed?2:1,'The source reloaded during rate changes or replay');
   assert.ok(result.p95DriftSeconds<.1,JSON.stringify(result));
   assert.ok(result.maxSteadyDriftSeconds<.25,JSON.stringify(result));
   assert.ok(state.media.every(media=>media.seeks<20),'Corrective-seek storm on a decoder');
   if(transportRate===2) assert.ok(result.elapsedMs<6000,'2x transport did not accelerate playback');
   assert.equal(state.waits,state.resumes,'Player did not recover from buffering');
  }
  assert.deepEqual(errors,[]);
  }
 }}finally{await browserServer?.kill();const receipt=JSON.stringify({fixtureContract:'playback-actors-v2',runId,ramp,gpu,blend,inverseCaption,slide,transitionBlur,springCaption,captionGeometry,scorecard,cameraReveal,startupMs,compositorEngine,imageFill,videoFill,standaloneVideoFill,cycles},null,2);fs.writeFileSync(path.join(output,'attempt.json'),receipt);fs.writeFileSync(path.join(output,`attempt-${runId}.json`),receipt);}
 const destination=path.join(output,'speed-steps.mp4');
 await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:destination,width:160,height:160,fps:30,durationInFrames,inputProps:{elements,laneOrderKeys:mixed?['visual_0','audio_0']:['visual_0']},concurrency:1});
 const probe=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-show_streams','-of','json',destination]));
 assert.equal(Number(probe.streams.find((s:any)=>s.codec_type==='video').nb_frames),durationInFrames);
 assert.ok(probe.streams.some((s:any)=>s.codec_type==='audio'),'Retimed audio missing from export');
 // Identify decoded source timestamps independently of the renderer time map.
 // Compare all source frames: browser color conversion makes RGB absolute error
 // unsuitable for timestamp identity on this highly saturated test pattern.
 await runMediaProcess('ffmpeg',['-v','error','-y','-i',source,'-fps_mode','passthrough',path.join(output,'source-%03d.png')]);
 const references=await Promise.all(Array.from({length:150},(_,i)=>sharp(path.join(output,`source-${String(i+1).padStart(3,'0')}.png`)).removeAlpha().raw().toBuffer()));
 const audioChecks=await verifyAudio(destination,durationInFrames/30);
 const audioActorChecks: Array<{type:string;lane:string;pcmBytes:number;matchesNarration:boolean}>=[];
 if(nativeProjectId&&mixed){
  let narration:Buffer|undefined;
  for(const [type,lane] of [['vo_full','audio_0'],['vo_segment','audio_0'],['music','music_0'],['sound_effect','sound_effect_0']] as const){
   const pcm=path.join(output,`actor-${type}.f32`);
   const actor={...element,id:`actor-${type}`,type,lane_key:lane};
   await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:pcm,width:160,height:160,fps:30,durationInFrames,inputProps:{elements:[actor],laneOrderKeys:[lane]},audioOnly:true,concurrency:1});
   const bytes=fs.readFileSync(pcm);
   assert.equal(bytes.length,Math.round(durationInFrames/30*48000)*2*4,`${type} audio duration differs`);
   assert.ok(bytes.some(value=>value!==0),`${type} is silent`);
   if(narration)assert.deepEqual(bytes,narration,`${type} changed authored retiming/gain compared with narration`);
   else narration=bytes;
   audioActorChecks.push({type,lane,pcmBytes:bytes.length,matchesNarration:true});
  }
 }
 const frameChecks=[];
 for(const frame of (ramp?[0,1,14,15,29,30,44,45,58,59]:[0,59,60,67,68,97,98,150,217,218,232])){
  const target=speedStepFrame(segments,frame,30).sourceTimeSeconds;
  const expectedFrame=Math.min(149,Math.floor(target*30+1e-6));
  const actual=path.join(output,`encoded-${frame}.png`);
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',destination,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1',actual]);
  const a=await sharp(actual).removeAlpha().raw().toBuffer();
  const matches=references.map((b,index)=>{assert.equal(a.length,b.length);return {index,mean:a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length};}).sort((a,b)=>a.mean-b.mean);
  frameChecks.push({frame,expectedFrame,matchedFrame:matches[0].index,mean:matches[0].mean,margin:matches[1].mean-matches[0].mean});
  assert.equal(matches[0].index,expectedFrame,`Encoded source timestamp mismatch: ${JSON.stringify(frameChecks.at(-1))}`);
  assert.ok(matches[1].mean-matches[0].mean>.1,'Source fixture cannot distinguish neighboring frames');
 }
 fs.writeFileSync(path.join(output,'latest.json'),JSON.stringify({fixtureContract:'playback-actors-v2',passed:true,blend,inverseCaption,slide,transitionBlur,springCaption,captionGeometry,scorecard,cameraReveal,startupMs,compositorEngine,imageFill,videoFill,standaloneVideoFill,previewRenderer:gpu?'browser-gpu':'standard',sourceDecoder:nativeProjectId?"rust-ffmpeg":"browser",realTimePlaybackVerified:!nativeExport,audioChecks,audioActorChecks,frameChecks,rates:[.5,4,1,.25,2],cycles,durationInFrames,probe},null,2));
 console.log(nativeExport?'Native export contract PASS: retimed source-frame identity and authored audio; real-time playback not exercised':nativePlayback?'Native playback PASS: complete scene presentation, random seeks, three replays, measured lag and retimed audio/video export':'Playback contract PASS: persistent decoder, random seeks, three real-time runs, bounded drift, retimed audio/video export');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>mediaServer?.close());
