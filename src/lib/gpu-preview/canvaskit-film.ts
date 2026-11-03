import type {Canvas,CanvasKit,Shader} from 'canvaskit-wasm';
import {FILM_HALATION_TINT,filmTintVector,type FilmLookPlan} from '../timeline/film-look';
import {glitchHash} from '../timeline/glitch';
import type {CanvasKitShaderLease} from './canvaskit-grade';

/**
 * Film tone (timeline/film-look.ts): split tone, then vignette, then grain, on the unpremultiplied
 * sRGB-encoded colour after grade/LUT and color map. Alpha is unchanged. `p` is in composition
 * pixels, so the vignette follows the frame and grain cells stay a fixed size on screen.
 */
export const CANVASKIT_FILM_TONE_SKSL=`
uniform shader source;
uniform float2 frame;
uniform float split;
uniform float3 shadowTint;
uniform float3 highlightTint;
uniform float balance;
uniform float vignette;
uniform float vignetteSize;
uniform float vignetteSoftness;
uniform float grain;
uniform float grainCell;
uniform float2 grainOffset;
float hash(float2 q){q=fract(q*float2(0.1031,0.1030));q+=dot(q,q.yx+33.33);return fract((q.x+q.y)*q.x);}
float noise(float2 q){
 float2 i=floor(q),f=fract(q);f=f*f*(3-2*f);
 return mix(mix(hash(i),hash(i+float2(1,0)),f.x),mix(hash(i+float2(0,1)),hash(i+float2(1,1)),f.x),f.y);
}
half4 main(float2 p){
 half4 pixel=source.eval(p);
 if(pixel.a<=0)return half4(0);
 float3 rgb=float3(pixel.rgb)/pixel.a;
 float luma=dot(rgb,float3(0.2126,0.7152,0.0722));
 if(split>0){
  float w=smoothstep(0.0,1.0,clamp(luma+balance*0.5,0,1));
  rgb+=split*0.3*mix(shadowTint*(1-luma),highlightTint*luma,w);
 }
 if(vignette>0){
  float d=length(p/frame-0.5)*1.41421356;
  rgb*=1-vignette*smoothstep(vignetteSize-vignetteSoftness*0.5,vignetteSize+vignetteSoftness*0.5,d);
 }
 if(grain>0){
  float2 q=p/grainCell+grainOffset;
  float n=(noise(q)-0.5)*1.4+(noise(q*2.17+float2(17.3,5.1))-0.5)*0.6;
  float l=clamp(luma,0,1);
  rgb+=n*grain*0.18*(0.35+2.6*l*(1-l));
 }
 rgb=clamp(rgb,0,1);
 return half4(rgb*pixel.a,pixel.a);
}`;

/** Each channel above the threshold, eased in, tinted and scaled: the light that halation and
 * bloom spread (FilmLookFilter writes the same curve as a per-channel table). Drawn blurred with Screen so it only ever brightens. */
export const CANVASKIT_FILM_GLOW_SKSL=`
uniform shader source;
uniform float threshold;
uniform float3 tint;
uniform float strength;
half4 main(float2 p){
 half4 pixel=source.eval(p);
 if(pixel.a<=0)return half4(0);
 float3 rgb=float3(pixel.rgb)/pixel.a;
 float3 k=clamp((rgb-threshold)/max(1-threshold,0.001),0,1);
 float3 glow=clamp(rgb*k*k*tint*strength*pixel.a,0,1);
 return half4(glow,max(glow.r,max(glow.g,glow.b)));
}`;

export function validateCanvasKitFilmLook(plan:FilmLookPlan,width:number,height:number){
 if(plan.width!==width||plan.height!==height)throw Error('CanvasKit film look does not match the output');
 const values=[plan.grain,plan.grainSize,plan.halation,plan.halationRadius,plan.bloom,plan.bloomRadius,plan.threshold,plan.vignette,plan.vignetteSize,plan.vignetteSoftness,plan.splitTone,plan.shadowHue,plan.highlightHue,plan.balance,plan.scale];
 if(!values.every(Number.isFinite)||!Number.isSafeInteger(plan.grainStep)||plan.grainStep<0)throw Error('Invalid CanvasKit film look');
 if([plan.grain,plan.halation,plan.bloom,plan.vignette,plan.splitTone].some(v=>v<0||v>1))throw Error('Invalid CanvasKit film look strength');
}

export function canvasKitFilmToneUniforms(plan:FilmLookPlan){
 // A different, repeatable grain field per step; offsets stay small so float noise keeps its precision.
 const offset=[glitchHash(plan.grainStep,1)*512,glitchHash(plan.grainStep,2)*512];
 return [plan.width,plan.height,plan.splitTone,...filmTintVector(plan.shadowHue),...filmTintVector(plan.highlightHue),plan.balance,
  plan.vignette,plan.vignetteSize,plan.vignetteSoftness,plan.grain,Math.max(0.5,plan.grainSize*plan.scale),...offset];
}

export const filmToneActive=(plan:FilmLookPlan)=>plan.splitTone>0||plan.vignette>0||plan.grain>0;
export const filmGlowRadius=(plan:FilmLookPlan)=>Math.max(plan.halation>0?plan.halationRadius:0,plan.bloom>0?plan.bloomRadius:0)*plan.scale;

/**
 * Halation then bloom, each the glow pass of `source` (the actor's colour before film tone)
 * blurred by its radius and screened over what is already drawn on `c`.
 */
export function canvasKitDrawFilmGlow(k:CanvasKit,c:Canvas,glow:(source:Shader,tint:readonly number[],strength:number)=>CanvasKitShaderLease,source:Shader,plan:FilmLookPlan,pad:number,owned:Array<{delete():void}>){
 const passes=[
  {strength:plan.halation*1.4,radius:plan.halationRadius,tint:FILM_HALATION_TINT},
  {strength:plan.bloom*1.1,radius:plan.bloomRadius,tint:[1,1,1] as const},
 ].filter(pass=>pass.strength>0);
 for(const pass of passes){
  const lease=glow(source,pass.tint,pass.strength);owned.push(lease);
  const sigma=pass.radius*plan.scale/2;
  const blur=k.ImageFilter.MakeBlur(sigma,sigma,k.TileMode.Decal,null);
  if(!blur)throw Error('CanvasKit film glow blur unavailable');owned.push(blur);
  const paint=new k.Paint();owned.push(paint);
  paint.setShader(lease.shader);paint.setImageFilter(blur);paint.setBlendMode(k.BlendMode.Screen);
  c.drawRect(k.LTRBRect(-pad,-pad,plan.width+pad,plan.height+pad),paint);
 }
}
