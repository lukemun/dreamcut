/** Synthetic renderer engineering only; never reads or exports a creator timeline. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gpuPropertyFixtures,GPU_PROPERTY_FIXTURE_SVGS} from '../src/lib/gpu-preview/property-fixtures';
import {hydrateCaptionFill} from '../src/lib/local-store/timeline-payload';
import {COLOR_GRADE_FIELDS,COLOR_GRADE_ADVANCED_FIELDS} from '../src/lib/timeline/color-grade';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {prepareStillPreview} from '../src/lib/local-store/still-preview';
import {runMediaProcess} from '../src/lib/render/audio-export';
import {renderBrowserVideo} from '../src/lib/render/browser-renderer';
import type {CompositionElement} from '../src/lib/render/composition-adapters';
import type {TimelineTransition} from '../src/components/studio/timeline/types';
import { readEnv } from '../src/lib/env-name';
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
const compositorEngine=readEnv("GPU_COMPOSITOR")??'webgpu';
if(!['webgpu','canvaskit'].includes(compositorEngine))throw Error('Unknown GPU compositor');
const root=process.env.TIMELINE_PROJECTS_DIR;
if(!root)throw Error('Set TIMELINE_PROJECTS_DIR to the running isolated editor storage root.');
const id='gpu-render-contract',media=path.resolve(root,id,'media'),outputRoot=path.resolve('testing/results/gpu-preview');
if(fs.existsSync(path.resolve(root,id,'timeline.json')))throw Error('Refusing to overwrite media in an existing editor project; use isolated engineering storage.');
fs.mkdirSync(media,{recursive:true});fs.mkdirSync(outputRoot,{recursive:true});
const output=fs.mkdtempSync(path.join(outputRoot,'run-'));
const w=320,h=readEnv("GPU_TRANSITION_PROOF")==='whip-smear-portrait'?568:320,fps=30,count=72;
/** Real CanvasKit allocation/presentation regression for layered full-resolution inputs. */
async function canvasKitBudgetProof(page:import('playwright-core').Page){
 const result=await page.evaluate(()=>{
  const kit=(window as any).proofCanvasKit,Api=(window as any).GpuProof;
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
  const compositor=new Api.CanvasKitCompositor(kit,canvas,64*1024*1024);
  const source=new OffscreenCanvas(2048,2048),ctx=source.getContext('2d')!;
  ctx.fillStyle='#e04020';ctx.fillRect(0,0,2048,2048);
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const layer={frame:source,transform:matrix,opacity:1};
  try{
   compositor.draw(Array.from({length:5},()=>({...layer})));
   const color=Array.from(canvas.getContext('2d')!.getImageData(80,80,1,1).data);
   if(color[0]<200||color[1]>100||color[3]!==255)throw Error('Layered budget proof did not present the complete red frame');
   let rejected=false;try{compositor.draw([{...layer,frame:{width:8192,height:8192}}]);}catch(e){rejected=String(e).includes('layer exceeds budget');}
   if(!rejected)throw Error('Oversized individual layer was not rejected');
   const retained=Array.from(canvas.getContext('2d')!.getImageData(80,80,1,1).data);
   if(JSON.stringify(color)!==JSON.stringify(retained))throw Error('Rejected frame changed visible output');
   compositor.draw([layer]);
   return {passed:true,layers:5,sourceSize:2048,budgetMiB:64,color,rejectedFramePreservesPicture:true};
  }finally{compositor.close();source.width=1;source.height=1;if(compositor.bytes!==0)throw Error('Compositor leaked budget after close');}
 });
 fs.writeFileSync(path.join(output,'layer-budget.json'),JSON.stringify(result,null,2));
}
/** Exhaustive scalar registry projection, intentionally separate from production
 * admission. Unsupported/error cases stay in the receipt and cannot be passes. */
async function propertyProof(request:string){
 const source=(name:string)=>`${base}/api/projects/${id}/media/${name}`;
 for(const [name,svg] of Object.entries(GPU_PROPERTY_FIXTURE_SVGS))await sharp(Buffer.from(svg)).png().toFile(path.join(media,`property-${name}.png`));
 await runMediaProcess('ffmpeg',['-v','error','-y','-loop','1','-i',path.join(media,'property-video.png'),'-t','3','-r','30','-c:v','libx264','-pix_fmt','yuv420p',path.join(media,'property-video.mp4')]);
 const maskSource=path.resolve('public/fixtures/grid-matte/00000.png');
 if(!fs.existsSync(maskSource))throw Error('Missing canonical grid-matte fixture');
 fs.mkdirSync(path.join(media,'property-grid'),{recursive:true});
 fs.copyFileSync(maskSource,path.join(media,'property-grid','00000.png'));
 const fixtureAssetHashes=Object.fromEntries(['property-picture.png','property-fullCanvas.png','property-backdrop.png','property-video.mp4','property-grid/00000.png'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(media,file))).digest('hex')]));
 const all=gpuPropertyFixtures({picture:source('property-picture.png'),fullCanvas:source('property-fullCanvas.png'),backdrop:source('property-backdrop.png'),video:{url:source('property-video.mp4'),durationSeconds:3},gridMask:{source_url:`/api/projects/${id}/media/property-grid`,source_start_seconds:0,fps:.1,frame_count:1,width:160,height:160,source_sha256:'0'.repeat(64)}});
 const cases=request==='all'?all:all.filter(entry=>entry.property===request);
 if(!cases.length)throw Error(`Unknown GPU property proof: ${request}`);
 const bundle=await build({stdin:{contents:"export {CanvasKitCompositor} from './src/lib/gpu-preview/canvaskit-compositor';export {GpuPreviewRuntime} from './src/lib/gpu-preview/runtime';export {admitGpuScene,gpuSceneCapabilityIssues} from './src/lib/gpu-preview/scene';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'GpuProof',platform:'browser'});
 const server=await chromium.launchServer({channel:'chrome',headless:true,args:['--force-color-profile=srgb']});
 const browser=await chromium.connect(server.wsEndpoint());
 const rows:any[]=[],receipt:any={ok:false,kind:'gpu-property-registry',request,compositorEngine,output,fixtureAssetHashes,date:new Date().toISOString(),total:cases.length,rows,scope:'Synthetic existing registry fixtures; active 61-frame encoded sequence, baseline/reset and repeat seeks. No audio or live-playback qualification.'};
 const pixel=async(input:Buffer|string)=>sharp(input).removeAlpha().raw().toBuffer();
 const difference=(a:Buffer,b:Buffer)=>{assert.equal(a.length,b.length);let sum=0,max=0,changed=0;for(let i=0;i<a.length;i+=3){let pixelMax=0;for(let j=0;j<3;j++){const d=Math.abs(a[i+j]-b[i+j]);sum+=d;pixelMax=Math.max(pixelMax,d);max=Math.max(max,d);}if(pixelMax>3)changed++;}return {mean:sum/a.length,max,changed};};
 try{
  const reference=await browser.newPage({viewport:{width:160,height:160},deviceScaleFactor:1});
  const candidate=await browser.newPage({viewport:{width:160,height:160},deviceScaleFactor:1});
  for(const page of [reference,candidate]){await page.addInitScript('globalThis.__name = value => value');await page.goto(`${base}/render-frame`,{waitUntil:'domcontentloaded'});}
  await reference.waitForFunction(()=>!!window.__dreamcutRender);
  if(compositorEngine==='canvaskit'){
   await candidate.route('**/gpu-proof-canvaskit.wasm',route=>route.fulfill({path:path.resolve('node_modules/canvaskit-wasm/bin/canvaskit.wasm'),contentType:'application/wasm'}));
   await candidate.addScriptTag({path:path.resolve('node_modules/canvaskit-wasm/bin/canvaskit.js')});
   await candidate.evaluate(async()=>{(window as any).proofCanvasKit=await (window as any).CanvasKitInit({locateFile:()=>'/gpu-proof-canvaskit.wasm'});});
  }
  await candidate.addScriptTag({content:bundle.outputFiles[0].text});
  receipt.browserVersion=browser.version();
  for(const fixture of cases){
   const folder=path.join(output,fixture.property);fs.mkdirSync(folder,{recursive:true});
   const row:any={property:fixture.property,caseIndex:fixture.caseIndex,inputFingerprint:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),minimumChangedPixels:fixture.minimumChangedPixels,status:'pending',admission:[],raw:[],encoded:[],checks:{}};rows.push(row);
   const close=async()=>candidate.evaluate(()=>{const p=(window as any).propertyProof;if(!p)return {bytes:0,errors:[]};p.runtime.close();const result={bytes:p.runtime.bytes,errors:p.errors};p.device.destroy();p.canvas.remove();delete (window as any).propertyProof;return result;});
   const load=async(variant:'baseline'|'active'|'reset')=>{
    const state=fixture[variant],previous=await close();assert.equal(previous.bytes,0,'Variant runtime retained bytes');assert.deepEqual(previous.errors,[]);
    await reference.evaluate(config=>window.__dreamcutRender!.load(config),{width:160,height:160,fps:30,durationInFrames:61,rendering:true,inputProps:state});
    const admission=await candidate.evaluate(async({state,engine})=>{
     const api=(window as any).GpuProof,admitted=api.admitGpuScene(state.elements,'property-fixture',engine),issues=api.gpuSceneCapabilityIssues(state.elements,'property-fixture',engine);
     // This explicit engineering mode exercises exact catalog input even when
     // production admission is gated. Preserve all issues in the receipt.
     const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No GPU adapter');const device=await adapter.requestDevice();
     const canvas=document.createElement('canvas');canvas.id='gpu-property';canvas.width=160;canvas.height=160;canvas.style.cssText='position:fixed;inset:0';document.body.append(canvas);
     const context=engine==='webgpu'?canvas.getContext('webgpu'):null,format=navigator.gpu.getPreferredCanvasFormat();context?.configure({device,format,alphaMode:'opaque'});
     const errors:string[]=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
     try{(window as any).propertyProof={device,canvas,errors,runtime:new api.GpuPreviewRuntime(device,context,format,state.elements,state.laneOrderKeys,'property-fixture',160,160,30,engine==='canvaskit'?new api.CanvasKitCompositor((window as any).proofCanvasKit,canvas):undefined)};}
     catch(error){device.destroy();canvas.remove();throw error;}
     return {engine,supported:admitted.supported,issues};
    },{state,engine:compositorEngine});
    row.admission.push({variant,...admission});
   };
   const capture=async(frame:number)=>{
    await reference.evaluate(frame=>window.__dreamcutRender!.frame(frame),frame);
    await candidate.evaluate(async frame=>{const p=(window as any).propertyProof;if(!await p.runtime.present(frame,frame))throw Error('Incomplete property frame');await p.device.queue.onSubmittedWorkDone();if(p.errors.length)throw Error(p.errors.join('; '));},frame);
    return {standard:await reference.locator('#dreamcut-render-surface').screenshot(),gpu:await candidate.locator('#gpu-property').screenshot()};
   };
   try{
    await load('baseline');const baseline=await capture(30);await load('active');
    const frames=new Map<number,{standard:Buffer;gpu:Buffer}>();
    for(let frame=0;frame<=60;frame++){
     const shot=await capture(frame);frames.set(frame,shot);
     fs.writeFileSync(path.join(folder,`reference-${String(frame).padStart(4,'0')}.png`),shot.standard);fs.writeFileSync(path.join(folder,`candidate-${String(frame).padStart(4,'0')}.png`),shot.gpu);
     row.raw.push({frame,...difference(await pixel(shot.standard),await pixel(shot.gpu))});
    }
    for(const frame of [30,0,60,15,30]){const shot=await capture(frame),before=frames.get(frame)!;assert.equal(difference(await pixel(shot.standard),await pixel(before.standard)).max,0,'Standard repeated seek changed');assert.equal(difference(await pixel(shot.gpu),await pixel(before.gpu)).max,0,'Candidate repeated seek changed');}
    row.checks.repeatSeek=true;
    const active=frames.get(30)!;await load('reset');const reset=await capture(30);
    for(const engine of ['standard','gpu'] as const){const effect=difference(await pixel(baseline[engine]),await pixel(active[engine])),restored=difference(await pixel(baseline[engine]),await pixel(reset[engine]));row[engine]={effect,reset:restored};assert.ok(effect.changed>=fixture.minimumChangedPixels,`${engine} effect not observable`);assert.equal(restored.max,0,`${engine} identity reset changed`);}
    row.checks.visibleEffect=true;row.checks.identityReset=true;
    row.rawMeanMax=Math.max(...row.raw.map((r:any)=>r.mean));
    for(const engine of ['reference','candidate']){
     await runMediaProcess('ffmpeg',['-v','error','-y','-framerate','30','-i',path.join(folder,`${engine}-%04d.png`),'-frames:v','61','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',path.join(folder,`${engine}.mp4`)]);
     const probe=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames','-of','json',path.join(folder,`${engine}.mp4`)]));assert.equal(Number(probe.streams[0].nb_frames),61,'Encoded property frame count');
     await runMediaProcess('ffmpeg',['-v','error','-y','-i',path.join(folder,`${engine}.mp4`),'-fps_mode','passthrough',path.join(folder,`${engine}-decoded-%04d.png`)]);
    }
    for(let frame=0;frame<=60;frame++)row.encoded.push({frame,...difference(await pixel(path.join(folder,`reference-decoded-${String(frame+1).padStart(4,'0')}.png`)),await pixel(path.join(folder,`candidate-decoded-${String(frame+1).padStart(4,'0')}.png`)))});
    row.encodedMeanMax=Math.max(...row.encoded.map((r:any)=>r.mean));assert.ok(row.rawMeanMax<1,`Raw property divergence ${row.rawMeanMax}`);assert.ok(row.encodedMeanMax<1,`Encoded property divergence ${row.encodedMeanMax}`);row.checks.encoded=true;
    row.productionAdmitted=row.admission.every((a:any)=>a.supported);row.status=row.productionAdmitted&&compositorEngine==='webgpu'?'passed':'experimental-pass';
   }catch(error){row.status='failed';row.error=String(error);}
   finally{try{row.cleanup=await close();assert.equal(row.cleanup.bytes,0);assert.deepEqual(row.cleanup.errors,[]);row.checks.cleanup=true;}catch(error){row.status='failed';row.cleanupError=String(error);}fs.writeFileSync(path.join(folder,'receipt.json'),JSON.stringify(row,null,2));}
   console.log(JSON.stringify({property:row.property,status:row.status,error:row.error,rawMeanMax:row.rawMeanMax,encodedMeanMax:row.encodedMeanMax}));
  }
  receipt.passed=rows.filter(r=>r.status==='passed').length;receipt.experimentalPassed=rows.filter(r=>r.status==='experimental-pass').length;receipt.failed=rows.filter(r=>r.status==='failed').length;receipt.productionUnsupported=rows.filter(r=>r.admission.some((a:any)=>!a.supported)).length;
  receipt.ok=receipt.passed===cases.length;receipt.implementationChecksPassed=receipt.failed===0;
  if(receipt.failed)process.exitCode=1;
 }finally{fs.writeFileSync(path.join(output,'latest.json'),JSON.stringify(receipt,null,2));fs.writeFileSync(path.join(outputRoot,'latest.json'),JSON.stringify(receipt,null,2));await server.kill();}
 console.log(JSON.stringify({output,ok:receipt.ok,passed:receipt.passed,experimentalPassed:receipt.experimentalPassed,failed:receipt.failed,productionUnsupported:receipt.productionUnsupported}));
}

async function main(){
 if(readEnv("GPU_PROPERTY_PROOF"))return propertyProof(readEnv("GPU_PROPERTY_PROOF"));
 const wideLut=readEnv("GPU_LUT_PROOF")==='wide-rgb';
 const seekVariants=[{name:'g30-b3',gop:30,bframes:3},{name:'g30-b0',gop:30,bframes:0},{name:'g15-b0',gop:15,bframes:0},{name:'g1-b0',gop:1,bframes:0}];
 const seekFiles:any[]=[];
 if(readEnv("GPU_SEEK_ABLATION")==='1'){
  const original=path.join(media,'seek-authority.nut');
  await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=540x960:rate=30:duration=6','-c:v','ffv1',original]);
  for(const variant of seekVariants){
   const file=path.join(media,`seek-${variant.name}.mp4`),stats=path.join(output,`seek-${variant.name}-ssim.txt`);
   await runMediaProcess('ffmpeg',['-v','error','-y','-i',original,'-an','-c:v','libx264','-preset','veryfast','-crf','18','-g',String(variant.gop),'-keyint_min',String(variant.gop),'-sc_threshold','0','-bf',String(variant.bframes),'-pix_fmt','yuv420p','-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',file]);
   await runMediaProcess('ffmpeg',['-v','error','-i',original,'-i',file,'-lavfi',`[0:v][1:v]ssim=stats_file=${stats}`,'-f','null','-']);
   const samples=fs.readFileSync(stats,'utf8').trim().split('\n').map(row=>Number(row.match(/All:([0-9.]+)/)?.[1]));
   assert.equal(samples.length,180);assert.ok(samples.every(value=>Number.isFinite(value)&&value>.95));
   seekFiles.push({...variant,url:`${base}/api/projects/${id}/media/seek-${variant.name}.mp4`,bytes:fs.statSync(file).size,frames:samples.length,minimumSsim:Math.min(...samples),meanSsim:samples.reduce((a,b)=>a+b,0)/samples.length});
  }
 }

 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i',`testsrc2=size=320x${wideLut?180:320}:rate=30:duration=2`,'-c:v','libx264','-pix_fmt','yuv420p',path.join(media,'rgb.mp4')]);
 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=black@0:size=320x320:rate=30:duration=2,format=yuva420p,drawbox=x=80:y=80:w=160:h=160:color=red@1:t=fill:replace=1','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0',path.join(media,'alpha.webm')]);
 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x00ff00:size=320x320:rate=30:duration=2,drawbox=x=65:y=70:w=180:h=180:color=red:t=fill,drawbox=x=35:y=70:w=30:h=180:color=0x55aa55:t=fill','-c:v','libx264','-crf','12','-pix_fmt','yuv420p',path.join(media,'key.mp4')]);
 const source=(name:string)=>`${base}/api/projects/${id}/media/${name}`;
 await sharp({create:{width:96,height:64,channels:4,background:{r:25,g:180,b:90,alpha:.65}}})
  .composite([{input:await sharp({create:{width:24,height:32,channels:4,background:{r:220,g:35,b:80,alpha:1}}}).png().toBuffer(),left:0,top:0}])
  .png().toFile(path.join(media,'still.png'));
 if(readEnv("GPU_IMAGE_ABLATION")==='1'){
  await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=3200x5600:rate=1','-frames:v','1',path.join(media,'large-pattern.png')]);
  for(const orientation of [1,6])await sharp(path.join(media,'large-pattern.png')).withMetadata({orientation}).jpeg({quality:95}).toFile(path.join(media,`large-${orientation}.jpg`));
 }
 const video=(name:string,lane:string,alpha=false):CompositionElement=>({id:name,type:'video_clip',source_url:source(name),timeline_start:0,duration:count/fps,lane_key:lane,lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,
 props:{source_duration_seconds:2,has_alpha:alpha,preview_source_url:source(name),preview_proxy_validation:{contract:'preview-proxy-v1',url:source(name),ok:true,width:320,height:320}}});
 const bg=video('rgb.mp4','visual_0');bg.props={...bg.props,media_orientation:'clockwise',color_grade_model:'linear-srgb-v1',grade_exposure_ev:.35,grade_temperature:.3,grade_tint:-.2,grade_contrast:1.12,grade_saturation:1.2,grade_hue_degrees:12,grade_shadows:.2,window_open_duration:1.3,window_corner_radius:90,window_side_margin_percent:12,window_vertical_margin_percent:15,window_center_y_percent:45,keyframes:{grade_exposure_ev:[{t:0,v:0},{t:.8,v:.35},{t:2,v:-.1}],mask_inset:[{t:0,v:[0,0,0,0]},{t:1,v:[.2,0,.2,0]},{t:2,v:[.1,0,.1,0]}]}};
 const fg=video('alpha.webm','visual_1',true);fg.props={...fg.props,media_scale:.85,media_offset_x:.05,media_offset_y:-.03,recolor_color:'#20dd80',recolor_amount:.65,recolor_preserve_shading:1,color_grade_model:'linear-srgb-v1',grade_lift_rgb:[.02,-.01,0],grade_gamma_rgb:[1.1,.9,1],grade_gain_rgb:[.9,1,1.1],grade_curve_master:[0,.1,.22,.35,.5,.65,.78,.9,1]};
 const lutCase=readEnv("GPU_LUT_PROOF");
 if(lutCase&&!['rgb','alpha','flat-rgb','flat-alpha','wide-rgb','unscaled-alpha','halo-alpha'].includes(lutCase))throw Error('Unknown GPU LUT fixture');
 if(wideLut)bg.props={...bg.props,preview_proxy_validation:{contract:'preview-proxy-v1',url:source('rgb.mp4'),ok:true,width:320,height:180}};
 if(lutCase){
  const rows=['LUT_3D_SIZE 4','DOMAIN_MIN 0.1 0.05 0','DOMAIN_MAX 0.9 1 0.95'];
  for(let b=0;b<4;b++)for(let g=0;g<4;g++)for(let r=0;r<4;r++)rows.push(`${b/3} ${r/3} ${g/3}`);
  fs.writeFileSync(path.join(media,'look.cube'),rows.join('\n'));
  const actor=lutCase.includes('alpha')?fg:bg;
  if(lutCase==='unscaled-alpha')for(const field of ['media_scale','media_offset_x','media_offset_y'])delete actor.props![field];
  if(lutCase==='flat-rgb')delete actor.props!.media_orientation;
  if(lutCase==='flat-alpha')for(const field of ['recolor_color','recolor_amount','recolor_preserve_shading'])delete actor.props![field];
  actor.props={...actor.props,lut_asset_id:'a'.repeat(64),lut_source_url:source('look.cube'),lut_intensity:.7,keyframes:{...(actor.props?.keyframes as object??{}),lut_intensity:[{t:0,v:0},{t:.5,v:.8},{t:1.5,v:.3},{t:2.3,v:1}]}};
  if(lutCase==='halo-alpha'){
    if(readEnv("GPU_DIAGNOSTIC")!=='1')throw Error('Halo isolation is diagnostic only');
    for(const field of [...COLOR_GRADE_FIELDS,...COLOR_GRADE_ADVANCED_FIELDS,'color_grade_model','media_scale','media_offset_x','media_offset_y','recolor_color','recolor_amount','recolor_preserve_shading'])delete actor.props![field];
    actor.props={...actor.props,color_grade_model:'linear-srgb-v1',lut_intensity:0,keyframes:{}};
  }
 }
 const radialCase=readEnv("GPU_RADIAL_PROOF");
 if(radialCase&&!['iris','edge-isolated','edge-scene'].includes(radialCase))throw Error('Unknown GPU radial fixture');
 if(radialCase)fg.props={...fg.props,...(radialCase==='iris'?{iris_radius:.8,iris_feather:.3}:{zoom_blur:12,...(radialCase==='edge-isolated'?{media_opacity:.85}:{})})};
 const blurCase=readEnv("GPU_BLUR_PROOF");
 const featherCase=readEnv("GPU_FEATHER_PROOF");
 if(featherCase&&!['alpha','rgb','rotated'].includes(featherCase))throw Error('Unknown GPU feather fixture');
 if(featherCase){const actor=featherCase==='rgb'?bg:fg;actor.props={...actor.props,mask_inset:[.2,.1,.2,.1],mask_feather:.1,keyframes:{...(actor.props?.keyframes as object??{}),mask_inset:[{t:0,v:[.2,.1,.2,.1]},{t:1,v:[.35,0,0,0]}],mask_feather:[{t:0,v:0},{t:.4,v:.1},{t:1,v:.3},{t:2,v:0}]}};}
 if(featherCase==='rotated'){
  for(const [actor,top,bottom,rotation]of [[fg,.35,0,35],[bg,0,.4,-55]] as const){
   actor.props={...actor.props,mask_inset:[top,0,bottom,0],mask_line_rotation:rotation,mask_feather:.1,
    keyframes:{...(actor.props?.keyframes as object??{}),mask_inset:[],mask_feather:[{t:0,v:0},{t:.4,v:.1},{t:1.2,v:.3},{t:2,v:0}]}};
  }
 }
 if(blurCase&&!['1','large-masked','masked-only','transition','transition-combined','transition-static'].includes(blurCase))throw Error('Unknown GPU blur fixture');
 if(blurCase){
  const x=['masked-only','transition'].includes(blurCase)?0:blurCase==='large-masked'?300:36,y=x/2;
  fg.props={...fg.props,directional_blur_x:x,directional_blur_y:y,keyframes:{directional_blur_x:[{t:0,v:0},{t:.6,v:x},{t:1.2,v:0}],directional_blur_y:[{t:0,v:0},{t:.6,v:y},{t:1.2,v:0}]}};
  if(blurCase==='large-masked'||blurCase==='masked-only'||blurCase==='transition-combined')fg.props={...fg.props,media_opacity:.65,mask_inset:[.15,.1,.15,.1],window_open_duration:1.2,window_corner_radius:70,window_side_margin_percent:25,window_vertical_margin_percent:25,window_center_y_percent:45};
 }
 if(blurCase?.startsWith('transition'))fg.props={...fg.props,keyframes:{...(fg.props?.keyframes as object??{}),transition_blur:[{t:0,v:0},{t:.3,v:20},{t:1,v:40},{t:1.8,v:0}]}};
 if(blurCase==='transition-static'){const keys={...(fg.props?.keyframes as Record<string,unknown>)};delete keys.transition_blur;fg.props={...fg.props,transition_blur:24,keyframes:keys};}
 const flashCase=readEnv("GPU_FLASH_PROOF");
 if(flashCase&&!['1','flash-only','flash-recolor'].includes(flashCase))throw Error('Unknown GPU flash fixture');
 if(flashCase){
  // Keep the original combined case intact. Ablations diagnose which filter
  // boundary introduces a discrepancy; they cannot certify combined support.
  if(flashCase!=='1')for(const field of [...COLOR_GRADE_FIELDS,...COLOR_GRADE_ADVANCED_FIELDS,'color_grade_model'])delete fg.props![field];
  if(flashCase==='flash-only')for(const field of ['recolor_color','recolor_amount','recolor_preserve_shading'])delete fg.props![field];
  fg.props={...fg.props,subject_flash:.7,keyframes:{...(fg.props?.keyframes as object??{}),subject_flash:[{t:0,v:0},{t:.5,v:.7},{t:1,v:0}]}};
 }
 const glowCase=readEnv("GPU_GLOW_PROOF");
 if(glowCase&&!['1','static','zero-radius'].includes(glowCase))throw Error('Unknown GPU glow fixture');
 if(glowCase)fg.props={...fg.props,subject_glow:2.33,subject_glow_radius:glowCase==='zero-radius'?0:42,...(glowCase==='1'?{keyframes:{...(fg.props?.keyframes as object??{}),subject_glow:[{t:0,v:2.33},{t:.3,v:0},{t:.8,v:1.5},{t:1.4,v:0}]}}:{})};
 const outlineCase=readEnv("GPU_OUTLINE_PROOF");
 if(outlineCase&&!['1','static'].includes(outlineCase))throw Error('Unknown GPU outline fixture');
 if(outlineCase)fg.props={...fg.props,sticker_outline:true,sticker_outline_width:12,sticker_outline_color:'#ffffff',...(outlineCase==='1'?{keyframes:{...(fg.props?.keyframes as object??{}),sticker_outline_width:[{t:0,v:0},{t:.3,v:12},{t:1.2,v:6},{t:2,v:0}]}}:{})};
 const mediaAnimationCase=readEnv("GPU_MEDIA_ANIMATION_PROOF");
 const animationCases=['identity','fade','pop','pop-rgb','pop-still','pop-rgb-plain','pop-rgb-ungraded','pop-rgb-unmasked','pop-masked','slide_up','slide_down','slide_left','slide_right','slide_up-rgb','slide_down-rgb','slide_left-rgb','slide_right-rgb','drop_in','drop_in-all','spring_pop','rotate_in'];
 if(mediaAnimationCase&&!animationCases.includes(mediaAnimationCase))throw Error('Unknown GPU media animation fixture');
 if(mediaAnimationCase&&mediaAnimationCase!=='pop-still'&&mediaAnimationCase!=='drop_in-all'){
  const actor=mediaAnimationCase.includes('-rgb')?bg:fg;
  if(['pop-rgb-plain','pop-rgb-ungraded'].includes(mediaAnimationCase))for(const field of [...COLOR_GRADE_FIELDS,...COLOR_GRADE_ADVANCED_FIELDS,'color_grade_model'])delete actor.props![field];
  if(['pop-rgb-plain','pop-rgb-unmasked'].includes(mediaAnimationCase))for(const field of ['window_open_duration','window_corner_radius','window_side_margin_percent','window_vertical_margin_percent','window_center_y_percent'])delete actor.props![field];
  if(mediaAnimationCase==='pop-rgb-plain')delete actor.props!.media_orientation;
  if(mediaAnimationCase.startsWith('pop-rgb-')){
   const keys={...(actor.props!.keyframes as Record<string,unknown>)};
   if(mediaAnimationCase!=='pop-rgb-unmasked')for(const field of [...COLOR_GRADE_FIELDS,...COLOR_GRADE_ADVANCED_FIELDS])delete keys[field];
   if(mediaAnimationCase!=='pop-rgb-ungraded')delete keys.mask_inset;
   actor.props!.keyframes=keys;
  }
  const preset=mediaAnimationCase.startsWith('pop')?'pop':mediaAnimationCase==='identity'?'none':mediaAnimationCase.replace(/-rgb$/,'');
  actor.props={...actor.props,animationIn:preset,animationOut:preset,animationInDuration:.6,animationOutDuration:.5};
  if(mediaAnimationCase==='pop-masked')actor.props={...actor.props,mask_inset:[.15,.1,.15,.1],window_open_duration:1.2,window_corner_radius:70,window_side_margin_percent:25,window_vertical_margin_percent:25,window_center_y_percent:45};
 }
 const text:CompositionElement={...bg,id:'note',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'NOTE',fontPreset:'classic_serif',fontSizePx:22,textColor:'#ffffff',surface_track:{version:1,id:'plane',parentId:fg.id,sourceUrl:fg.source_url,sourceSha256:'a'.repeat(64),width:w,height:h,referenceTime:0,visibleFrom:0,visibleTo:2,samples:Array.from({length:61},(_,i)=>({t:i/fps,quad:[[.28+i*.0005,.33],[.7,.29+i*.0004],[.69,.59],[.29,.61]],visible:i<57,confidence:1}))}}};
 const still:CompositionElement={...bg,id:'still',type:'still',source_url:source('still.png'),lane_key:'visual_2',timeline_start:.2,duration:1.8,
  props:{media_scale:.3,media_offset_x:-.3,media_offset_y:.3,media_orientation:'counterclockwise',media_mirror:'horizontal',paper_fill_color:'#cc8040',keyframes:{media_opacity:[{t:0,v:.4},{t:1,v:1}]}}};
 if(mediaAnimationCase==='pop-still')still.props={...still.props,media_scale:.85,media_offset_x:0,media_offset_y:0,animationIn:'pop',animationOut:'pop',animationInDuration:.6,animationOutDuration:.5};
 if(mediaAnimationCase==='drop_in-all'){
  for(const actor of [bg,fg,still])actor.props={...actor.props,animationIn:'drop_in',animationOut:'drop_in',animationInDuration:.6,animationOutDuration:.5};
 }
 if(readEnv("GPU_PREPARED_STILL_PROOF")==='1'){
  still.source_url=`/api/projects/${id}/media/still.png`;
  still.props={...still.props,runtime_still_preview:await prepareStillPreview(id,still.source_url,'detail')};
 }
 const caption:CompositionElement={...text,id:'ordinary-caption',timeline_start:.1,duration:2,
  props:{text:'A shared\ncaption',keyframes:{},positionPreset:'top_left',styleVariant:'bold_outline',fontPreset:'classic_serif',fontSizePx:24,maxWidth:.65,textAlign:'left'}};
 const keyed=video('key.mp4','visual_3');keyed.props={...keyed.props,media_scale:.4,media_offset_x:.28,media_offset_y:.27,chroma_key_model:'color-key-v1',chroma_key_color:'#00ff00',chroma_key_tolerance:.13,chroma_key_softness:.3,chroma_key_spill:.6,keyframes:{chroma_key_tolerance:[{t:0,v:.13},{t:1,v:.3},{t:2,v:.2}]}};
 // Focused caption conformance cases. Unsupported cases must still fail
 // admission; diagnostic mode never issues an ok:true verification receipt.
 const captionCase=readEnv("GPU_CAPTION_PLACEMENT_PROOF");
 if(captionCase&&!['1','position','layout','scale','outline','fixed','plain','static-layout','speech-active','speech-single','ticker','scan','wall-motion','viewport-mask'].includes(captionCase))throw Error('Unknown GPU caption conformance case');
 if(captionCase)caption.props={...caption.props,
  ...(captionCase==='plain'?{styleVariant:'none'}:{}),
  ...(['1','position','layout'].includes(captionCase)?{absX:.08,absY:.07}:{}),
  ...(['1','fixed','layout'].includes(captionCase)?{fontSizing:'fixed'}:{}),
  ...(['1','outline','layout'].includes(captionCase)?{outlineWidthPx:1.5}:{}),
  ...(captionCase==='layout'?{positionNudgeY:'slightly_down'}:{}),
  ...(['1','scale'].includes(captionCase)?{textScaleX:1.05,textScaleY:.95}:{})};
 const captionSpeech=captionCase==='speech-active'||captionCase==='speech-single';
 const captionSpecial=captionCase==='ticker'||captionCase==='scan';
 const captionWall=captionCase==='wall-motion';
 const captionMask=captionCase==='viewport-mask';
 if(captionMask){
  await sharp({create:{width:w,height:h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:Math.floor(w/2),height:h,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer(),left:0,top:0}]).png().toFile(path.join(media,'caption-mask.png'));
  caption.props={...caption.props,text:'MASK MOVES',styleVariant:'none',fontSizePx:30,absX:.15,absY:.35,text_mask_url:source('caption-mask.png'),animationIn:'none',animationOut:'none',keyframes:{media_offset_x:[{t:0,v:0},{t:1,v:1}]}};
 }
 if(captionWall)caption.props={...caption.props,text:'WALL TEXT',surfaceMode:'wall',surfacePerspectivePx:700,surfaceDepthPx:-70,surfaceRotateXDeg:12,surfaceRotateYDeg:-18,surfaceRotateZDeg:8,surfaceSkewXDeg:9,surfaceSkewYDeg:-4,surfaceOpacity:.82,surfaceBlurPx:.5,surfaceBlendMode:'multiply',textColor:'#e85020',textScaleX:1.15,textScaleY:.9,animationIn:'pop',animationOut:'pop',animationInDuration:.6,animationOutDuration:.5};
 if(captionSpecial)caption.props={...caption.props,text:'A TICKER MOVES',styleVariant:'none',fontSizePx:24,animationIn:'none',animationOut:'none',...(captionCase==='ticker'?{ticker_motion:'crawl_left'}:{scan_reveal_line:true,scan_reveal_start_y:.2,scan_reveal_end_y:.8,scan_reveal_line_width:.6,scan_reveal_line_height_px:4,animationInDuration:1})};
 if(captionCase==='static-layout')caption.props={...caption.props,text:'Mixed Case',offsetX:.08,offsetY:.04,textScaleX:1.18,textScaleY:.85,textCase:'upper',groupLayout:{kind:'paragraph_panel',packing:'reels_safe',row:1,rows:3},animationIn:'none',animationOut:'none'};
 if(captionSpeech)caption.props={...caption.props,text:'One two',animationIn:'none',animationOut:'none',timingMode:captionCase==='speech-single'?'single_word':'active_word',wordTimings:[{text:'One',start:0,end:.7},{text:'two',start:1,end:1.8}],activeWordColor:'#e63b21',activeWordTextColor:'#ffffff',activeWordKeepsOutline:true,activeWordPadXEm:.3};
 const captionOffsets=readEnv("GPU_CAPTION_OFFSETS_PROOF")==='1';
 if(captionOffsets)caption.props={...caption.props,media_offset_y:.08,keyframes:{media_offset_x:[{t:0,v:0},{t:.5,v:.35},{t:1,v:-.15},{t:1.8,v:.1}],media_offset_y:[{t:0,v:.08},{t:1,v:.25},{t:1.8,v:0}]}};
 const captionStyle=readEnv("GPU_CAPTION_STYLE_PROOF");
 if(captionStyle&&!['highlight_yellow','highlight_red','yellow_banner','black_card','thought_bubble','yellow_words','benchmark_card','camera_reveal'].includes(captionStyle))throw Error('Unknown GPU caption-style fixture');
 if(captionStyle)caption.props={...caption.props,styleVariant:captionStyle};
 if(captionStyle==='camera_reveal')caption.props={...caption.props,text:'OPEN',fontPreset:'display_serif',mediaFillUrls:[source('still.png')],cameraRevealBlurSamples:1,cameraRevealDurationSeconds:1.5};
 const cameraBlur=readEnv("GPU_CAMERA_BLUR_PROOF")==='1';
 if(cameraBlur){if(captionStyle!=='camera_reveal')throw Error('Camera blur proof requires the camera reveal fixture');caption.props={...caption.props,cameraRevealBlurSamples:4,cameraRevealShutterAngle:180};}
 const cameraMaterial=readEnv("GPU_CAMERA_MATERIAL_PROOF")==='1';
 if(cameraMaterial){
  if(captionStyle!=='camera_reveal')throw Error('Camera material proof requires the camera reveal fixture');
  await sharp({create:{width:96,height:64,channels:4,background:'#f8c020'}}).composite([{input:await sharp({create:{width:32,height:64,channels:4,background:'#1238c0'}}).png().toBuffer(),left:40,top:0}]).png().toFile(path.join(media,'camera-second.png'));
  caption.props={...caption.props,text:'NEW\nVIEW',fontSizePx:40,textScaleX:1.1,textScaleY:.9,offsetX:12,offsetY:-8,
   cameraRevealTypographySizing:'font_size',cameraRevealMediaFit:'camera',cameraRevealStartSeconds:.1,cameraRevealHoldSeconds:.1,cameraRevealDurationSeconds:1.1,
   cameraRevealStartDistance:1,cameraRevealEndDistance:5,cameraRevealTargetX:-.8,cameraRevealTargetY:.4,cameraRevealOrbitX:.8,cameraRevealOrbitY:-.3,
   cameraRevealExtrusionDepth:.3,cameraRevealBevelWidth:.2,cameraRevealEdgeLight:.7,cameraRevealWallMirror:.5,cameraRevealEdgeColor:'#ffaa30',
   cameraRevealResolveMode:'brand_card',cameraRevealResolveStartSeconds:1.2,cameraRevealResolveDurationSeconds:.6,
   mediaFillUrls:[source('still.png'),source('camera-second.png')],mediaFillTransition:'slide',mediaFillSlideDirection:'right',mediaFillChangeTimesSeconds:[0,.5,1.1],mediaFillCrossfadeSeconds:.2,mediaFillPanPercent:12};
 }
 if(captionStyle==='benchmark_card')caption.props={...caption.props,text:'Synthetic scores\nFirst 91 | Second 87 | Third 74',fontSizePx:24,maxWidth:.72,benchmark_winner:'Second',source_note:'Synthetic fixture',benchmarkRotationDeg:-3.5,animationInDuration:.8,benchmarkStackLayout:{kind:'featured_benchmark_stack',index:0}};

 const handwriting:CompositionElement={...caption,id:'handwritten-caption',props:{text:'Go!',fontPreset:'pacifico',fontSizePx:40,styleVariant:'none',textColor:'#ffffff',absX:.07,absY:.65,maxWidth:.6,animationIn:'handwriting',animationOut:'handwriting',animationInDuration:.6,animationOutDuration:.4}};
 const fillCase=readEnv("GPU_MEDIA_FILL_PROOF");
 if(fillCase&&!['images','video','tracked'].includes(fillCase))throw Error('Unknown GPU media-text fixture');
 if(fillCase){
  await sharp({create:{width:96,height:64,channels:4,background:'#f8c020'}}).composite([{input:await sharp({create:{width:32,height:64,channels:4,background:'#1238c0'}}).png().toBuffer(),left:40,top:0}]).withMetadata({orientation:6}).jpeg({quality:95}).toFile(path.join(media,'fill-second.jpg'));
  const fill={styleVariant:'image_fill',mediaFillUrls:[source('still.png'),source('fill-second.jpg')],mediaFillSecondsPerImage:.5,mediaFillCrossfadeSeconds:.2,mediaFillScale:1.3,mediaFillPanPercent:20};
  if(fillCase==='tracked')text.props={...text.props,...fill,text:'TRACKED',fontSizePx:28};
  if(fillCase==='images')caption.props={...caption.props,...fill,text:'IMAGE FILL',fontSizePx:32};
  handwriting.props={...handwriting.props,...fill,...(fillCase==='video'?{mediaFillVideoUrl:source('rgb.mp4'),mediaFillVideoPreviewUrl:source('rgb.mp4'),mediaFillVideoPlaybackRate:.5,mediaFillScene:{startSeconds:0,x:0,y:0,width:1,height:1}}:{})};
 }
 const standaloneVideoFill=readEnv("GPU_VIDEO_FILL_STANDALONE")==='1';
 if(standaloneVideoFill){
  if(fillCase!=='video')throw Error('Standalone video fill requires video fixture');
  fs.copyFileSync(path.join(media,'rgb.mp4'),path.join(media,'standalone-fill.mp4'));
  const url=`/api/projects/${id}/media/standalone-fill.mp4`;
  handwriting.props={...handwriting.props,mediaFillVideoUrl:url,mediaFillVideoPreviewUrl:url};
  handwriting.props.runtime_media_fill_preview=hydrateCaptionFill(handwriting.props,'detail');
 }
 const videoFillLayout=readEnv("GPU_VIDEO_FILL_LAYOUT");
 if(videoFillLayout&&!['cover','offset','wall','ticker'].includes(videoFillLayout))throw Error('Unknown video fill layout');
 if(videoFillLayout&&fillCase!=='video')throw Error('Video fill layout requires video fixture');
 if(videoFillLayout)handwriting.props={...handwriting.props,text:'Video\nFill',singleLine:false,maxWidth:.75,absY:.2,fontSizePx:42,mediaFillScene:videoFillLayout==='cover'?undefined:{startSeconds:0,x:.1,y:.15,width:.7,height:.8}};
 if(videoFillLayout==='wall')handwriting.props={...handwriting.props,surfaceMode:'wall',surfacePerspectivePx:900,surfaceRotateXDeg:12,surfaceRotateYDeg:25,surfaceSkewXDeg:8,surfaceOpacity:.8,surfaceBlurPx:.4,surfaceBlendMode:'multiply'};
 if(videoFillLayout==='ticker')handwriting.props={...handwriting.props,ticker_motion:'crawl_left',singleLine:true,mediaFillScene:undefined};
 const inverseCase=readEnv("GPU_INVERSE_CAPTION_PROOF");
 if(inverseCase&&!['static','motion','tracked'].includes(inverseCase))throw Error('Unknown inverse caption fixture');
 if(inverseCase){
  caption.props={...caption.props,styleVariant:'inverse',animationIn:'fade',animationOut:'fade',animationInDuration:.6,animationOutDuration:.5,...(inverseCase==='motion'?{inverseMaskMotion:'drift',inverseMaskDriftXPercent:12,inverseMaskDriftYPercent:-8,inverseMaskSweepIntensity:.7,inverseMaskSweepCycles:2}:{})};
  handwriting.props={...handwriting.props,styleVariant:'inverse',...(inverseCase==='motion'?{inverseMaskMotion:'drift',inverseMaskDriftXPercent:-10,inverseMaskDriftYPercent:8}:{})};
  if(inverseCase==='tracked')text.props={...text.props,styleVariant:'inverse'};
 }
 const captionFade=readEnv("GPU_CAPTION_FADE_PROOF");
 if(captionFade&&!['fade','mixed','reverse-mixed'].includes(captionFade))throw Error('Unknown GPU caption fade fixture');
 if(captionFade)caption.props={...caption.props,animationIn:captionFade==='reverse-mixed'?'handwriting':'fade',animationOut:captionFade==='mixed'?'handwriting':'fade',animationInDuration:.6,animationOutDuration:.5};
 const captionMotion=readEnv("GPU_CAPTION_MOTION_PROOF");
 if(captionMotion&&!['slide_up','slide_down','slide_left','slide_right','word_fade','word_rise','word_pop','words','write_on','scan_reveal_down','reveals','pop','spring_pop','rotate_in','drop_in','focus_settle','blocks','geometry','drops','focuses','all'].includes(captionMotion))throw Error('Unknown caption motion fixture');
 if(captionMotion)caption.props={...caption.props,animationIn:captionMotion==='all'?'slide_up':captionMotion==='words'?'word_fade':captionMotion==='reveals'?'write_on':captionMotion==='drops'?'drop_in':captionMotion==='focuses'?'focus_settle':['blocks','geometry'].includes(captionMotion??'')?'pop':captionMotion,animationOut:captionMotion==='all'?'slide_up':captionMotion==='words'?'word_fade':captionMotion==='reveals'?'write_on':captionMotion==='drops'?'drop_in':captionMotion==='focuses'?'focus_settle':['blocks','geometry'].includes(captionMotion??'')?'pop':captionMotion,animationInDuration:.6,animationOutDuration:.5};
 const blendCase=readEnv("GPU_BLEND_PROOF");
 if(blendCase&&!['difference','exclusion','stacked','reverse-stacked'].includes(blendCase))throw Error('Unknown GPU blend fixture');
 if(blendCase){
  fg.props={...fg.props,media_blend_mode:blendCase==='stacked'?'difference':blendCase==='reverse-stacked'?'exclusion':blendCase,keyframes:{media_opacity:[{t:0,v:.25},{t:1,v:1},{t:2,v:.5}]}};
  if(blendCase==='stacked'||blendCase==='reverse-stacked')still.props={...still.props,media_blend_mode:blendCase==='stacked'?'exclusion':'difference'};
 }
 const wrapperBackdrop=readEnv("GPU_WRAPPER_BACKDROP_PROOF");
 if(wrapperBackdrop&&!['spiral','page-rigid','page-segmented'].includes(wrapperBackdrop))throw Error('Unknown wrapper backdrop fixture');
 const transitionCase=wrapperBackdrop?.startsWith('page-')?'page_turn':readEnv("GPU_TRANSITION_PROOF");
 if(transitionCase&&!['page_turn','cube','wipe','film_burn','camera_flash','blackout','fade','slide','slide-left','slide-up','slide-down','slide-in-place','slide-blur','slide-travel','slide-smear','slide-smear-flat','slide-smear-zoom','whip-smear','whip-smear-vertical','whip-smear-handles','whip-smear-portrait','whip-smear-short','whip-smear-default','whip-kernel'].includes(transitionCase))throw Error('Unknown GPU transition fixture');
 const elements=[bg,fg,still,keyed,text,caption,handwriting];
 if(wrapperBackdrop==='spiral'){fg.props={...fg.props,zoom_blur:12,spiral_group:{origin_x:.25,origin_y:.7,start_seconds:.1,duration_seconds:1.8,turns:1}};caption.props={...caption.props,spiral_group:{origin_x:.7,origin_y:.3,start_seconds:.1,duration_seconds:1.8,turns:-1}};}
 if(wrapperBackdrop?.startsWith('page-')){bg.props={...bg.props,zoom_blur:12,keyframes:{},mask_inset:[0,0,0,0],media_opacity:1};if(wrapperBackdrop==='page-segmented'){bg.type='still';bg.source_url=source('still.png');bg.props={zoom_blur:12};}}
 if(captionMotion==='focuses'){
  for(const [animationIn,animationOut,absY] of [['focus_settle','handwriting',.05],['handwriting','focus_settle',.35],['word_pop','focus_settle',.75]] as const){
   elements.push({...caption,id:`focus-${animationIn}-${animationOut}`,lane_key:`captions_${elements.length}`,props:{...caption.props,text:'FOCUS TEXT',fontSizePx:20,maxWidth:.8,absX:.1,absY,animationIn,animationOut}});
  }
 }
 if(captionMotion==='drops'){
  for(const [absY,dropInDistanceRatio] of [[1.03,.45],[.15,.02]] as const){
   elements.push({...caption,id:`drop-${absY}`,lane_key:`captions_${elements.length}`,props:{...caption.props,text:'EDGE DROP',fontSizePx:20,maxWidth:.8,absX:.1,absY,dropInDistanceRatio}});
  }
 }
 if(['blocks','geometry'].includes(captionMotion??'')){
  for(const [preset,absY] of [['spring_pop',.02],['rotate_in',.23],['drop_in',.53],['focus_settle',.8]] as const){
   if(captionMotion==='geometry'&&preset==='focus_settle')continue;
   elements.push({...caption,id:`block-${preset}`,lane_key:`captions_${elements.length}`,props:{...caption.props,text:'MOVING TEXT',fontSizePx:20,maxWidth:.8,absX:.1,absY,animationIn:preset,animationOut:preset}});
  }
 }
 if(captionMotion==='reveals'){
  for(const [animationIn,animationOut,absY] of [['scan_reveal_down','write_on',.05],['write_on','handwriting',.35],['handwriting','write_on',.75]] as const){
   elements.push({...caption,id:`reveal-${animationIn}`,lane_key:`captions_${elements.length}`,props:{...caption.props,text:'REVEAL TEXT',fontSizePx:20,maxWidth:.8,absX:.1,absY,animationIn,animationOut}});
  }
 }
 if(captionMotion==='words'){
  for(const [animationIn,animationOut,absY] of [['word_fade','handwriting',.35],['handwriting','word_fade',.55]] as const){
   elements.push({...caption,id:`mixed-${animationIn}`,lane_key:`captions_${elements.length}`,props:{...caption.props,text:'MIXED WORDS',fontSizePx:18,maxWidth:.8,absX:.1,absY,animationIn,animationOut}});
  }
  for(const [preset,absY] of [['word_rise',.05],['word_pop',.8]] as const){
   elements.push({...caption,id:`motion-${preset}`,lane_key:`captions_${elements.length}`,props:{...caption.props,text:'ONE TWO THREE',fontSizePx:20,maxWidth:.9,absX:.05,absY,animationIn:preset,animationOut:preset}});
  }
 }
 if(captionMotion==='all'){
  for(const [preset,absX,absY] of [['slide_down',.1,-.02],['slide_left',-.04,.5],['slide_right',.85,.8]] as const){
   elements.push({...caption,id:`motion-${preset}`,lane_key:`captions_${elements.length}`,props:{...caption.props,text:'EDGE',fontSizePx:20,maxWidth:.3,absX,absY,animationIn:preset,animationOut:preset}});
  }
 }
 if(transitionCase){
  if(transitionCase==='whip-kernel'){
   if(readEnv("GPU_DIAGNOSTIC")!=='1')throw Error('Kernel isolation is diagnostic only');
   await sharp({create:{width:320,height:320,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:await sharp({create:{width:160,height:320,channels:4,background:{r:255,g:0,b:0,alpha:1}}}).png().toBuffer(),left:80,top:0}]).png().toFile(path.join(media,'blur-rect.png'));
   bg.type='still';bg.source_url=source('blur-rect.png');bg.props={};
   for(const actor of [fg,still,keyed])actor.props={...actor.props,media_opacity:0,keyframes:{}};
   for(const actor of [text,caption,handwriting])actor.props={...actor.props,text:''};
  }
  const incoming={...bg,id:'background-next',timeline_start:1.2,duration:1.2,trim_start:transitionCase==='whip-smear-handles'?.4:0,
    props:transitionCase==='whip-kernel'?{media_opacity:0}:{...bg.props,recolor_color:'#ee1280',recolor_amount:.6,recolor_preserve_shading:1}};
  if(transitionCase==='slide-travel')for(const actor of [bg,incoming])actor.props={...actor.props,transition_travel_percent:35};
  const transition:TimelineTransition={id:'fixture-join',project_id:id,from_element_id:bg.id,to_element_id:incoming.id,
    type:['page_turn','cube','wipe','film_burn','camera_flash','blackout'].includes(transitionCase)?transitionCase as TimelineTransition['type']:transitionCase==='fade'?'fade':transitionCase.startsWith('slide')?'slide':'whip',duration_seconds:transitionCase==='whip-smear-short'?4/fps:transitionCase?.startsWith('slide-smear')?.3:.4,
    params:['page_turn','cube','wipe','film_burn','camera_flash','blackout'].includes(transitionCase)?{direction:'from-right'}:transitionCase.startsWith('slide-smear')?{direction:'from-right',motion:'smear',bezier:[.65,0,.35,1],whip_blur_strength:transitionCase==='slide-smear-zoom'?0:1.5,...(transitionCase==='slide-smear-flat'?{smear_zoom_percent:0}:{})}:transitionCase.startsWith('slide')?{direction:transitionCase==='slide-left'?'from-left':transitionCase==='slide-up'?'from-top':transitionCase==='slide-down'?'from-bottom':'from-right',motion:transitionCase==='slide-in-place'?'in-place':undefined,motion_start_progress:.1,bezier:[.2,0,.8,1],...(transitionCase==='slide-blur'?{whip_blur_strength:.75}:{})}:transitionCase==='fade'?{motion_start_progress:.1,bezier:[.2,0,.8,1]}:transitionCase==='whip-smear-default'?{motion:'smear'}:{motion:'smear',direction:transitionCase==='whip-smear-vertical'?'from-bottom':'from-right',smear_travel_percent:100,smear_zoom_percent:0,whip_blur_strength:2},
    removed_at:null,removed_reason:null,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
  bg.duration=1.2;bg.transition_out=transition;incoming.transition_in=transition;elements.push(incoming);
 }
 const inputProps={elements,laneOrderKeys:[]};
 const transitionProbeFrame=bg.transition_out?36-Math.ceil(bg.transition_out.duration_seconds*fps/2):29;
 const bundle=await build({stdin:{contents:"export {CanvasKitCompositor} from './src/lib/gpu-preview/canvaskit-compositor'; export {GpuPreviewRuntime} from './src/lib/gpu-preview/runtime'; export {BrowserFrameProvider} from './src/lib/gpu-preview/browser-frame-provider'; export {admitGpuScene,gpuSceneCapabilityIssues} from './src/lib/gpu-preview/scene'; export {GpuTextCache} from './src/lib/gpu-preview/text-cache'; export {gpuTextAnchor,gpuTextBounds} from './src/lib/gpu-preview/text-bounds'; export {gpuTextTextureKey} from './src/lib/gpu-preview/scene-draws';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'GpuProof',platform:'browser'});
 const server=await chromium.launchServer({channel:'chrome',headless:true,args:['--force-color-profile=srgb','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const browser=await chromium.connect(server.wsEndpoint());
 const rows:any[]=[];const receipt:any={ok:false,compositorEngine,output,rows,date:new Date().toISOString(),width:w,height:h,coverage:'Synthetic RGB + alpha foreground, transparent PNG with animated opacity and clip boundaries, ordinary multiline outlined caption and cropped SVG handwriting entrance/exit, transformed tracked text, mirrored/rotated sources, rounded window opening, recolor, animated basic and advanced linearRGB grading, animated green-screen key with spill suppression, animated mask bars, tail hold, repeated seeks, encoded reference; no audio or performance claim.'};
 try{
  receipt.wrapperBackdrop=wrapperBackdrop??null;receipt.radialCase=radialCase??null;receipt.captionOffsets=captionOffsets;receipt.cameraMaterial=cameraMaterial;receipt.cameraBlur=cameraBlur;receipt.fillCase=fillCase??null;receipt.standaloneVideoFill=standaloneVideoFill;receipt.videoFillLayout=videoFillLayout??null;receipt.inverseCase=inverseCase??null;receipt.blendCase=blendCase??null;receipt.browserVersion=browser.version();receipt.captionCase=captionCase??null;receipt.captionStyle=captionStyle??null;receipt.captionMotionCase=captionMotion??null;receipt.captionFadeCase=captionFade??null;receipt.blurCase=blurCase??null;receipt.lutCase=lutCase??null;receipt.flashCase=flashCase??null;receipt.mediaAnimationCase=mediaAnimationCase??null;receipt.outlineCase=outlineCase??null;receipt.glowCase=glowCase??null;receipt.transitionCase=transitionCase??null;
  const reference=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1}),gpu=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  reference.on('pageerror',error=>console.error('Standard reference page error:',error.message));
  await Promise.all([reference,gpu].map(page=>page.addInitScript('globalThis.__name = (value) => value')));
  await Promise.all([reference,gpu].map(page=>page.goto(`${base}/render-frame`,{waitUntil:'domcontentloaded'})));
  await reference.waitForFunction(()=>!!window.__dreamcutRender);
  await reference.evaluate(config=>window.__dreamcutRender!.load(config),{width:w,height:h,fps,durationInFrames:count,rendering:true,inputProps});
  if(readEnv("GPU_CAPTION_COMPOSITING_PROBE")==='1'){
   if(!captionMotion||readEnv("GPU_DIAGNOSTIC")!=='1')throw Error('Caption compositing probe requires caption motion and diagnostic mode');
   await reference.addStyleTag({content:'[style*="transform-origin"] { will-change: transform !important; }'});
   receipt.captionCompositingProbe={referenceWillChangeTransform:true,scope:'Altered reference rasterization diagnostic; never production parity evidence'};
  }
  if(readEnv("GPU_MEDIA_COMPOSITING_PROBE")==='1'){
   if(mediaAnimationCase!=='pop-still'||readEnv("GPU_DIAGNOSTIC")!=='1')throw Error('Media compositing probe requires pop-still and diagnostic mode');
   await reference.addStyleTag({content:'[data-timeline-element-id="still"] [style*="perspective(1100px)"] { will-change: transform !important; }'});
   receipt.mediaCompositingProbe={referenceWillChangeTransform:true,scope:'Altered still animation reference rasterization diagnostic; never production parity evidence'};
  }
  if(readEnv("GPU_TRANSITION_COMPOSITING_PROBE")==='1'){
   if(!transitionCase?.startsWith('slide')||readEnv("GPU_DIAGNOSTIC")!=='1')throw Error('Transition compositing probe requires a slide and diagnostic mode');
   await reference.addStyleTag({content:'[style*="translate3d"] { will-change: transform !important; }'});
   receipt.transitionCompositingProbe={referenceWillChangeTransform:true,scope:'Altered transition reference rasterization diagnostic; never production parity evidence'};
  }
  if(compositorEngine==='canvaskit'){
   const wasm=path.resolve('node_modules/canvaskit-wasm/bin/canvaskit.wasm');
   await gpu.route('**/gpu-proof-canvaskit.wasm',route=>route.fulfill({path:wasm,contentType:'application/wasm'}));
   await gpu.addScriptTag({path:path.resolve('node_modules/canvaskit-wasm/bin/canvaskit.js')});
   await gpu.evaluate(async()=>{(window as any).proofCanvasKit=await (window as any).CanvasKitInit({locateFile:()=>'/gpu-proof-canvaskit.wasm'});});
  }
  await gpu.addScriptTag({content:bundle.outputFiles[0].text});
  if(compositorEngine==='canvaskit')await canvasKitBudgetProof(gpu);
  receipt.htmlCanvas=await gpu.evaluate(()=>({requestPaint:typeof (HTMLCanvasElement.prototype as any).requestPaint,drawElementImage:typeof (CanvasRenderingContext2D.prototype as any).drawElementImage,copyElementImageToTexture:typeof GPUQueue==='undefined'?'undefined':typeof (GPUQueue.prototype as any).copyElementImageToTexture}));
  receipt.featherCase=featherCase??null;
  receipt.adapter=await gpu.evaluate(async({radialCase,compositorEngine,elements,w,h,fps,transitionCase,mediaAnimationCase,featherCase,lutCase,captionMotion,blendCase,inverseCase,fillCase,blurCase,captionStyle,captionOffsets})=>{
   const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No GPU adapter');const device=await adapter.requestDevice();
   const canvas=document.createElement('canvas');canvas.id='gpu-proof';canvas.width=w;canvas.height=h;canvas.style.cssText='position:fixed;inset:0';document.body.append(canvas);
   const context=compositorEngine==='webgpu'?canvas.getContext('webgpu'):null,format=navigator.gpu.getPreferredCanvasFormat();context?.configure({device,format,alphaMode:'opaque'});
   const api=(window as any).GpuProof,admitted=api.admitGpuScene(elements,'fixture',compositorEngine);
   const experimental=!admitted.supported&&api.gpuSceneCapabilityIssues(elements,'fixture',compositorEngine).every((issue:any)=>
    (!!radialCase&&['property:iris_radius','property:iris_feather','property:zoom_blur'].includes(issue.capability))||(captionOffsets&&['property:keyframes','property:media_offset_x','property:media_offset_y'].includes(issue.capability))||(captionStyle==='camera_reveal'&&(issue.capability.startsWith('property:cameraReveal')||['textScaleX','textScaleY','offsetX','offsetY','mediaFillTransition','mediaFillSlideDirection','mediaFillChangeTimesSeconds'].some(key=>issue.capability===`property:${key}`)))|| (['geometry','blocks','pop','spring_pop','rotate_in','focus_settle','focuses'].includes(captionMotion??'')&&issue.capability==='caption-animation')|| ((!!inverseCase||!!captionStyle)&&issue.capability==='caption-style')|| (!!fillCase&&['caption-style','property:mediaFillUrls','property:mediaFillSecondsPerImage','property:mediaFillCrossfadeSeconds','property:mediaFillScale','property:mediaFillPanPercent','property:mediaFillVideoUrl','property:mediaFillVideoPreviewUrl','property:mediaFillVideoPlaybackRate','property:mediaFillScene'].includes(issue.capability))|| (blurCase?.startsWith('transition')&&['animation:transition_blur','property:transition_blur'].includes(issue.capability))|| (!!blendCase&&issue.capability==='blend')|| (!!transitionCase&&issue.capability==='transitions')|| (!!mediaAnimationCase&&issue.capability==='media-animation')|| (!!featherCase&&(issue.capability==='feather-mask'||featherCase==='rotated'&&['property:mask_line_rotation','rotated-mask-blur'].includes(issue.capability)))|| (!!lutCase&&['property:lut_asset_id','property:lut_source_url','property:lut_intensity','animation:lut_intensity'].includes(issue.capability)));
   if(!admitted.supported&&!experimental)throw Error(admitted.reason);
   const gpuErrors:string[]=[];device.addEventListener('uncapturederror',event=>gpuErrors.push(event.error.message));
   (window as any).proof={device,gpuErrors,runtime:new api.GpuPreviewRuntime(device,context,format,admitted.supported?admitted.elements:elements,[],'fixture',w,h,fps,compositorEngine==='canvaskit'?new api.CanvasKitCompositor((window as any).proofCanvasKit,canvas):undefined)};
   return {compositorEngine,vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description,experimentalAdmissionOverride:experimental};
  },{radialCase,compositorEngine,elements,w,h,fps,transitionCase,mediaAnimationCase,featherCase,lutCase,captionMotion,blendCase,inverseCase,fillCase,blurCase,captionStyle,captionOffsets});
  receipt.experimentalAdmissionOverride=receipt.adapter.experimentalAdmissionOverride;
  const pixels=async(buffer:Buffer)=>sharp(buffer).removeAlpha().raw().toBuffer();
  const diff=(a:Buffer,b:Buffer)=>{assert.equal(a.length,b.length);let sum=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;max=Math.max(max,d);}return {mean:sum/a.length,max};};
  const captureGpu=async(frame:number)=>{
   await gpu.evaluate(async frame=>{const p=(window as any).proof;if(!await p.runtime.present(frame,frame))throw Error('Incomplete GPU packet');await p.device.queue.onSubmittedWorkDone();},frame);
   const png=await gpu.locator('#gpu-proof').screenshot();
   const errors=await gpu.evaluate(()=>(window as any).proof.gpuErrors);
   assert.deepEqual(errors,[],`GPU validation failed preparing frame ${frame}`);
   return png;
  };
  const prior=new Map<number,Buffer>(),priorReference=new Map<number,Buffer>();
  for(const frame of [...((fillCase||transitionCase||inverseCase||['words','reveals','blocks','geometry','drops','focuses'].includes(captionMotion??''))?[65]:[]),0,15,29,45,60,71,...((captionSpecial||captionMask)?[3,18,33,48,62,33,3]:[]),...(captionWall?[6,9,12,21,33,54,58,9,6]:[]),...(captionSpeech?[3,4,9,15,24,30,33,34,39,45,56,57,15,24,3]:[]),...(captionMotion?[10,11,12,13]:[]),...(mediaAnimationCase?[5,10,50,55,58,59]:[]),...(transitionCase?[23,24,30,32,35,36,transitionProbeFrame,29,23]:[]),15,0]){
   await reference.evaluate(frame=>window.__dreamcutRender!.frame(frame),frame);
   if(readEnv("GPU_DIAGNOSTIC")==='1'){
    receipt.referenceMediaSnapshots??=[];
    receipt.referenceMediaSnapshots.push({frame,media:await reference.evaluate(async()=>{
     return Promise.all([...document.querySelectorAll<HTMLCanvasElement>('#dreamcut-render-surface canvas')].map(async canvas=>{
      const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
      const context=copy.getContext('2d')!;context.drawImage(canvas,0,0);
      const bytes=context.getImageData(0,0,copy.width,copy.height).data;
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
      const video=canvas.parentElement?.querySelector('video');
      return {width:canvas.width,height:canvas.height,hash,presentedTime:canvas.dataset.presentedSourceTime??null,videoTime:video?.currentTime??null};
     }));
    })});
   }
   if(captionStyle==='camera_reveal'){
    const layout=await reference.evaluate(()=>{const canvas=document.querySelector<HTMLCanvasElement>('[data-caption-camera-reveal] canvas');if(!canvas)return null;const r=canvas.getBoundingClientRect();return {width:canvas.width,height:canvas.height,layoutWidth:parseFloat(canvas.style.width),layoutHeight:parseFloat(canvas.style.height),displayWidth:r.width,displayHeight:r.height};});
    receipt.cameraLayouts??=[];receipt.cameraLayouts.push({frame,layout});
    if(layout){assert.equal(layout.layoutWidth,w,'3D canvas measurement included its animated CSS scale');assert.equal(layout.layoutHeight,h,'3D canvas measurement included its animated CSS scale');}
   }
   const referencePng=await reference.locator('#dreamcut-render-surface').screenshot();fs.writeFileSync(path.join(output,`standard-${frame}.png`),referencePng);
   const expected=await pixels(referencePng),png=await captureGpu(frame),actual=await pixels(png),delta=diff(expected,actual);
   fs.writeFileSync(path.join(output,`gpu-${frame}.png`),png);
   rows.push({frame,kind:'raw',...delta});
   if(!priorReference.has(frame))fs.writeFileSync(path.join(output,`standard-first-${frame}.png`),referencePng);
   const previousReference=priorReference.get(frame);
   if(previousReference){
    const repeat=diff(previousReference,expected);
    rows.push({frame,kind:'reference-repeat',...repeat});
    if(repeat.max>0){
     const changed=[];
     for(let i=0;i<expected.length&&changed.length<32;i++)if(expected[i]!==previousReference[i]){
      const pixel=Math.floor(i/3);changed.push({x:pixel%w,y:Math.floor(pixel/w),channel:i%3,first:previousReference[i],repeat:expected[i]});
     }
     receipt.referenceRepeatDifferences??=[];receipt.referenceRepeatDifferences.push({frame,...repeat,firstChangedChannels:changed});
    }
    if(readEnv("GPU_DIAGNOSTIC")!=='1')assert.ok(expected.equals(previousReference),'Standard repeated seek changed pixels');
   }
   priorReference.set(frame,expected);
   if(mediaAnimationCase){
    receipt.mediaAnimationGeometry??=[];
    receipt.mediaAnimationGeometry.push({frame,standard:await reference.evaluate(()=>{
     const root=document.querySelector('#dreamcut-render-surface')!;
     return [...root.querySelectorAll<HTMLElement>('[style],canvas,video,img')].flatMap(node=>{
      const style=getComputedStyle(node);
      if(style.transform==='none'&&style.clipPath==='none'&&style.filter==='none'&&!['CANVAS','VIDEO','IMG'].includes(node.tagName))return [];
      const r=node.getBoundingClientRect();
      return [{tag:node.tagName,transform:style.transform,origin:style.transformOrigin,opacity:style.opacity,clip:style.clipPath,filter:style.filter,
       rect:{x:r.x,y:r.y,width:r.width,height:r.height}}];
     });
    }),gpu:await gpu.evaluate(frame=>(window as any).proof.runtime.scene(frame).layers.filter((layer:any)=>layer.kind==='video').map((layer:any)=>({
     id:layer.element.id,transform:layer.transform,mask:layer.mask,animation:layer.animation,opacity:layer.opacity,timeUs:layer.timeUs,
    })),frame)});
   }
   if(transitionCase&&[29,30,31,32,35].includes(frame)){
    receipt.transitionRasterGeometry??=[];
    receipt.transitionRasterGeometry.push({frame,standard:await reference.evaluate(()=>[...document.querySelectorAll<HTMLElement>('#dreamcut-render-surface [style]')].flatMap(node=>{
      const style=getComputedStyle(node);if(!style.filter.startsWith('url('))return [];
      const r=node.getBoundingClientRect();return [{rect:{x:r.x,y:r.y,width:r.width,height:r.height},layout:{width:node.offsetWidth,height:node.offsetHeight},transform:style.transform,filter:style.filter,gaussian:[...node.querySelectorAll('feGaussianBlur')].map(filter=>filter.getAttribute('stdDeviation'))}];
    })),gpu:await gpu.evaluate(frame=>(window as any).proof.runtime.scene(frame).layers.filter((layer:any)=>layer.kind==='video'&&layer.transition).map((layer:any)=>({id:layer.element.id,transition:layer.transition})),frame)});
   }
   if(transitionCase&&frame===29&&!receipt.transitionGeometry){
    receipt.transitionGeometry={frame,standard:await reference.evaluate(()=>[...document.querySelectorAll<HTMLElement>('#dreamcut-render-surface [style]')].filter(node=>getComputedStyle(node).clipPath!=='none').map(node=>{
      const style=getComputedStyle(node),r=node.getBoundingClientRect();
      return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},clipPath:style.clipPath,transform:style.transform};
    })),gpu:await gpu.evaluate(frame=>(window as any).proof.runtime.scene(frame).layers.filter((layer:any)=>layer.kind==='video').map((layer:any)=>({id:layer.element.id,mask:layer.mask,transition:layer.transition,transform:layer.transform})),frame)};
   }
   if(captionMotion){
    const geometry={frame,standard:await reference.evaluate(()=>[...document.querySelectorAll<HTMLElement>('[style*="transform-origin"]')].filter(node=>node.style.fontFamily).map(node=>{const r=node.getBoundingClientRect();return {text:node.textContent,center:[r.x+r.width/2,r.y+r.height/2],transform:node.style.transform,font:getComputedStyle(node).font,computedTransform:getComputedStyle(node).transform,opacity:getComputedStyle(node).opacity};})),gpu:await gpu.evaluate(async frame=>{
     const p=(window as any).proof,api=(window as any).GpuProof,rows=[];
     for(const layer of p.runtime.scene(frame).layers){if(layer.kind!=='caption')continue;
      const lease=await p.runtime.text.acquire(layer,new AbortController().signal);
      try{rows.push({text:layer.text.text,anchor:api.gpuTextAnchor(lease.frame.value),bounds:api.gpuTextBounds(lease.frame.value,layer.planeWidth,layer.planeHeight),translation:layer.translation,scale:layer.scale,rotateZDeg:layer.rotateZDeg});}finally{lease.release();}
     }return rows;
    },frame)};
    if(captionMotion==='spring_pop'&&[10,11,12,13,15].includes(frame)){
     const standard=geometry.standard.find(row=>row.text===caption.props?.text);
     const candidate=geometry.gpu.find(row=>row.text===caption.props?.text);
     assert.ok(standard&&candidate?.anchor,'Spring caption geometry must be measurable');
     const matrix=standard.computedTransform.match(/^matrix3d\((.+)\)$/)?.[1].split(',').map(Number);
     assert.ok(matrix?.length===16,'Spring caption must expose its computed transform');
     assert.ok(Math.abs(matrix[0]-candidate.scale)<1e-5&&Math.abs(matrix[5]-candidate.scale)<1e-5,'Spring caption scale diverged from Standard');
     assert.ok(standard.center.every((value,index)=>Math.abs(value-candidate.anchor![index])<1e-4),'Spring caption center diverged from Standard');
    }
    (receipt.captionGeometrySamples??=[]).push(geometry);
    if(frame===15)receipt.captionGeometry=geometry;
   }

   if(prior.has(frame))assert.ok(actual.equals(prior.get(frame)!),'GPU repeated seek changed pixels');prior.set(frame,actual);
  }
  if(captionStyle==='benchmark_card'){
   receipt.scorecardRaster=await gpu.evaluate(async()=>{
    const runtime=(window as any).proof.runtime,signal=new AbortController().signal;
    const samples=[],canvases=[];
    for(const frame of [3,15,27,33]){
     const layer=runtime.scene(frame).layers.find((layer:any)=>layer.element.id==='ordinary-caption');
     const lease=await runtime.text.acquire(layer,signal);
     try{
      const canvas=lease.frame.value;canvases.push(canvas);
      samples.push({width:canvas.width,height:canvas.height,bytes:new Uint8Array(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data)});
     }finally{lease.release();}
    }
    const differences=samples.slice(1).map((sample,index)=>{
     const prior=samples[index];if(sample.width!==prior.width||sample.height!==prior.height)throw Error('Scorecard changed texture bounds during bar animation');
     let changed=0;for(let i=0;i<sample.bytes.length;i++)if(sample.bytes[i]!==prior.bytes[i])changed++;
     return changed;
    });
    return {frames:[3,15,27,33],changedChannels:differences,settledTextureReused:canvases[2]===canvases[3]};
   });
   assert.ok(receipt.scorecardRaster.changedChannels[0]>100&&receipt.scorecardRaster.changedChannels[1]>100,'Scorecard bars did not visibly advance');
   assert.equal(receipt.scorecardRaster.changedChannels[2],0,'Settled scorecard kept changing');
   assert.equal(receipt.scorecardRaster.settledTextureReused,true,'Settled scorecard did not reuse its texture');
  }
  if(readEnv("GPU_DIAGNOSTIC")==='1'){
   receipt.diagnosticOnly=true;receipt.captionCase=captionCase;
   if(readEnv("GPU_BLUR_PROFILE")==='1')receipt.blurProfiles=await reference.evaluate(()=>{
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('width','0');svg.setAttribute('height','0');document.body.append(svg);
    try{
     return [3,6,42*320/1080,20].map((sigma,index)=>{
      const filter=document.createElementNS(ns,'filter'),blur=document.createElementNS(ns,'feGaussianBlur');
      const id=`diagnostic-blur-${index}`;filter.id=id;
      for(const [key,value] of Object.entries({x:'-100%',y:'-100%',width:'300%',height:'300%','color-interpolation-filters':'sRGB'}))filter.setAttribute(key,value);
      blur.setAttribute('stdDeviation',`${sigma} 0`);filter.append(blur);svg.append(filter);
      const source=document.createElement('canvas'),output=document.createElement('canvas');
      source.width=source.height=output.width=output.height=320;
      source.getContext('2d')!.fillRect(160,0,1,320);
      const context=output.getContext('2d')!;context.filter=`url(#${id})`;context.drawImage(source,0,0);
      const bytes=context.getImageData(0,160,320,1).data;
      const alpha=Array.from({length:320},(_,x)=>bytes[x*4+3]);
      const sum=alpha.reduce((n,v)=>n+v,0);
      if(sum===0)throw Error('Blur impulse probe was blank');
      return {sigma,alpha,totalAlpha:sum,centroid:alpha.reduce((n,v,x)=>n+(x-160)*v,0)/sum};
     });
    }finally{svg.remove();}
   });
   receipt.gpuErrors=await gpu.evaluate(()=>(window as any).proof.gpuErrors);
   assert.deepEqual(receipt.gpuErrors,[],'Diagnostic comparison contains GPU validation errors');
   console.log(JSON.stringify({diagnosticOnly:true,output,htmlCanvas:receipt.htmlCanvas,blurProfiles:receipt.blurProfiles?.map((p:any)=>({sigma:p.sigma,totalAlpha:p.totalAlpha,centroid:p.centroid})),rows}));return;
  }
  assert.ok(diff(prior.get(0)!,prior.get(15)!).mean>.5,'Moving fixture is blank or frozen');
  await gpu.evaluate(elements=>{const p=(window as any).proof;p.runtime.updateScene(elements.filter((e:any)=>e.id!=='note'),[]);},elements);
  assert.ok(diff(prior.get(0)!,await pixels(await captureGpu(0))).mean>.05,'GPU tracked text did not change any meaningful pixels');
  await gpu.evaluate(elements=>{(window as any).proof.runtime.updateScene(elements.filter((e:any)=>e.id!=='ordinary-caption'),[]);},elements);
  assert.ok(diff(prior.get(15)!,await pixels(await captureGpu(15))).mean>.05,'GPU ordinary caption did not change meaningful pixels');
  await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
  if(lutCase){
   const actor=lutCase.includes('alpha')?fg:bg;
   const without=elements.map(element=>{
    if(element.id!==actor.id)return element;
    const props={...element.props},keyframes={...(props.keyframes as object??{})} as Record<string,unknown>;
    delete props.lut_asset_id;delete props.lut_source_url;delete props.lut_intensity;delete keyframes.lut_intensity;props.keyframes=keyframes;
    return {...element,props};
   });
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),without);
   assert.ok(diff(prior.get(15)!,await pixels(await captureGpu(15))).mean>.05,'GPU LUT did not change meaningful pixels');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(await pixels(await captureGpu(15)),prior.get(15),'GPU LUT reset changed pixels');
  }
  if(featherCase){
   const actor=featherCase==='rgb'?bg:fg;
   const hard=elements.map(element=>element.id!==actor.id?element:{...element,props:{...element.props,mask_feather:0,keyframes:{...(element.props?.keyframes as object??{}),mask_feather:[]}}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),hard);
   receipt.featherVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.featherVisibleDifference>.05,'Feather mask did not visibly change its actor');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Restoring feather changed its deterministic picture');
  }
  if(transitionCase){
   const noJoin=elements.map(element=>({...element,transition_in:null,transition_out:null}));
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),noJoin);
   receipt.transitionVisibleDifference=diff(prior.get(transitionProbeFrame)!,await pixels(await captureGpu(transitionProbeFrame))).mean;
   assert.ok(receipt.transitionVisibleDifference>.05,'Transition did not visibly change the overlap');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(transitionProbeFrame)!,await pixels(await captureGpu(transitionProbeFrame)),'Restoring a transition changed its deterministic picture');
  }
  if(wrapperBackdrop){
   const probe=wrapperBackdrop==='spiral'?15:transitionProbeFrame;
   const neutral=elements.map(element=>({...element,props:{...element.props,zoom_blur:0}}));
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),neutral);
   receipt.wrapperBlurVisibleDifference=diff(prior.get(probe)!,await pixels(await captureGpu(probe))).mean;
   assert.ok(receipt.wrapperBlurVisibleDifference>.01,'Wrapper edge blur did not visibly change pixels');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(probe)!,await pixels(await captureGpu(probe)),'Wrapper backdrop reset changed pixels');
  }
  if(mediaAnimationCase&&mediaAnimationCase!=='identity'){
   const actor=mediaAnimationCase==='pop-still'?still:mediaAnimationCase.includes('-rgb')?bg:fg;
   const probeFrame=mediaAnimationCase==='pop-still'?10:0;
   const settled=elements.map(element=>element.id!==actor.id?element:{...element,props:{...element.props,animationIn:'none',animationOut:'none'}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),settled);
   receipt.mediaAnimationVisibleDifference=diff(prior.get(probeFrame)!,await pixels(await captureGpu(probeFrame))).mean;
   assert.ok(receipt.mediaAnimationVisibleDifference>.05,'Media animation did not visibly change its actor');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(probeFrame)!,await pixels(await captureGpu(probeFrame)),'Restoring media animation changed its deterministic picture');
  }
  if(glowCase){
   const withoutGlow=elements.map(element=>element.id!==fg.id?element:{...element,props:{...element.props,subject_glow_state:'disabled'}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),withoutGlow);
   receipt.glowVisibleDifference=diff(prior.get(0)!,await pixels(await captureGpu(0))).mean;
   assert.ok(receipt.glowVisibleDifference>.01,'Glow did not visibly change its actor');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(0)!,await pixels(await captureGpu(0)),'Restoring glow changed its deterministic picture');
  }
  if(outlineCase){
   const withoutOutline=elements.map(element=>element.id!==fg.id?element:{...element,props:{...element.props,sticker_outline:false}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),withoutOutline);
   receipt.outlineVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.outlineVisibleDifference>.05,'Outline did not visibly change its actor');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Restoring outline changed its deterministic picture');
  }
  if(flashCase){
   const unflashed=elements.map(element=>element.id!==fg.id?element:{...element,props:{...element.props,subject_flash:0,keyframes:{}}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),unflashed);
   receipt.flashVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.flashVisibleDifference>.05,'Flash did not visibly change its actor');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Restoring flash changed its deterministic picture');
  }
  if(blurCase?.startsWith('transition')){
   const reset=elements.map(e=>e.id!==fg.id?e:{...e,props:{...e.props,keyframes:{...(e.props?.keyframes as object??{}),transition_blur:[]},transition_blur:0}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),reset);
   receipt.transitionBlurVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.transitionBlurVisibleDifference>.05,'Transition blur did not visibly change its actor');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Restoring transition blur changed pixels');
  }
  if(blurCase&&blurCase!=='masked-only'&&!blurCase.startsWith('transition')){
   const unblurred=elements.map(element=>element.id!==fg.id?element:{...element,props:{...element.props,directional_blur_x:0,directional_blur_y:0,keyframes:{}}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),unblurred);
   receipt.blurVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.blurVisibleDifference>.05,'Blur did not visibly change its actor');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Restoring blur changed its deterministic picture');
  }
  if(blendCase){
   const neutral=elements.map(element=>({...element,props:{...element.props,media_blend_mode:'normal'}}));
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),neutral);
   receipt.blendVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.blendVisibleDifference>.1,'Blend did not visibly change the picture');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Blend reset changed the deterministic picture');
  }
  if(inverseCase){
   const neutral=elements.map(element=>element.type==='caption_text'?{...element,props:{...element.props,styleVariant:'none'}}:element);
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),neutral);
   receipt.inverseVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.inverseVisibleDifference>.1,'Inverse text did not visibly change the backdrop');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Inverse reset changed the deterministic picture');
  }
  if(captionCase==='static-layout'||captionSpeech||captionWall||captionMask){
   const neutral=elements.map(element=>element.id!==caption.id?element:{...element,props:{...element.props,offsetX:0,offsetY:0,textScaleX:1,textScaleY:1,groupLayout:null,timingMode:'phrase',wordTimings:[],...(captionWall?{surfaceMode:'none'}:{}),...(captionMask?{text_mask_url:null}:{})}});
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),neutral);
   receipt.captionControlVisibleDifference=diff(prior.get(15)!,await pixels(await captureGpu(15))).mean;
   assert.ok(receipt.captionControlVisibleDifference>.05,'Caption controls did not visibly change the picture');
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   assert.deepEqual(prior.get(15)!,await pixels(await captureGpu(15)),'Caption control reset changed pixels');
  }
  if(captionWall){
   // A changed neutral-control picture does not prove the wall actor exists:
   // dropping the actor also differs from an unprojected caption. Compare the
   // active projected result to the same scene with only that caption removed.
   const wallFrames=[29,33,45],wallPictures=new Map<number,Buffer>();
   for(const frame of wallFrames)wallPictures.set(frame,await pixels(await captureGpu(frame)));
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements.filter(element=>element.id!==caption.id));
   receipt.wallMotionPresence=[];
   try{
    for(const frame of wallFrames){
     const actual=wallPictures.get(frame)!,without=await pixels(await captureGpu(frame));
     let changedPixels=0;
     for(let i=0;i<actual.length;i+=3)if(Math.max(Math.abs(actual[i]-without[i]),Math.abs(actual[i+1]-without[i+1]),Math.abs(actual[i+2]-without[i+2]))>8)changedPixels++;
     receipt.wallMotionPresence.push({frame,changedPixels,...diff(actual,without)});
    }
   }finally{await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);}
   for(const frame of [...wallFrames].reverse())assert.deepEqual(await pixels(await captureGpu(frame)),wallPictures.get(frame),'Wall presence reset/backward seek changed pixels');
   assert.ok(receipt.wallMotionPresence.every((row:any)=>row.changedPixels>40),'Projected wall caption is missing from the composited picture at its fully visible hold');
   receipt.wallMotionRaster=await gpu.evaluate(async()=>{
    const runtime=(window as any).proof.runtime,signal=new AbortController().signal,held=[],rows=[];
    try{for(const frame of [6,9,12,21,33,54,58,9]){
     const layer=runtime.scene(frame).layers.find((layer:any)=>layer.element.id==='ordinary-caption');
     const lease=await runtime.text.acquire(layer,signal);held.push(lease);
     const canvas=lease.frame.value,bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
     let ink=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])ink++;
     rows.push({frame,ink,reused:canvas===held[0].frame.value,scale:layer.scale,opacity:layer.opacity});
    }return rows;}finally{for(const lease of held)lease.release();}
   });
   assert.ok(receipt.wallMotionRaster.every((row:any)=>row.ink>0&&row.reused),'Projected wall motion must reuse its visible neutral glyph raster');
   assert.notEqual(receipt.wallMotionRaster[0].scale,receipt.wallMotionRaster[3].scale,'Wall entrance scale did not advance');
   assert.notEqual(receipt.wallMotionRaster[4].scale,receipt.wallMotionRaster[6].scale,'Wall exit scale did not advance');
  }
  if(captionSpeech){
   receipt.speechRaster=await gpu.evaluate(async()=>{
    const runtime=(window as any).proof.runtime,signal=new AbortController().signal,rows=[];
    for(const frame of [3,4,9,15,24,30,33,34,39,45,56,57,15,24,3]){
     const layer=runtime.scene(frame).layers.find((layer:any)=>layer.element.id==='ordinary-caption');
     const lease=await runtime.text.acquire(layer,signal);
     try{
      const canvas=lease.frame.value,bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let ink=0,hash=2166136261;for(let i=0;i<bytes.length;i++){hash=Math.imul(hash^bytes[i],16777619);if(i%4===3&&bytes[i]>0)ink++;}
      rows.push({frame,phase:layer.speechPhase,ink,signature:`${canvas.width}x${canvas.height}:${hash>>>0}`});
     }finally{lease.release();}
    }return rows;
   });
   const sample=(frame:number)=>receipt.speechRaster.find((row:any)=>row.frame===frame);
   assert.ok(sample(15).ink>0&&sample(45).ink>0,'Speech words must have visible ink');
   assert.equal(sample(24).phase.index,-1,'Expected the inter-word gap');
   assert.notEqual(sample(15).signature,sample(45).signature,'The active word never visibly changed');
   assert.equal(sample(9).signature,sample(15).signature,'First word hold must reuse identical glyphs');
   assert.equal(sample(39).signature,sample(45).signature,'Second word hold must reuse identical glyphs');
   if(captionCase==='speech-single'){
    assert.equal(sample(24).ink,0,'Single-word gap must have no text');
    assert.notEqual(sample(3).signature,sample(4).signature,'Single-word entrance squeeze is missing');
   }else assert.ok(sample(24).ink>0,'Active-word gap retains its unhighlighted phrase');
   for(const row of receipt.speechRaster)assert.equal(row.signature,sample(row.frame).signature,'Backward speech seek changed pixels');
  }
  if(captionSpecial||captionMask){
   const sampleFrames=captionCase==='ticker'?[3,18,33,48,62]:[3,18,33];
   const originalPictures=new Map<number,Buffer>();
   for(const frame of sampleFrames)originalPictures.set(frame,await pixels(await captureGpu(frame)));
   const neutral=elements.filter(element=>element.id!==caption.id);
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),neutral);
   receipt.specialCaptionVisibility=[];
   for(const frame of sampleFrames){
    const original=originalPictures.get(frame)!,empty=await pixels(await captureGpu(frame));
    let count=0,sumY=0,left=w,right=-1,top=h,bottom=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const i=(y*w+x)*3;if(Math.max(...[0,1,2].map(c=>Math.abs(original[i+c]-empty[i+c])))<=8)continue;
     count++;sumY+=y;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    receipt.specialCaptionVisibility.push({frame,changedPixels:count,centroidY:count?sumY/count:null,bounds:count?{left,right,top,bottom}:null});
   }
   await gpu.evaluate(elements=>(window as any).proof.runtime.updateScene(elements,[]),elements);
   for(const frame of [...sampleFrames].reverse())assert.deepEqual(await pixels(await captureGpu(frame)),originalPictures.get(frame),'Special caption reset/backward seek changed pixels');
   const visibility=receipt.specialCaptionVisibility;
   if(captionCase==='ticker'){
    // Linear texture sampling can touch the boundary pixel while the layout starts outside.
    assert.ok(visibility[0].changedPixels===0||(visibility[0].bounds?.left===w-1&&visibility[0].bounds?.right===w-1),'Ticker start may only touch the antialiased rightmost pixel column');
    assert.ok(visibility[2].changedPixels>40,'Ticker never entered the visible viewport');
    assert.equal(visibility.at(-1).changedPixels,0,'Ticker must finish beyond the left viewport edge');
   }else if(captionMask){
    assert.ok(visibility[0].changedPixels>40,'Moving text must begin inside the fixed mask');
    assert.equal(visibility.at(-1).changedPixels,0,'Moving text must disappear beyond the fixed mask');
    assert.ok(visibility.every((row:any)=>!row.bounds||row.bounds.right<w/2+1),'Fixed mask moved with the text');
   }else{
    assert.ok(visibility.every((row:any)=>row.changedPixels>40),'Scan line must remain visibly drawn');
    assert.ok(visibility[0].centroidY<visibility[1].centroidY&&visibility[1].centroidY<visibility[2].centroidY,'Scan line did not move down');
    assert.ok(Math.abs(visibility[0].centroidY-h*.2)<4&&Math.abs(visibility[2].centroidY-h*.8)<4,'Scan line missed its authored endpoints');
   }
   receipt.specialCaptionGlyphs=await gpu.evaluate(async frames=>{
    const runtime=(window as any).proof.runtime,signal=new AbortController().signal,rows=[],held=[];
    try{
     for(const frame of frames){
      const layer=runtime.scene(frame).layers.find((layer:any)=>layer.element.id==='ordinary-caption');
      const lease=await runtime.text.acquire(layer,signal);held.push(lease);
      const canvas=lease.frame.value,bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let ink=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])ink++;
      rows.push({frame,ink,width:canvas.width,height:canvas.height,reused:canvas===held[0].frame.value});
     }return rows;
    }finally{for(const lease of held)lease.release();}
   },sampleFrames);
   assert.ok(receipt.specialCaptionGlyphs.every((row:any)=>row.ink>0&&row.reused),'Special caption movement must reuse visible static glyph pixels');
  }
  // The current renderer/encoder remains the independent output authority.
  const encoded=path.join(output,'reference.mp4');
  await renderBrowserVideo({baseUrl:base,outputLocation:encoded,width:w,height:h,fps,durationInFrames:count,inputProps,concurrency:2,crf:12});
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',encoded,path.join(output,'encoded-%03d.png')]);
  for(let frame=0;frame<count;frame++){
   const png=await captureGpu(frame);fs.writeFileSync(path.join(output,`candidate-${String(frame+1).padStart(3,'0')}.png`),png);
   const actual=await pixels(png),encodedReference=await pixels(fs.readFileSync(path.join(output,`encoded-${String(frame+1).padStart(3,'0')}.png`)));
   await reference.evaluate(frame=>window.__dreamcutRender!.frame(frame),frame);
   const standardPng=await reference.locator('#dreamcut-render-surface').screenshot();
   if(captionMotion||transitionCase||fillCase||mediaAnimationCase||readEnv("GPU_ENCODING_CONTROL")==='1')fs.writeFileSync(path.join(output,`reference-raw-${String(frame+1).padStart(3,'0')}.png`),standardPng);
   const standard=await pixels(standardPng);
   rows.push({frame,kind:'raw-all',...diff(standard,actual)});
   rows.push({frame,kind:'reference-compression',...diff(standard,encodedReference)});
  }
  await runMediaProcess('ffmpeg',['-v','error','-y','-framerate',String(fps),'-i',path.join(output,'candidate-%03d.png'),'-frames:v',String(count),'-an','-c:v','libx264','-preset','fast','-crf','12','-vf','scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709','-pix_fmt','yuv420p',path.join(output,'candidate.mp4')]);
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',path.join(output,'candidate.mp4'),path.join(output,'candidate-encoded-%03d.png')]);
  for(let frame=0;frame<count;frame++){
   const actual=await pixels(fs.readFileSync(path.join(output,`candidate-encoded-${String(frame+1).padStart(3,'0')}.png`))),expected=await pixels(fs.readFileSync(path.join(output,`encoded-${String(frame+1).padStart(3,'0')}.png`)));
   rows.push({frame,kind:'encoded',...diff(expected,actual)});
  }
  receipt.streams=[];
  for(const file of [encoded,path.join(output,'candidate.mp4')]){
   const probe=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=width,height,nb_read_frames,avg_frame_rate,duration','-of','json',file])).streams[0];
   assert.equal(probe.width,w);assert.equal(probe.height,h);assert.equal(Number(probe.nb_read_frames),count);assert.equal(probe.avg_frame_rate,`${fps}/1`);assert.ok(Math.abs(Number(probe.duration)-count/fps)<1e-6);receipt.streams.push(probe);
  }
  if(readEnv("GPU_ENCODING_CONTROL")==='1'){
   const control=path.join(output,'reference-capture-control.mp4');
   await runMediaProcess('ffmpeg',['-v','error','-y','-framerate',String(fps),'-i',path.join(output,'reference-raw-%03d.png'),'-frames:v',String(count),'-an','-c:v','libx264','-preset','fast','-crf','12','-vf','scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709','-pix_fmt','yuv420p',control]);
   await runMediaProcess('ffmpeg',['-v','error','-y','-i',control,path.join(output,'reference-control-%03d.png')]);
   for(let frame=0;frame<count;frame++){
    const n=String(frame+1).padStart(3,'0');
    const control=await pixels(fs.readFileSync(path.join(output,`reference-control-${n}.png`)));
    rows.push({frame,kind:'standard-capture-control',...diff(control,await pixels(fs.readFileSync(path.join(output,`encoded-${n}.png`))))});
    rows.push({frame,kind:'gpu-capture-control',...diff(control,await pixels(fs.readFileSync(path.join(output,`candidate-encoded-${n}.png`))))});
   }
   receipt.encodingControl={standardCaptureMeanMax:Math.max(...rows.filter(r=>r.kind==='standard-capture-control').map(r=>r.mean)),gpuCaptureMeanMax:Math.max(...rows.filter(r=>r.kind==='gpu-capture-control').map(r=>r.mean)),scope:'Diagnostic same-capture encoding control; does not replace the independent production export gate.'};
  }
  receipt.rawMeanMax=Math.max(...rows.filter(r=>r.kind==='raw'||r.kind==='raw-all').map(r=>r.mean));receipt.encodedMeanMax=Math.max(...rows.filter(r=>r.kind==='encoded').map(r=>r.mean));
  receipt.referenceCompressionMeanMax=Math.max(...rows.filter(r=>r.kind==='reference-compression').map(r=>r.mean));
  receipt.numericParity={rawPassed:receipt.rawMeanMax<1,encodedPassed:receipt.encodedMeanMax<1,threshold:1};
  // Retain strict numerical results; resource and motion checks must still run
  // for wrapper qualification even when rasterization differs cosmetically.
  if(!wrapperBackdrop){assert.ok(receipt.rawMeanMax<1,`GPU/raw difference: ${receipt.rawMeanMax}`);assert.ok(receipt.encodedMeanMax<1,`GPU/encoded difference: ${receipt.encodedMeanMax}`);}
  // Component ablation: identical text pixels with and without cache reuse.
  // This does not measure whole-engine speed or claim a spatial ROI benefit.
  receipt.textCacheAblation=await gpu.evaluate(async()=>{
   const api=(window as any).GpuProof,p=(window as any).proof;
   const layer=p.runtime.scene(0).layers.find((layer:any)=>layer.kind==='text');
   if(!layer)throw Error('Text cache ablation requires visible tracked text');
   const signal=new AbortController().signal,reused=new api.GpuTextCache('ablation');
   const hash=async(canvas:OffscreenCanvas)=>{
    const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    const digest=await crypto.subtle.digest('SHA-256',pixels);
    return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
   };
   const cold:number[]=[],warm:number[]=[],hashes=new Set<string>();
   try{
    const initial=await reused.acquire(layer,signal);hashes.add(await hash(initial.frame.value));initial.release();
    for(let i=0;i<30;i++){
     const fresh=new api.GpuTextCache('ablation');
     try{const start=performance.now(),lease=await fresh.acquire(layer,signal);cold.push(performance.now()-start);hashes.add(await hash(lease.frame.value));lease.release();}finally{fresh.close();}
     const start=performance.now(),lease=await reused.acquire(layer,signal);warm.push(performance.now()-start);hashes.add(await hash(lease.frame.value));lease.release();
    }
    if(hashes.size!==1)throw Error('Caching changed text pixels');
    const p95=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*.95)-1];
    return {samples:30,coldMs:cold,warmMs:warm,coldP95Ms:p95(cold),warmP95Ms:p95(warm),bytes:reused.bytes,pixelHash:[...hashes][0],scope:'Text raster component only; fonts already warm; unchanged layout and pixels'};
   }finally{reused.close();}
  });
  receipt.pipelineCacheAblation=await gpu.evaluate(async()=>{
   const api=(window as any).GpuProof,p=(window as any).proof;
   const uncached:number[]=[],cached:number[]=[];
   // Source frames stay warm in both conditions. Only the text intermediate is
   // discarded; fixed quality, source time, masks and frame submission stay equal.
   for(let i=0;i<20;i++){
    const frame=[0,15,29,45][i%4];
    p.runtime.text.close();p.runtime.text=new api.GpuTextCache('ablation');
    let started=performance.now();
    if(!await p.runtime.present(frame,`uncached-${i}`))throw Error('Incomplete uncached ablation frame');
    await p.device.queue.onSubmittedWorkDone();uncached.push(performance.now()-started);
    started=performance.now();
    if(!await p.runtime.present(frame,`cached-${i}`))throw Error('Incomplete cached ablation frame');
    await p.device.queue.onSubmittedWorkDone();cached.push(performance.now()-started);
   }
   const p95=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*.95)-1];
   return {samples:20,uncachedMs:uncached,cachedMs:cached,uncachedP95Ms:p95(uncached),cachedP95Ms:p95(cached),scope:'Paired full GPU submission + queue completion; source frames and fonts warm; only text intermediate reuse differs; fixed uncached-then-cached order, not whole-editor interaction latency'};
  });
  if(readEnv("GPU_IMAGE_ABLATION")==='1')receipt.imageAblation=await gpu.evaluate(async urls=>{
   const Decoder=(window as any).ImageDecoder;
   if(!Decoder)return {supported:false};
   const rows:any[]=[];
   for(const url of urls){
    const blob=await (await fetch(url)).blob();
    let reference:Uint8ClampedArray|undefined;
    for(const method of ['bitmap','decoder','decoder-bitmap','decoder-bitmap','decoder','bitmap']){
     const began=performance.now();let image:any,decoder:any;
     try{
      if(method==='bitmap')image=await createImageBitmap(blob,{imageOrientation:'from-image',premultiplyAlpha:'none',colorSpaceConversion:'default'});
      else{decoder=new Decoder({data:await blob.arrayBuffer(),type:blob.type,colorSpaceConversion:'default',preferAnimation:false});image=(await decoder.decode({frameIndex:0})).image;
       if(method==='decoder-bitmap'){const decoded=image;try{image=await createImageBitmap(decoded,{premultiplyAlpha:'none',colorSpaceConversion:'default'});}finally{decoded.close();}}
      }
      const decodeMs=performance.now()-began,width=image.displayWidth??image.width,height=image.displayHeight??image.height;
      const canvas=new OffscreenCanvas(160,280),ctx=canvas.getContext('2d')!;
      ctx.drawImage(image,0,0,160,280);const pixels=ctx.getImageData(0,0,160,280).data;
      if(!reference)reference=pixels;
      let sum=0,max=0;for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-reference[i]);sum+=d;max=Math.max(max,d);}
      rows.push({file:url.split('/').at(-1),method,decodeMs,width,height,mean:sum/pixels.length,max});
      canvas.width=1;canvas.height=1;
     }finally{image?.close();decoder?.close();}
    }
   }
   return {supported:true,rows,scope:'Alternating full-resolution synthetic image decoding; 160x280 pixel diagnostic only, not full-resolution parity or whole-editor latency'};
  },[source('large-1.jpg'),source('large-6.jpg'),source('still.png')]);
  if(readEnv("GPU_SEEK_ABLATION")==='1')receipt.seekAblation=await gpu.evaluate(async files=>{
   const Provider=(window as any).GpuProof.BrowserFrameProvider,rows:any[]=[];
   for(let round=0;round<3;round++){
    const ordered=round%2?[...files].reverse():files;
    for(const file of ordered)for(const time of [4533333,2966667,1433333]){
     const provider=new Provider(1),started=performance.now();let timing:any,received=0;
     try{
      await provider.decode({key:file.url,url:file.url,validationUrl:file.url},[time],new AbortController().signal,(frame:any)=>{
       try{if(time<frame.timestampUs||time>=frame.timestampUs+frame.durationUs)throw Error('Seek returned the wrong interval');received++;}finally{frame.release();}
      },(value:any)=>{timing=value;});
      if(received!==1)throw Error('Seek did not return exactly one picture');
      rows.push({round,name:file.name,time,totalMs:performance.now()-started,...timing});
     }finally{provider.close();if(provider.bytes!==0)throw Error('Seek ablation retained samples');}
    }
   }
   return {files,rows,scope:'Synthetic 540x960 SDR; fresh provider per seek, alternating encoding order, HTTP/browser caches retained; component latency, not whole editor. Originals and production recipes unchanged.'};
  },seekFiles);
  if(readEnv("GPU_DECODE_ABLATION")==='1')receipt.decodeAblation=await gpu.evaluate(async()=>{
   const p=(window as any).proof,Provider=(window as any).GpuProof.BrowserFrameProvider;
   const source=p.runtime.scene(0).layers.find((layer:any)=>layer.kind==='video'&&!layer.source.alpha&&layer.source.kind!=='image').source;
   const rows:any[]=[];
   for(const mode of ['batch','sequential','sequential','batch']){
    const provider=new Provider(1,'no-preference',mode),batches:number[]=[];let pictures=0;
    try{
     for(let offset=0;offset<60;offset+=5){
      const times=Array.from({length:5},(_,i)=>Math.round((offset+i)*1e6/30)),start=performance.now();
      await provider.decode(source,times,new AbortController().signal,(value:any)=>{pictures++;value.release();});
      batches.push(performance.now()-start);
     }
     rows.push({mode,batches,pictures,retainedSampleBytes:provider.bytes});
     if(pictures!==60)throw Error('Decoder ablation lost pictures');
    }finally{provider.close();if(provider.bytes!==0)throw Error('Decoder ablation leaked retained samples');}
   }
   return {rows,scope:'Two alternating-order synthetic runs per decoder strategy; five-frame batches, identical proxy, no rendering, not whole-editor performance acceptance'};
  });
  receipt.handwriting=await gpu.evaluate(async()=>{
   const p=(window as any).proof,signal=new AbortController().signal;
   const samples:any[]=[];let complete:{canvas:OffscreenCanvas;key:string}|undefined,partial:{canvas:OffscreenCanvas;key:string}|undefined;
   for(const frame of [3,12,24,42,57]){
    const layer=p.runtime.scene(frame).layers.find((l:any)=>l.element.id==='handwritten-caption');
    const began=performance.now(),lease=await p.runtime.text.acquire(layer,signal),acquireMs=performance.now()-began;
    try{
     const canvas=lease.frame.value as OffscreenCanvas,data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
     let ink=0;for(let i=3;i<data.length;i+=4)ink+=data[i];
     const key=(window as any).GpuProof.gpuTextTextureKey(layer,p.runtime.text.fontIdentity);
     if(frame===12)partial={canvas,key};
     if(frame===57&&partial?.key===key&&partial.canvas!==canvas)throw Error('Equal handwriting dependencies rebuilt their pixels');
     if(frame===24)complete={canvas,key};
     if(frame===42&&complete?.key===key&&complete.canvas!==canvas)throw Error('Handwriting hold rebuilt its completed texture');
     if(frame===42&&complete?.key!==key&&complete?.canvas===canvas)throw Error('Changed fill dependencies reused stale handwriting pixels');
     samples.push({frame,progress:layer.handwritingProgress,ink,bytes:lease.frame.bytes,width:canvas.width,height:canvas.height,acquireMs});
    }finally{lease.release();}
   }
   if(samples[0].ink!==0||samples[1].ink<=0||samples[1].ink>=samples[2].ink||samples[4].ink<=0||samples[4].ink>=samples[2].ink)throw Error('Handwriting reveal/erase did not change visible strokes');
   if(samples.some(s=>s.bytes>=320*320*4/2))throw Error('Handwriting retained most of the full canvas');
   return {samples,scope:'Completed-ink bounds and mixed cache-hit/miss reveal acquisition with fonts warm; excludes pixel inspection, not whole-editor latency'};
  });
  receipt.captionStorage=await gpu.evaluate(async camera=>{
   const p=(window as any).proof,layer=p.runtime.scene(15).layers.find((l:any)=>l.kind==='caption'&&(!camera||l.element.id==='ordinary-caption'));
   const lease=await p.runtime.text.acquire(layer,new AbortController().signal);
   try{return {width:lease.frame.value.width,height:lease.frame.value.height,bytes:lease.frame.bytes,fullCanvasBytes:layer.planeWidth*layer.planeHeight*4};}finally{lease.release();}
  },captionStyle==='camera_reveal');
  if(captionStyle==='camera_reveal')assert.equal(receipt.captionStorage.bytes,receipt.captionStorage.fullCanvasBytes,'3D scene must retain its full background');
  else assert.ok(receipt.captionStorage.bytes<receipt.captionStorage.fullCanvasBytes/2,'Caption crop retained most of the empty canvas');
  if(readEnv("GPU_EXPORT_PROOF")==='1'){
   assert.equal(compositorEngine,'canvaskit');
   const production=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
   try{
    await production.goto(`${base}/render-frame`);await production.waitForFunction(()=>Boolean(window.__dreamcutRender));
    await production.evaluate(config=>window.__dreamcutRender!.load(config),{gpu:true,width:w,height:h,fps,durationInFrames:count,inputProps});
    let rawMaximum=0;
    for(const frame of [...Array(count).keys(),0,37,5]){
     await production.evaluate(frame=>window.__dreamcutRender!.frame(frame),frame);
     const raw=await pixels(await production.locator('#dreamcut-render-surface').screenshot());
     const expected=await pixels(await captureGpu(frame));
     const difference=diff(expected,raw);rawMaximum=Math.max(rawMaximum,difference.mean);
     assert.equal(difference.mean,0,`GPU export differs from GPU preview at ${frame}`);
    }
    const file=path.join(output,'production-gpu.mp4');
    const metadata=await renderBrowserVideo({baseUrl:base,outputLocation:file,width:w,height:h,fps,durationInFrames:count,inputProps,gpu:true,concurrency:1,crf:12});
    await runMediaProcess('ffmpeg',['-v','error','-y','-i',file,path.join(output,'production-gpu-%03d.png')]);
    for(let frame=0;frame<count;frame++){
     const n=String(frame+1).padStart(3,'0');
     const delta=diff(await pixels(fs.readFileSync(path.join(output,`candidate-encoded-${n}.png`))),await pixels(fs.readFileSync(path.join(output,`production-gpu-${n}.png`))));
     assert.equal(delta.mean,0,`Encoded GPU export differs at ${frame}`);
    }
    assert.equal(metadata&&'compositor' in metadata?metadata.compositor:undefined,'canvaskit');
    await assert.rejects(production.evaluate(config=>window.__dreamcutRender!.load(config),{gpu:true,width:w,height:h,fps,durationInFrames:count,inputProps:{elements:[{...bg,props:{...bg.props,unknown_gpu_effect:1}}]}}),/not supported/);
    // A non-silent, automated audio actor must retain the existing PCM result.
    await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=3','-c:a','pcm_s16le',path.join(media,'export-tone.wav')]);
    const audioActor:CompositionElement={...bg,id:'export-tone',type:'audio',lane_key:'audio_0',source_url:source('export-tone.wav'),volume:.4,playback_rate:1.25,trim_start:.2,trim_end:null,fade_in:.2,fade_out:.3,props:{}};
    const audioProps={...inputProps,elements:[...elements,audioActor]};
    const standardPcm=path.join(output,'standard-audio.f32le'),gpuPcm=path.join(output,'gpu-audio.f32le');
    await renderBrowserVideo({baseUrl:base,outputLocation:standardPcm,width:w,height:h,fps,durationInFrames:count,inputProps:audioProps,audioOnly:true,concurrency:1});
    await renderBrowserVideo({baseUrl:base,outputLocation:path.join(output,'gpu-audio-proof.mp4'),pcmOutputLocation:gpuPcm,width:w,height:h,fps,durationInFrames:count,inputProps:audioProps,gpu:true,concurrency:1});
    assert.deepEqual(fs.readFileSync(gpuPcm),fs.readFileSync(standardPcm),'GPU export changed authored PCM audio');
    assert.ok(fs.readFileSync(gpuPcm).some(byte=>byte!==0),'Audio proof is silent');
    // Delivery-resolution smoke uses the real export route, not a scaled screenshot.
    const hd=path.join(output,'gpu-1080.mp4');
    await renderBrowserVideo({baseUrl:base,outputLocation:hd,width:1080,height:1920,fps,durationInFrames:count,frameRange:[25,29],inputProps,gpu:true,pictureOnly:true,concurrency:1});
    const hdStream=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,nb_read_frames','-of','json',hd])).streams[0];
    assert.equal(hdStream.width,1080);assert.equal(hdStream.height,1920);assert.equal(Number(hdStream.nb_read_frames),5);
    receipt.productionGpuExport={passed:true,rawMaximum,frames:count,repeatedSeeks:true,encodedFramesEqual:true,unsupportedRejected:true,pcmAudioEqual:true,delivery1080Frames:5};
   }finally{await production.close();}
  }
  receipt.resources=await gpu.evaluate(async()=>{
   const p=(window as any).proof;await p.device.queue.onSubmittedWorkDone();
   const before=p.runtime.bytes;p.runtime.close();p.runtime.close();
   if(document.querySelector('[data-gpu-camera-reveal-stage]'))throw Error('GPU close retained its 3D stage');
   return {ownedPayloadBytesBeforeClose:before,ownedPayloadBytesAfterClose:p.runtime.bytes,gpuErrors:p.gpuErrors,scope:'Owned encoded image and decoded frame caches, upload canvas, uniform and GPU target payloads only; excludes decoder/driver overhead and swapchain'};
  });
  assert.ok(receipt.resources.ownedPayloadBytesBeforeClose>0);
  assert.equal(receipt.resources.ownedPayloadBytesAfterClose,0,'GPU runtime retained owned payloads after close');
  assert.deepEqual(receipt.resources.gpuErrors,[],'GPU emitted asynchronous validation/allocation errors');
  receipt.functionalChecksPassed=true;receipt.ok=compositorEngine==='webgpu'&&!receipt.experimentalAdmissionOverride&&receipt.numericParity.rawPassed&&receipt.numericParity.encodedPassed;receipt.legacySummaryReason=compositorEngine==='canvaskit'?'CanvasKit is an experimental engine; functional and numerical qualification are reported separately.':receipt.experimentalAdmissionOverride?'Experimental admission override prevents production qualification.':!receipt.numericParity.rawPassed||!receipt.numericParity.encodedPassed?'Strict numerical parity threshold failed.':'Production engine checks passed.';console.log(JSON.stringify({ok:receipt.ok,legacySummaryReason:receipt.legacySummaryReason,functionalChecksPassed:receipt.functionalChecksPassed,numericParity:receipt.numericParity,experimentalAdmissionOverride:receipt.experimentalAdmissionOverride,output,rawMeanMax:receipt.rawMeanMax,encodedMeanMax:receipt.encodedMeanMax,referenceCompressionMeanMax:receipt.referenceCompressionMeanMax}));
 }finally{
  fs.writeFileSync(path.join(output,'latest.json'),JSON.stringify(receipt,null,2));
  fs.writeFileSync(path.join(outputRoot,'latest.json'),JSON.stringify(receipt,null,2));
  // A stuck GPU teardown must not hide a completed failure receipt.
  await server.kill();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
