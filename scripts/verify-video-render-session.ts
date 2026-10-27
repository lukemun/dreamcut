/** Synthetic proof for preparation session reuse. No creator project is written. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {VideoRenderSession,renderBrowserVideo} from '../src/lib/render/browser-renderer';
import {runMediaProcess} from '../src/lib/render/audio-export';
import {projectsRoot} from '../src/lib/local-store/paths';
const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
const project=`prepared-playback-test-${randomUUID()}`,root=path.join(projectsRoot(),project),out=path.resolve('testing/results/video-render-session');
async function main(){
 fs.mkdirSync(path.join(root,'media'),{recursive:true});fs.mkdirSync(out,{recursive:true});
 await runMediaProcess('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x160:rate=30:duration=2','-c:v','libx264','-pix_fmt','yuv420p',path.join(root,'media','source.mp4')]);
 const row={id:'picture',type:'video_clip',source_url:`${base}/api/projects/${project}/media/source.mp4`,timeline_start:0,duration:2,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:null,fade_in:0,fade_out:0,props:{source_duration_seconds:2}};
 fs.writeFileSync(path.join(root,'metadata.json'),JSON.stringify({id:project,title:'Capture session proof',delivery_target:'web'}));fs.writeFileSync(path.join(root,'timeline.json'),JSON.stringify({version:1,elements:[],transitions:[],beats:[]}));
 const common={baseUrl:base,width:160,height:160,fps:30,durationInFrames:60,concurrency:1,inputProps:{elements:[row],laneOrderKeys:['visual_0']}};
 const session=new VideoRenderSession(),rows:unknown[]=[];
 const decodedHash=async(file:string)=>{const raw=file+'.rgba';await runMediaProcess('ffmpeg',['-v','error','-y','-i',file,'-f','rawvideo','-pix_fmt','rgba',raw]);return createHash('sha256').update(fs.readFileSync(raw)).digest('hex');};
 try{
  for(const [index,range] of ([[0,1],[30,31],[0,1]] as [number,number][]).entries()){
   const original=path.join(out,`fresh-${index}.mp4`),reused=path.join(out,`reused-${index}.mp4`);
   let start=performance.now();await renderBrowserVideo({...common,frameRange:range,outputLocation:original});const freshMs=performance.now()-start;
   start=performance.now();await renderBrowserVideo({...common,session,frameRange:range,outputLocation:reused});const reusedMs=performance.now()-start;
   assert.equal(await decodedHash(reused),await decodedHash(original),'Reused session changed encoded pixels');rows.push({range,freshMs,reusedMs});
  }
  assert.deepEqual(session.metrics,{launches:1,loads:1},'Identical sections should retain one browser and loaded composition');
  const first=renderBrowserVideo({...common,session,frameRange:[10,11],outputLocation:path.join(out,'exclusive.mp4')});
  await assert.rejects(renderBrowserVideo({...common,session,frameRange:[20,21],outputLocation:path.join(out,'invalid-overlap.mp4')}),/already in use/);await first;
  const changed={...common,inputProps:{...common.inputProps,elements:[{...row,props:{...row.props,media_scale:.5}}]}};
  await renderBrowserVideo({...changed,session,frameRange:[0,1],outputLocation:path.join(out,'changed.mp4')});
  assert.deepEqual(session.metrics,{launches:1,loads:2},'Changed composition must reload, retaining only the browser');
  assert.notEqual(await decodedHash(path.join(out,'changed.mp4')),await decodedHash(path.join(out,'reused-0.mp4')));
  fs.writeFileSync(path.join(out,'latest.json'),JSON.stringify({passed:true,rows,metrics:session.metrics,exactEncodedPixels:true,backwardSeek:true,concurrentUseRejected:true,changedCompositionReloaded:true},null,2));console.log('Capture session proof PASS',JSON.stringify(rows));
 }finally{await session.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
