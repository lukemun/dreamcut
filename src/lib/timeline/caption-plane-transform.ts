import type {CaptionElementProps} from './captions';
type PlaneText=Pick<CaptionElementProps,'surfaceMode'|'surfacePerspectivePx'|'surfaceDepthPx'|'surfaceRotateXDeg'|'surfaceRotateYDeg'|'surfaceRotateZDeg'|'surfaceSkewXDeg'|'surfaceSkewYDeg'|'textScaleX'|'textScaleY'>;
/** CSS applies this list right-to-left. Both renderer adapters consume this owner. */
export function captionPlaneTransform(text:PlaneText,animationScale=1,animationRotateZDeg=0,renderScale=1){
 const wall=text.surfaceMode==='wall';
 return {perspective:text.surfacePerspectivePx*renderScale,depth:wall?text.surfaceDepthPx*renderScale:0,
  rotateX:wall?text.surfaceRotateXDeg:0,rotateY:wall?text.surfaceRotateYDeg:0,
  rotateZ:(wall?text.surfaceRotateZDeg:0)+animationRotateZDeg,
  skewX:wall?text.surfaceSkewXDeg:0,skewY:wall?text.surfaceSkewYDeg:0,
  scaleX:animationScale*text.textScaleX,scaleY:animationScale*text.textScaleY};
}
/** A flat plane (no depth, no X/Y tilt) emits only its 2D functions. perspective() is the
 * identity there, but any 3D function promotes the caption to its own compositor layer,
 * which Chrome resamples at the fractional anchor offset instead of pixel-snapping the
 * glyph baseline. That made Standard captions ~0.17-0.33 px softer/lower than the same
 * markup painted in one pass (Browser GPU's foreignObject raster, a 2D DOM transform). */
export function captionPlaneCss(plane:ReturnType<typeof captionPlaneTransform>){
 if(plane.depth===0&&plane.rotateX===0&&plane.rotateY===0)
  return `rotateZ(${plane.rotateZ}deg) skew(${plane.skewX}deg, ${plane.skewY}deg) scale(${plane.scaleX}, ${plane.scaleY})`;
 return `perspective(${plane.perspective}px) translateZ(${plane.depth}px) rotateX(${plane.rotateX}deg) rotateY(${plane.rotateY}deg) rotateZ(${plane.rotateZ}deg) skew(${plane.skewX}deg, ${plane.skewY}deg) scale(${plane.scaleX}, ${plane.scaleY})`;
}
export function projectCaptionPlanePoint(plane:ReturnType<typeof captionPlaneTransform>,point:readonly[number,number],anchor:readonly[number,number],translation:readonly[number,number]=[0,0]):[number,number]{
 if(![...Object.values(plane),...point,...anchor,...translation].every(Number.isFinite)||plane.perspective<=0)throw Error('Invalid caption plane');
 const rad=Math.PI/180;
 const sx=(point[0]-anchor[0])*plane.scaleX,sy=(point[1]-anchor[1])*plane.scaleY;
 const x=sx+Math.tan(plane.skewX*rad)*sy,y=sy+Math.tan(plane.skewY*rad)*sx;
 const rz=plane.rotateZ*rad,ry=plane.rotateY*rad,rx=plane.rotateX*rad;
 const zx=Math.cos(rz)*x-Math.sin(rz)*y,zy=Math.sin(rz)*x+Math.cos(rz)*y;
 const yx=Math.cos(ry)*zx,yz=-Math.sin(ry)*zx;
 const xy=Math.cos(rx)*zy-Math.sin(rx)*yz,z=Math.sin(rx)*zy+Math.cos(rx)*yz+plane.depth;
 const denominator=1-z/plane.perspective;
 if(denominator<=1e-6)throw Error('Caption plane crosses perspective horizon');
 return [anchor[0]+translation[0]+yx/denominator,anchor[1]+translation[1]+xy/denominator];
}
/** Presets whose glyph raster Standard retains through scale/rotation (CSS will-change). */
export const CAPTION_MOTION_LAYER_PRESETS:readonly string[]=['pop','spring_pop','rotate_in'];
/**
 * Whether the caption is drawn as one retained, resampled glyph layer at this frame.
 * Only while the animation pose is not the identity: a settled caption paints in one pass
 * (pixel-snapped glyphs) in both renderers. While active, Standard's compositor layer keeps
 * the fractional part of the actor's translation out of the raster and resamples it at
 * composite time; Browser GPU rasterizes at the integer-snapped translation and draws the
 * raster at the fractional remainder, so both resample the same pixels.
 */
export function captionMotionLayerActive(animationIn:string,animationOut:string,scale:number,rotateZDeg:number){
 return (scale!==1||rotateZDeg!==0)&&[animationIn,animationOut].some(preset=>CAPTION_MOTION_LAYER_PRESETS.includes(preset));
}
