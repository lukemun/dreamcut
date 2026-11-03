import type {CompositionElement} from '@/lib/render/composition-adapters';

/** Props that only move, size or fade a layer: changing them never changes which source
 * frames a scene decodes. Everything else (sources, timing, effects, text) is conservative. */
const PLACEMENT_ONLY=new Set(['media_scale','media_offset_x','media_offset_y','media_opacity','absX','absY','fontSizePx']);

function mediaShape(element:CompositionElement){
 const props=Object.fromEntries(Object.entries(element.props??{}).filter(([key])=>!PLACEMENT_ONLY.has(key)));
 return {...element,props};
}

/** True when two scenes need exactly the same decoded media, so a scene swap can keep it. */
export function samePictureSources(before:readonly CompositionElement[],after:readonly CompositionElement[]){
 if(before.length!==after.length)return false;
 for(let index=0;index<before.length;index++){
  const a=before[index]!,b=after[index]!;
  if(a===b)continue;
  if(a.id!==b.id||JSON.stringify(mediaShape(a))!==JSON.stringify(mediaShape(b)))return false;
 }
 return true;
}
