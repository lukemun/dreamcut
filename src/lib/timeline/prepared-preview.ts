import {currentFrameRate} from './frame-rate-scope';
import {PREVIEW_QUALITIES, type PreviewQuality} from '../preview-quality';
import type { CompositionElement } from '../render/composition-adapters';
import {stripRuntimePreviewProps} from './runtime-preview-props';

/** Exactness is a property of a complete composed frame, not independent decoders. */
export type PreparedPreviewInput = {
  backend?: 'standard' | 'rust';
  width: number; height: number; fps: number; durationInFrames: number;
  /** Inclusive absolute composition frame window; omitted for full preparation. */
  frameRange?: [number,number];
  inputProps: { elements: CompositionElement[]; laneOrderKeys?: string[]; renderScale?: number; externalAudioPreview?: boolean };
};
export type PreparedPreviewStatus = { id: string; state: 'queued' | 'preparing' | 'ready' | 'failed' | 'cancelled' | 'stale'; progress: number; url?: string; error?: string };
export function hasLayeredVideo(elements: CompositionElement[]) {
  const videos = elements.filter(e => e.type === 'video_clip');
  return videos.some((a, i) => videos.slice(i + 1).some(b => a.lane_key !== b.lane_key
    && a.timeline_start < b.timeline_start + b.duration && b.timeline_start < a.timeline_start + a.duration));
}
// Callers include mutable preparation requests. Object identity cannot prove that
// nested picture properties still describe the same frame.
export function preparedPreviewIdentity(input: PreparedPreviewInput): string {
  // Includes effective proposal tuning, order, text, masks and full output geometry.
  return JSON.stringify({ ...input, inputProps: { ...input.inputProps, elements: input.inputProps.elements.map(element=>{
    const picture={...element} as CompositionElement & {created_at?:unknown;updated_at?:unknown};
    delete picture.created_at;delete picture.updated_at;
    // Editor thumbnail data and disposable decoder bindings are not picture edits.
    // Use the shared inventory so live and proposal hydration canonicalize equally.
    if(picture.props) {
      const {runtime_preview_source_url, runtime_still_preview, runtime_media_fill_preview, preview_proxy_validation} = picture.props;
      picture.props=stripRuntimePreviewProps(picture.props);
      // A completed proxy replacement changes preview pixels, unlike readiness
      // and thumbnail metadata. Retain the binding in the disposable cache key.
      if (typeof runtime_preview_source_url === "string") picture.props = {...picture.props, runtime_preview_source_url};
      if (preview_proxy_validation) picture.props = {...picture.props, preview_proxy_validation};
      if (runtime_still_preview) picture.props = {...picture.props, runtime_still_preview};
      if (runtime_media_fill_preview) picture.props = {...picture.props, runtime_media_fill_preview};
    }
    return picture;
  }), externalAudioPreview: false } });
}
export function currentPreparedPreview(identity: string, result: { identity: string; status: PreparedPreviewStatus } | null) {
  return result?.identity === identity ? result.status : null;
}

/** Whole-composition preparation is currently bounded to one minute. */
export function shouldPreparePlayback(elements: CompositionElement[], durationInFrames: number, fps: number = currentFrameRate()) {
  return durationInFrames <= 60 * fps && hasLayeredVideo(elements);
}

/** Keep authored CSS geometry; only rasterize fewer preview pixels. Export stays full resolution. */
export function preparedPreviewPixelScale(width:number,height:number,quality?:PreviewQuality) {
 const edge=quality ? PREVIEW_QUALITIES[quality].edge || 1280 : 1280;
 let scale=1;
 while(Math.max(width*scale,height*scale)>edge && width*scale%4===0 && height*scale%4===0)scale/=2;
 return scale;
}

/** Hydrated proxy proofs are the shared, server-validated effective quality.
 * During an upgrade, keep the previous proven tier until its replacement is ready.
 * Mixed sources use the largest tier so a small/alpha layer cannot downscale the scene.
 */
export function preparedRasterScale(input:PreparedPreviewInput) {
 const qualities=input.inputProps.elements.flatMap(element=>{
  const proof=element.props?.preview_proxy_validation as {ok?:unknown;quality?:unknown}|undefined;
  return proof?.ok===true && typeof proof.quality==='string' && Object.hasOwn(PREVIEW_QUALITIES,proof.quality)
   ? [proof.quality as PreviewQuality] : [];
 });
 const quality=qualities.sort((a,b)=>(PREVIEW_QUALITIES[b].edge||1280)-(PREVIEW_QUALITIES[a].edge||1280))[0];
 return preparedPreviewPixelScale(input.width,input.height,quality);
}

/** Only known sound-only controls are erased. Fades/transitions also affect picture. */
export function preparedPictureInput(input: PreparedPreviewInput): PreparedPreviewInput {
  const canonical = JSON.parse(preparedPreviewIdentity(input)) as PreparedPreviewInput;
  const elements = canonical.inputProps.elements.filter(el =>
    !/^(audio_|music_|sound_effect_)/.test(el.lane_key)).map(el => {
      const props = {...el.props}; delete props.volume_envelope;
      return {...el,volume:0,props};
    });
  return {...canonical,inputProps:{...canonical.inputProps,elements,
    laneOrderKeys:canonical.inputProps.laneOrderKeys?.filter(lane=>!/^(audio_|music_|sound_effect_)/.test(lane))}};
}
