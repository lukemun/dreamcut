/** Match the installed Chromium's FilterResult::rescale: keep logical bounds
 * centered and fractional across half-size steps, rounding only storage bounds.
 * The source-to-layer transform and effective sigma use that logical scale.
 * See pinned Skia 2466dcf3937437e217e7f284afe0e1aae15891ce, SkImageFilterTypes.cpp.
 * Keep separate from media filters until both families pass full conformance.
 */
export function postBlurPlan(width:number,height:number,x:number,y:number){
  if(![width,height].every(value=>Number.isSafeInteger(value)&&value>0)||![x,y].every(value=>Number.isFinite(value)&&value>=0))throw Error('Invalid GPU post-filter geometry');
  const scaleX=Math.min(1,4/Math.max(x,4)),scaleY=Math.min(1,4/Math.max(y,4));
  let stepsX=Math.max(0,Math.ceil(Math.log2(1/scaleX))),stepsY=Math.max(0,Math.ceil(Math.log2(1/scaleY)));
  let logical={x:0,y:0,width,height},pixels={x:0,y:0,width,height};
  const reductions:Array<{key:string;width:number;height:number;inverseX:number;inverseY:number;sampleX:number;sampleY:number}>=[];
  while(stepsX>0||stepsY>0){
    const sx=stepsX>1?.5:stepsX===1?width*scaleX/logical.width:1;
    const sy=stepsY>1?.5:stepsY===1?height*scaleY/logical.height:1;
    const next={x:logical.x+logical.width*(1-sx)/2,y:logical.y+logical.height*(1-sy)/2,width:logical.width*sx,height:logical.height*sy};
    const left=Math.floor(next.x),top=Math.floor(next.y),right=Math.ceil(next.x+next.width),bottom=Math.ceil(next.y+next.height);
    if(!(right>left&&bottom>top)||![sx,sy,next.x,next.y,next.width,next.height].every(Number.isFinite))throw Error('GPU post-filter scale exceeds safe geometry');
    reductions.push({key:`post-blur-input-${reductions.length}-${right-left}-${bottom-top}`,width:right-left,height:bottom-top,inverseX:1/sx,inverseY:1/sy,
      sampleX:(left-next.x)/sx+logical.x-pixels.x,sampleY:(top-next.y)/sy+logical.y-pixels.y});
    pixels={x:left,y:top,width:right-left,height:bottom-top};logical=next;
    stepsX=Math.max(0,stepsX-1);stepsY=Math.max(0,stepsY-1);
  }
  const sigmaX=x*scaleX,sigmaY=y*scaleY;
  const padX=Math.ceil(sigmaX*3),padY=Math.ceil(sigmaY*3);
  const outputPadX=Math.ceil(3*x),outputPadY=Math.ceil(3*y);
  return {reductions,padX,padY,sigmaX,sigmaY,width:pixels.width+2*padX,height:pixels.height+2*padY,
    outputPadX,outputPadY,outputWidth:width+2*outputPadX,outputHeight:height+2*outputPadY,
    sourcePadX:(padX+logical.x-pixels.x)/scaleX,sourcePadY:(padY+logical.y-pixels.y)/scaleY,
    extentWidth:(pixels.width+2*padX)/scaleX,extentHeight:(pixels.height+2*padY)/scaleY};
}

/** Match Chromium's actual SVG Gaussian kDecal border (edgeMode on this
 * primitive is not read by its SVG element implementation). Pad the complete actor,
 * not the raw media: filtering sits outside its media effects and inside its
 * transition transform. One texel-preserving copy avoids resampling the source.
 */
export const DECAL_EDGE_PADDING_SHADER = /* wgsl */`
@group(0) @binding(0) var<uniform> pad:vec4f;
@group(0) @binding(1) var picture:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(p[i],0,1);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let source=vec2i(floor(p.xy-pad.xy));
  if(any(source<vec2i(0))||any(source>=vec2i(textureDimensions(picture)))){return vec4f(0);}
  return textureLoad(picture,source,0);
}`;

/** Pair neighboring Gaussian taps using linear texture sampling, as Skia's
 * shader blur does. Store offsets/weights with its float32 kernel construction;
 * the shader's half precision is explicit rather than backend-dependent.
 */
export function postBlurUniforms(sigma:number,vertical:boolean){
  if(!Number.isFinite(sigma)||sigma<0||sigma>4.00001)throw Error('Invalid GPU post-filter sigma');
  const f=Math.fround,s=f(sigma),radius=s<=.03?0:Math.ceil(f(3*s));
  const full:number[]=[],denominator=radius?f(1/f(f(2*s)*s)):1;
  let sum=0;
  for(let i=-radius;i<=radius;i++){const value=radius?f(Math.exp(-f(f(i*i)*denominator))):1;full.push(value);sum=f(sum+value);}
  const scale=f(1/sum);for(let i=0;i<full.length;i++)full[i]=f(full[i]*scale);
  const size=radius+1,mid=Math.floor(size/2),weights=Array(28).fill(0),offsets=Array(28).fill(0);
  let source=radius,low=mid-1;
  const pair=(a:number,b:number)=>{const weight=f(a+b);return {weight,offset:f(b/weight)};};
  if(radius%2){const point=pair(f(full[source]*.5),full[source+1]);weights[mid]=weights[low]=point.weight;offsets[mid]=point.offset;offsets[low]=-point.offset;source++;low--;}
  else weights[mid]=full[source];
  source++;
  for(let i=mid+1;i<size;i++,source+=2,low--){const point=pair(full[source],full[source+1]);weights[i]=weights[low]=point.weight;offsets[i]=f(point.offset+source-radius);offsets[low]=-offsets[i];}
  for(let i=size;i<28;i++)offsets[i]=offsets[size-1];
  return new Float32Array([vertical?0:1,vertical?1:0,size,0,...offsets.flatMap((offset,i)=>[offset,weights[i]])]);
}

export const POST_BLUR_SHADER=/* wgsl */`
struct Params {axis:vec4f,pairs:array<vec4f,14>}
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var picture:texture_2d<f32>;
@group(0) @binding(2) var linearSampler:sampler;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let dimensions=vec2f(textureDimensions(picture));var sum=vec4f(0);
  for(var i=0u;i<(u32(params.axis.z)+1u)/2u;i++){
    let pair=quantizeToF16(params.pairs[i]);
    let a=quantizeToF16(textureSampleLevel(picture,linearSampler,(p.xy+pair.x*params.axis.xy)/dimensions,0));
    let b=quantizeToF16(textureSampleLevel(picture,linearSampler,(p.xy+pair.z*params.axis.xy)/dimensions,0));
    sum=quantizeToF16(sum+pair.y*a);sum=quantizeToF16(sum+pair.w*b);
  }
  return floor(sum*255.0+vec4f(0.5))/255.0;
}`;

/** Fractional bounds stay centered through repeated reductions. Conservative
 * storage pixels are sampled through the exact logical scale, not treated as
 * a new integer-sized picture (Chromium-pinned Skia FilterResult::rescale).
 */
export const POST_RESCALE_SHADER=/* wgsl */`
@group(0) @binding(0) var<uniform> mapping:vec4f;
@group(0) @binding(1) var picture:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);
}
fn pixel(p:vec2i)->vec4f{
  if(any(p<vec2i(0))||any(p>=vec2i(textureDimensions(picture)))){return vec4f(0);}
  return textureLoad(picture,p,0);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let coord=p.xy*mapping.xy+mapping.zw-vec2f(0.5);
  let base=vec2i(floor(coord));let part=fract(coord);
  let a=mix(pixel(base),pixel(base+vec2i(1,0)),part.x);
  let b=mix(pixel(base+vec2i(0,1)),pixel(base+vec2i(1,1)),part.x);
  return floor(mix(a,b,part.y)*255.0+vec4f(0.5))/255.0;
}`;
