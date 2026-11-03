import type {CanvasKit,Image,Surface} from 'canvaskit-wasm';
import type {ProjectionRect} from '../timeline/source-projection';
export type GpuCaptionFill={mask:OffscreenCanvas;bounds:ProjectionRect;regions:readonly {rect:ProjectionRect;clip:readonly[number,number,number,number]}[]};
export type CanvasKitCaptionFillPlan={width:number;height:number;scale:number;bytes:number;bounds:ProjectionRect;regions:GpuCaptionFill['regions']};
/** One cropped local actor, independent of its later wall/ticker transform. */
export function canvasKitCaptionFillPlan(fill:GpuCaptionFill):CanvasKitCaptionFillPlan{
 const width=fill.mask.width,height=fill.mask.height,{bounds,regions}=fill;
 // A supersampled export rasterizes the mask at `scale` pixels per logical pixel.
 const scale=width/bounds.width;
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=4096*scale)||width*height*4>16*1024*1024*scale*scale||!Object.values(bounds).every(Number.isFinite)||!(scale>=1&&scale<=2)||Math.abs(bounds.height*scale-height)>1e-6||!regions.length||regions.length>4096)throw Error('Invalid local caption fill');
 for(const {rect,clip}of regions)if(!Object.values(rect).every(Number.isFinite)||rect.width<=0||rect.height<=0||clip.length!==4||!clip.every(Number.isFinite)||clip[2]<clip[0]||clip[3]<clip[1])throw Error('Invalid local caption fill region');
 // Mask upload, local surface, and immutable snapshot; raw video upload is
 // accounted by the caller separately. No ownership of borrowed canvas/frame.
 return {width,height,scale,bytes:width*height*12,bounds,regions};
}
export function canvasKitAssembleCaptionFill(k:CanvasKit,parent:Surface,source:Image,mask:Image,plan:CanvasKitCaptionFillPlan):Image{
 if(mask.width()!==plan.width||mask.height()!==plan.height)throw Error('Caption fill mask dimensions changed');
 const surface=parent.makeSurface({width:plan.width,height:plan.height,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Premul,colorSpace:k.ColorSpace.SRGB});
 if(!surface)throw Error('Local caption fill surface unavailable');
 const paint=new k.Paint();
 try{
  const c=surface.getCanvas();c.clear(k.TRANSPARENT);c.save();if(plan.scale!==1)c.scale(plan.scale,plan.scale);c.translate(-plan.bounds.x,-plan.bounds.y);
  for(const {rect,clip}of plan.regions){c.save();c.clipRect(k.LTRBRect(...clip),k.ClipOp.Intersect,true);c.drawImageRectOptions(source,k.LTRBRect(0,0,source.width(),source.height()),k.LTRBRect(rect.x,rect.y,rect.x+rect.width,rect.y+rect.height),k.FilterMode.Linear,k.MipmapMode.None,paint);c.restore();}
  c.restore();paint.setBlendMode(k.BlendMode.DstIn);
  c.drawImageRectOptions(mask,k.LTRBRect(0,0,plan.width,plan.height),k.LTRBRect(0,0,plan.width,plan.height),k.FilterMode.Linear,k.MipmapMode.None,paint);
  surface.flush();const result=surface.makeImageSnapshot();if(!result)throw Error('Local caption fill snapshot unavailable');return result;
 }finally{paint.delete();surface.delete();}
}
