/** Owned teaching examples through the production compositor; no project writes. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {renderBrowserVideo} from '../src/lib/render/browser-renderer';
import {runMediaProcess} from '../src/lib/render/audio-export';
import type {CompositionElement} from '../src/lib/render/composition-adapters';
async function main(){
 const base=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
 const out='public/recipe-previews/mask-glitch';fs.mkdirSync(out,{recursive:true});
 const source=(name:string)=>`${base}/inspector-previews/sources/${name}.png`;
 const element=(id:string,file:string,start:number,duration:number,props:Record<string,unknown>={},lane=0):CompositionElement=>({id,type:'still',source_url:source(file),props,timeline_start:start,duration,lane_key:`visual_${lane}`,lane_index:lane,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0});
 // A pedagogical slow lead-in: white for 6 frames, colour for 9, then scene B.
 // Separate native subject layers retain exact destination registration.
 const elements=[element('scene-a','a-background',0,1.5),element('scene-b','b',1.5,1.5),element('white-subject','subject',1,.2,{has_alpha:true,subject_flash:1,subject_flash_enabled:true},1),element('colour-subject','subject',1.2,.3,{has_alpha:true},1)];
 await renderBrowserVideo({baseUrl:base,outputLocation:`${out}/result.mp4`,width:360,height:640,fps:30,durationInFrames:90,inputProps:{elements,laneOrderKeys:['visual_1','visual_0'],renderScale:1/3},pictureOnly:true,concurrency:2,crf:18});
 for(const [name,frame] of [['poster',0],['start',20],['white',33],['colour',40],['destination',60]] as const){
  await runMediaProcess('ffmpeg',['-v','error','-y','-i',`${out}/result.mp4`,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-q:v','2',`${out}/${name}.jpg`]);
 }
 const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({rights:'owned',credit:'DreamCut original illustrative artwork',fps:30,frames:90,width:360,height:640,teachingNote:'Still-image demonstration. Lead-in slowed to 0.5 seconds for clarity; moving matte tracking is not demonstrated.',sources:['a-background','b','subject'].map(name=>({file:`/inspector-previews/sources/${name}.png`,sha256:hash(`public/inspector-previews/sources/${name}.png`)})),outputs:['result.mp4','poster.jpg','start.jpg','white.jpg','colour.jpg','destination.jpg'].map(file=>({file,sha256:hash(`${out}/${file}`)}))},null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
