/** Record the Effects panel's picture-look previews (Film Look, Glitch, Color Map) on the
 * public-domain sample photos through the production GPU renderer. Read-only: builds its own
 * one-clip composition and never touches a project. Run against a running editor. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildCompositionElements} from '../src/lib/render/composition-adapters';
import {absolutizeMediaUrls} from '../src/lib/render/pipeline';
import {renderBrowserVideo, VideoRenderSession} from '../src/lib/render/browser-renderer';
import {runMediaProcess} from '../src/lib/render/audio-export';
import {inspectorSampleSpecs} from '../src/lib/render/inspector-samples';
import type {TimelineElement} from '../src/components/studio/timeline/types';

/** Strong enough to read at tile size; each is still the panel's own preset family. */
/** A photo that shows each look: a bright sunset for glow and grain, a clear sky and climber for the rest. */
const LOOK_PHOTO:Record<string,string>={film:'landscape-b',glitch:'background',gradient_map:'background'};
const LOOK_PROPS:Record<string,Record<string,unknown>>={
 film:{film_grain:0.45,film_halation:0.7,film_bloom:0.35,film_vignette:0.55,film_split_tone:0.5,film_glow_threshold:0.6},
 glitch:{glitch_amount:0.8},
 gradient_map:{gradient_map_amount:1},
};
const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function main(){
 const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
 const out='public/inspector-previews',manifestPath=path.join(out,'manifest.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(manifest.rights!=='public-domain-and-derived')throw Error('Record the photographic sample previews first');
 const session=new VideoRenderSession();const recorded=new Map<string,unknown>();
 try{for(const spec of inspectorSampleSpecs.filter(entry=>entry.kind==='look')){
  const element={id:`look-${spec.type}`,project_id:'inspector-previews',type:'still',source_url:`/inspector-previews/photos/${LOOK_PHOTO[spec.type]}.png`,beat_id:null,voice_clip_id:null,character_id:null,
   timeline_start:0,duration:spec.endFrame/30,lane_key:'visual_0',lane_index:0,trim_start:0,trim_end:0,volume:1,fade_in:0,fade_out:0,playback_rate:1,position_locked:false,removed_at:null,removed_reason:null,
   created_at:'2026-10-24T00:00:00.000Z',updated_at:'2026-10-24T00:00:00.000Z',props:{objectFit:'cover',...LOOK_PROPS[spec.type]}} as unknown as TimelineElement;
  const inputProps={elements:absolutizeMediaUrls(buildCompositionElements([element],new Set()),base),laneOrderKeys:['visual_0'],renderScale:1/3};
  const video=path.join(out,`${spec.name}.mp4`),poster=path.join(out,`${spec.name}.jpg`);
  await renderBrowserVideo({baseUrl:base,outputLocation:video,width:360,height:640,fps:30,durationInFrames:spec.endFrame,inputProps,pictureOnly:true,gpu:true,session,concurrency:1,crf:18});
  await runMediaProcess('ffmpeg',['-v','error','-y','-ss','0.5','-i',video,'-frames:v','1','-q:v','2',poster]);
  recorded.set(spec.name,{name:spec.name,width:360,height:640,fps:30,frames:spec.endFrame-spec.startFrame,treatment_frames:15,video_sha256:hash(video),poster_sha256:hash(poster)});
  console.log(`Recorded ${spec.name}`);
 }}finally{await session.close();}
 // Keep the shared manifest in spec order, replacing only the look entries.
 const byName=new Map(manifest.entries.map((entry:{name:string})=>[entry.name,entry]));
 manifest.entries=inspectorSampleSpecs.map(spec=>recorded.get(spec.name)??byName.get(spec.name)).filter(Boolean);
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
