import type {elementAnimationFrame} from '../timeline/element-animation';
import type {GpuGroupTransform} from './geometry';
/** Native media animation acts on the completed media wrapper. Focus blur is
 * expressed in composition CSS pixels (not the 1080-normalized effect units),
 * filtered before the whole-actor pose and multiplied opacity. A write_on wipe
 * is a right-edge clip of the composition-sized wrapper in group-local space
 * (Standard's CSS clip-path on the transformed wrapper); it is omitted at zero. */
export function gpuMediaAnimationDraw(animation:ReturnType<typeof elementAnimationFrame>,width:number,height:number):{
 group:GpuGroupTransform;postBlur:{x:number;y:number}|undefined;opacity:number;wipeRight?:number;
}{
 const wipe=animation.wipeRight??0;
 if(![width,height].every(v=>Number.isFinite(v)&&v>0)||![animation.scale,animation.translateX,animation.translateY,animation.rotateZDeg,animation.blurPx,animation.opacity,wipe].every(Number.isFinite)||animation.blurPx<0||wipe<0||wipe>1)throw Error('Invalid GPU media animation');
 return {group:{scale:animation.scale,translateX:animation.translateX,translateY:animation.translateY,rotateZDeg:animation.rotateZDeg,width,height},
  postBlur:animation.blurPx>.01?{x:animation.blurPx,y:animation.blurPx}:undefined,opacity:animation.opacity,
  ...(wipe>0?{wipeRight:wipe}:{})};
}
