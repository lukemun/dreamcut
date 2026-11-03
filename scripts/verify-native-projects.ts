/** Opt-in engineering exports of explicit isolated project copies. Never delivers or mutates edits. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {readTimeline,readMetadata,activeElements,activeTransitions} from '../src/lib/local-store/store';
import {buildTimelineTransitionLayout} from '../src/lib/timeline/transitions';
import {buildCompositionElements,getCompositionDimensions} from '../src/lib/render/composition-adapters';
import {absolutizeMediaUrls} from '../src/lib/render/pipeline';
import {renderBrowserVideo} from '../src/lib/render/browser-renderer';
import {nativeScene} from '../src/lib/native-preview/scene';
const args=process.argv.slice(2),arg=(key:string)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
async function main(){
 const ids=arg('--projects')?.split(','),output=arg('--output'),base=arg('--base')??'http://127.0.0.1:3143';
 if(!ids?.length||!output||!process.env.TIMELINE_PROJECTS_DIR)throw Error('Explicit --projects, --output and isolated TIMELINE_PROJECTS_DIR are required');
 if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local editor required');
 const root=path.resolve(process.env.TIMELINE_PROJECTS_DIR),out=path.resolve(output),fullSource=args.includes('--full-source');
 if(root===path.resolve('projects')||out===root||out.startsWith(root+path.sep))throw Error('Use isolated project copies and a separate evidence directory');
 fs.mkdirSync(out,{recursive:true});const results:any[]=[];
 for(const id of ids){
  if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid project id');
  const timeline=readTimeline(id),metadata=readMetadata(id),layout=buildTimelineTransitionLayout(activeElements(timeline),activeTransitions(timeline));
  const elements=buildCompositionElements(layout.renderedElements,new Set(metadata.muted_lane_keys)),canvas=getCompositionDimensions(metadata.output_aspect_ratio);
  const scale=Math.min(480/canvas.height,540/canvas.width),width=Math.round(canvas.width*scale/2)*2,height=Math.round(canvas.height*scale/2)*2;
  const frames=Math.round(layout.effectiveDurationSeconds*30),blocked:{frame:number;reason:string}[]=[];
  for(let frame=0;!fullSource&&frame<frames;frame++){try{nativeScene(elements,metadata.lane_order_keys,frame,width,height,true);}catch(e){blocked.push({frame,reason:String(e)});}}
  const record:any={id,timelineSha256:createHash('sha256').update(JSON.stringify(timeline)).digest('hex'),width,height,frames,blocked,backend:fullSource?'Rust sources + owned browser effects/text + authored audio':'Rust picture + browser captions + reference audio',passed:false};results.push(record);
  const directory=path.join(out,id);fs.mkdirSync(directory,{recursive:true});
  if(blocked.length){record.status='unsupported';console.log(id,'BLOCKED',blocked.length,'frames',blocked[0].reason);}
  else if(!args.includes('--export')){record.status='eligible-not-rendered';}
  else try{
   const props={elements:absolutizeMediaUrls(elements,base),laneOrderKeys:metadata.lane_order_keys,renderScale:scale};
   const common={baseUrl:base,width,height,fps:30,durationInFrames:frames,concurrency:1,inputProps:props};
   await renderBrowserVideo({...common,inputProps:{...props,projectId:id},fixtureId:fullSource?'NativeFullComparison':'NativeComparisonFixture',outputLocation:path.join(directory,'rust-picture.mp4')});
   await renderBrowserVideo({...common,outputLocation:path.join(directory,'reference.mp4')});
   if(fullSource)fs.copyFileSync(path.join(directory,'rust-picture.mp4'),path.join(directory,'candidate.mp4'));
   else execFileSync('ffmpeg',['-v','error','-y','-i',path.join(directory,'rust-picture.mp4'),'-i',path.join(directory,'reference.mp4'),'-map','0:v:0','-map','1:a:0?','-c','copy',path.join(directory,'candidate.mp4')]);
   const stats=path.join(directory,'ssim-frames.txt');
   execFileSync('ffmpeg',['-v','error','-y','-i',path.join(directory,'reference.mp4'),'-i',path.join(directory,'candidate.mp4'),'-lavfi',`[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim=stats_file=${stats}`,'-an','-f','null','-'],{timeout:300000});
   const samples=fs.readFileSync(stats,'utf8').trim().split('\n').map((line,frame)=>({frame,ssim:Number(line.match(/All:([\d.]+)/)?.[1])}));
   const probe=(name:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-of','json',path.join(directory,name)],{encoding:'utf8'})).streams[0];
   const a=probe('reference.mp4'),b=probe('candidate.mp4');
   record.samples=samples;record.meanSsim=samples.reduce((sum,s)=>sum+s.ssim,0)/samples.length;
   record.failedFrames=samples.filter(s=>!Number.isFinite(s.ssim)||s.ssim<.97);
   record.structureMatches=['width','height','nb_frames','r_frame_rate','duration'].every(k=>a[k]===b[k])&&Number(a.nb_frames)===frames&&samples.length===frames;
   record.passed=record.structureMatches&&record.failedFrames.length===0;record.status=record.passed?'passed':'pixel-mismatch';
   record.audio=fullSource?'Authored audio independently collected through the shared audio pipeline; audio parity needs its separate gate':'Copied reference audio; no independent Rust audio claim';
   console.log(id,record.status,'minimum SSIM',Math.min(...samples.map(s=>s.ssim)));
  }catch(e){record.status='render-failed';record.error=String(e);console.error(id,record.error);}
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(record,null,2));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
 }
 if(results.some(r=>!r.passed))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
