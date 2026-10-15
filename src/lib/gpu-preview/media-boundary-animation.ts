import type {GpuGroupTransform} from './geometry';
import type {gpuMediaAnimationDraw} from './media-animation-draw';
export type GpuBoundaryAnimation={
 phase:'in'|'out';pose?:GpuGroupTransform;postBlur?:{x:number;y:number};
 /** Smear's outgoing CSS transform replaces the native actor transform. */
 replaceNativePose?:boolean;
 /** Active SVG directional blur replaces the native CSS blur. */
 replaceNativeBlur?:boolean;
 /** Shared ordinary blur in CSS pixels, used in the same filter declaration. */
 cssBlurPx?:number;
};
/** Standard's outgoing wrapper has one CSS transform list, not two nested
 * wrappers. Translation precedes the summed Z rotation and product scale. This
 * must not be implemented as boundaryMatrix * nativeMatrix: that would rotate
 * or scale the native translation. Incoming transition wrappers own their pose. */
export function gpuMediaBoundaryAnimation(native:ReturnType<typeof gpuMediaAnimationDraw>,boundary:GpuBoundaryAnimation|undefined){
 if(!boundary)return {group:native.group,postBlur:native.postBlur};
 if(boundary.phase==='in'){
  if(native.group.scale!==1||native.group.translateX!==0||native.group.translateY!==0||native.group.rotateZDeg!==0||native.postBlur)throw Error('Incoming boundary requires neutral held-head animation');
  return {group:boundary.pose??native.group,postBlur:boundary.postBlur};
 }
 let group=native.group;
 if(boundary.pose){
  if(boundary.pose.width!==group.width||boundary.pose.height!==group.height)throw Error('GPU boundary/native dimensions differ');
  group=boundary.replaceNativePose?boundary.pose:{...group,
   translateX:group.translateX+boundary.pose.translateX,translateY:group.translateY+boundary.pose.translateY,
   rotateZDeg:group.rotateZDeg+boundary.pose.rotateZDeg,scale:group.scale*boundary.pose.scale};
 }
 if(boundary.replaceNativeBlur&&boundary.postBlur)return {group,postBlur:boundary.postBlur};
 const sigma=(native.postBlur?.x??0)+(boundary.cssBlurPx??0);
 if(!Number.isFinite(sigma)||sigma<0)throw Error('Invalid GPU native/boundary blur');
 return {group,postBlur:sigma>.01?{x:sigma,y:sigma}:undefined};
}
