import {resolveVideoPlaybackSource,resolveStillPlaybackSource} from '../remotion/video-preview-source';
import type { CompositionElement } from '../render/composition-adapters';
import { resolveSpeedStepSegments, speedStepFrame } from '../timeline/speed-steps';
import { resolveMediaTransformAtTime, resolveMaskInsetAtTime, resolveMediaEffectAtTime } from '../timeline/media-transform';
import { buildCompositingLaneOrder } from '../timeline/compositing-lanes';

export type NativeLayer={source_index?:number;source_pts?:number;codec?:'vp8'|'vp9';color?:import('./source-color').NativeColor;id:string;path:string;frame:number;time?:number;fit:string;alpha:boolean;scale:number;x:number;y:number;opacity:number;mask:number[]};
export type NativeScene={version:1;width:number;height:number;transparent?:boolean;retain_decoders?:boolean;retain_ids?:string[];layers:NativeLayer[]};
const allowed=new Set(['title','objectFit','mask_inset','media_scale','media_offset_x','media_offset_y','media_opacity','media_blend_mode','has_alpha','source_duration_seconds','source_start_seconds','source_end_seconds','source_interval','preview_source_url','preview_audio_source_url','preview_audio_baked_gain','archival_source_url','media_preparation_recipe','custom_cutout_receipt','derived_from_source','keyframes','media_limit_duration_seconds','preview_proxy_validation','compound_proxy_validation','overflow_hold_frame_url','overflow_hold_start_frame_url','runtime_source_has_audio','runtime_preview_source_url','runtime_preview_audio_source_url','runtime_preview_preparation']);
const animated=new Set(['mask_inset','media_scale','media_offset_x','media_offset_y','media_opacity','playback_rate']);
allowed.add('runtime_still_preview');
/** Closed experimental subset; unsupported treatment returns a whole-scene fallback reason. */
export function nativeScene(elements:CompositionElement[],laneOrderKeys:string[]|undefined,frame:number,width:number,height:number,rendering=false):NativeScene {
 const now=frame/30;
 const active=elements.filter(e=>!e.picture_hidden&&!['audio_','music_','sound_effect_'].some(prefix=>e.lane_key.startsWith(prefix))).filter(e=>now>=e.timeline_start&&now<e.timeline_start+e.duration);
 const visuals=active.filter(e=>e.type==='video_clip'||e.type==='still');
 const captions=active.filter(e=>e.type==='caption_text');
 const order=buildCompositingLaneOrder({visualLaneKeys:visuals.map(e=>e.lane_key),captionLaneKeys:captions.map(e=>e.lane_key),persistedLaneOrderKeys:laneOrderKeys??[]});
 if(active.some(e=>!['video_clip','still','caption_text'].includes(e.type)))throw Error('This scene needs the standard preview (unsupported actor).');
 if(captions.some(c=>visuals.some(v=>order.indexOf(c.lane_key)<order.indexOf(v.lane_key))))throw Error('Interleaved text requires the standard preview.');
 const layers=visuals.sort((a,b)=>order.indexOf(a.lane_key)-order.indexOf(b.lane_key)||a.timeline_start-b.timeline_start).map(e=>{
  const props=e.props??{};
  if(e.transition_in||e.transition_out||e.fade_in||e.fade_out)throw Error('Transitions and fades require the standard preview.');
  for(const key of Object.keys(props))if(props[key]!=null&&!allowed.has(key)&&!key.startsWith('_'))throw Error(`Standard preview required for ${key}.`);
  for(const key of Object.keys((props.keyframes??{}) as object))if(!animated.has(key))throw Error(`Standard preview required for animated ${key}.`);
  if(props.media_blend_mode&&props.media_blend_mode!=='normal')throw Error('Blend mode requires the standard preview.');
  const t=now-e.timeline_start,transform=resolveMediaTransformAtTime(props,t),mask=resolveMaskInsetAtTime(props,t),effect=resolveMediaEffectAtTime(props,t);
  const localFrame=frame-Math.round(e.timeline_start*30),segments=resolveSpeedStepSegments(e);
  let source=segments.length?speedStepFrame(segments,localFrame,30).sourceTimeSeconds:Math.round(e.trim_start*30)/30+localFrame/30*e.playback_rate;const duration=Number(props.source_duration_seconds);
  if(Number.isFinite(duration))source=Math.min(source,Math.max(0,duration-0.00001));
  const sourceUrl=e.type==='video_clip'?resolveVideoPlaybackSource(e,e.source_url,rendering):e.source_url&&props.runtime_still_preview?resolveStillPlaybackSource(e.source_url,rendering,e.duration,props):e.source_url;
  if(!sourceUrl)throw Error('Standard preview required until the verified media proxy is ready.');
  return {id:e.id,path:sourceUrl,frame:e.type==='still'?0:Math.max(0,Math.floor(source*30+1e-6)),time:e.type==='still'?0:Math.max(0,source),fit:props.objectFit==='cover'?'cover':'contain',alpha:Boolean(props.has_alpha),scale:transform.scale,x:transform.offsetX,y:transform.offsetY,opacity:effect.opacity,mask:[mask.top,mask.right,mask.bottom,mask.left]};
 });
 return {version:1,width,height,layers};
}
