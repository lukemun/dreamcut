import {preparedPictureInput, type PreparedPreviewInput} from '../timeline/prepared-preview';
import {validatePreviewProxy} from '../local-store/preview-proxy-validation';
import {resolveVideoPlaybackSource} from '../remotion/video-preview-source';

/** Picture-only preparation uses the same validated binding as either live
 * decoder. The worker renders audio separately from untouched render authorities.
 * This adapter never runs for delivery exports. */
export function preparedPlaybackSources(input:PreparedPreviewInput,validate=validatePreviewProxy):PreparedPreviewInput {
  const picture=preparedPictureInput(input);
  return {...picture,inputProps:{...picture.inputProps,elements:picture.inputProps.elements.map(element=>{
    if(element.type!=='video_clip')return element;
    const props=element.props ?? {};
    const url=props.runtime_preview_source_url ?? props.preview_source_url;
    const quality=(props.preview_proxy_validation as {quality?:unknown}|undefined)?.quality;
    const proof=validate(url,props.has_alpha===true,quality);
    const source=resolveVideoPlaybackSource({...element,props:{...props,preview_proxy_validation:proof}},element.source_url,false);
    if(!source)throw new Error(`Prepare preview for ${element.id}: no validated picture proxy`);
    const pictureProps={...props}; delete pictureProps.volume_envelope;
    return {...element,source_url:source,volume:0,props:pictureProps};
  })}};
}

/** Zero-gain actors cannot contribute to the audio manifest. Avoid decoding their
 * full-resolution pictures merely to produce silence in the audio-only pass. */
export function preparedAudioSources(input:PreparedPreviewInput):PreparedPreviewInput {
  return {...input,inputProps:{...input.inputProps,elements:input.inputProps.elements.filter(element=>
    (element.volume !== 0 || Boolean(element.props?.volume_envelope)) &&
    (element.type === 'video_clip' || /^(audio_|music_|sound_effect_)/.test(element.lane_key))
  )}};
}

/** Conservatively detect overlap with an audible actor before starting a browser.
 * False positives cost work; silence is emitted only for a provably empty window. */
export function preparedRangeHasAudio(input:PreparedPreviewInput, range:[number,number]):boolean {
  const start=range[0]/input.fps, end=(range[1]+1)/input.fps;
  return preparedAudioSources(input).inputProps.elements.some(element =>
    element.timeline_start < end && element.timeline_start + element.duration > start);
}
