import {spiralGroupSchema,spiralGroupTransform} from '../timeline/spiral-group';
export type GpuSpiralTransform={matrix:readonly number[];hidden:boolean};
/** Same anchored CSS translate/rotate/scale as SpiralGroupFrame. Keep this
 * nested wrapper separate from native animation because filters do not commute. */
export function gpuSpiralTransform(value:unknown,seconds:number,width:number,height:number):GpuSpiralTransform|undefined{
 if(value==null)return undefined;
 const recipe=spiralGroupSchema.parse(value),pose=spiralGroupTransform(recipe,seconds,width,height);
 const a=pose.rotation*Math.PI/180,c=Math.cos(a)*pose.scale,s=Math.sin(a)*pose.scale,x=recipe.origin_x*width,y=recipe.origin_y*height;
 return {hidden:pose.scale<=Number.EPSILON*16,matrix:[c,-s,x+pose.x-c*x+s*y,s,c,y+pose.y-s*x-c*y,0,0,1]};
}
