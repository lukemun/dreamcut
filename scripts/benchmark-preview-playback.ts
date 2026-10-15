/** Read-only real-editor trials. Browser preferences are isolated; disk caches are retained. */
import {build} from 'esbuild';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {resolveLocalMediaSource,mediaFileSha256} from '../src/lib/local-store/audio-effects';
import {chromium,type Page} from 'playwright-core';import {projectDir} from '../src/lib/local-store/paths';
import {gpuTimelineCapabilityInventory} from '../src/lib/gpu-preview/capability-inventory';
import {gpuCompositorEngine} from '../src/lib/gpu-preview/compositor-engine';
import type {TimelineElement,TimelineTransition} from '../src/components/studio/timeline/types';
import { readEnv } from '../src/lib/env-name';
const [project,engine='standard',mode='selective',inventoryFlag,...extra]=process.argv.slice(2);
const inventoryOnly=inventoryFlag==='--inventory-only';
const runs=Number(readEnv("BENCHMARK_RUNS")??5),warmRuns=Number(readEnv("BENCHMARK_WARM_RUNS")??20);
const compositorEngine=readEnv("EXPECT_GPU_COMPOSITOR")??gpuCompositorEngine(process.env.NEXT_PUBLIC_DREAMCUT_GPU_COMPOSITOR ?? process.env.NEXT_PUBLIC_OPENEDIT_GPU_COMPOSITOR);
if(!['webgpu','canvaskit'].includes(compositorEngine))throw Error('Unknown expected GPU compositor');
const captureSeekTrace=readEnv("BENCHMARK_SEEK_TRACE")==='1';
const decodeAblation=readEnv("BENCHMARK_DECODE_ABLATION")==='1';
const cpuSeekIndex=Number(readEnv("BENCHMARK_CPU_SEEK_INDEX")??0);
if(!Number.isSafeInteger(cpuSeekIndex)||cpuSeekIndex<0||cpuSeekIndex>=Math.max(1,warmRuns))throw Error('CPU seek index must name a warm interaction');
const captureCpuProfile=readEnv("BENCHMARK_CPU_PROFILE")==='1';
if(!Number.isInteger(runs)||runs<1||runs>10||!Number.isInteger(warmRuns)||warmRuns<0||warmRuns>50)throw Error('Use 1–10 cold runs and 0–50 warm interactions');
if(!project||!/^[a-zA-Z0-9_-]+$/.test(project)||!['standard','rust'].includes(engine)||!['live','prepared','rolling','selective','gpu'].includes(mode)||(inventoryFlag&&!inventoryOnly)||extra.length)throw Error('Usage: benchmark-preview-playback <project> [standard|rust] [live|prepared|rolling|selective|gpu] [--inventory-only]');
if(decodeAblation&&(mode!=='gpu'||warmRuns<1))throw Error('Decoder ablation requires GPU mode and warm seeks');
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3143';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local editor required');
const out=path.resolve('private/integration-review/playback-strategies');fs.mkdirSync(out,{recursive:true});
const timelineFile=path.join(projectDir(project),'timeline.json'),hash=()=>createHash('sha256').update(fs.readFileSync(timelineFile)).digest('hex');
const report:any={schema:2,project,engine,mode,started:new Date().toISOString(),machine:os.cpus()[0].model,ram:os.totalmem(),timelineHash:hash(),cache:'Fresh Chrome process/context per cold trial. Proxy and server prepared caches retained, job cache state recorded. Warm interactions follow one full playback in the same page.',memoryMeasurement:'Owned encoded image cache, decoded/text frames, upload canvases, uniforms and GPU target payloads, plus conservative encoded-source cache reservations; excludes decoder/driver overhead, demux metadata and swapchain. CDP heap is separate.',measurement:'GPU complete-frame submission and visible-video requestVideoFrameCallback observations; not physical display presentation. Direct/Smart source identity is observed, not certified atomic.',runs:[],warm:[]};
const file=path.join(out,`ui-${project}-${engine}-${mode}-${Date.now()}.json`),save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));save();
async function proxySnapshot(){
 const response=await fetch(`${base}/api/projects/${project}/timeline`);if(!response.ok)throw Error('Cannot read benchmark source bindings');
 const body=await response.json() as {elements:Array<{props?:Record<string,any>}>};
 const proofs=new Map<string,Record<string,any>>();
 for(const element of body.elements){
  const proof=element.props?.preview_proxy_validation;if(proof?.ok&&typeof proof.url==='string')proofs.set(proof.url,proof);
  const still=element.props?.runtime_still_preview;if(still&&typeof still.url==='string')proofs.set(still.url,still);
 }
 return [...proofs].sort(([a],[b])=>a.localeCompare(b)).map(([url,proof])=>{const local=resolveLocalMediaSource(project,url,{allowReferencedProject:true});if(!local)throw Error('Benchmark proxy is not a resolvable local file');return {url,sha256:mediaFileSha256(local.absolutePath),width:proof.width,height:proof.height,quality:proof.quality};});
}
async function installObserver(page:Page){await page.evaluate(()=>{
 const state={rows:[] as any[],videos:new Map<HTMLVideoElement,{pts:number;at:number;frames:number}>(),canvases:new Map<HTMLCanvasElement,{at:number;frames:number}>(),last:'',click:0,seek:0};(window as any).__previewBench=state;
 document.addEventListener('click',event=>{if((event.target as Element).closest('[aria-label="Play preview"]'))state.click=performance.now();},true);
 document.addEventListener('input',event=>{if((event.target as Element).matches('[aria-label="Seek preview"]'))state.seek=performance.now();},true);
 const watch=()=>{
  const root=document.querySelector('[data-dreamcut-player]');
  for(const video of root?.querySelectorAll('video')??[]){if(state.videos.has(video))continue;const info={pts:-1,at:0,frames:0};state.videos.set(video,info);const next=(_:number,meta:VideoFrameCallbackMetadata)=>{info.pts=meta.mediaTime;info.at=performance.now();info.frames=meta.presentedFrames;if(video.isConnected)video.requestVideoFrameCallback(next);};video.requestVideoFrameCallback(next);}
  const slider=root?.querySelector('[aria-label="Seek preview"]') as HTMLInputElement|null,gpu=root?.querySelector('[data-gpu-preview]') as HTMLElement|null;
  const visible=[...state.videos].filter(([video])=>video.isConnected&&video.checkVisibility({opacityProperty:true,visibilityProperty:true})).map(([v,info])=>({src:v.currentSrc,time:v.currentTime,pts:info.pts,at:info.at,seeking:v.seeking,ready:v.readyState,decoded:info.frames,width:v.videoWidth,height:v.videoHeight}));
  // Standard preview hides its decoder and presents an AlphaVideo canvas.
  // Observe that owner's painted-source timestamp, not the hidden video element.
  for(const canvas of root?.querySelectorAll<HTMLCanvasElement>('[data-dreamcut-effect-output="alpha-video"]')??[]){
   let info=state.canvases.get(canvas);
   if(!info){info={at:0,frames:0};state.canvases.set(canvas,info);const owned=info;new MutationObserver(()=>{owned.at=performance.now();owned.frames++;}).observe(canvas,{attributes:true,attributeFilter:['data-presented-source-time']});}
   if(!canvas.checkVisibility({opacityProperty:true,visibilityProperty:true}))continue;
   const video=canvas.parentElement?.querySelector('video');if(!video||!canvas.dataset.presentedSourceTime)continue;
   visible.push({src:video.currentSrc,time:video.currentTime,pts:Number(canvas.dataset.presentedSourceTime),at:info.at,seeking:video.seeking,ready:video.readyState,decoded:info.frames,width:video.videoWidth,height:video.videoHeight});
  }
  const row={at:performance.now(),frame:Number(slider?.value??0),playing:root?.getAttribute('data-playing'),gpuFrame:gpu?Number(gpu.dataset.gpuPreviewFrame??-1):null,gpu:gpu?.dataset.gpuPresentation?JSON.parse(gpu.dataset.gpuPresentation):null,prefetch:gpu?.dataset.gpuPrefetch?JSON.parse(gpu.dataset.gpuPrefetch):null,cacheBytes:Number(gpu?.dataset.gpuCacheBytes??0),visible};
  const key=JSON.stringify([row.frame,row.gpuFrame,visible.map(v=>[v.src,v.pts,v.seeking,v.ready])]);if(key!==state.last){state.last=key;state.rows.push(row);}
  if(state.rows.length>30000)state.rows.shift();requestAnimationFrame(watch);
 };requestAnimationFrame(watch);
});}
async function pause(page:Page){await page.evaluate(()=>{const button=document.querySelector<HTMLButtonElement>('[aria-label="Pause preview"]');button?.click();});}
async function seek(page:Page,target:number){
 await pause(page);await page.getByRole('slider',{name:'Seek preview',exact:true}).fill(String(target));
 await page.waitForFunction(({target,mode})=>{
  const state=(window as any).__previewBench,row=state.rows.at(-1);if(!row||row.frame!==target||row.at<state.seek)return false;
  return mode==='gpu'?row.gpuFrame===target:row.visible.length>0&&row.visible.every((v:any)=>v.ready>=2&&!v.seeking&&v.at>=state.seek);
 },{target,mode},{timeout:30000});
 return page.evaluate(()=>{const state=(window as any).__previewBench;return {requested:state.seek,ready:performance.now(),observed:state.rows.at(-1).at,row:state.rows.at(-1)};});
}
async function firstMotion(page:Page){
 await page.waitForFunction(mode=>{const state=(window as any).__previewBench;return state.rows.some((r:any)=>r.at>=state.click&&r.frame>0&&(mode==='gpu'?r.gpuFrame>0:r.visible.some((v:any)=>v.at>=state.click&&v.pts>0)));},mode,{timeout:180000});
 return page.evaluate(mode=>{const state=(window as any).__previewBench;const row=state.rows.find((r:any)=>r.at>=state.click&&r.frame>0&&(mode==='gpu'?r.gpuFrame>0:r.visible.some((v:any)=>v.at>=state.click&&v.pts>0)));return {click:state.click,at:row.at,ms:row.at-state.click};},mode);
}
async function main(){try{
 const response=await fetch(`${base}/api/projects/${project}/timeline`);
 if(!response.ok)throw Error('Cannot read benchmark capability inventory');
 const timeline=await response.json() as {elements:TimelineElement[];transitions?:TimelineTransition[]};
 const durationSeconds=Math.max(0,...timeline.elements.map(element=>element.timeline_start+element.duration));
 const playbackTimeoutMs=Math.max(180000,Math.ceil(durationSeconds*1500+30000));
 report.durationSeconds=durationSeconds;report.playbackTimeoutMs=playbackTimeoutMs;
 report.capabilityInventory=gpuTimelineCapabilityInventory(timeline.elements,timeline.transitions??[],'benchmark-inventory',new Set(),compositorEngine as 'webgpu'|'canvaskit');
 report.inventoryScope='Saved working cut with production transition/outline projection. Browser runtime source selection and proposal previews are verified separately; admission is not visual conformance.';
 save();
 if(inventoryOnly){console.log(JSON.stringify({actorCount:report.capabilityInventory.actorCount,issueCount:report.capabilityInventory.issueCount,counts:report.capabilityInventory.counts,transitionCounts:report.capabilityInventory.transitionCounts}));return;}
 report.proxiesBefore=await proxySnapshot();save();for(let run=0;run<runs;run++){
 const server=await chromium.launchServer({channel:'chrome',headless:true,args:['--force-color-profile=srgb','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--mute-audio']});
 const browser=await chromium.connect(server.wsEndpoint());let page:Page|undefined;const result:any={run,requests:[],errors:[]};report.runs.push(result);save();
 try{
  const context=await browser.newContext({viewport:{width:1400,height:900}});await context.addInitScript('globalThis.__name = (value) => value');await context.addInitScript(({engine,mode})=>{localStorage.setItem('dreamcut.playback-engine',engine);localStorage.setItem('dreamcut.preview-preparation',mode);},{engine,mode});
  page=await context.newPage();const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  page.on('pageerror',error=>result.errors.push(error.message));page.on('response',response=>{if(response.request().method()==='POST'&&response.url().includes('/prepared-preview'))void response.json().then(body=>result.requests.push({state:body.state,id:body.id,backend:response.request().postDataJSON()?.input?.backend})).catch(()=>{});});
  result.phase='navigation';save();
  const began=performance.now();await page.goto(`${base}/p/${project}`,{waitUntil:'domcontentloaded'});await installObserver(page);
  result.phase='preview-readiness';save();
  const play=page.getByRole('button',{name:'Play preview',exact:true});await play.waitFor({timeout:45000});await page.waitForFunction(()=>!(document.querySelector('[aria-label="Play preview"]') as HTMLButtonElement)?.disabled,undefined,{timeout:180000});
  result.readyButtonMs=performance.now()-began;result.browser=browser.version();
  result.serverQualityBefore=await page.evaluate(async()=>{const response=await fetch('/api/preview-settings');if(!response.ok)throw Error('Cannot read preview quality');return (await response.json()).quality;});
  if(mode==='gpu'&&!await page.locator('[data-gpu-preview]').count())throw Error('GPU mode fell back; exclude this trial from GPU measurements');
  if(mode==='gpu'){result.compositorEngine=await page.locator('[data-gpu-preview]').getAttribute('data-gpu-compositor');if(result.compositorEngine!==compositorEngine)throw Error('Unexpected GPU compositor: '+result.compositorEngine);}
  result.cpuProfileDiagnostic=captureCpuProfile;result.seekTraceDiagnostic=captureSeekTrace;
  if(captureCpuProfile){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
  result.phase="first-motion";save();await play.click();const motion=await firstMotion(page);result.firstMotion=motion;result.navigationToMotionMs=performance.now()-began;
  if(captureCpuProfile){const {profile}=await cdp.send('Profiler.stop');const profilePath=file+`.${run}.startup.cpuprofile`;fs.writeFileSync(profilePath,JSON.stringify(profile));result.startupCpuProfile=profilePath;result.performanceCaveat='CPU profiling can perturb startup and seek timing; diagnostic run is not performance acceptance.';}
  result.phase="playback-completion";save();await page.waitForFunction(mode=>{const slider=document.querySelector('[aria-label="Seek preview"]') as HTMLInputElement,gpu=document.querySelector('[data-gpu-preview]') as HTMLElement|null;return mode==='gpu'&&!gpu||Number(slider.value)===Number(slider.max)&&(mode!=='gpu'||Number(gpu?.dataset.gpuPreviewFrame)===Number(slider.max));},mode,{timeout:playbackTimeoutMs});await pause(page);
  if(mode==='gpu'&&!await page.locator('[data-gpu-preview]').count())throw Error('GPU fell back during playback');
  const trace=await page.evaluate(click=>{const s=(window as any).__previewBench;return s.rows.filter((r:any)=>r.at>=click);},motion.click);
  if(trace.length<2)throw Error('No playback observations captured');
  if(mode==='gpu'&&trace.some((r:any)=>r.gpuFrame===null))throw Error('GPU fell back during playback');result.trace=trace;result.endMs=trace.at(-1)?.at-motion.click;
  result.maxCacheBytes=Math.max(0,...trace.map((r:any)=>r.cacheBytes));
  result.identityErrors=trace.flatMap((r:any)=>r.gpu?.sourceFrames??[]).filter((s:any)=>s.requestedUs<s.timestampUs||s.requestedUs>=s.timestampUs+s.durationUs);
  if(result.identityErrors.length)throw Error('GPU submitted source intervals do not cover their requested time');
  const changed=trace.filter((r:any,i:number)=>i===0||(mode==='gpu'?r.gpuFrame!==trace[i-1].gpuFrame:r.frame!==trace[i-1].frame));result.gapsMs=changed.slice(1).map((r:any,i:number)=>r.at-changed[i].at);result.stalls=result.gapsMs.filter((n:number)=>n>250);
  result.playbackStallsMs=changed.slice(1).flatMap((row:any,index:number)=>changed[index].at>=motion.at&&row.at-changed[index].at>250?[row.at-changed[index].at]:[]);
  result.stallScope='stalls includes startup; playbackStallsMs counts gaps only after first motion';
  const timings=trace.filter((r:any)=>r.gpu).map((r:any)=>r.gpu.totalMs).sort((a:number,b:number)=>a-b);result.gpuProcessing=timings.length?{p95Ms:timings[Math.ceil(timings.length*.95)-1],maxMs:timings.at(-1),overFrameBudget:timings.filter((n:number)=>n>1000/30).length,samples:timings.length}:null;
  result.metrics=await cdp.send('Performance.getMetrics');save();console.log(JSON.stringify({run,mode,first:motion.ms,total:result.endMs,stalls:result.stalls,cache:result.maxCacheBytes}));
  // Inspect current server-owned quality without changing it.
  await page.getByRole('button',{name:'Preview & export settings',exact:true}).click();await page.getByRole('combobox',{name:'Preview renderer',exact:true}).waitFor();result.selectedRenderer=await page.getByRole('combobox',{name:'Preview renderer',exact:true}).inputValue();if(mode==='gpu'&&result.selectedRenderer!=='gpu')throw Error('Selected renderer changed during GPU benchmark');result.settings=await page.locator('[role="dialog"][aria-label="Preview & export settings"]').innerText();await page.waitForFunction(expected=>(document.querySelector('[aria-label="Preview quality"]') as HTMLSelectElement|null)?.value===expected || [...document.querySelectorAll('select')].some(select=>select.labels?.[0]?.textContent==='Preview quality'&&select.value===expected),result.serverQualityBefore,{timeout:10000});result.quality=await page.getByRole('combobox',{name:'Preview quality',exact:true}).inputValue();result.serverQualityAfter=await page.evaluate(async()=>{const response=await fetch('/api/preview-settings');return (await response.json()).quality;});if(result.serverQualityBefore!==result.serverQualityAfter)throw Error('Preview quality changed during measurement');await page.getByRole('button',{name:'Preview & export settings',exact:true}).click();
  if(run===0){
   const max=Number(await page.getByRole('slider',{name:'Seek preview',exact:true}).getAttribute('max'));
   for(let i=0;i<warmRuns;i++){
    await seek(page,0);await page.waitForTimeout(150);await play.click();const warm=await firstMotion(page);await pause(page);
    const target=Math.max(1,Math.round(max*([.4,.75,.2,.9,.55][i%5])));
    let traceReady:Promise<{stream:string}>|undefined;
    if(captureSeekTrace&&i===cpuSeekIndex){
     traceReady=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
     await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline,media',transferMode:'ReturnAsStream'});
     result.traceCaveat='DevTools tracing perturbs timing; diagnostic only.';
    }
    if(captureCpuProfile&&i===cpuSeekIndex)await cdp.send('Profiler.start');
    const sought=await seek(page,target);
    if(captureCpuProfile&&i===cpuSeekIndex){const {profile}=await cdp.send('Profiler.stop');const profilePath=file+`.${run}.seek.cpuprofile`;fs.writeFileSync(profilePath,JSON.stringify(profile));result.seekCpuProfile=profilePath;}
    if(traceReady){
     await cdp.send('Tracing.end');const {stream}=await traceReady;let data='';
     try{while(true){const chunk=await cdp.send('IO.read',{handle:stream});data+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString('utf8'):chunk.data;if(chunk.eof)break;}}finally{await cdp.send('IO.close',{handle:stream});}
     const tracePath=file+`.${run}.seek.trace.json`;fs.writeFileSync(tracePath,JSON.stringify(JSON.parse(data)));result.seekTrace=tracePath;
    }
    report.warm.push({i,playMs:warm.ms,seekTarget:target,seekMs:sought.ready-sought.requested,seekObservedMs:sought.observed-sought.requested,seekHarnessReturnMs:sought.ready-sought.observed,seekRow:sought.row});save();
   }
  }
  if(mode==='gpu'&&result.requests.length)throw Error('Supported GPU trial requested a prepared movie');
  result.phase="evidence-capture";save();
  try{await page.screenshot({path:file+`.${run}.png`,timeout:10000});}catch(error){result.screenshotError=String(error);}
  if(decodeAblation&&run===0&&mode==='gpu'){
   const chosen=new Map<string,{url:string;time:number;alpha:boolean}>();
   for(const row of [...report.warm].sort((a:any,b:any)=>b.seekMs-a.seekMs))for(const item of row.seekRow?.gpu?.sourceFrames??[]){
    const key=JSON.parse(item.sourceKey);if(key.at(-1)==='image-srgb-v1'||chosen.size>=3||chosen.has(key[1]))continue;
    chosen.set(key[1],{url:new URL(key[1],base).href,time:item.requestedUs,alpha:key.at(-2)===true});
   }
   if(!chosen.size)throw Error('Decoder ablation requires warm video seeks');
   const bundle=await build({stdin:{contents:"export {BrowserFrameProvider} from './src/lib/gpu-preview/browser-frame-provider';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'DecodeProbe',platform:'browser'});
   const measure=async(target:Page)=>{
    await target.addScriptTag({content:bundle.outputFiles[0].text});
    return target.evaluate(async sources=>{
     const rows:any[]=[];
     for(let round=0;round<3;round++)for(const source of round%2?[...sources].reverse():sources){
      const provider=new (window as any).DecodeProbe.BrowserFrameProvider(1);let timing:any,received=0;
      try{
       await provider.decode({key:source.url,url:source.url,validationUrl:source.url,alpha:source.alpha},[source.time],new AbortController().signal,(frame:any)=>{
        try{if(source.time<frame.timestampUs||source.time>=frame.timestampUs+frame.durationUs)throw Error('Incorrect probe picture');received++;}finally{frame.release();}
       },(value:any)=>{timing=value;});
       if(received!==1)throw Error('Missing probe picture');rows.push({round,url:source.url,time:source.time,...timing});
      }finally{provider.close();if(provider.bytes!==0)throw Error('Probe retained decoded frames');}
     }return rows;
    },[...chosen.values()]);
   };
   result.decodeAblation={scope:'Fresh provider per source seek; paused editor first, then render-frame page after editor closes in same browser. Fixed order and retained HTTP/server caches; diagnostic, not whole-editor latency.',editor:await measure(page)};save();
   await page.close();page=await browser.newPage();await page.addInitScript('globalThis.__name = (value) => value');await page.goto(`${base}/render-frame`,{waitUntil:'domcontentloaded'});
   result.decodeAblation.rendererOnly=await measure(page);save();
  }
  result.completed=true;
 }catch(error){result.error=String(error);if(page&&!page.isClosed()){result.failureObservation=await page.evaluate(()=>{const state=(window as any).__previewBench;return {click:state?.click,rows:state?.rows?.slice(-30),videos:[...document.querySelectorAll("video")].map(v=>({src:v.currentSrc,time:v.currentTime,ready:v.readyState,paused:v.paused,seeking:v.seeking,error:v.error?.message}))};}).catch(()=>null);result.body=await page.locator('body').innerText({timeout:5000}).then(text=>text.slice(0,10000)).catch(()=>null);await page.screenshot({path:file+`.${run}.failure.png`,timeout:10000}).catch(()=>{});}throw error;}
 finally{
  save();
  // Chrome can exit while Playwright remains waiting for cleanup acknowledgement.
  // Keep that harness delay separate from measured editor playback.
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const stopped=await Promise.race([server.kill().then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),10000);})]);
   if(!stopped){
    const child=server.process();
    if(child.exitCode===null&&child.signalCode===null)throw Error('Benchmark browser did not stop; refusing to overlap trials');
    result.cleanupWarning='Browser process exited; cleanup acknowledgement exceeded 10 seconds';
   }
  }finally{if(timer)clearTimeout(timer);save();}
 }
 }
 const p95=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]??null;
 report.proxiesAfter=await proxySnapshot();if(JSON.stringify(report.proxiesBefore)!==JSON.stringify(report.proxiesAfter))throw Error('Proxy bindings or bytes changed during benchmark');
 report.summary={coldRuns:report.runs.length,warmSamples:report.warm.length,warmPlayP95:p95(report.warm.map((r:any)=>r.playMs)),warmSeekP95:p95(report.warm.map((r:any)=>r.seekMs)),coldPlayP95:p95(report.runs.map((r:any)=>r.firstMotion.ms)),coldNavigationP95:p95(report.runs.map((r:any)=>r.navigationToMotionMs))};
 }finally{report.finalTimelineHash=hash();report.timelineUnchanged=report.timelineHash===report.finalTimelineHash;save();console.log(file);if(!report.timelineUnchanged)throw Error('Timeline changed during read-only benchmark');}}
main().catch(error=>{report.error=String(error);save();console.error(error);process.exitCode=1;});
