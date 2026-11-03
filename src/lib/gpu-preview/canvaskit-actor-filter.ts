import type {CanvasKit,ImageFilter} from 'canvaskit-wasm';
import type {GpuVideoDraw} from './compositor';
import {outlinePassPlan} from './outline-pass';
import {canvasKitColorMatrices} from './canvaskit-color';
import {paperContourMatrix} from '../timeline/paper-contour';
import {edgeAuraMatrices} from '../timeline/edge-aura';

/** PaperContourFilter's SVG program: one color matrix, or the aura ring
 * (inner IN outer IN SourceAlpha). Both are unpremultiplied sRGB matrices. */
export type CanvasKitContour={matrix:readonly number[]}|{ring:{inner:readonly number[];outer:readonly number[]}};

/** Same resolvers and precedence as PaperContourFilter: a valid aura replaces the contour. */
export function canvasKitContour(props:Record<string,unknown>|null|undefined,seconds:number):CanvasKitContour|undefined{
 const ring=edgeAuraMatrices(props?.edge_aura,seconds);
 if(ring)return {ring};
 const matrix=paperContourMatrix(props,seconds);
 return matrix?{matrix}:undefined;
}

export type CanvasKitActorEffects=Pick<GpuVideoDraw,'outline'|'contour'|'recolor'|'flash'|'glow'|'blur'>;
const validMatrix=(m:readonly number[])=>m.length===20&&m.every(Number.isFinite);
export function canvasKitActorPlan(e:CanvasKitActorEffects){
 const matrices=canvasKitColorMatrices(e.recolor,e.flash);
 const outline=e.outline;
 if(outline&&(!outline.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||outline.color.length!==3))throw Error('Invalid CanvasKit outline color');
 const morphology=outline?outlinePassPlan(outline.radius,outline.softness):null;
 if(e.glow&&(![e.glow.strength,e.glow.radius].every(Number.isFinite)||e.glow.strength<0||e.glow.strength>3||e.glow.radius<0))throw Error('Invalid CanvasKit glow');
 if(e.blur&&![e.blur.x,e.blur.y].every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid CanvasKit actor blur');
 if(e.contour&&!('ring' in e.contour?validMatrix(e.contour.ring.inner)&&validMatrix(e.contour.ring.outer):validMatrix(e.contour.matrix)))throw Error('Invalid CanvasKit contour');
 return {matrices,contour:e.contour,outline:outline&&morphology?{radius:morphology.steps.reduce((a,b)=>a+b,0),softness:outline.softness,color:outline.color,only:outline.only===true}:null,glow:e.glow,blur:e.blur};
}
/** Whole-actor filters in Standard's nesting order (StickerOutline inside PaperContour
 * inside Recolor inside SubjectGlow): outline -> contour -> recolor -> flash -> glow ->
 * inner blur. Source-primary conversion is earlier; outer masks/group blur later.
 */
export function canvasKitActorFilter(k:CanvasKit,e:CanvasKitActorEffects){
 const plan=canvasKitActorPlan(e),owned:Array<{delete():void}>=[];let closed=false;
 const keep=<T extends {delete():void}>(value:T):T=>{if(!value)throw Error('CanvasKit actor filter allocation failed');owned.push(value);return value;};
 const close=()=>{if(closed)return;closed=true;for(const value of owned.reverse())value.delete();};
 const color=(rgb:readonly number[],alpha=1)=>keep(k.ColorFilter.MakeMatrix([0,0,0,0,rgb[0],0,0,0,0,rgb[1],0,0,0,0,rgb[2],0,0,0,alpha,0]));
 let filter:ImageFilter|null=null;
 try{
  if(plan.outline){const o=plan.outline;
   // A zero radius is the identity dilation (SVG feMorphology); Skia rejects it.
   let edge:ImageFilter|null=o.radius>0?keep(k.ImageFilter.MakeDilate(o.radius,o.radius,null)):null;
   if(o.softness)edge=keep(k.ImageFilter.MakeBlur(o.softness,o.softness,k.TileMode.Decal,edge));
   edge=keep(k.ImageFilter.MakeColorFilter(color(o.color),edge));
   filter=o.only?edge:keep(k.ImageFilter.MakeBlend(k.BlendMode.SrcOver,edge,null));
  }
  if(plan.contour){
   const matrix=(m:readonly number[])=>keep(k.ColorFilter.MakeMatrix([...m]));
   if('ring' in plan.contour){
    // feComposite operator="in": source scaled by the second input's alpha (SrcIn).
    const inner=keep(k.ImageFilter.MakeColorFilter(matrix(plan.contour.ring.inner),filter));
    const outer=keep(k.ImageFilter.MakeColorFilter(matrix(plan.contour.ring.outer),filter));
    const ring=keep(k.ImageFilter.MakeBlend(k.BlendMode.SrcIn,outer,inner));
    filter=keep(k.ImageFilter.MakeBlend(k.BlendMode.SrcIn,filter,ring));
   }else filter=keep(k.ImageFilter.MakeColorFilter(matrix(plan.contour.matrix),filter));
  }
  for(const matrix of plan.matrices)filter=keep(k.ImageFilter.MakeColorFilter(keep(k.ColorFilter.MakeMatrix(matrix)),filter));
  if(plan.glow?.strength){let halo=keep(k.ImageFilter.MakeBlur(plan.glow.radius,plan.glow.radius,k.TileMode.Decal,filter));
   halo=keep(k.ImageFilter.MakeColorFilter(color([1,1,1],plan.glow.strength),halo));
   filter=keep(k.ImageFilter.MakeBlend(k.BlendMode.SrcOver,halo,filter));
  }
  if(plan.blur&&(plan.blur.x||plan.blur.y))filter=keep(k.ImageFilter.MakeBlur(plan.blur.x,plan.blur.y,k.TileMode.Decal,filter));
  return {filter,delete:close};
 }catch(error){close();throw error;}
}
