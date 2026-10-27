import {quadMatrixValues, type SurfaceQuad} from '../timeline/surface-track';
import type {ProjectionRect} from '../timeline/source-projection';
/** Column-major composition, matching CSS matrix3d and WGSL mat4x4. */
function multiply(a: readonly number[], b: readonly number[]) {
  return Array.from({length:16},(_,i)=>{const row=i%4,column=Math.floor(i/4);let sum=0;for(let k=0;k<4;k++)sum+=a[k*4+row]*b[column*4+k];return sum;});
}
export function quadToGpuTransform(quad: SurfaceQuad, width: number, height: number, textureScale:readonly [number,number]=[1,1]): number[] | null {
  if(!(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)))throw Error('Invalid GPU canvas dimensions');
  const projective=quadMatrixValues(quad,1);
  if(!projective)return null;
  // Local quad [-1,1], Y up -> source UV [0,1], Y down -> project pixels -> clip.
  const [sx,sy]=textureScale;
  if(![sx,sy].every(value=>Number.isFinite(value)&&value>0))throw Error('Invalid GPU texture extent');
  const localToUv=[.5*sx,0,0,0,0,-.5*sy,0,0,0,0,1,0,.5*sx,.5*sy,0,1];
  const pixelsToClip=[2/width,0,0,0,0,-2/height,0,0,0,0,1,0,-1,1,0,1];
  return multiply(pixelsToClip,multiply(projective,localToUv));
}
export function rectToGpuTransform(rect: ProjectionRect, width: number, height: number) {
  const {x,y,width:w,height:h}=rect;
  return quadToGpuTransform([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],width,height);
}

/** Source mirror precedes CSS rotation, inside the outer translate/scale/mask. */
export function orientedRectToGpuTransform(rect:ProjectionRect,width:number,height:number,orientation:{degrees:number;mirrorX:number}){
 const cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
 const radians=orientation.degrees*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
 const quad=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{
  const dx=x*rect.width/2*orientation.mirrorX,dy=y*rect.height/2;
  return [cx+c*dx-s*dy,cy+s*dx+c*dy];
 }) as SurfaceQuad;
 return quadToGpuTransform(quad,width,height);
}

export type GpuGroupTransform={width:number;height:number;scale:number;translateX:number;translateY:number;rotateZDeg:number};
/** Whole-actor CSS animation is outside media scale, filters and masks. Pack its
 * forward clip mapping after the isolated actor surface has its masks applied. */
export function gpuGroupParameters(group?:GpuGroupTransform){
 if(!group)return [1,1,0,0,0,0,1,1];
 if(!Object.values(group).every(Number.isFinite)||group.width<=0||group.height<=0||group.scale<=0)throw Error('Invalid GPU group transform');
 const radians=group.rotateZDeg*Math.PI/180;
 return [group.scale,Math.cos(radians),Math.sin(radians),group.scale!==1||group.translateX!==0||group.translateY!==0||group.rotateZDeg!==0?1:0,
  group.translateX,group.translateY,group.width,group.height];
}
export function groupGpuTransform(transform:readonly number[],group?:GpuGroupTransform){
 const [scale,c,s,active,x,y,w,h]=gpuGroupParameters(group);
 if(!active)return transform;
 return multiply([scale*c,-scale*s*w/h,0,0,scale*s*h/w,scale*c,0,0,0,0,1,0,2*x/w,-2*y/h,0,1],transform);
}
