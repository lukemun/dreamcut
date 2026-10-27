/** Record a specifically authorized sample project through the production renderer.
 * Read-only: never constructs or mutates a timeline. Only the licensed sample sources
 * may enter public previews. Run after preparing the editable sample assembly. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {activeElements, activeTransitions, readMetadata, readTimeline} from '../src/lib/local-store/store';
import {projectDir} from '../src/lib/local-store/paths';
import {buildCompositionElements} from '../src/lib/render/composition-adapters';
import {buildTimelineTransitionLayout} from '../src/lib/timeline/transitions';
import {absolutizeMediaUrls} from '../src/lib/render/pipeline';
import {renderBrowserVideo, VideoRenderSession} from '../src/lib/render/browser-renderer';
import {runMediaProcess} from '../src/lib/render/audio-export';
import {inspectorSampleSpecs} from '../src/lib/render/inspector-samples';
const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(){
 const project=process.argv[2];if(!project)throw Error('Pass the authorized sample project ID');
 const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
 const timeline=readTimeline(project),metadata=readMetadata(project);
 if(metadata.output_aspect_ratio!=='9:16')throw Error('Sample project must be vertical 9:16');
 const elements=activeElements(timeline);
 const usePhotos=process.argv.includes('--photos');
 const replacements:Record<string,string>={'a':'a','b':'b','a-background':'background','subject':'subject'};
 const knownSources=[
  ...['a','b','a-background','subject'].map(name=>({file:`sources/${name}.png`,photo:replacements[name]})),
  ...['a','b','background','subject','landscape-a','landscape-b'].map(name=>({file:`photos/${name}.png`,photo:name})),
 ].map(source=>({...source,hash:hash(path.join('public/inspector-previews',source.file))}));
 // Engineering preview fixture only: preserve the working project and its approval state.
 const recordingElements=elements.map(element=>{
  const file=element.source_url?.split('/media/')[1];
  if(!file || file.split('/').some(part=>part==='..') || !file.startsWith('sources/'))throw Error('Only registered sample sources may be recorded');
  const fingerprint=hash(path.join(projectDir(project),'media',file));
  const source=knownSources.find(candidate=>candidate.hash===fingerprint);
  if(!source)throw Error('Sample source does not match the public, credited sample set');
  if(!usePhotos){
   if(source.file.startsWith('photos/'))throw Error('Pass --photos when recording photographic sources');
   return element;
  }
  const props={...element.props};delete props.runtime_still_preview;delete props.runtime_preview_preparation;
  // The background shares the old B image bytes, but is not a transition actor.
  const role=file === 'sources/background.png' ? 'background' : source.photo;
  const photo=role === 'a' ? 'landscape-a' : role === 'b' ? 'landscape-b' : role;
  return {...element,source_url:`${base}/inspector-previews/photos/${photo}.png`,props};
 });
 const layout=buildTimelineTransitionLayout(recordingElements,activeTransitions(timeline));
 const inputProps={elements:absolutizeMediaUrls(buildCompositionElements(layout.renderedElements,new Set()),base),laneOrderKeys:metadata.lane_order_keys,renderScale:1/3};
 const out='public/inspector-previews',entries=[];fs.mkdirSync(out,{recursive:true});
 // Look previews come from record-look-previews.ts; keep their entries.
 const previousEntries:Array<{name:string}>=fs.existsSync(path.join(out,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8')).entries:[];
 const session=new VideoRenderSession();
 try{for(const spec of inspectorSampleSpecs){
  if(spec.kind==='look'){const kept=previousEntries.find(entry=>entry.name===spec.name);if(kept)entries.push(kept);continue;}
  const video=path.join(out,`${spec.name}.mp4`),poster=path.join(out,`${spec.name}.jpg`);
  await renderBrowserVideo({baseUrl:base,outputLocation:video,width:360,height:640,fps:30,durationInFrames:Math.ceil(layout.effectiveDurationSeconds*30),frameRange:[spec.startFrame,spec.endFrame-1],inputProps,pictureOnly:true,session,concurrency:2,crf:18});
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',video,'-frames:v','1','-q:v','2',poster]);
  entries.push({name:spec.name,width:360,height:640,fps:30,frames:spec.endFrame-spec.startFrame,treatment_frames:15,video_sha256:hash(video),poster_sha256:hash(poster)});
  console.log(`Recorded ${spec.name}`);
 }}finally{await session.close();}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:1,credit:usePhotos?'NPS / Neal Herbert, A. Falgoust, Jacob W. Frank (public domain); Christopher Campbell (CC0); AI-assisted portrait cutout':'DreamCut · original deterministic sample artwork',rights:usePhotos?'public-domain-and-derived':'owned',renderer:'TimelineComposition via Chromium/FFmpeg',sources:(usePhotos?['photos/landscape-a','photos/landscape-b','photos/background','photos/subject']:['sources/a','sources/b','sources/a-background','sources/subject']).map(name=>({file:`${name}.png`,sha256:hash(path.join(out,`${name}.png`))})),entries},null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
