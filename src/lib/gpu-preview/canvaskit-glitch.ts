import type {Canvas,CanvasKit,Image,Paint} from 'canvaskit-wasm';
import type {GlitchPlan,GlitchRect} from '../timeline/glitch';

/** Channel isolation, applied to unpremultiplied colour like SVG feColorMatrix. */
const CHANNEL_MATRICES=[
 [1,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,1,0],
 [0,0,0,0,0, 0,1,0,0,0, 0,0,0,0,0, 0,0,0,1,0],
 [0,0,0,0,0, 0,0,0,0,0, 0,0,1,0,0, 0,0,0,1,0],
] as const;

export function validateCanvasKitGlitch(plan:GlitchPlan,width:number,height:number){
 if(plan.width!==width||plan.height!==height)throw Error('CanvasKit glitch plan does not match the output');
 if(!Number.isFinite(plan.split)||plan.split<0)throw Error('Invalid CanvasKit glitch split');
 const integer=(value:number)=>Number.isSafeInteger(value);
 for(const block of plan.blocks){
  const r=block.rect;
  if(![r.x,r.y,r.width,r.height].every(integer)||r.width<=0||r.height<=0)throw Error('Invalid CanvasKit glitch block');
  if(block.kind==='shift'?!integer(block.dx):!integer(block.line))throw Error('Invalid CanvasKit glitch block');
 }
}

/**
 * Draw the glitched actor from `image`, the colour-stage intermediate (logical
 * size w+2·pad at `scale` device pixels per unit, origin at -pad). Block geometry
 * is the shared `glitchPlan`; Standard's GlitchFilter draws the same plan with SVG
 * primitives, so each step here mirrors one primitive there:
 *   base minus blocks (feComposite out) → shifted blocks (two feOffsets in a subregion,
 *   the second one frame width back so the band wraps around)
 *   → smears (feTile of a one-pixel column/row) → R/G/B copies screened together.
 * Sampling is nearest at whole composition pixels, so repeated seeks are exact.
 */
export function canvasKitDrawGlitch(k:CanvasKit,c:Canvas,image:Image,plan:GlitchPlan,pad:number,scale:number,layerPaint:Paint,owned:Array<{delete():void}>){
 const w=plan.width,h=plan.height;
 const src=(x:number,y:number,width:number,height:number)=>k.LTRBRect((x+pad)*scale,(y+pad)*scale,(x+width+pad)*scale,(y+height+pad)*scale);
 const full=src(-pad,-pad,w+2*pad,h+2*pad);
 const draw=(source:Float32Array,target:GlitchRect|Float32Array)=>c.drawImageRectOptions(image,source,target instanceof Float32Array?target:k.XYWHRect(target.x,target.y,target.width,target.height),k.FilterMode.Nearest,k.MipmapMode.None,null);
 const glitched=()=>{
  draw(full,k.LTRBRect(-pad,-pad,w+pad,h+pad));
  for(const block of plan.blocks){
   const r=block.rect;
   c.save();c.clipRect(k.XYWHRect(r.x,r.y,r.width,r.height),k.ClipOp.Intersect,false);c.clear(k.TRANSPARENT);
   // A shifted band wraps around the frame, so no hole opens at its trailing edge.
   if(block.kind==='shift')for(const dx of [block.dx,block.dx-Math.sign(block.dx)*w])draw(full,k.LTRBRect(-pad+dx,-pad,w+pad+dx,h+pad));
   else if(block.axis==='x')draw(src(block.line,r.y,1,r.height),r);
   else draw(src(r.x,block.line,r.width,1),r);
   c.restore();
  }
 };
 c.saveLayer(layerPaint);
 if(plan.split>0){
  CHANNEL_MATRICES.forEach((matrix,channel)=>{
   const filter=k.ColorFilter.MakeMatrix([...matrix]);owned.push(filter);
   const paint=new k.Paint();owned.push(paint);paint.setColorFilter(filter);
   paint.setBlendMode(channel===0?k.BlendMode.SrcOver:k.BlendMode.Screen);
   c.saveLayer(paint);
   if(channel!==1)c.translate(channel===0?plan.split:-plan.split,0);
   glitched();
   c.restore();
  });
 }else glitched();
 c.restore();
}
