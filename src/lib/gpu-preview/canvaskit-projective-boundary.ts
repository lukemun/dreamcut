import {canvasKitScaledSourceRect,makeCanvasKitScaledSurface} from './canvaskit-pixel-scale';
import type {CanvasKit,Canvas,Surface,Paint} from 'canvaskit-wasm';
import type {SurfaceQuad} from '../timeline/surface-track';
import {quadToGpuTransform} from './geometry';
import {canvasKitSourceMatrix} from './canvaskit-geometry';
export type GpuProjectiveBoundary={quad:readonly(readonly[number,number])[];backfaceVisible:boolean;perspective:number};
export type CanvasKitProjectiveBoundaryPlan={hidden:boolean;matrix:number[];bytes:number};
/** Cube transforms the complete actor after source effects/masks/opacity. Never
 * apply this homography directly to the original media's source rectangle. */
export function canvasKitProjectiveBoundaryPlan(value:GpuProjectiveBoundary,width:number,height:number):CanvasKitProjectiveBoundaryPlan{
 if(![width,height,value.perspective].every(v=>Number.isFinite(v)&&v>0)||value.quad.length!==4||value.quad.some(p=>p.length!==2||!p.every(Number.isFinite))||typeof value.backfaceVisible!=='boolean')throw Error('Invalid projective boundary');
 const area=Math.abs(value.quad.reduce((sum,p,i)=>{const next=value.quad[(i+1)%4];return sum+p[0]*next[1]-p[1]*next[0];},0))/2;
 if(value.backfaceVisible||area<1e-7)return {hidden:true,matrix:[],bytes:0};
 const transform=quadToGpuTransform(value.quad.map(p=>[...p]) as SurfaceQuad,width,height);
 if(!transform)throw Error('Degenerate projective boundary');
 return {hidden:false,matrix:canvasKitSourceMatrix(transform,width,height,width,height),bytes:width*height*8};
}

/** Caller accounts plan.bytes before any allocation/publication. Callback draws
 * a complete actor in neutral composition coordinates, including its group state.
 * Failures propagate; the enclosing compositor retains its last published frame. */
export function canvasKitDrawProjectiveBoundary(kit:CanvasKit,parent:Surface,output:Canvas,plan:CanvasKitProjectiveBoundaryPlan,width:number,height:number,drawActor:(canvas:Canvas)=>void,scale=1){
 if(plan.hidden)return;
 const surface=makeCanvasKitScaledSurface(kit,parent,width,height,scale);
 if(!surface)throw Error('Projective boundary surface unavailable');
 let image:ReturnType<Surface['makeImageSnapshot']>|null=null;
 let paint:Paint|null=null;const saved=output.getSaveCount();
 try{
  paint=new kit.Paint();
  const canvas=surface.getCanvas();canvas.clear(kit.TRANSPARENT);drawActor(canvas);surface.flush();image=surface.makeImageSnapshot();
  if(!image)throw Error('Projective boundary snapshot unavailable');
  output.save();output.concat(plan.matrix);
  output.drawImageRectOptions(image,canvasKitScaledSourceRect(kit,width,height,scale),kit.LTRBRect(0,0,width,height),kit.FilterMode.Linear,kit.MipmapMode.None,paint);
 }finally{output.restoreToCount(saved);paint?.delete();image?.delete();surface.delete();}
}
