import type {CompositionElement} from '../render/composition-adapters';
import type {GpuProxySource} from './browser-frame-provider';
import type {GpuScene} from './scene';
import {resolveGpuVideoSource} from './source';

export type GpuFrameDependency={slot:string;source:GpuProxySource;timeUs:number};

/** Caption media participates in the same complete-frame ticket as picture.
 * Reuse an existing verified source identity, including its alpha/color policy.
 * An export URL, or a caption URL alone, is not a proxy validation receipt. */
export function gpuFrameDependencies(scene:GpuScene,elements:readonly CompositionElement[],scope:string,rendering=false):GpuFrameDependency[]{
 const dependencies:GpuFrameDependency[]=[];
 for(const layer of scene.layers){
  if(layer.kind==='video')dependencies.push({slot:layer.element.id,source:layer.source,timeUs:layer.timeUs});
  else if(layer.kind==='caption'&&layer.fill?.kind==='video'){
   const fill=layer.fill;
   const source=resolveGpuCaptionVideoSource(fill.url,elements,scope,rendering);
   const timeUs=fill.timeUs;
   if(!Number.isSafeInteger(timeUs)||timeUs<0)throw Error('Invalid caption video source time');
   dependencies.push({slot:layer.element.id,source,timeUs});
  }
 }
 return dependencies;
}

/** Keep distinct presentation slots, but decode a shared source/time only once. */
export function uniqueGpuFrameDependencies(dependencies:readonly GpuFrameDependency[]){
 return [...new Map(dependencies.map(item=>[JSON.stringify([item.source.key,item.timeUs]),item])).values()];
}

/** Shared admission/runtime authority for a caption video dependency. */
export function resolveGpuCaptionVideoSource(url:string,elements:readonly CompositionElement[],scope:string,rendering=false):GpuProxySource{
  if(!url)throw Error('GPU video-filled text requires its prepared preview source');
  if(rendering){
   const owner=elements.find(e=>e.type==='caption_text'&&e.props?.mediaFillVideoUrl===url);
   if(!owner)throw Error('GPU export video fill has no render authority');
   return resolveGpuVideoSource({type:'video_clip',source_url:url,props:{has_alpha:(owner.props?.runtime_media_fill_preview as {alpha?:boolean}|undefined)?.alpha===true}},scope,true);
  }
  let source:GpuProxySource|undefined;
  for(const element of elements){
   if(element.type!=='video_clip')continue;
   let candidate:GpuProxySource;
   try{candidate=resolveGpuVideoSource(element,scope);}catch{continue;}
   if(candidate.url===url){source=candidate;break;}
  }
  if(!source)for(const element of elements){
   if(element.type!=='caption_text')continue;
   const evidence=element.props?.runtime_media_fill_preview as {sourceUrl?:unknown;previewUrl?:unknown;alpha?:boolean;validation?:unknown}|null|undefined;
   if(!evidence||typeof evidence.sourceUrl!=='string'||!evidence.sourceUrl||evidence.previewUrl!==url||evidence.sourceUrl!==element.props?.mediaFillVideoUrl||evidence.previewUrl!==element.props?.mediaFillVideoPreviewUrl)continue;
   try{source=resolveGpuVideoSource({type:'video_clip',props:{preview_source_url:url,preview_proxy_validation:evidence.validation,has_alpha:evidence.alpha===true}},scope);break;}catch{continue;}
  }
  if(!source)throw Error('GPU video-filled text requires a matching verified preview source');
  return source;
}
