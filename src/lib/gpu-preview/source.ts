import {resolveVideoPlaybackSource,resolveStillPlaybackSource, type PreviewableVideoElement} from '../remotion/video-preview-source';
import {hasValidatedPreviewProxy} from '../remotion/preview-proxy-contract';
import type {GpuProxySource} from './browser-frame-provider';
import {outlineFrameUrl,type OutlineMask} from '../timeline/outline-layer';

const RASTER_IMAGE=/\.(png|jpe?g)(?:[?#]|$)/i,VECTOR_IMAGE=/\.svg(?:[?#]|$)/i;
/** Largest edge of a rasterized vector still; bounds decoded bytes for scaled-up art. */
export const GPU_SVG_RASTER_MAX_EDGE=4096;

/** Standard draws a vector still with the browser at its contained layout size and
 * keeps it sharp under media scale. Rasterize for the largest authored scale once,
 * so seeks reuse one picture; unscaled art is drawn at exactly its layout size. */
export function gpuSvgRasterBox(props:Record<string,unknown>|null|undefined,frame:{width:number;height:number}){
  const points=(props?.keyframes as Record<string,unknown>|null|undefined)?.media_scale;
  const scales=[Number(props?.media_scale??1),...(Array.isArray(points)?points.map(point=>Number((point as {v?:unknown})?.v)):[])].filter(v=>Number.isFinite(v)&&v>0);
  const scale=Math.max(1,...scales),limit=GPU_SVG_RASTER_MAX_EDGE/Math.max(frame.width,frame.height);
  const factor=Math.min(scale,Math.max(1,limit));
  return {width:Math.max(1,Math.round(frame.width*factor)),height:Math.max(1,Math.round(frame.height*factor))};
}

/** Contained raster size of an image with this intrinsic size inside the box. */
export function gpuSvgRasterSize(naturalWidth:number,naturalHeight:number,box:{width:number;height:number}){
  if(!(naturalWidth>0&&naturalHeight>0))return {width:box.width,height:box.height};
  const scale=Math.min(box.width/naturalWidth,box.height/naturalHeight);
  return {width:Math.max(1,Math.round(naturalWidth*scale)),height:Math.max(1,Math.round(naturalHeight*scale))};
}

/** Stills share Standard's prepared-image selection; export keeps its source.
 * SVG is rasterized by the browser at its layout size. Animated formats (GIF,
 * WebP, AVIF) stay rejected: Standard's <img> animates them on the wall clock. */
export function resolveGpuImageSource(element:{source_url:string|null;duration:number;props?:Record<string,unknown>|null},mediaScope:string,rendering=false,frame:{width:number;height:number}={width:1080,height:1920}):GpuProxySource {
  const source=element.source_url;
  if(!mediaScope||!source)throw Error('GPU image requires a source and media snapshot identity');
  const url=resolveStillPlaybackSource(source,rendering,element.duration,element.props);
  if(VECTOR_IMAGE.test(source)){
    const raster=gpuSvgRasterBox(element.props,frame);
    return {kind:'image',key:JSON.stringify([mediaScope,url,'svg-raster-srgb-v1',raster.width,raster.height]),url,validationUrl:url,raster};
  }
  if(!RASTER_IMAGE.test(source))throw Error('GPU still preview requires a PNG, JPEG or SVG image');
  return {kind:'image',key:JSON.stringify([mediaScope,url,'image-srgb-v1']),url,validationUrl:url};
}

/** Prepared per-frame silhouette of an outline layer (timeline/outline-layer.ts). */
export function readGpuOutlineMask(props:Record<string,unknown>|null|undefined):OutlineMask|null{
  if(typeof props?.outline_parent_id!=='string'||props.outline_mask==null)return null;
  const mask=props.outline_mask as Partial<OutlineMask>;
  if(typeof mask!=='object'||typeof mask.source_url!=='string'||!mask.source_url||!Number.isSafeInteger(mask.frame_count)||mask.frame_count!<1
    ||!Number.isFinite(mask.fps)||mask.fps!<=0||mask.timestamps!=null&&(!Array.isArray(mask.timestamps)||!mask.timestamps.every(Number.isFinite)))throw Error('Invalid outline mask');
  return mask as OutlineMask;
}

/** Visual media source at a source time. An outline layer draws its prepared mask
 * frame, never the subject's video (TimelineComposition's outline branch). */
export function resolveGpuMediaSource(element:PreviewableVideoElement&{type:string;source_url?:string|null;duration:number},mediaScope:string,rendering=false,sourceSeconds=0,frame?:{width:number;height:number}):GpuProxySource{
  const mask=element.type==='video_clip'?readGpuOutlineMask(element.props):null;
  if(mask){
    if(!mediaScope)throw Error('GPU source requires a media snapshot identity');
    const url=outlineFrameUrl(mask,sourceSeconds);
    return {kind:'image',key:JSON.stringify([mediaScope,url,'outline-mask-v1']),url,validationUrl:url};
  }
  return element.type==='still'?resolveGpuImageSource({source_url:element.source_url??null,duration:element.duration,props:element.props},mediaScope,rendering,frame):resolveGpuVideoSource(element,mediaScope,rendering);
}

/** Same measured proxy selection as the standard player. Scope expires on media refresh.
 * Prepared media uses immutable versioned URLs; the scope prevents legacy replacements
 * at a stable URL from reusing decoded frames across input snapshots.
 */
export function resolveGpuVideoSource(element: PreviewableVideoElement & {source_url?:string|null}, mediaScope: string, rendering=false): GpuProxySource {
  if (!mediaScope) throw Error('GPU source requires a media snapshot identity');
  if(rendering){
    const url=element.source_url;
    if(element.type!=='video_clip'||!url)throw Error('GPU export requires a render source');
    return {url,validationUrl:url,alpha:element.props?.has_alpha===true,key:JSON.stringify([mediaScope,url,'export-sdr-v1'])};
  }
  if (element.type !== 'video_clip' || !hasValidatedPreviewProxy(element.props)) {
    throw Error('GPU preview requires a verified video proxy');
  }
  const url = resolveVideoPlaybackSource(element, null, false);
  if (!url) throw Error('GPU preview requires a verified video proxy');
  const proof = element.props!.preview_proxy_validation as Record<string, unknown>;
  const alpha = element.props!.has_alpha === true;
  return {
    url, validationUrl: url, alpha,
    // Reserve conservative coded blocks rather than a full composition-sized
    // surface for each unseen proxy. Actual decoded bytes replace this hint.
    estimatedFrameBytes:Math.ceil(Number(proof.width)/64)*64*Math.ceil(Number(proof.height)/64)*64*4,
    key: JSON.stringify([mediaScope, url, proof.width, proof.height, proof.quality ?? null, proof.revision ?? null,
      element.props!.preview_proxy_sha256??element.props!.preview_sha256??null,alpha, 'sdr-srgb-v1']),
  };
}
