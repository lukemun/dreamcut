/** Engineering fixture only: no creator timeline writes or project exports. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import sharp from 'sharp';
import {renderBrowserVideo} from '../src/lib/render/browser-renderer';
import {runMediaProcess} from '../src/lib/render/audio-export';
import { readEnv } from '../src/lib/env-name';
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
const nativeProjectId=readEnv("VERIFY_NATIVE")==='1'?'native-surface-contract':undefined;
const output=path.resolve(nativeProjectId?'testing/results/native-surface-tracking':'testing/results/surface-tracking');fs.mkdirSync(output,{recursive:true});
const raw=async(b:Buffer|string)=>sharp(b).removeAlpha().raw().toBuffer();
const difference=(a:Buffer,b:Buffer)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;};
async function main(){
 let sourceVideo:string|undefined;
 if(nativeProjectId){
  const root=process.env.TIMELINE_PROJECTS_DIR;if(!root)throw Error('Native surface proof requires isolated project root');
  const source=path.join(root,nativeProjectId,'media','surface.mp4');fs.mkdirSync(path.dirname(source),{recursive:true});
  await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x606060:size=320x320:rate=30:duration=1','-c:v','libx264','-pix_fmt','yuv420p',source]);
  sourceVideo=`${base}/api/projects/${nativeProjectId}/media/surface.mp4`;
 }
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:320,height:320},deviceScaleFactor:1});page.on("pageerror",e=>console.error("Render page:",e.message));page.on("requestfailed",r=>console.error("Render request:",r.url(),r.failure()?.errorText));await page.goto(`${base}/render-frame`,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__dreamcutRender,undefined,{timeout:90000});
 const capture=async(frame:number,rendering:boolean,enabled=true,text='NOTE',presentedTime?:number)=>{
  await page.evaluate(c=>window.__dreamcutRender!.load(c),{nativeProjectId,fixtureId:'SurfaceTrackFixture',width:320,height:320,fps:30,durationInFrames:30,rendering,inputProps:{enabled,text,presentedTime,sourceVideo}});
  await page.evaluate(f=>window.__dreamcutRender!.frame(f),frame);if(nativeProjectId)assert.equal(await page.locator('canvas[data-native-source]').count(),1,'Tracking proof did not use native video');return raw(await page.locator('#dreamcut-render-surface').screenshot());};
 const baseline=await capture(0,true,false);const samples=new Map<number,Buffer>();
 for(const f of [0,12,23,29,12,0]){const p=await capture(f,false);assert.equal(difference(p,await capture(f,true)),0,'preview/export differ');if(samples.has(f))assert.equal(difference(p,samples.get(f)!),0,'random seek drift');samples.set(f,p);}
 assert.ok(difference(samples.get(0)!,baseline)>.5,'text missing');assert.ok(difference(samples.get(0)!,samples.get(12)!)>.3,'track did not move');assert.equal(difference(samples.get(29)!,baseline),0,'text did not hide');
 assert.ok(difference(samples.get(12)!,await capture(12,true,true,'EDIT'))>.3,'text is not editable');assert.equal(difference(baseline,await capture(0,true,false)),0,'reset differs');
 assert.equal(difference(samples.get(0)!,await capture(12,false,true,'NOTE',0)),0,'attachment ran ahead of displayed pixels');
 assert.equal(difference(samples.get(12)!,await capture(12,true,true,'NOTE',0)),0,'presentation observations changed export');
 // Hidden live/staging scenes must not leak tracked text over prepared video.
 // Exercise both the frame style and the preview presented-frame subscription.
 for(const rendering of [false,true]){
  const hiddenCapture=async(enabled:boolean)=>{
   await capture(12,rendering,enabled,'NOTE',0);
   await page.locator('#dreamcut-render-surface').evaluate(el=>(el as HTMLElement).style.visibility='hidden');
   const pixels=await raw(await page.screenshot());
   await page.locator('#dreamcut-render-surface').evaluate(el=>(el as HTMLElement).style.removeProperty('visibility'));
   return pixels;
  };
  assert.equal(difference(await hiddenCapture(true),await hiddenCapture(false)),0,'tracked text escaped its hidden scene');
 }
 const video=path.join(output,'fixture.mp4');await renderBrowserVideo({baseUrl:base,nativeProjectId,outputLocation:video,width:320,height:320,fps:30,durationInFrames:30,fixtureId:'SurfaceTrackFixture',inputProps:{sourceVideo},concurrency:2,crf:12});
 await runMediaProcess('ffmpeg',['-v','error','-y','-i',video,'-vf','select=eq(n\\,12)','-frames:v','1',path.join(output,'encoded.png')]);
 const delta=difference(samples.get(12)!,await raw(path.join(output,'encoded.png')));assert.ok(delta<3,`encoded picture differs: ${delta}`);
 fs.writeFileSync(path.join(output,'latest.json'),JSON.stringify({ok:true,sourceDecoder:nativeProjectId?"rust-ffmpeg":"browser",previewExportExact:true,randomSeekExact:true,editableText:true,hiddenBoundary:true,encodedMeanError:delta,date:new Date().toISOString()},null,2));console.log('Surface tracking renderer: perspective, text edit, visibility, reset, repeated seeks and encoding passed.');
}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
