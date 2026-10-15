import type {CanvasKit, Shader, RuntimeEffect} from 'canvaskit-wasm';
import type {ColorGradeFilterDescriptor} from '../timeline/color-grade';
import type {ChromaKey} from '../timeline/chroma-key';
import {GRADIENT_MAP_LUMA,type GradientMap} from '../timeline/gradient-map';
import {cubeLutRgbaBytes, type ParsedCubeLut} from '../timeline/cube-lut';
import {gpuGradeTransferTables} from './color-grade';
import {FrameStore, type FrameLease} from './frame-store';

/** Shader leases own only their intermediates, never the caller's source shader.
 * The actor owner releases the lease after submission, including failure paths. */
export type CanvasKitShaderLease={shader:Shader;bytes:number;delete():void};
const conversions=`
float3 bounded(float3 c){return floor(clamp(c,0,1)*255+0.5)/255;}
float3 linearize(float3 c){return float3(c.r<=0.04045?c.r/12.92:pow((c.r+0.055)/1.055,2.4),c.g<=0.04045?c.g/12.92:pow((c.g+0.055)/1.055,2.4),c.b<=0.04045?c.b/12.92:pow((c.b+0.055)/1.055,2.4));}
float3 encode(float3 c){return float3(c.r<=0.0031308?c.r*12.92:1.055*pow(c.r,1.0/2.4)-0.055,c.g<=0.0031308?c.g*12.92:1.055*pow(c.g,1.0/2.4)-0.055,c.b<=0.0031308?c.b*12.92:1.055*pow(c.b,1.0/2.4)-0.055);}
`;
export const CANVASKIT_GRADE_SKSL=`
uniform shader source;
uniform shader transfers;
uniform float3 balance;
uniform float toneActive;
uniform float saturation;
uniform float hue;
${conversions}
float transfer(float v,float row){return transfers.eval(float2(floor(clamp(v,0,1)*255+0.5)+0.5,row+0.5)).r;}
float3 same(float3 c,float row){return float3(transfer(c.r,row),transfer(c.g,row),transfer(c.b,row));}
half4 main(float2 p){
 half4 inputColor=source.eval(p);
 if(inputColor.a<=0)return half4(0);
 float3 c=bounded(linearize(float3(inputColor.rgb)/inputColor.a));
 c=same(c,0);c=bounded(c*balance);c=same(c,1);
 if(toneActive>0.5)c=same(c,2);
 c=bounded(mix(float3(dot(c,float3(0.213,0.715,0.072))),c,saturation));
 float co=cos(hue),si=sin(hue);
 c=bounded(float3(dot(c,float3(0.213+co*0.787-si*0.213,0.715-co*0.715-si*0.715,0.072-co*0.072+si*0.928)),dot(c,float3(0.213-co*0.213+si*0.143,0.715+co*0.285+si*0.140,0.072-co*0.072-si*0.283)),dot(c,float3(0.213-co*0.213-si*0.787,0.715-co*0.715+si*0.715,0.072+co*0.928+si*0.072))));
 c=float3(transfer(c.r,3),transfer(c.g,4),transfer(c.b,5));
 c=float3(transfer(c.r,6),transfer(c.g,7),transfer(c.b,8));
 c=float3(transfer(c.r,9),transfer(c.g,10),transfer(c.b,11));
 c=bounded(encode(same(c,12)));
 return half4(c*inputColor.a,inputColor.a);
}`;
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

/** The same 13 byte-transfer tables used by WebGPU's SVG-grade emulation. */
export function canvasKitGradeTableBytes(grade:ColorGradeFilterDescriptor):Uint8Array{
 const values=gpuGradeTransferTables(grade),bytes=new Uint8Array(256*13*4);
 for(let i=0;i<256*13;i++){const v=Math.round(values[i]*255);bytes.set([v,v,v,255],i*4);}
 return bytes;
}
function compile(k:CanvasKit,source:string){
 let diagnostic='';const effect=k.RuntimeEffect.Make(source,e=>{diagnostic=e;});
 if(!effect)throw Error(`CanvasKit color shader failed: ${diagnostic}`);
 return effect;
}
/** Apply after recolor/flash and glow, before geometry/group blur. LUT actors
 * use the continuous LUT-grade path instead; do not apply both grade models. */
export function makeCanvasKitGradeShader(k:CanvasKit,source:Shader,grade:ColorGradeFilterDescriptor):CanvasKitShaderLease{
 const cache=new CanvasKitColorShaderCache(k);try{return ownedCacheLease(cache,cache.grade(source,grade));}catch(error){cache.close();throw error;}
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

/** Continuous grading is intentionally separate from SVG byte-transfer grading,
 * matching LutCanvasFilter and GPU_LUT_SHADER. Atlas taps reproduce normalized
 * linear 3D texture sampling (texel coordinate = normalized * size - 0.5). */
export const CANVASKIT_LUT_SKSL=`
uniform shader source;
uniform shader atlas;
uniform float exposure;
uniform float3 balance;
uniform float contrast;
uniform float intercept;
uniform float saturation;
uniform float hue;
uniform float3 lift;
uniform float3 liftOffset;
uniform float3 gamma;
uniform float3 gain;
uniform float toneActive;
uniform float tone[65];
uniform float curve[17];
uniform float size;
uniform float intensity;
uniform float3 domainMin;
uniform float3 domainMax;
${conversions}
float toneValue(int a){${Array.from({length:64},(_,i)=>`if(a==${i})return tone[${i}];`).join('')}return tone[64];}
float curveValue(int a){${Array.from({length:16},(_,i)=>`if(a==${i})return curve[${i}];`).join('')}return curve[16];}
float toneAt(float v){float x=clamp(v,0,1)*64;int a=int(floor(x));return mix(toneValue(a),toneValue(a+1),fract(x));}
float curveAt(float v){float x=clamp(v,0,1)*16;int a=int(floor(x));return mix(curveValue(a),curveValue(a+1),fract(x));}
float3 tap(float3 p){p=clamp(p,float3(0),float3(size-1));return atlas.eval(float2(p.r+0.5,p.g+p.b*size+0.5)).rgb;}
float3 lookup(float3 c){
 float3 p=clamp((c-domainMin)/(domainMax-domainMin),0,1)*size-0.5;
 float3 a=floor(p),f=fract(p);
 return mix(mix(mix(tap(a),tap(a+float3(1,0,0)),f.r),mix(tap(a+float3(0,1,0)),tap(a+float3(1,1,0)),f.r),f.g),mix(mix(tap(a+float3(0,0,1)),tap(a+float3(1,0,1)),f.r),mix(tap(a+float3(0,1,1)),tap(a+float3(1,1,1)),f.r),f.g),f.b);
}
half4 main(float2 p){
 half4 pixel=source.eval(p);if(pixel.a<=0)return half4(0);
 float3 c=linearize(float3(pixel.rgb)/pixel.a)*exposure*balance;
 c=c*contrast+float3(intercept);
 if(toneActive>0.5)c=float3(toneAt(c.r),toneAt(c.g),toneAt(c.b));
 c=mix(float3(dot(c,float3(0.2126,0.7152,0.0722))),c,saturation);
 float co=cos(hue),si=sin(hue);
 c=float3(dot(c,float3(0.213+co*0.787-si*0.213,0.715-co*0.715-si*0.715,0.072-co*0.072+si*0.928)),dot(c,float3(0.213-co*0.213+si*0.143,0.715+co*0.285+si*0.140,0.072-co*0.072-si*0.283)),dot(c,float3(0.213-co*0.213-si*0.787,0.715-co*0.715+si*0.715,0.072+co*0.928+si*0.072)));
 c=pow(max(c*lift+liftOffset,float3(0)),gamma)*gain;
 c=clamp(encode(float3(curveAt(c.r),curveAt(c.g),curveAt(c.b))),0,1);
 c=bounded(mix(c,lookup(c),intensity));
 return half4(c*pixel.a,pixel.a);
}`;
export function makeCanvasKitLutShader(k:CanvasKit,source:Shader,grade:ColorGradeFilterDescriptor,parsed:CanvasKitLutInput,intensity:number):CanvasKitShaderLease{
 const cache=new CanvasKitColorShaderCache(k);try{return ownedCacheLease(cache,cache.lut(source,grade,parsed,intensity));}catch(error){cache.close();throw error;}
}
function ownedCacheLease(cache:CanvasKitColorShaderCache,lease:CanvasKitShaderLease):CanvasKitShaderLease{
 return {...lease,delete(){lease.delete();cache.close();}};
}
type Lookup={shader:Shader};
/** One owner per composition session. Four fixed compiled effects and a bounded
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
 private effect(kind:'grade'|'chroma'|'lut'|'gradientMap'){
  if(this.closed)throw Error('CanvasKit color cache closed');
  let result=this.effects.get(kind);
  if(!result){result=compile(this.kit,kind==='grade'?CANVASKIT_GRADE_SKSL:kind==='chroma'?CANVASKIT_CHROMA_SKSL:kind==='gradientMap'?CANVASKIT_GRADIENT_MAP_SKSL:CANVASKIT_LUT_SKSL);this.effects.set(kind,result);}
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
 private wrap(effect:RuntimeEffect,source:Shader,uniforms:number[],lookup?:FrameLease<Lookup>):CanvasKitShaderLease{
  try{
   if(!uniforms.every(Number.isFinite))throw Error('Invalid CanvasKit color uniforms');
   const shader=effect.makeShaderWithChildren(uniforms,lookup?[source,lookup.frame.value.shader]:[source]);
   let released=false;return {shader,bytes:lookup?.frame.bytes??0,delete(){if(released)return;released=true;shader.delete();lookup?.release();}};
  }catch(error){lookup?.release();throw error;}
 }
 grade(source:Shader,g:ColorGradeFilterDescriptor):CanvasKitShaderLease{
  const effect=this.effect('grade');
  // Matrix-only adjustments do not invalidate component transfer uploads.
  const key='grade:'+JSON.stringify([g.exposureSlope,g.contrastSlope,g.contrastIntercept,g.toneTable,g.liftSlope,g.liftIntercept,g.gammaExponent,g.gainSlope,g.masterCurveTable]);
  const upload=this.upload(key,256,13,()=>canvasKitGradeTableBytes(g));
  return this.wrap(effect,source,[g.redGain,g.greenGain,g.blueGain,g.toneActive?1:0,g.saturation,g.hueDegrees*Math.PI/180],upload);
 }
 chroma(source:Shader,c:ChromaKey):CanvasKitShaderLease{
  if(!/^#[0-9a-f]{6}$/i.test(c.color)||![c.tolerance,c.softness,c.spill].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid CanvasKit chroma');
  return this.wrap(this.effect('chroma'),source,[...[1,3,5].map(i=>parseInt(c.color.slice(i,i+2),16)/255),c.tolerance,c.softness,c.spill]);
 }
 gradientMap(source:Shader,map:GradientMap):CanvasKitShaderLease{
  validateCanvasKitGradientMap(map);
  return this.wrap(this.effect('gradientMap'),source,[...map.stops.flat(),map.amount,map.contrast]);
 }
 lut(source:Shader,g:ColorGradeFilterDescriptor,parsed:CanvasKitLutInput,intensity:number):CanvasKitShaderLease{
  if(!Number.isFinite(intensity)||intensity<0||intensity>1||g.toneTable.length!==65||g.masterCurveTable.length!==17)throw Error('Invalid CanvasKit LUT grade');
  const effect=this.effect('lut');
  const identity='rgba' in parsed?parsed.rgba:parsed;
  let key=this.lutIds.get(identity);if(!key){key=`lut:${++this.nextLut}`;this.lutIds.set(identity,key);}
  const upload=this.upload(key,parsed.size,parsed.size*parsed.size,()=>'rgba' in parsed?parsed.rgba:cubeLutRgbaBytes(parsed));
  return this.wrap(effect,source,[g.exposureSlope,g.redGain,g.greenGain,g.blueGain,g.contrastSlope,g.contrastIntercept,g.saturation,g.hueDegrees*Math.PI/180,...g.liftSlope,...g.liftIntercept,...g.gammaExponent,...g.gainSlope,g.toneActive?1:0,...g.toneTable,...g.masterCurveTable,parsed.size,intensity,...parsed.domainMin,...parsed.domainMax],upload);
 }
 close(){if(this.closed)return;this.closed=true;this.uploads.close();for(const effect of this.effects.values())effect.delete();this.effects.clear();}
}

export function validateCanvasKitGradientMap(map:GradientMap){
 if(!(Number.isFinite(map.amount)&&map.amount>0&&map.amount<=1)||!(Number.isFinite(map.contrast)&&map.contrast>0)||map.stops.length!==3||!map.stops.every(stop=>stop.length===3&&stop.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid CanvasKit color map');
}
