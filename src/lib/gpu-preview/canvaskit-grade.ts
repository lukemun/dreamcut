import type {CanvasKit, Shader, RuntimeEffect} from 'canvaskit-wasm';
import type {ColorGradeFilterDescriptor} from '../timeline/color-grade';
import {ATLAS_ROW_COUNT,ATLAS_WIDTH} from '../color/grade-v2';
import {CANVASKIT_GRADE_V2_SKSL,SDR_OUTPUT,canvasKitGradeV2Uniforms,type GradeOutput} from '../color/grade-shader';
import type {ChromaKey} from '../timeline/chroma-key';
import {GRADIENT_MAP_LUMA,type GradientMap} from '../timeline/gradient-map';
import {cubeLutRgbaBytes, type ParsedCubeLut} from '../timeline/cube-lut';
import {FrameStore, type FrameLease} from './frame-store';
import {CANVASKIT_FILM_GLOW_SKSL,CANVASKIT_FILM_TONE_SKSL,canvasKitFilmToneUniforms} from './canvaskit-film';
import type {FilmLookPlan} from '../timeline/film-look';

/** Shader leases own only their intermediates, never the caller's source shader.
 * The actor owner releases the lease after submission, including failure paths. */
export type CanvasKitShaderLease={shader:Shader;bytes:number;delete():void};
export const CANVASKIT_CHROMA_SKSL=`
uniform shader source;
uniform float3 key;
uniform float tolerance;
uniform float softness;
uniform float spill;
float2 chroma(float3 c){return float2(dot(c,float3(-0.168736,-0.331264,0.5)),dot(c,float3(0.5,-0.418688,-0.081312)));}
half4 main(float2 p){
 half4 sampleColor=source.eval(p);
 if(sampleColor.a<=0)return half4(0);
 float3 rgb=float3(sampleColor.rgb)/sampleColor.a;
 float mask=clamp((length(chroma(rgb)-chroma(key))-tolerance)/max(softness,0.00001),0,1);
 mask=mask*mask*(3-2*mask);
 float3 direction=max(key-float3(dot(key,float3(0.299,0.587,0.114))),float3(0));
 float excess=max(0.0,dot(rgb-float3(dot(rgb,float3(0.299,0.587,0.114))),direction)/max(dot(direction,direction),0.00001));
 rgb=max(float3(0),rgb-direction*excess*spill*(1-mask));
 rgb=floor(rgb*255+0.5)/255;
 float alpha=floor(sampleColor.a*mask*255+0.5)/255;
 return half4(rgb*alpha,alpha);
}`;

/** Color map: luminance of the unpremultiplied sRGB-encoded colour, stretched by
 * contrast about 0.5, then a three-stop ramp mixed in by amount. Alpha is unchanged.
 * Standard's GradientMapFilter evaluates the same steps with SVG primitives. */
export const CANVASKIT_GRADIENT_MAP_SKSL=`
uniform shader source;
uniform float3 shadows;
uniform float3 midtones;
uniform float3 highlights;
uniform float amount;
uniform float contrast;
half4 main(float2 p){
 half4 pixel=source.eval(p);
 if(pixel.a<=0)return half4(0);
 float3 rgb=float3(pixel.rgb)/pixel.a;
 float level=clamp((dot(rgb,float3(${GRADIENT_MAP_LUMA.join(',')}))-0.5)*contrast+0.5,0,1);
 float3 mapped=level<0.5?mix(shadows,midtones,level*2):mix(midtones,highlights,level*2-1);
 rgb=clamp(mix(rgb,mapped,amount),0,1);
 return half4(rgb*pixel.a,pixel.a);
}`;

function compile(k:CanvasKit,source:string){
 let diagnostic='';const effect=k.RuntimeEffect.Make(source,e=>{diagnostic=e;});
 if(!effect)throw Error(`CanvasKit color shader failed: ${diagnostic}`);
 return effect;
}
/** Apply after recolor/flash and glow, before geometry/group blur. One float shader carries the
 * whole grade (src/lib/color/grade-shader.ts), with an optional creative LUT after the output transform. */
export function makeCanvasKitGradeShader(k:CanvasKit,source:Shader,grade:ColorGradeFilterDescriptor,lut?:CanvasKitLutInput|null,intensity=0):CanvasKitShaderLease{
 const cache=new CanvasKitColorShaderCache(k);try{return ownedCacheLease(cache,cache.grade(source,grade,lut,intensity));}catch(error){cache.close();throw error;}
}
/** Key source samples before recolor/flash/grade, skipping CSS-video primaries. */
export function makeCanvasKitChromaShader(k:CanvasKit,source:Shader,chroma:ChromaKey):CanvasKitShaderLease{
 const cache=new CanvasKitColorShaderCache(k);try{return ownedCacheLease(cache,cache.chroma(source,chroma));}catch(error){cache.close();throw error;}
}
/** Backend-neutral LUT upload data, retained by the loading owner under the
 * existing immutable content identity and byte budget. WebGL cannot consume a
 * WebGPU GPUTexture. This atlas is preparation input, not a CPU per-frame effect.
 * R is fastest, G next, B slices occupy consecutive rows. */
export type CanvasKitPackedLut={size:number;domainMin:readonly number[];domainMax:readonly number[];rgba:Uint8Array};
type CanvasKitLutInput=ParsedCubeLut|CanvasKitPackedLut;
export function canvasKitLutAtlas(parsed:CanvasKitLutInput){
 return {width:parsed.size,height:parsed.size*parsed.size,bytes:'rgba' in parsed?parsed.rgba:cubeLutRgbaBytes(parsed),domainMin:[...parsed.domainMin],domainMax:[...parsed.domainMax],size:parsed.size};
}

export function makeCanvasKitLutShader(k:CanvasKit,source:Shader,grade:ColorGradeFilterDescriptor,parsed:CanvasKitLutInput,intensity:number):CanvasKitShaderLease{
 return makeCanvasKitGradeShader(k,source,grade,parsed,intensity);
}
function ownedCacheLease(cache:CanvasKitColorShaderCache,lease:CanvasKitShaderLease):CanvasKitShaderLease{
 return {...lease,delete(){lease.delete();cache.close();}};
}
type Lookup={shader:Shader};
/** One owner per composition session. Three fixed compiled effects and a bounded
 * upload LRU. Pending draws pin uploads; close retires them until leases release.
 * Parsed LUTs are immutable loader-owned objects; object identity avoids hashing
 * a multi-megabyte cube each frame and cannot collide across different assets. */
export class CanvasKitColorShaderCache {
 private readonly uploads:FrameStore<Lookup>;
 private readonly effects=new Map<string,RuntimeEffect>();
 private readonly lutIds=new WeakMap<object,string>();
 private nextLut=0;
 private closed=false;
 constructor(private readonly kit:CanvasKit,readonly budgetBytes=4*1024*1024){this.uploads=new FrameStore(budgetBytes);}
 get bytes(){return this.uploads.bytes;}
 private effect(kind:'grade'|'chroma'|'gradientMap'|'filmTone'|'filmGlow'){
  if(this.closed)throw Error('CanvasKit color cache closed');
  let result=this.effects.get(kind);
  if(!result){result=compile(this.kit,{grade:CANVASKIT_GRADE_V2_SKSL,chroma:CANVASKIT_CHROMA_SKSL,gradientMap:CANVASKIT_GRADIENT_MAP_SKSL,filmTone:CANVASKIT_FILM_TONE_SKSL,filmGlow:CANVASKIT_FILM_GLOW_SKSL}[kind]);this.effects.set(kind,result);}
  return result;
 }
 private upload(key:string,width:number,height:number,produce:()=>Uint8Array):FrameLease<Lookup>{
  if(this.closed)throw Error('CanvasKit color cache closed');
  const hit=this.uploads.acquire(key,0);if(hit)return hit;
  const bytes=width*height*4,k=this.kit;
  let image:ReturnType<CanvasKit['MakeImage']>=null,shader:Shader|undefined;
  // Reserve/evict before allocating: a pinned frame cannot overrun the budget.
  if(!this.uploads.put({sourceKey:key,timestampUs:0,durationUs:1,bytes,value:{get shader(){if(!shader)throw Error('CanvasKit upload incomplete');return shader;}},release(){shader?.delete();image?.delete();}}))throw Error('CanvasKit color upload budget is fully leased');
  try{
   image=k.MakeImage({width,height,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Opaque,colorSpace:k.ColorSpace.SRGB},produce(),width*4);
   if(!image)throw Error('CanvasKit color upload failed');
   shader=image.makeShaderOptions(k.TileMode.Clamp,k.TileMode.Clamp,k.FilterMode.Nearest,k.MipmapMode.None);
   return this.uploads.acquire(key,0)!;
  }catch(error){this.uploads.invalidate(key);throw error;}
 }
 private wrap(effect:RuntimeEffect,source:Shader,uniforms:number[],...lookups:FrameLease<Lookup>[]):CanvasKitShaderLease{
  try{
   if(!uniforms.every(Number.isFinite))throw Error('Invalid CanvasKit color uniforms');
   const shader=effect.makeShaderWithChildren(uniforms,[source,...lookups.map(lookup=>lookup.frame.value.shader)]);
   let released=false;return {shader,bytes:lookups.reduce((sum,lookup)=>sum+lookup.frame.bytes,0),delete(){if(released)return;released=true;shader.delete();for(const lookup of lookups)lookup.release();}};
  }catch(error){for(const lookup of lookups)lookup.release();throw error;}
 }
 grade(source:Shader,g:ColorGradeFilterDescriptor,parsed?:CanvasKitLutInput|null,intensity=0,output:GradeOutput=SDR_OUTPUT):CanvasKitShaderLease{
  if(!Number.isFinite(intensity)||intensity<0||intensity>1)throw Error('Invalid CanvasKit LUT intensity');
  const effect=this.effect('grade');
  // Matrix and tone-map uniforms change freely; only the baked curves invalidate the atlas upload.
  const atlas=this.upload(g.atlasKey,ATLAS_WIDTH,ATLAS_ROW_COUNT,g.atlasBytes);
  let lut:FrameLease<Lookup>;
  try{
   if(parsed&&intensity>0){
    const identity='rgba' in parsed?parsed.rgba:parsed;
    let key=this.lutIds.get(identity);if(!key){key=`lut:${++this.nextLut}`;this.lutIds.set(identity,key);}
    lut=this.upload(key,parsed.size,parsed.size*parsed.size,()=>'rgba' in parsed?parsed.rgba:cubeLutRgbaBytes(parsed));
   }else lut=this.upload('lut:none',2,4,()=>new Uint8Array(32).fill(255));
  }catch(error){atlas.release();throw error;}
  const lutUniforms=parsed&&intensity>0?{size:parsed.size,intensity,domainMin:parsed.domainMin,domainMax:parsed.domainMax}:null;
  return this.wrap(effect,source,canvasKitGradeV2Uniforms(g,lutUniforms,output),atlas,lut);
 }
 chroma(source:Shader,c:ChromaKey):CanvasKitShaderLease{
  if(!/^#[0-9a-f]{6}$/i.test(c.color)||![c.tolerance,c.softness,c.spill].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid CanvasKit chroma');
  return this.wrap(this.effect('chroma'),source,[...[1,3,5].map(i=>parseInt(c.color.slice(i,i+2),16)/255),c.tolerance,c.softness,c.spill]);
 }
 gradientMap(source:Shader,map:GradientMap):CanvasKitShaderLease{
  validateCanvasKitGradientMap(map);
  return this.wrap(this.effect('gradientMap'),source,[...map.stops.flat(),map.amount,map.contrast]);
 }
 /** Split tone, vignette and grain (canvaskit-film.ts). */
 filmTone(source:Shader,plan:FilmLookPlan):CanvasKitShaderLease{
  return this.wrap(this.effect('filmTone'),source,canvasKitFilmToneUniforms(plan));
 }
 /** Tinted highlights for a halation or bloom pass; the caller blurs and screens them. */
 filmGlow(source:Shader,threshold:number,tint:readonly number[],strength:number):CanvasKitShaderLease{
  return this.wrap(this.effect('filmGlow'),source,[threshold,...tint,strength]);
 }
 lut(source:Shader,g:ColorGradeFilterDescriptor,parsed:CanvasKitLutInput,intensity:number):CanvasKitShaderLease{
  return this.grade(source,g,parsed,intensity);
 }
 close(){if(this.closed)return;this.closed=true;this.uploads.close();for(const effect of this.effects.values())effect.delete();this.effects.clear();}
}

export function validateCanvasKitGradientMap(map:GradientMap){
 if(!(Number.isFinite(map.amount)&&map.amount>0&&map.amount<=1)||!(Number.isFinite(map.contrast)&&map.contrast>0)||map.stops.length!==3||!map.stops.every(stop=>stop.length===3&&stop.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid CanvasKit color map');
}
