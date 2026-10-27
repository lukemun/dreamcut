import {cameraMatrix,composeAffine,type Affine,type CameraView} from '../timeline/camera';
import {spiralGroupSchema,spiralGroupTransform} from '../timeline/spiral-group';
import {multiplyProjective,type Projective} from '../timeline/surface-placement';
export type GpuSpiralTransform={matrix:readonly number[];hidden:boolean};
/** Same anchored CSS translate/rotate/scale as SpiralGroupFrame. Keep this
 * nested wrapper separate from native animation because filters do not commute. */
export function gpuSpiralTransform(value:unknown,seconds:number,width:number,height:number):GpuSpiralTransform|undefined{
 if(value==null)return undefined;
 const recipe=spiralGroupSchema.parse(value),pose=spiralGroupTransform(recipe,seconds,width,height);
 const a=pose.rotation*Math.PI/180,c=Math.cos(a)*pose.scale,s=Math.sin(a)*pose.scale,x=recipe.origin_x*width,y=recipe.origin_y*height;
 return {hidden:pose.scale<=Number.EPSILON*16,matrix:[c,-s,x+pose.x-c*x+s*y,s,c,y+pose.y-s*x-c*y,0,0,1]};
}

/**
 * The outermost transform of a clip or caption: its spiral group, seen through the camera it follows
 * (timeline/camera.ts). Standard draws the same order: CameraFrame outside SpiralGroupFrame.
 */
export function gpuOuterTransform(spiral:unknown,seconds:number,width:number,height:number,camera?:CameraView,surface?:{matrix:Projective;hidden:boolean}):GpuSpiralTransform|undefined{
 const inner=gpuSpiralTransform(spiral,seconds,width,height);
 // A picture on a tracked surface: its frame mapped onto the surface (with the footage's camera
 // already applied, timeline/surface-placement.ts), so it is the outermost, projective transform.
 if(surface)return {hidden:surface.hidden||(inner?.hidden??false),matrix:inner?multiplyProjective(surface.matrix,inner.matrix as unknown as Projective):surface.matrix};
 if(!camera)return inner;
 const view=cameraMatrix(camera,width,height);
 return {hidden:inner?.hidden??false,matrix:inner?composeAffine(view,inner.matrix as Affine):view};
}
