import type {CanvasKit,Canvas,Image} from 'canvaskit-wasm';
import {GRID_MATTE_DEFAULTS,gridMatteCells,gridMatteFrameUrl,normalizeGridMatte,type GridMatteMask} from '../timeline/grid-matte';
export type CanvasKitGridMattePlan={
 url:string;columns:number;rows:number;coverage:number;
 rect:{x:number;y:number;width:number;height:number};lineOpacity:number;lineWidth:number;
};
/** Source seconds must come from the existing source-window/speed-map owner.
 * This helper deliberately does not invent a second timeline/source clock. */
export function canvasKitGridMattePlan(props:Record<string,unknown>|null|undefined,sourceSeconds:number,width:number,height:number):CanvasKitGridMattePlan|null{
 const size=normalizeGridMatte('grid_matte_cell_size',props?.grid_matte_cell_size??0),mask=props?.grid_matte_mask as GridMatteMask|undefined;
 if(!mask||size===0||props?.grid_matte_enabled===false)return null;
 if(![width,height,mask.width,mask.height,mask.fps,mask.frame_count].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(sourceSeconds)||!Number.isFinite(mask.source_start_seconds)||mask.source_start_seconds<0||!Number.isSafeInteger(mask.frame_count)||typeof mask.source_url!=='string'||!mask.source_url.startsWith('/'))throw Error('Invalid CanvasKit grid matte');
 const columns=Math.max(1,Math.round(1080/Math.max(1,size))),rows=Math.max(1,Math.round(columns*mask.height/mask.width));
 // Standard's minimum cell size bounds columns. Pathological aspect ratios
 // still need rejection before texture/path allocation rather than silent loss.
 if(!Number.isSafeInteger(rows)||columns*rows>65536)throw Error('CanvasKit grid matte cell budget exceeded');
 const fit=Math.min(width/mask.width,height/mask.height),w=mask.width*fit,h=mask.height*fit;
 return {url:gridMatteFrameUrl(mask,sourceSeconds),columns,rows,
  coverage:normalizeGridMatte('grid_matte_coverage',props?.grid_matte_coverage??GRID_MATTE_DEFAULTS.grid_matte_coverage),
  rect:{x:(width-w)/2,y:(height-h)/2,width:w,height:h},
  lineOpacity:normalizeGridMatte('grid_matte_line_opacity',props?.grid_matte_line_opacity??GRID_MATTE_DEFAULTS.grid_matte_line_opacity),
  lineWidth:normalizeGridMatte('grid_matte_line_width',props?.grid_matte_line_width??GRID_MATTE_DEFAULTS.grid_matte_line_width)*w/1080};
}
/** Shared source-mask area sampling. Stored alpha is separate from media RGB;
 * the picture stays sharp even when a grid cell covers many source pixels. */
export function canvasKitGridMattePixels(plan:CanvasKitGridMattePlan,pixels:{url:string;data:Uint8ClampedArray;width:number;height:number}):Uint8Array{
 if(pixels.url!==plan.url)throw Error('CanvasKit grid matte source frame mismatch');
 if(![pixels.width,pixels.height].every(v=>Number.isSafeInteger(v)&&v>0)||pixels.data.length!==pixels.width*pixels.height*4)throw Error('Invalid CanvasKit grid matte pixels');
 const cells=gridMatteCells(pixels.data,pixels.width,pixels.height,plan.columns,plan.rows,plan.coverage),rgba=new Uint8Array(cells.length*4);
 cells.forEach((a,i)=>{const alpha=Math.round(a*255);rgba.set([255,255,255,alpha],i*4);});
 return rgba;
}
/** Owns no cache or image. The caller can cache cell images under source URL,
 * actual mask bytes, columns/rows and coverage with its existing byte budget. */
export function makeCanvasKitGridMatteImage(kit:CanvasKit,plan:CanvasKitGridMattePlan,rgba:Uint8Array):Image{
 if(rgba.length!==plan.columns*plan.rows*4)throw Error('Invalid CanvasKit grid cell image');
 const image=kit.MakeImage({width:plan.columns,height:plan.rows,colorType:kit.ColorType.RGBA_8888,alphaType:kit.AlphaType.Unpremul,colorSpace:kit.ColorSpace.SRGB},rgba,plan.columns*4);
 if(!image)throw Error('CanvasKit grid matte upload failed');return image;
}
/** Composition-space alpha on an isolated complete picture. Call after the
 * media wrapper effects, restore picture isolation, then draw grid lines. */
export function applyCanvasKitGridMatte(kit:CanvasKit,canvas:Canvas,plan:CanvasKitGridMattePlan,image:Image){
 if(image.width()!==plan.columns||image.height()!==plan.rows)throw Error('CanvasKit grid cell dimensions differ');
 const r=plan.rect,shader=image.makeShaderOptions(kit.TileMode.Decal,kit.TileMode.Decal,kit.FilterMode.Nearest,kit.MipmapMode.None,[r.width/plan.columns,0,r.x,0,r.height/plan.rows,r.y,0,0,1]),paint=new kit.Paint();
 try{paint.setBlendMode(kit.BlendMode.DstIn);paint.setShader(shader);canvas.drawPaint(paint);}finally{paint.delete();shader.delete();}
}
/** Lines are black regardless of cell alpha, and belong outside media opacity.
 * SVG viewport clips the boundary strokes to the contain-fit rectangle. */
export function drawCanvasKitGridLines(kit:CanvasKit,canvas:Canvas,plan:CanvasKitGridMattePlan){
 if(plan.lineOpacity<=0||plan.lineWidth<=0)return;
 const b=new kit.PathBuilder(),paint=new kit.Paint(),r=plan.rect,save=canvas.getSaveCount();
 try{
  for(let i=0;i<=plan.columns;i++){const x=r.x+i*r.width/plan.columns;b.moveTo(x,r.y);b.lineTo(x,r.y+r.height);}
  for(let i=0;i<=plan.rows;i++){const y=r.y+i*r.height/plan.rows;b.moveTo(r.x,y);b.lineTo(r.x+r.width,y);}
  paint.setColor(kit.BLACK);paint.setAlphaf(plan.lineOpacity);paint.setAntiAlias(true);paint.setStyle(kit.PaintStyle.Stroke);paint.setStrokeWidth(plan.lineWidth);
  canvas.save();canvas.clipRect(kit.LTRBRect(r.x,r.y,r.x+r.width,r.y+r.height),kit.ClipOp.Intersect,true);
  const path=b.snapshot();try{canvas.drawPath(path,paint);}finally{path.delete();}
 }finally{canvas.restoreToCount(save);paint.delete();b.delete();}
}
