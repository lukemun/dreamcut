import {resolveVideoPlaybackSource} from '../remotion/video-preview-source';
import type {CompositionElement} from '../render/composition-adapters';
/** Only the nearest two distinct, verified video sources within two seconds. */
export function nativeWarmupSources(elements:CompositionElement[],seconds:number,warmed:ReadonlySet<string>):string[]{
 const candidates=elements.filter(e=>e.type==='video_clip'&&e.timeline_start>seconds&&e.timeline_start<=seconds+2).sort((a,b)=>a.timeline_start-b.timeline_start);
 const result:string[]=[];
 for(const element of candidates){const source=resolveVideoPlaybackSource(element,element.source_url,false);if(source&&!warmed.has(source)&&!result.includes(source))result.push(source);if(result.length===2)break;}
 return result;
}
