import {captionCompositingCSS,type CaptionElementProps} from '../timeline/captions';

/** The positioned caption lane is an isolated stacking context. Its inner wall
 * Multiply sees transparent local pixels, not the already-painted scene. Only
 * the outer shared compositing wrapper may blend with visual lanes. Promoting
 * wall Multiply to this boundary makes text disappear over black backgrounds. */
export function gpuCaptionBlend(text:Pick<CaptionElementProps,'surfaceMode'|'surfaceBlendMode'|'styleVariant'>){
 return captionCompositingCSS(text.styleVariant).mixBlendMode==='difference'?'difference':'normal';
}
export const CANVASKIT_CAPTION_SURFACE_PROPERTIES=[
 'surfaceMode','surfaceBlendMode','surfacePerspectivePx','surfaceDepthPx','surfaceRotateXDeg','surfaceRotateYDeg','surfaceRotateZDeg','surfaceSkewXDeg','surfaceSkewYDeg','surfaceOpacity','surfaceBlurPx',
 'surface_attached','surface_rotate_deg','surface_skew_x_deg','surface_skew_y_deg','surface_opacity','surface_blur_px',
] as const;
export function gpuCaptionSurfaceIssue(props:Record<string,unknown>,text:CaptionElementProps,_videoFill:boolean):string|null{
 for(const key of CANVASKIT_CAPTION_SURFACE_PROPERTIES){
  const value=props[key];if(value==null)continue;
  if(key==='surfaceMode'){if(value!=='none'&&value!=='wall')return 'Invalid caption surface mode';}
  else if(key==='surfaceBlendMode'){if(value!=='normal'&&value!=='multiply')return 'Invalid caption surface blend';}
  else if(key==='surface_attached'){if(typeof value!=='boolean')return 'Invalid caption surface attachment';}
  else if(typeof value!=='number'||!Number.isFinite(value))return 'Invalid caption surface control';
 }
 if(text.surfaceMode!=='wall')return null;
 return null;
}
