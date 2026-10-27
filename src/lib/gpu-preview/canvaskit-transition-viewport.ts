import type {CanvasKit,Canvas,BlendMode} from 'canvaskit-wasm';
import type {GpuVideoDraw} from './compositor';

type Viewport=NonNullable<GpuVideoDraw['transitionViewport']>;

export function validateCanvasKitTransitionViewport(viewport:Viewport|undefined){
 if(!viewport)return;
 const {x,y,width,height}=viewport.rect,shadow=viewport.shadow;
 if(![x,y,width,height].every(Number.isFinite)||width<0||height<0)throw Error('Invalid CanvasKit transition viewport');
 if(shadow&&(![shadow.dx,shadow.dy,shadow.sigma,shadow.opacity].every(Number.isFinite)||shadow.sigma<0||shadow.opacity<0||shadow.opacity>1))throw Error('Invalid CanvasKit transition viewport shadow');
}

/**
 * Standard's FixedTransitionViewport (transition_clip_to_media_bounds): an overflow-hidden
 * box at the resting media rect whose box-shadow sits outside it, around the actor's
 * animation/transition wrapper. Draws that shadow, then clips the current canvas to the box
 * for everything drawn until the caller's matching restore. Call in the space that box lives
 * in: composition space, or the page-local space inside a page turn.
 *
 * In composition space Chrome pixel-snaps the overflow clip and the box-shadow's border box
 * (edges round, ties toward +infinity): a hard device-pixel rect (`snapped`). Inside the 3D
 * page-turn context the box is transformed and clipped at its exact, antialiased edges.
 */
export function canvasKitTransitionViewport(kit:CanvasKit,canvas:Canvas,viewport:Viewport|undefined,blend:BlendMode,snapped:boolean){
 if(!viewport)return;
 const {x:rawX,y:rawY,width:rawWidth,height:rawHeight}=viewport.rect,shadow=viewport.shadow;
 const x=snapped?Math.round(rawX):rawX,y=snapped?Math.round(rawY):rawY;
 const width=snapped?Math.round(rawX+rawWidth)-x:rawWidth,height=snapped?Math.round(rawY+rawHeight)-y:rawHeight,box=kit.XYWHRect(x,y,width,height);
 if(shadow){
  const paint=new kit.Paint(),filter=shadow.sigma>0?kit.MaskFilter.MakeBlur(kit.BlurStyle.Normal,shadow.sigma,true):null;
  try{
   paint.setAntiAlias(true);paint.setColor(kit.Color4f(0,0,0,shadow.opacity));paint.setBlendMode(blend);
   if(filter)paint.setMaskFilter(filter);
   // An outer box-shadow is never painted under its own border box.
   canvas.save();canvas.clipRect(box,kit.ClipOp.Difference,!snapped);
   canvas.drawRect(kit.XYWHRect(x+shadow.dx,y+shadow.dy,width,height),paint);canvas.restore();
  }finally{paint.delete();filter?.delete();}
 }
 canvas.clipRect(box,kit.ClipOp.Intersect,!snapped);
}
