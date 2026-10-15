import {drawCanvasKitScaledImage} from './canvaskit-pixel-scale';
import type {CanvasKit,Canvas,Image,RuntimeEffect} from 'canvaskit-wasm';
export type CanvasKitRadialPlan={width:number;height:number;iris:readonly [number,number]|null;edgeBlurSigma:number};
/** Consumes numbers already evaluated by resolveTransitionEffects on the source
 * clock. The CSS zoom_blur effect is an edge-weighted backdrop Gaussian, not a
 * radial sample streak or a source-scale animation. */
export function canvasKitRadialPlan(effect:{radius:number;feather:number;zoomBlur:number},width:number,height:number):CanvasKitRadialPlan{
 if(![width,height].every(v=>Number.isFinite(v)&&v>0)||![effect.radius,effect.feather,effect.zoomBlur].every(Number.isFinite)||effect.radius<0||effect.radius>2||effect.feather<0||effect.feather>.8||effect.zoomBlur<0||effect.zoomBlur>40)throw Error('Invalid CanvasKit radial effect');
 return {width,height,iris:effect.radius<2?[effect.radius,effect.feather]:null,edgeBlurSigma:effect.zoomBlur*width/1080};
}
export function canvasKitRadialAlpha(plan:CanvasKitRadialPlan,x:number,y:number,kind:'iris'|'edge'):number{
 const distance=Math.hypot((x-plan.width/2)/(plan.width/2),(y-plan.height/2)/(plan.height/2));
 if(kind==='edge')return Math.max(0,Math.min(1,(distance/Math.SQRT2-.15)/.6));
 if(!plan.iris)return 1;
 const [radius,feather]=plan.iris;if(radius<=0)return 0;
 return feather===0?(distance<=radius?1:0):Math.max(0,Math.min(1,(1-distance/radius)/feather));
}
// CSS's unspecified ellipse reaches the farthest corner. Its semiaxes are
// sqrt(2) times the canvas half-axes, unlike the explicit iris ellipse size.
export const CANVASKIT_RADIAL_SHADER=`
uniform float4 geometry;
uniform float4 effect;
half4 main(float2 p){
 float d=length((p-geometry.xy)/geometry.zw);float a=1.0;
 if(effect.z>0.5){a=clamp((d/1.4142135623730951-0.15)/0.6,0.0,1.0);}
 else if(effect.x<=0.0){a=0.0;}
 else if(effect.y<=0.0){a=d<=effect.x?1.0:0.0;}
 else {a=clamp((1.0-d/effect.x)/effect.y,0.0,1.0);}
 return half4(a);
}`;
export class CanvasKitRadialEffects {
 private shader:RuntimeEffect|null=null;
 private closed=false;
 constructor(private readonly kit:CanvasKit){}
 private mask(canvas:Canvas,plan:CanvasKitRadialPlan,edge:boolean){
  if(this.closed)throw Error('CanvasKit radial effects closed');
  this.shader??=this.kit.RuntimeEffect.Make(CANVASKIT_RADIAL_SHADER);
  if(!this.shader)throw Error('CanvasKit radial shader unavailable');
  const shader=this.shader.makeShader([plan.width/2,plan.height/2,plan.width/2,plan.height/2,...(plan.iris??[2,0]),edge?1:0,0]),paint=new this.kit.Paint();
  try{paint.setBlendMode(this.kit.BlendMode.DstIn);paint.setShader(shader);canvas.drawPaint(paint);}finally{paint.delete();shader.delete();}
 }
 /** Composition coordinates, on an isolated transition layer after its content
  * filtering and before outer mask/opacity. Does not affect preceding actors. */
 applyIris(canvas:Canvas,plan:CanvasKitRadialPlan){if(this.closed)throw Error('CanvasKit radial effects closed');if(plan.iris)this.mask(canvas,plan,false);}
 /** Caller supplies the complete appropriate CSS backdrop-root snapshot in
  * composition coordinates. Run after transition/iris content, before outer
  * line masks and opacity. Snapshot ownership and byte budgets remain caller's.
  * This helper does not decide which earlier actors belong to that backdrop. */
 drawEdgeBlur(canvas:Canvas,plan:CanvasKitRadialPlan,backdrop:Image,scale=1){
  if(this.closed)throw Error('CanvasKit radial effects closed');
  if(plan.edgeBlurSigma<=0)return;
  if(backdrop.width()!==Math.ceil(plan.width*scale)||backdrop.height()!==Math.ceil(plan.height*scale))throw Error('CanvasKit edge blur backdrop dimensions differ');
  const k=this.kit,paint=new k.Paint(),filter=k.ImageFilter.MakeBlur(plan.edgeBlurSigma,plan.edgeBlurSigma,k.TileMode.Clamp,null),count=canvas.getSaveCount();
  if(!filter){paint.delete();throw Error('CanvasKit edge blur filter unavailable');}
  try{
   canvas.saveLayer();paint.setImageFilter(filter);
   drawCanvasKitScaledImage(k,canvas,backdrop,0,0,scale,paint);
   this.mask(canvas,plan,true);
   canvas.restore();
  }finally{canvas.restoreToCount(count);paint.delete();filter.delete();}
 }
 close(){if(this.closed)return;this.closed=true;this.shader?.delete();this.shader=null;}
}
