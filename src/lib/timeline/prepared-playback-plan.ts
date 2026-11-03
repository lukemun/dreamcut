import {DEFAULT_CAPTION_PROPS,resolveCaptionProps} from './captions';
import {buildCompositingLaneOrder} from './compositing-lanes';
import {preparedPreviewIdentity,type PreparedPreviewInput} from './prepared-preview';
const audioLane=(lane:string)=>/^(audio_|music_|sound_effect_)/.test(lane);
const captionMetadata=new Set(['title','graphic_text_role','caption_audio_binding','source_aspect_ratio','source_width','source_height']);
/** Closed eligibility: never paint over baked text or move a caption across a visual lane. */
export function preparedPlaybackPlan(input:PreparedPreviewInput) {
  const canonical=JSON.parse(preparedPreviewIdentity(input)) as PreparedPreviewInput;
  const elements=canonical.inputProps.elements;
  const captions=elements.filter(e=>e.type==='caption_text' && e.lane_key.startsWith('captions_'));
  const order=buildCompositingLaneOrder({visualLaneKeys:elements.filter(e=>e.lane_key.startsWith('visual_')).map(e=>e.lane_key),captionLaneKeys:captions.map(e=>e.lane_key),persistedLaneOrderKeys:input.inputProps.laneOrderKeys??[]});
  const topVisual=Math.max(-1,...order.map((lane,index)=>lane.startsWith('visual_')?index:-1));
  const overlayCaptions=!elements.some(e=>e.props?.gravity_drop_after_text_id) && captions.every(e=>{
    const props=e.props??{}, resolved=resolveCaptionProps(props);
    return order.indexOf(e.lane_key)>topVisual && !e.transition_in && !e.transition_out
      && Object.keys(props).every(key=>key in DEFAULT_CAPTION_PROPS || captionMetadata.has(key))
      && resolved.surfaceMode==='none' && resolved.surfaceBlendMode==='normal'
      && ['cinematic','bold_outline','clean','minimal','handwritten'].includes(resolved.styleVariant)
      && !resolved.mediaFillVideoUrl && !resolved.mediaFillUrls.length && !resolved.mediaFillScene;
  });
  // Keep embedded clip audio in the prepared file. The established editor mixer
  // owns standalone sound lanes; it must not double-play the baked soundtrack.
  const liveAudio=input.inputProps.externalAudioPreview===true;
  const retained=elements.filter(e=>!(liveAudio && audioLane(e.lane_key)) && !(overlayCaptions && captions.includes(e)));
  const preparedInput={...canonical,inputProps:{...canonical.inputProps,elements:retained,laneOrderKeys:canonical.inputProps.laneOrderKeys?.filter(lane=>!(liveAudio && audioLane(lane)) && !(overlayCaptions && lane.startsWith('captions_')))}};
  return {input:preparedInput,overlayCaptions,liveAudio};
}

/** Prepare bounded compositing hotspots; a short mask must not flatten an entire edit. */
export function preparedPlaybackRanges(input:PreparedPreviewInput):[number,number][] {
  const videos=input.inputProps.elements.filter(e=>e.type==='video_clip');
  const ranges:[number,number][]=[];
  const add=(start:number,end:number)=>{
    if(end<=start)return;
    // Two context frames cover quantization and entry/exit settling.
    ranges.push([Math.max(0,Math.floor(start*input.fps)-2),Math.min(input.durationInFrames-1,Math.ceil(end*input.fps)+1)]);
  };
  for(const [index,a] of videos.entries()) {
    if(a.props?.has_alpha===true)add(a.timeline_start,a.timeline_start+a.duration);
    for(const b of videos.slice(index+1))if(a.lane_key!==b.lane_key)
      add(Math.max(a.timeline_start,b.timeline_start),Math.min(a.timeline_start+a.duration,b.timeline_start+b.duration));
    if(a.transition_in)add(a.timeline_start,a.timeline_start+a.transition_in.duration_seconds);
    if(a.transition_out)add(a.timeline_start+a.duration-a.transition_out.duration_seconds,a.timeline_start+a.duration);
  }
  const merged:[number,number][]=[];
  for(const range of ranges.filter(([a,b])=>b>=a).sort((a,b)=>a[0]-b[0])) {
    const previous=merged.at(-1);
    if(previous && range[0]<=previous[1]+1)previous[1]=Math.max(previous[1],range[1]);
    else merged.push([...range]);
  }
  // Bound the working set to sixteen blocks (four retained proposal versions).
  // Merge the smallest gaps first rather than leaving any hotspot uncovered.
  while(merged.length>16){
    let closest=0;
    for(let i=1;i<merged.length-1;i++)if(merged[i+1][0]-merged[i][1]<merged[closest+1][0]-merged[closest][1])closest=i;
    merged.splice(closest,2,[merged[closest][0],merged[closest+1][1]]);
  }
  return merged;
}
