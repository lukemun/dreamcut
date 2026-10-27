import type {TimelineTransition,TimelineTransitionDirection} from '../../components/studio/timeline/types';
import {resolveCubeTransitionVisualStyle,resolveTransitionDirection} from '../timeline/transitions';
import {accentTransitionFrame,isAccentTransition} from '../timeline/accent-transitions';
import {pageTurnVisualPlan} from '../timeline/page-turn-plan';

export type GpuBoundaryVisual = {
 clip?:readonly[number,number,number,number];
 projective?:{quad:readonly(readonly[number,number])[];backfaceVisible:boolean;perspective:number};
 wash?:{opacity:number;background:string};
 pageTurn?:ReturnType<typeof pageTurnVisualPlan>;
 opacity:number;
};

/** CSS inset semantics used by the Standard incoming viewport (including its
 * historical top/bottom convention). Bounds are composition pixels. */
export function gpuWipeClip(progress:number,direction:TimelineTransitionDirection,width:number,height:number):readonly[number,number,number,number]{
 const p=Math.max(0,Math.min(1,progress));
 if(direction==='from-right')return [(1-p)*width,0,width,height];
 if(direction==='from-top')return [0,(1-p)*height,width,height];
 if(direction==='from-bottom')return [0,0,width,p*height];
 return [0,0,p*width,height];
}

/** Project the shared CSS cube geometry in its declared transform order.
 * Returned quad transforms the whole composited actor, not its raw source. */
export function gpuCubeProjection(progress:number,phase:'in'|'out',direction:TimelineTransitionDirection,width:number,height:number){
 const visual=resolveCubeTransitionVisualStyle(progress,phase,direction,width,height);
 const rx=visual.rotateXDeg*Math.PI/180,ry=visual.rotateYDeg*Math.PI/180;
 const perspective=(direction==='from-top'||direction==='from-bottom'?height:width)*3;
 const quad=([[0,0],[width,0],[width,height],[0,height]] as const).map(([px,py])=>{
  const x=px-width/2,y=py-height/2;
  const x1=x*Math.cos(ry),z1=-x*Math.sin(ry);
  const y1=y*Math.cos(rx)-z1*Math.sin(rx),z2=y*Math.sin(rx)+z1*Math.cos(rx);
  const z=z2+visual.translateZ,denominator=1-z/perspective;
  if(denominator<=0)throw Error('Cube crosses perspective plane');
  return [(x1+visual.translateX)/denominator+width/2,(y1+visual.translateY)/denominator+height/2] as const;
 });
 // Perspective translation changes the eye-to-plane direction. Projected
 // winding, unlike cos(rotation), detects the CSS back face at side positions.
 const signedArea=quad.reduce((sum,p,i)=>{const next=quad[(i+1)%4];return sum+p[0]*next[1]-p[1]*next[0];},0);
 return {quad,backfaceVisible:signedArea<0,perspective};
}

/** Pure descriptor; unsupported composition packets must reject until the adapter
 * implements every returned operation. Admission remains independently gated. */
export function gpuBoundaryVisual(transition:TimelineTransition,progress:number,phase:'in'|'out',width:number,height:number,outgoingType:string):GpuBoundaryVisual|null{
 if(![progress,width,height].every(Number.isFinite)||width<=0||height<=0)throw Error('Invalid boundary geometry');
 const direction=resolveTransitionDirection(transition.params);
 switch(transition.type){
  case 'wipe':return {opacity:1,...(phase==='in'?{clip:gpuWipeClip(progress,direction,width,height)}:{})};
  case 'cube':return {opacity:1,projective:gpuCubeProjection(progress,phase,direction,width,height)};
  case 'page_turn':return {opacity:1,...(phase==='out'?{pageTurn:pageTurnVisualPlan(progress,transition.params,outgoingType,width,height)}:{})};
  default:
   if(isAccentTransition(transition.type)){
    if(phase==='out')return {opacity:1};
    const frame=accentTransitionFrame(transition.type,progress,transition.params);
    return {opacity:frame.incomingOpacity,wash:{opacity:frame.washOpacity,background:frame.background}};
   }
   return null;
 }
}
