import type {CompositionElement} from '../render/composition-adapters';
import {resolvePreviewAudioSource} from '../remotion/video-preview-audio';
import {readPreviewAudioBakedGain} from '../remotion/preview-narration-audio';
/** Preserve clip identity and authored automation; delegate audible video to the shared mixer. */
export function nativePreviewAudioElements(elements:CompositionElement[]):CompositionElement[]{
 return elements.map(e=>{
  if(e.type!=='video_clip'||e.props?.runtime_source_has_audio===false)return e;
  // Binding is independent of gain: a muted channel can be unmuted live or
  // have an envelope. Do not open a full-resolution movie just because the
  // shared audible-source helper skips currently muted elements.
  const sidecar=resolvePreviewAudioSource({...e,volume:1},false);
  // A reversed clip without its prepared backward track stays silent rather than playing forward.
  if(e.props?.playback_reverse===true&&!sidecar)return {...e,volume:0,lane_key:`audio_native_${e.lane_key}`,props:{...e.props,_native_video_audio:true}};
  return {...e,lane_key:`audio_native_${e.lane_key}`,source_url:sidecar??e.source_url,props:{...e.props,_native_video_audio:true,_native_preview_audio_baked_gain:sidecar?readPreviewAudioBakedGain(e):1}};
 });
}
