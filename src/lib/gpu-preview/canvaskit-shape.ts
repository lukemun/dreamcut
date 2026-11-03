import type {Canvas,CanvasKit,Paint,Path} from 'canvaskit-wasm';
import type {ShapeFrame} from '../timeline/shapes';
import {addBox,emptyBox,paintBoundsOfBox,pathPointBox,strokePad,type Box} from './shape-raster';

/** SVG's stroke defaults, as Standard draws them: butt caps, miter joins, miter limit 4. */
const MITER_LIMIT=4;
const HEX=/^#[0-9a-f]{6}$/i;

/** A cached path and the box around its points in local pixels (null when it cannot be bounded). */
type ShapePathEntry={path:Path;box:Box|null;chars:number};

/**
 * Parsed SkPaths kept from frame to frame, keyed by their SVG path data and fill rule, with the
 * box around their points so a reused path is never read again. An unchanged shape reuses its
 * paths; a drawing-on ink outline is new data each frame and replaces the least recently used
 * entries. Bounded by entries and by path text length (a proxy for point storage); every evicted
 * or closed path is deleted. Paths taken between `hold` and `release` are not evicted until then.
 */
export class CanvasKitShapePaths {
 private readonly paths=new Map<string,ShapePathEntry>();
 private readonly held=new Set<string>();
 private holding=false;
 private chars=0;
 constructor(private readonly kit:CanvasKit,private readonly maxEntries=4096,private readonly maxChars=16*1024*1024){}
 /** The path for `d`; valid until the next `path` call may evict it (or until `release`), so draw it at once. */
 path(d:string,evenOdd:boolean):Path{return this.pathEntry(d,evenOdd).path;}
 /** `path`, with the box around its points. */
 pathEntry(d:string,evenOdd:boolean):ShapePathEntry{
  // Ink (the common, long, per-frame data) is keyed by its own text so a repeated string's hash is reused; SVG data never starts with 'e'.
  return this.entry(evenOdd?`e${d}`:d,d.length,()=>{
   const path=this.kit.Path.MakeFromSVGString(d);
   if(!path)throw Error('CanvasKit shape path is unreadable');
   path.setFillType(evenOdd?this.kit.FillType.EvenOdd:this.kit.FillType.Winding);
   return {path,box:pathPointBox(d)};
  });
 }
 /**
  * The outline of stroking `d` (the first `drawn` of its `length` when partly drawn, as one dash),
  * as a path to fill. Stroking on the CPU and filling the result is how Chrome rasterizes Standard's
  * SVG strokes, so edges antialias as a fill does; a GPU stroke antialiases its edges differently.
  * `precision` is the device pixels per local unit, so curves stay smooth when scaled up. Its box is
  * the line's points padded by the reach of its joins.
  */
 stroke(d:string,width:number,drawn:number,length:number,precision:number):Path{return this.strokeEntry(d,width,drawn,length,precision).path;}
 /** `stroke`, with the box around its points padded by the reach of its joins. */
 strokeEntry(d:string,width:number,drawn:number,length:number,precision:number):ShapePathEntry{
  const dashed=drawn<length,res=Math.max(1,Math.round(precision*4)/4);
  return this.entry(`s${width}:${dashed?`${drawn}:${length}`:''}:${res}:${d}`,d.length*2,()=>{
   const k=this.kit,source=k.Path.MakeFromSVGString(d);
   if(!source)throw Error('CanvasKit shape path is unreadable');
   try{
    // A partly drawn contour is one dash from its first point; the gap covers the rest.
    const line=dashed?source.makeDashed(drawn,length+width,0):source;
    if(!line)throw Error('CanvasKit shape dash failed');
    try{
     const outline=line.makeStroked({width,miter_limit:MITER_LIMIT,precision:res,join:k.StrokeJoin.Miter,cap:k.StrokeCap.Butt});
     if(!outline)throw Error('CanvasKit shape stroke failed');
     outline.setFillType(k.FillType.Winding);
     const points=pathPointBox(d),box=points&&emptyBox();
     if(points&&box)addBox(box,points,strokePad(width));
     return {path:outline,box};
    }finally{if(line!==source)line.delete();}
   }finally{source.delete();}
  });
 }
 /** Keep every path taken from now until `release` (one shape's paths, read before any is drawn). */
 hold(){this.holding=true;}
 /** Let held paths be evicted again, and trim to the bounds. */
 release(){this.holding=false;this.held.clear();this.trim(null);}
 private entry(key:string,chars:number,make:()=>{path:Path;box:Box|null}):ShapePathEntry{
  if(this.holding)this.held.add(key);
  const hit=this.paths.get(key);
  if(hit){this.paths.delete(key);this.paths.set(key,hit);return hit;}
  const entry={...make(),chars};
  this.paths.set(key,entry);this.chars+=chars;
  this.trim(key);
  return entry;
 }
 private trim(keep:string|null){
  // Never evict the entry just made or a held one: the caller draws it next. Both are the newest.
  for(const [old,entry] of this.paths){
   if(this.paths.size<=this.maxEntries&&this.chars<=this.maxChars)break;
   if(old===keep||this.held.has(old))break;
   this.paths.delete(old);this.chars-=entry.chars;entry.path.delete();
  }
 }
 get size(){return this.paths.size;}
 get bytes(){return this.chars;}
 close(){for(const entry of this.paths.values())entry.path.delete();this.paths.clear();this.held.clear();this.chars=0;}
}

function color(kit:CanvasKit,hex:string){
 if(!HEX.test(hex))throw Error('Invalid CanvasKit shape colour');
 return kit.Color4f(...([1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as [number,number,number]),1);
}

/** Reject a shape frame that cannot be drawn exactly, before any drawing starts. */
export function validateCanvasKitShape(frame:ShapeFrame,opacity:number){
 if(![frame.centerX,frame.centerY,frame.rotationDeg,frame.scale,frame.strokeWidth,opacity].every(Number.isFinite)||opacity<0||opacity>1)throw Error('Invalid CanvasKit shape');
 if(frame.fill!==null&&!HEX.test(frame.fill)||frame.stroke!==null&&!HEX.test(frame.stroke))throw Error('Invalid CanvasKit shape colour');
 for(const contour of frame.contours)if(![contour.drawn,contour.length].every(Number.isFinite))throw Error('Invalid CanvasKit shape contour');
}

/**
 * Trace one shape frame into `c` (logical output pixels) as vector paths: the same paths,
 * transform order, fill rules and dash pattern as ShapeSequence in TimelineComposition
 * (Standard). Opacity applies to the whole shape, so a stroke over its fill does not show
 * the fill through it: an output-clipped layer holds the shape when it is translucent.
 */
export function drawCanvasKitShape(kit:CanvasKit,c:Canvas,paths:CanvasKitShapePaths,frame:ShapeFrame,opacity:number,width:number,height:number,pixelScale=1){
 if(opacity<=0)return;
 const fillsPath=!!(frame.fill&&frame.d),strokes=!!(frame.stroke&&frame.strokeWidth>0);
 if(!fillsPath&&!(strokes&&frame.contours.some(contour=>contour.drawn>0)))return;
 const owned:Paint[]=[];
 const start=c.getSaveCount();
 // Every path is taken (cached, with its box) before drawing, so the layer can be bounded without reading path text again.
 paths.hold();
 try{
  const fillPath=fillsPath?paths.pathEntry(frame.d,true):null;
  const precision=Math.abs(frame.scale)*pixelScale;
  const inks=strokes?frame.contours.flatMap(contour=>contour.drawn<=0?[]:contour.ink?[paths.pathEntry(contour.ink,false)]:contour.d?[paths.strokeEntry(contour.d,frame.strokeWidth,contour.drawn,contour.length,precision)]:[]):[];
  const local=emptyBox();let bounded=true;
  for(const entry of fillPath?[fillPath,...inks]:inks){if(!entry.box){bounded=false;break;}addBox(local,entry.box);}
  // Paths that cannot be bounded get the whole output, as shapePaintBounds gives them.
  const W=Math.max(1,Math.round(width)),H=Math.max(1,Math.round(height));
  const bounds=bounded?paintBoundsOfBox(frame,local,width,height):{x:0,y:0,width:W,height:H};
  if(!bounds)return;
  if(opacity<1){const layer=new kit.Paint();owned.push(layer);layer.setAlphaf(opacity);c.saveLayer(layer,kit.XYWHRect(bounds.x,bounds.y,bounds.width,bounds.height));}
  else c.save();
  c.translate(frame.centerX,frame.centerY);c.rotate(frame.rotationDeg,0,0);c.scale(frame.scale,frame.scale);
  if(fillPath&&frame.fill){
   // Even-odd, so an inner contour cuts a hole (a ring, the counter of a letter).
   const fill=new kit.Paint();owned.push(fill);fill.setAntiAlias(true);fill.setStyle(kit.PaintStyle.Fill);fill.setColor(color(kit,frame.fill));
   c.drawPath(fillPath.path,fill);
  }
  if(inks.length&&frame.stroke){
   // Hand-drawn ink is a filled pen outline, not a stroked line; a plain line is its stroke outline, filled.
   const ink=new kit.Paint();owned.push(ink);ink.setAntiAlias(true);ink.setStyle(kit.PaintStyle.Fill);ink.setColor(color(kit,frame.stroke));
   for(const entry of inks)c.drawPath(entry.path,ink);
  }
 }finally{c.restoreToCount(start);for(const paint of owned)paint.delete();paths.release();}
}
