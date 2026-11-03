/** Complete-picture prepared preview, invalidation and browser acceptance fixture. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';import {runMediaProcess} from '../src/lib/render/audio-export';
import sharp from 'sharp';
import {renderBrowserStill} from '../src/lib/render/browser-renderer';
import {projectsRoot} from '../src/lib/local-store/paths';
import { readEnv } from '../src/lib/env-name';
const blockedAutoplay=process.env.PREPARED_PROOF_AUTOPLAY==='blocked';
const backend=readEnv("VERIFY_NATIVE")==='1'?'rust':'standard';
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
const project=`prepared-playback-test-${randomUUID()}`,root=path.join(projectsRoot(),project),out=path.resolve(process.env.PREPARED_PROOF_OUTPUT??'testing/results/prepared-playback');fs.mkdirSync(path.join(root,'media'),{recursive:true});fs.mkdirSync(out,{recursive:true});
async function main(){
 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x160:rate=30:duration=4','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(root,'media','source.mp4')]);
 const url=`/api/projects/${project}/media/source.mp4`,common={project_id:project,type:'video_clip',source_url:url,timeline_start:0,duration:4,lane_index:0,volume:.1,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{source_duration_seconds:4,source_width:160,source_height:160,preview_source_url:url,preview_proxy_validation:{contract:'preview-proxy-v1',url,ok:true,width:160,height:160}}};
 const elements=[{...common,id:'back',lane_key:'visual_0'},{...common,id:'front',lane_key:'visual_1',lane_index:1,volume:0,timeline_start:.5,duration:3.5,trim_start:.5,props:{...common.props,media_scale:.55,media_offset_x:.15}},{...common,id:'label',type:'caption_text',source_url:null,lane_key:'captions_0',lane_index:2,volume:0,props:{text:'ONE',fontSizePx:20,fontPreset:'clean_sans',color:'#ffffff',absX:.1,absY:.35,maxWidth:.8}}];
 fs.writeFileSync(path.join(root,'metadata.json'),JSON.stringify({id:project,name:'Prepared playback test',aspect_ratio:'1:1',delivery_target:'reels',caption_safe_area_mode:'organic'}));
 fs.writeFileSync(path.join(root,'timeline.json'),JSON.stringify({version:1,elements,transitions:[],beats:[],lane_order_keys:['captions_0','visual_1','visual_0'],muted_lane_keys:[]}));
 // Match verify-playback-contract: browser permission recovery is a separate concern.
 const browser=await chromium.launch({channel:'chrome',headless:true,args:[blockedAutoplay?'--autoplay-policy=user-gesture-required':'--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage({viewport:{width:900,height:850}});
 if(blockedAutoplay)await page.addInitScript(()=>{
  // Deterministic browser-permission denial, independent of machine engagement settings.
  const play=HTMLMediaElement.prototype.play;let activated=false;
  document.addEventListener('pointerdown',()=>{activated=true;},{once:true,capture:true});
  HTMLMediaElement.prototype.play=function(){return activated?play.call(this):Promise.reject(new DOMException('User interaction required','NotAllowedError'));};
 });
 const requests:unknown[]=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/prepared-preview')){requests.push(r.postDataJSON().input);fs.writeFileSync(path.join(out,'requests.json'),JSON.stringify(requests,null,2));}});await page.goto(`${base}/prepared-playback-proof?project=${project}&backend=${backend}`);
 await page.waitForSelector('[data-prepared-playback-state="preparing"]',{timeout:30000});
 await page.screenshot({path:path.join(out,'preparing.png')});
 const progress=page.getByRole('progressbar',{name:'Preparing preview'});
 await progress.waitFor({state:'visible',timeout:180000});
 assert.equal(await progress.count(),1);
 const chrome=page.locator('[data-prepared-playback-state]');
 assert.notEqual(await chrome.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','Preparation needs a visible background');
 assert.match(await progress.innerText(),/Preparing/);
 if(!blockedAutoplay){await page.setViewportSize({width:360,height:740});await page.getByRole('button',{name:'Toggle appearance',exact:true}).click();
 await page.screenshot({path:path.join(out,'preparing-light-narrow.png')});
 await page.getByRole('button',{name:'Toggle appearance',exact:true}).click();await page.setViewportSize({width:900,height:850});}
 assert.equal(await page.getByRole('button',{name:'Play preview',exact:true}).isDisabled(),true);
 await page.waitForSelector('[data-prepared-playback-state="ready"], [data-prepared-playback-state="failed"]',{timeout:180000,state:'attached'});assert.equal(await page.locator('[data-prepared-playback-state]').getAttribute('data-prepared-playback-state'),'ready',await page.locator('[data-prepared-playback-state]').innerText());
 assert.equal(await page.locator('[data-prepared-playback-state="ready"]').isVisible(),false,'Ready status should disappear');
 await page.waitForFunction(()=>document.querySelector('video')?.readyState!>=3);
 assert.equal(await page.locator('video').count(),1,'Prepared playback must use one composed decoder');
 if(blockedAutoplay){
  await page.waitForTimeout(500);
  assert.equal(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.paused),true,'fresh document unexpectedly autoplayed');
  assert.equal(await page.locator('[data-dreamcut-player] [role=alert]').count(),0,'autoplay denial was presented as a broken preview');
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
 }

 await page.waitForFunction(()=>{const v=document.querySelector('video');return v && !v.paused && v.currentTime>.1;});
 await page.getByRole('button',{name:'Pause preview',exact:true}).click();
 const pausedFrame=await page.getByRole('slider',{name:'Seek preview',exact:true}).inputValue();
 await page.waitForTimeout(1200);
 assert.equal(await page.getByRole('slider',{name:'Seek preview',exact:true}).inputValue(),pausedFrame,'Ready updates must not undo a pause');
 if(blockedAutoplay){
  fs.writeFileSync(path.join(out,'autoplay.json'),JSON.stringify({project,backend,deniedAutoplay:true,noFatalOverlay:true,manualPlayRecovered:true,manualPausePreserved:true},null,2));
  console.log('PASS denied autoplay: ready without fatal error, manual Play advances, manual Pause stays paused');
  return; // Permission-specific proof; the default mode retains the full encoded-parity gate.
 }

 let firstUrl=await page.locator('video').getAttribute('src');
 for(let cycle=0;cycle<3;cycle++){
 await page.getByRole('slider',{name:'Seek preview',exact:true}).fill('0');
 await page.getByRole('button',{name:'Play preview',exact:true}).click();
 await page.waitForTimeout(2300);
 assert.equal(await page.locator('video').count(),1);
 assert.ok(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.currentTime>2.1));
 await page.getByRole('button',{name:'Pause preview',exact:true}).click();
 }
 const warmStart=Date.now();
 const reloadPreparation=page.waitForResponse(r=>r.request().method()==='POST' && r.url().includes('/prepared-preview'));
 await page.reload();
 assert.equal((await (await reloadPreparation).json()).state,'ready','Reload rebuilt an unchanged preview');
 await page.waitForSelector('[data-prepared-playback-state="ready"]',{timeout:10000,state:'attached'});
 const warmReloadMs=Date.now()-warmStart;
 firstUrl=await page.locator('video').getAttribute('src');
 await page.screenshot({path:path.join(out,'ready-dark.png')});
 await page.getByRole('button',{name:'Change text',exact:true}).click();
 await page.waitForSelector('[data-prepared-playback-state="needs-update"]');
 assert.equal(await page.getByRole('button',{name:'Play preview',exact:true}).isDisabled(),true);
 assert.equal(await page.locator(`video[src="${firstUrl}"]`).count(),0,'Stale prepared media stayed mounted after an edit');
 await page.waitForSelector('[data-prepared-playback-state="ready"], [data-prepared-playback-state="failed"]',{timeout:180000,state:'attached'});assert.equal(await page.locator('[data-prepared-playback-state]').getAttribute('data-prepared-playback-state'),'ready',await page.locator('[data-prepared-playback-state]').innerText());
 await page.waitForFunction(()=>document.querySelector('video')?.readyState!>=3);
 const pauseAfterEdit=page.getByRole('button',{name:'Pause preview',exact:true});
 if(await pauseAfterEdit.count())await pauseAfterEdit.click();
 await page.getByRole('slider',{name:'Seek preview',exact:true}).fill('0');
 const playAfterEdit=page.getByRole('button',{name:'Play preview',exact:true});
 if(await playAfterEdit.count())await playAfterEdit.click();
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v && !v.paused && v.currentTime>.1;}).catch(async error=>{console.error('Edited preview state',await page.evaluate(()=>({alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),videos:[...document.querySelectorAll('video')].map(v=>({src:v.src,time:v.currentTime,paused:v.paused,seeking:v.seeking,ready:v.readyState,error:v.error?.message})),controls:[...document.querySelectorAll('button')].map(b=>({label:b.ariaLabel,disabled:b.disabled})),ranges:[...document.querySelectorAll('input[type=range]')].map(e=>({label:e.getAttribute('aria-label'),value:(e as HTMLInputElement).value}))})));throw error;});
 const secondUrl=await page.locator('video').getAttribute('src');assert.notEqual(secondUrl,firstUrl);
 await page.getByRole('button',{name:'Toggle appearance',exact:true}).click();await page.setViewportSize({width:360,height:740});await page.screenshot({path:path.join(out,'ready-light-narrow.png')});
 // The prepared output contains audio and the exact declared number of composed frames.
 const mp4=path.join(out,'prepared.mp4');const response=await fetch(`${base}${secondUrl}`);assert.ok(response.ok);fs.writeFileSync(mp4,Buffer.from(await response.arrayBuffer()));
 const stdout=await runMediaProcess('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_type,nb_read_frames:format=duration','-of','json',mp4]);const facts=JSON.parse(stdout);assert.equal(Number(facts.streams.find((s:any)=>s.codec_type==='video').nb_read_frames),120);assert.ok(facts.streams.some((s:any)=>s.codec_type==='audio'));
 // Compare decoded output to the owned renderer at the layer entry and throughout motion.
 const parity:Array<{frame:number;mean:number}>=[];
 for(const frame of [0,14,15,16,59,60,61,119]){
  const expected=path.join(out,`expected-${frame}.png`),actual=path.join(out,`decoded-${frame}.png`);
  await renderBrowserStill({baseUrl:base,output:expected,width:160,height:160,fps:30,durationInFrames:120,frame,nativeProjectId:backend==='rust'?project:undefined,inputProps:{elements:elements.map(e=>e.type==='caption_text'?{...e,props:{...e.props,text:'TWO'}}:e),laneOrderKeys:['captions_0','visual_1','visual_0'],externalAudioPreview:false}});
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',mp4,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1',actual]);
  const a=await sharp(expected).removeAlpha().raw().toBuffer(),b=await sharp(actual).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);
  let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);const mean=sum/a.length;
  assert.ok(mean<8,`Prepared frame ${frame} differs from settled composition: ${mean}`);parity.push({frame,mean});
 }
 fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify({blockedAutoplay,backend,project,url:`${base}/prepared-playback-proof?project=${project}&backend=${backend}`,singleDecoder:true,replays:3,invalidatesImmediately:true,firstUrl,secondUrl,facts,parity,warmReloadMs},null,2));console.log(`PASS prepared playback; fixture retained for visual review: ${base}/prepared-playback-proof?project=${project}&backend=${backend}`);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
