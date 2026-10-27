/** Synthetic selective-preview acceptance: range clocks, live overlays, retained variants. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';import sharp from 'sharp';
import {runMediaProcess} from '../src/lib/render/audio-export';import {renderBrowserStill} from '../src/lib/render/browser-renderer';
import {projectsRoot} from '../src/lib/local-store/paths';
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
const project=`prepared-playback-test-${randomUUID()}`,root=path.join(projectsRoot(),project),out=path.resolve('testing/results/prepared-playback/blocks');
async function main(){
 fs.mkdirSync(path.join(root,'media'),{recursive:true});fs.mkdirSync(out,{recursive:true});
 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x160:rate=30:duration=4','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(root,'media','source.mp4')]);
 const url=`/api/projects/${project}/media/source.mp4`,common={project_id:project,type:'video_clip',source_url:url,timeline_start:0,duration:4,lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{source_duration_seconds:4,source_width:160,source_height:160,preview_source_url:url,preview_proxy_validation:{contract:'preview-proxy-v1',url,ok:true,width:160,height:160}}};
 const elements=[{...common,id:'back',lane_key:'visual_0'},{...common,id:'front',lane_key:'visual_1',lane_index:1,timeline_start:2,duration:.5,trim_start:2,props:{...common.props,media_scale:.55,media_offset_x:.15}},{...common,id:'label',type:'caption_text',source_url:null,lane_key:'captions_0',lane_index:2,props:{text:'ONE',styleVariant:'bold_outline',fontSizePx:20,fontPreset:'clean_sans',textColor:'#ffffff',absX:.1,absY:.35,maxWidth:.8}},{...common,id:'sound',type:'sound_effect',lane_key:'sound_effect_0',volume:.2}];
 const laneOrderKeys=['captions_0','visual_1','visual_0','sound_effect_0'];
 fs.writeFileSync(path.join(root,'metadata.json'),JSON.stringify({id:project,name:'Selective playback test',aspect_ratio:'1:1',delivery_target:'reels',caption_safe_area_mode:'organic'}));
 fs.writeFileSync(path.join(root,'timeline.json'),JSON.stringify({version:1,elements,transitions:[],beats:[],lane_order_keys:laneOrderKeys,muted_lane_keys:[]}));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:900,height:850}}),requests:any[]=[];
  let holdReady=true;
  await page.route('**/prepared-preview?*',async route=>{
   if(route.request().method()!=='GET' || new URL(route.request().url()).searchParams.has('file'))return route.continue();
   const response=await route.fetch(),body=await response.json();
   await route.fulfill({response,json:holdReady && body.state==='ready'?{...body,state:'preparing',url:undefined}:body});
  });
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/prepared-preview'))requests.push(r.postDataJSON().input);});
  await page.goto(`${base}/prepared-playback-proof?project=${project}&mode=blocks`);
  await page.getByLabel('Prepared frame count').filter({hasText:'19'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Play preview',exact:true}).isEnabled(),true,'ordinary footage should play while effect prepares');
  const ready=async()=>{await page.waitForSelector('[data-prepared-playback-state="ready"], [data-prepared-playback-state="failed"]',{timeout:180000,state:'attached'});assert.equal(await page.locator('[data-prepared-playback-state]').getAttribute('data-prepared-playback-state'),'ready',await page.locator('[data-prepared-playback-state]').innerText());};
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await page.waitForFunction(()=>Number((document.querySelector('input[aria-label="Seek preview"]') as HTMLInputElement)?.value)>=58);
  assert.equal(await page.getByRole('button',{name:'Play preview',exact:true}).isDisabled(),true,'unfinished hotspot must hold playback');
  const heldFrame=Number(await page.getByRole('slider',{name:'Seek preview',exact:true}).inputValue());
  await page.waitForTimeout(150);assert.equal(Number(await page.getByRole('slider',{name:'Seek preview',exact:true}).inputValue()),heldFrame);
  holdReady=false;await ready();
  await page.waitForFunction(()=>Number((document.querySelector('input[aria-label="Seek preview"]') as HTMLInputElement)?.value)>77);
  await page.getByRole('button',{name:'Pause preview',exact:true}).click();
  assert.deepEqual(requests[0].frameRange,[58,76]);assert.equal(requests[0].inputProps.elements.length,2);
  const slider=page.getByRole('slider',{name:'Seek preview',exact:true});await slider.fill('65');
  const block=page.locator('video[title="prepared-picture-block"]');await block.waitFor();
  const firstUrl=await block.getAttribute('src');const before=requests.length;
  await page.getByRole('button',{name:'Change text',exact:true}).click();await page.getByRole('button',{name:'Change sound',exact:true}).click();await page.waitForTimeout(500);
  assert.equal(requests.length,before,'text/sound changes rebuilt prepared picture');assert.equal(await block.getAttribute('src'),firstUrl);assert.equal(await page.getByLabel('Current text').innerText(),'TWO');assert.equal(await page.getByLabel('Current sound').innerText(),'0.6');
  await page.getByRole('button',{name:'Switch picture',exact:true}).click();await page.waitForTimeout(250);await ready();assert.equal(requests.length,before+1);
  const switchStart=Date.now();await page.getByRole('button',{name:'Switch picture',exact:true}).click();await ready();const switchMs=Date.now()-switchStart;assert.equal(await block.getAttribute('src'),firstUrl);await page.waitForTimeout(250);assert.equal(requests.length,before+1);
  const replayMs:number[]=[];
  for(let cycle=0;cycle<3;cycle++){
   await slider.fill('0');const start=Date.now();await page.getByRole('button',{name:'Play preview',exact:true}).click();
   await page.waitForFunction(()=>Number((document.querySelector('input[aria-label="Seek preview"]') as HTMLInputElement)?.value)>=110,{},{timeout:15000});
   replayMs.push(Date.now()-start);assert.ok(replayMs.at(-1)!<6000,'four-second preview stalled at a handoff');await page.getByRole('button',{name:'Pause preview',exact:true}).click();assert.equal(await page.locator('[data-dreamcut-player] [role=alert]').count(),0,await page.getByRole('alert').allTextContents());
  }
  const seeks=[];
  for(const frame of [58,77,65,0,74]){
   const began=performance.now();await slider.fill(String(frame));
   const cached=frame>=58&&frame<=76,target=(cached?frame-58:frame)/30;
   await page.waitForFunction(({cached,target})=>{
    const videos=[...document.querySelectorAll<HTMLVideoElement>('[data-dreamcut-player] video')];
    const video=videos.find(v=>cached?v.title==='prepared-picture-block':v.title!=='prepared-picture-block');
    return !!video&&video.readyState>=2&&!video.seeking&&Math.abs(video.currentTime-target)<.035;
   },{cached,target},{timeout:5000});
   seeks.push({frame,cached,seekToDecodedFrameMs:performance.now()-began});
  }
  fs.writeFileSync(path.join(out,'seek-latest.json'),JSON.stringify({project,switchMs,replayMs,seeks},null,2));
  await slider.fill('65');await page.screenshot({path:path.join(out,'hybrid.png')});
  const mp4=path.join(out,'block.mp4'),response=await fetch(`${base}${firstUrl}`);assert.ok(response.ok);fs.writeFileSync(mp4,Buffer.from(await response.arrayBuffer()));
  const facts=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_type,nb_read_frames:format=duration','-of','json',mp4]));assert.equal(Number(facts.streams.find((s:any)=>s.codec_type==='video').nb_read_frames),19);
  // Concatenating sections with disposable AAC tracks previously shifted picture
  // timestamps by encoder priming (~21 ms), exposing the preceding layer frame.
  const timestamps=JSON.parse(await runMediaProcess('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',mp4])).frames;
  timestamps.forEach((frame:any,index:number)=>assert.ok(Math.abs(Number(frame.best_effort_timestamp_time)-index/30)<.000002,`Cached frame ${index} has shifted PTS ${frame.best_effort_timestamp_time}`));
  const live={elements:elements.map(e=>e.type==='caption_text'?{...e,props:{...e.props,text:'TWO'}}:e),laneOrderKeys,externalAudioPreview:true};
  const parity=[];
  for(const frame of [57,58,60,65,74,76,77]){
   const expected=path.join(out,`expected-${frame}.png`),actual=path.join(out,`hybrid-${frame}.png`);
   await renderBrowserStill({baseUrl:base,output:expected,width:160,height:160,fps:30,durationInFrames:120,frame,inputProps:live});
   await renderBrowserStill({baseUrl:base,output:actual,width:160,height:160,fps:30,durationInFrames:120,frame,fixtureId:'PreparedPlaybackFixture',inputProps:{live,blocks:[{range:[58,76],url:`${base}${firstUrl}`,status:null}],overlayCaptions:true}});
   const a=await sharp(expected).removeAlpha().raw().toBuffer(),b=await sharp(actual).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);const mean=sum/a.length;assert.ok(mean<8,`frame ${frame} differs: ${mean}`);parity.push({frame,mean});
  }
  fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify({project,requests:requests.map(r=>r.frameRange),preparedFrames:19,totalFrames:120,switchMs,replayMs,seeks,facts,parity},null,2));console.log(JSON.stringify({passed:true,preparedFrames:19,totalFrames:120,switchMs,replayMs,seeks,parity}));
 }finally{await browser.close();}
}
main().catch(error=>{fs.writeFileSync(path.join(out,'latest-failure.json'),JSON.stringify({project,at:new Date().toISOString(),error:String(error)},null,2));console.error(error);process.exitCode=1;});
