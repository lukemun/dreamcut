import type {PreparedPreviewInput} from './prepared-preview';
import {preparedPlaybackRanges} from './prepared-playback-plan';
import {DEFAULT_CAPTION_PROPS,resolveCaptionProps} from './captions';

export type PreviewCacheStrategy = 'rolling' | 'selective';
// Closed cheap-picture vocabulary. Unknown treatments are cached conservatively.
const cheapProps = new Set(['title','objectFit','media_scale','media_offset_x','media_offset_y','media_opacity','media_blend_mode','source_aspect_ratio','source_width','source_height','source_duration_seconds','source_start_seconds','source_end_seconds','source_interval','preview_source_url','preview_audio_source_url','preview_audio_baked_gain','archival_source_url','preview_proxy_validation','compound_proxy_validation','runtime_preview_source_url','runtime_preview_audio_source_url','runtime_preview_preparation','runtime_source_has_audio','media_preparation_recipe','derived_from_source','has_alpha','media_limit_duration_seconds']);
cheapProps.add('runtime_still_preview');

/** Stable two-second grid gives both strategies the same cache seams and reuse units. */
export function previewCacheRanges(input:PreparedPreviewInput,strategy:PreviewCacheStrategy):[number,number][] {
  if(input.durationInFrames<1)return [];
  const size=Math.max(1,Math.round(input.fps*2));
  const heavy=preparedPlaybackRanges(input);
  for(const e of input.inputProps.elements){
    if(/^(audio_|music_|sound_effect_)/.test(e.lane_key))continue;
    const props=e.props??{};
    const caption=resolveCaptionProps(props);
    const ordinaryText=e.type==='caption_text' && !e.transition_in && !e.transition_out
      && Object.keys(props).every(key=>key in DEFAULT_CAPTION_PROPS || ['title','graphic_text_role','caption_audio_binding','source_aspect_ratio','source_width','source_height'].includes(key))
      && caption.surfaceMode==='none' && caption.surfaceBlendMode==='normal'
      && ['none','cinematic','bold_outline','clean','minimal','handwritten'].includes(String(props.styleVariant??caption.styleVariant))
      && !caption.mediaFillVideoUrl && !caption.mediaFillUrls.length && !caption.mediaFillScene;
    if(ordinaryText)continue;
    const expensive=!['video_clip','still'].includes(e.type) || e.fade_in>0 || e.fade_out>0 || e.transition_in || e.transition_out
      || Object.entries(props).some(([key,value])=>value!=null && !cheapProps.has(key));
    if(expensive)heavy.push([Math.max(0,Math.floor(e.timeline_start*input.fps)-2),Math.min(input.durationInFrames-1,Math.ceil((e.timeline_start+e.duration)*input.fps)+1)]);
  }
  const windows:[number,number][]=[];
  for(let start=0;start<input.durationInFrames;start+=size){
    const end=Math.min(input.durationInFrames-1,start+size-1);
    if(strategy==='rolling'||heavy.some(([a,b])=>a<=end&&b>=start))windows.push([start,end]);
  }
  if(strategy==='rolling')return windows;
  // One job per continuous effect amortizes browser setup. The worker still
  // stores independent two-second sections and preserves their source clocks.
  const effects:[number,number][]=[];
  for(const range of windows){
    const previous=effects.at(-1);
    if(previous&&previous[1]+1===range[0])previous[1]=range[1];
    else effects.push([...range]);
  }
  return effects;
}

/** Active first, then forward look-ahead, then already-passed sections. */
export function prioritizePreviewRanges(ranges:[number,number][],frame:number):number[]{
  const distance=([a,b]:[number,number])=>frame>=a&&frame<=b?0:a>frame?a-frame:Number.MAX_SAFE_INTEGER/2+frame-b;
  return ranges.map((_,i)=>i).sort((a,b)=>distance(ranges[a])-distance(ranges[b]));
}

/** Finish a contiguous effect before entering it; don't gate unrelated future shots. */
export function activePreviewRun(ranges:[number,number][],frame:number):number[] {
  const active=ranges.findIndex(([start,end])=>frame>=start&&frame<=end);
  if(active<0)return [];
  let last=active;
  while(last+1<ranges.length&&ranges[last+1][0]<=ranges[last][1]+1)last++;
  return Array.from({length:last-active+1},(_,index)=>active+index);
}
