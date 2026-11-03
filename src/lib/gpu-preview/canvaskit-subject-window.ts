import type {CanvasKit,Canvas} from 'canvaskit-wasm';
import {subjectWindowEmptyAlpha,subjectWindowRgba,type SubjectWindowPlan} from '../timeline/subject-window';

/** Multiply an isolated, complete actor by its subject window (DstIn). The alpha grid
 * covers the composition exactly; Standard's SubjectWindow stretches the same bytes. */
export function applyCanvasKitSubjectWindow(kit:CanvasKit,canvas:Canvas,window:{plan:SubjectWindowPlan;alpha:Uint8Array|null},width:number,height:number){
 const {plan,alpha}=window,paint=new kit.Paint();
 try{
  paint.setBlendMode(kit.BlendMode.DstIn);
  if(!alpha){paint.setColor(kit.Color4f(1,1,1,subjectWindowEmptyAlpha(plan)));canvas.drawPaint(paint);return;}
  if(alpha.length!==plan.gridWidth*plan.gridHeight)throw Error('Invalid CanvasKit subject window packet');
  const rgba=subjectWindowRgba(alpha);
  const image=kit.MakeImage({width:plan.gridWidth,height:plan.gridHeight,colorType:kit.ColorType.RGBA_8888,alphaType:kit.AlphaType.Unpremul,colorSpace:kit.ColorSpace.SRGB},new Uint8Array(rgba.buffer),plan.gridWidth*4);
  if(!image)throw Error('CanvasKit subject window upload failed');
  try{
   const shader=image.makeShaderOptions(kit.TileMode.Clamp,kit.TileMode.Clamp,kit.FilterMode.Linear,kit.MipmapMode.None,[width/plan.gridWidth,0,0,0,height/plan.gridHeight,0,0,0,1]);
   try{paint.setShader(shader);canvas.drawPaint(paint);}finally{shader.delete();}
  }finally{image.delete();}
 }finally{paint.delete();}
}
