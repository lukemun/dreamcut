import type {CanvasKit,Canvas,Image,RuntimeEffect} from 'canvaskit-wasm';
import type {GpuVideoDraw} from './compositor';

type MaskInput=Pick<GpuVideoDraw,'mask'|'captionMask'|'featherMask'|'window'|'lineMask'|'roundedMask'>;
export type CanvasKitMaskPlan={
 feather:readonly number[]|null;
 window:GpuVideoDraw['window'];
 captionMatrix:number[]|null;
};
/** Image-shader matrices map mask pixels into source pixels. Keep this separate
 * from the actor's projective matrix so tracking and mirroring move both together. */
export function canvasKitCaptionMaskMatrix(mapping:readonly number[],sourceWidth:number,sourceHeight:number,maskWidth:number,maskHeight:number):number[]{
 if(mapping.length!==4||!mapping.every(Number.isFinite)||mapping[0]===0||mapping[1]===0||
  ![sourceWidth,sourceHeight,maskWidth,maskHeight].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid CanvasKit caption mask');
 const [sx,sy,tx,ty]=mapping;
 return [sourceWidth/(sx*maskWidth),0,-tx*sourceWidth/sx,0,sourceHeight/(sy*maskHeight),-ty*sourceHeight/sy,0,0,1];
}
export function canvasKitMaskPlan(layer:MaskInput,sourceWidth:number,sourceHeight:number):CanvasKitMaskPlan{
 if(layer.mask)throw Error('CanvasKit requires a portable mask source; GPUTexture cannot cross graphics contexts');
 const f=layer.featherMask,l=layer.lineMask,rr=layer.roundedMask,window=layer.window;
 if(f&&(f.length!==4||!f.every(Number.isFinite)||f[2]<=0||![1,2,3].includes(f[3])))throw Error('Invalid CanvasKit feather mask');
 if(l&&(l.length!==4||!l.every(Number.isFinite)||l[3]<0))throw Error('Invalid CanvasKit line mask');
 if(rr&&(rr.length!==6||!rr.every(Number.isFinite)||rr[2]<=0||rr[3]<=0||rr[4]<0||rr[5]<0))throw Error('Invalid CanvasKit rounded mask');
 if(window&&(![window.rect.x,window.rect.y,window.rect.width,window.rect.height,window.radius].every(Number.isFinite)||window.rect.width<0||window.rect.height<0||window.radius<0))throw Error('Invalid CanvasKit window mask');
 const activeLine=l&&(l[0]!==0||l[1]!==0);
 // A rotated line is not a rectangle; a rounded crop replaces the axis feather.
 return {feather:activeLine?[...l,1,0,0,0]:rr?[rr[0],rr[1],rr[2],rr[3],2,rr[4],rr[5],0]:f?[...f,0,0,0,0]:null,
  window:window&&window.rect.width>0&&window.rect.height>0?window:undefined,
  captionMatrix:layer.captionMask?canvasKitCaptionMaskMatrix(layer.captionMask.mapping,sourceWidth,sourceHeight,layer.captionMask.canvas.width,layer.captionMask.canvas.height):null};
}
// Same local composition-space alpha and 8-bit quantization as the shared GPU
// mask contract. A rotated line replaces the axis feather, never multiplies it.
export const CANVASKIT_FEATHER_SHADER=`
uniform float4 shape;
uniform float4 options;
half4 main(float2 p) {
 float a=1.0;
 if(options.x>1.5){float2 q=abs(p-shape.xy)-(shape.zw-float2(options.y));float d=length(max(q,float2(0.0)))+min(max(q.x,q.y),0.0)-options.y;a=options.z>0.0?clamp(-d/options.z,0.0,1.0):clamp(0.5-d,0.0,1.0);}
 else if(options.x>0.5){float d=dot(p,shape.xy)-shape.z;a=shape.w>0.0?clamp(d/max(shape.w,0.000001),0.0,1.0):(d>=0.0?1.0:0.0);}
 else {if(shape.w==1.0||shape.w==3.0)a*=clamp((p.y-shape.x)/shape.z,0.0,1.0);if(shape.w==2.0||shape.w==3.0)a*=clamp((shape.y-p.y)/shape.z,0.0,1.0);}
 a=floor(a*255.0+0.5)/255.0;return half4(a);
}`;
/** Reusable GPU mask drawer. Caller owns actor isolation/saveLayer and uploaded
 * caption image. No readback, frame cache, or ownership transfer occurs here. */
export class CanvasKitMasks {
 private feather:RuntimeEffect|null=null;
 private closed=false;
 constructor(private readonly kit:CanvasKit){}
 /** Before source concat, after group pose; clip belongs inside postBlur layer. */
 clipWindow(canvas:Canvas,plan:CanvasKitMaskPlan){
  if(this.closed)throw Error('CanvasKit masks closed');
  if(!plan.window)return;
  const {rect,radius}=plan.window,{x,y,width,height}=rect,r=Math.min(radius,width/2,height/2),right=x+width,bottom=y+height;
  const b=new this.kit.PathBuilder();
  try{
   b.moveTo(x+r,y);b.lineTo(right-r,y);b.quadTo(right,y,right,y+r);
   b.lineTo(right,bottom-r);b.quadTo(right,bottom,right-r,bottom);
   b.lineTo(x+r,bottom);b.quadTo(x,bottom,x,bottom-r);
   b.lineTo(x,y+r);b.quadTo(x,y,x+r,y);b.close();
   const path=b.snapshot();try{canvas.clipPath(path,this.kit.ClipOp.Difference,true);}finally{path.delete();}
  }finally{b.delete();}
 }
 /** After source drawing, while source projective concat is active. DstIn must
  * be isolated to this source so the caption does not erase earlier actors. */
 applyCaption(canvas:Canvas,plan:CanvasKitMaskPlan,image:Image){
  if(this.closed)throw Error('CanvasKit masks closed');
  if(!plan.captionMatrix)return;
  const k=this.kit,shader=image.makeShaderOptions(k.TileMode.Decal,k.TileMode.Decal,k.FilterMode.Linear,k.MipmapMode.None,plan.captionMatrix),paint=new k.Paint();
  try{paint.setBlendMode(k.BlendMode.DstIn);paint.setShader(shader);canvas.drawPaint(paint);}finally{paint.delete();shader.delete();}
 }
 /** After restoring source concat, before restoring the actor's postBlur layer. */
 applyFeather(canvas:Canvas,plan:CanvasKitMaskPlan){
  if(this.closed)throw Error('CanvasKit masks closed');
  if(!plan.feather)return;
  const k=this.kit;
  this.feather??=k.RuntimeEffect.Make(CANVASKIT_FEATHER_SHADER);
  if(!this.feather)throw Error('CanvasKit feather shader unavailable');
  const shader=this.feather.makeShader([...plan.feather]),paint=new k.Paint();
  try{paint.setBlendMode(k.BlendMode.DstIn);paint.setShader(shader);canvas.drawPaint(paint);}finally{paint.delete();shader.delete();}
 }
 close(){if(this.closed)return;this.closed=true;this.feather?.delete();this.feather=null;}
}
