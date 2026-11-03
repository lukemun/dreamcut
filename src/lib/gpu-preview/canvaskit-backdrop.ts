import {drawCanvasKitScaledImage,makeCanvasKitScaledSurface} from './canvaskit-pixel-scale';
import {resolveMediaScene} from '../timeline/resolved-media-scene';

export type CanvasKitBackdropScope='actor'|'scene'|'unresolved';
/** MediaTransformFrame puts edgeBlur after the transition child, inside outer.
 * A mask/clip or opacity on that outer establishes an actor-local CSS backdrop
 * root. Inner iris, grade, source opacity/alpha and window do NOT establish a
 * root for their sibling edgeBlur. Unknown enclosing wrappers stay explicit.
 */
export function canvasKitBackdropScope(props:Record<string,unknown>|null|undefined,time:number,canvas:{width:number;height:number},ancestor:{isolated:boolean;known:boolean}):CanvasKitBackdropScope{
 const outer=resolveMediaScene(props,time,canvas).styles.outer;
 if(typeof outer.opacity==='number'&&outer.opacity<1||outer.clipPath&&outer.clipPath!=='none'||outer.maskImage&&outer.maskImage!=='none'||outer.WebkitMaskImage&&outer.WebkitMaskImage!=='none')return 'actor';
 if(!ancestor.known)return 'unresolved';
 return ancestor.isolated?'actor':'scene';
}

/** These are the actual enclosing wrappers emitted by MediaTransitionIn /
 * MediaAnimationOut / FixedTransitionViewport, not the source's inner effects.
 * Perspective and spiral transforms alone are not CSS backdrop roots. The
 * page renderer further specializes each face: clipped fronts and filtered
 * backs isolate, while other fronts sample through their own homography. */
/** `animationClip`: a write_on clip-path on the media wrapper is a backdrop root. */
export function canvasKitBackdropAncestor(input:{grid:boolean;animationOpacity:number;animationBlur:boolean;animationClip?:boolean;blend:string;transition?:{type:string;opacity:number;filtered:boolean;clipped:boolean};spiral:boolean}){
 const t=input.transition;
 const known=(!t||['fade','slide','whip','wipe','cube','page_turn','film_burn','camera_flash','blackout'].includes(t.type));
 return {known,isolated:input.grid||input.animationOpacity<1||input.animationBlur||!!input.animationClip||input.blend!=='normal'||!!t&&(t.opacity<1||t.filtered||t.clipped)};
}

import type {CanvasKit,Surface,Image} from 'canvaskit-wasm';
import type {GpuGroupTransform} from './geometry';
import {gpuGroupParameters} from './geometry';
/** Map the already-composed scene into the edge sibling's untransformed local
 * viewport before Gaussian filtering. Transforming just the finished blur would
 * change which background pixels the CSS backdrop filter sees. */
export function canvasKitBackdropInverse(group:GpuGroupTransform|undefined,width:number,height:number):number[]{
 gpuGroupParameters(group);
 if(!group)return [1,0,0,0,1,0,0,0,1];
 if(group.width!==width||group.height!==height)throw Error('CanvasKit backdrop group dimensions differ');
 const a=-group.rotateZDeg*Math.PI/180,c=Math.cos(a)/group.scale,s=Math.sin(a)/group.scale;
 const x=width/2+group.translateX,y=height/2+group.translateY;
 return [c,-s,width/2-c*x+s*y,s,c,height/2-s*x-c*y,0,0,1];
}
/** Compose prior actors + this actor in local coordinates. The caller draws
 * only the masked blurred overlay into its actor surface; it must not redraw
 * this entire composite or untouched background pixels would be resampled.
 * Allocation ownership is explicit and bounded by the caller's frame plan. */
export function canvasKitComposeSceneBackdrop(k:CanvasKit,owner:Surface,previous:Image,actor:Image,group?:GpuGroupTransform,projective?:readonly number[],inner?:readonly number[],scale=1){
 // Images hold `scale` device pixels per logical pixel; transforms are logical.
 const width=actor.width()/scale,height=actor.height()/scale;
 if(previous.width()!==actor.width()||previous.height()!==actor.height())throw Error('CanvasKit scene backdrop dimensions differ');
 const inverse=canvasKitBackdropInverse(group,width,height),projectiveInverse=projective?canvasKitBackdropProjectiveInverse(projective):null;
 const surface=makeCanvasKitScaledSurface(k,owner,width,height,scale);
 if(!surface)throw Error('CanvasKit scene backdrop surface unavailable');
 let image:Image|undefined;
 try{
  const c=surface.getCanvas();c.clear(k.TRANSPARENT);c.save();if(inner)c.concat(canvasKitBackdropProjectiveInverse(inner));c.concat(inverse);if(projectiveInverse)c.concat(projectiveInverse);
  drawCanvasKitScaledImage(k,c,previous,0,0,scale);c.restore();drawCanvasKitScaledImage(k,c,actor,0,0,scale);surface.flush();image=surface.makeImageSnapshot();
  let closed=false;return {image,bytes:actor.width()*actor.height()*8,delete(){if(closed)return;closed=true;image?.delete();surface.delete();}};
 }catch(error){image?.delete();surface.delete();throw error;}
}

/** Invert the complete actor-to-scene homography. Refuse singular perspective
 * rather than sample arbitrary background pixels near a collapsed face. */
export function canvasKitBackdropProjectiveInverse(m:readonly number[]):number[]{
 if(m.length!==9||!m.every(Number.isFinite))throw Error('Invalid CanvasKit backdrop homography');
 const [a,b,c,d,e,f,g,h,i]=m;
 const cof=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
 const determinant=a*cof[0]+b*cof[3]+c*cof[6];
 if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-12)throw Error('Singular CanvasKit backdrop homography');
 return cof.map(v=>v/determinant);
}
