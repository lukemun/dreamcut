import type {CanvasKitRadialPlan} from './canvaskit-radial-effects';
import type {CanvasKitGridMattePlan} from './canvaskit-grid-matte';
import {GPU_BLEND_SHADER} from './blend-pass';
import {GPU_LUT_SHADER} from './lut-shader';
import type {GpuLutTexture} from './lut-textures';
/// <reference types="@webgpu/types" />
import {gpuGradeUniforms,GPU_GRADE_FIELDS,GPU_GRADE_SHADER} from './color-grade';
import type {ChromaKey} from '../timeline/chroma-key';
import type {ColorGradeFilterDescriptor} from '../timeline/color-grade';
import {validateGpuCopyBudget,pruneGpuCopies} from './copy-budget';
import {gaussianBlurPlan,gaussianBlurUniforms,GAUSSIAN_BLUR_SHADER} from './blur-pass';
import {rectToGpuTransform,groupGpuTransform,gpuGroupParameters,type GpuGroupTransform} from './geometry';
import {glowMaskPlan} from './glow-pass';
import {outlinePassPlan,MORPHOLOGY_SHADER} from './outline-pass';
import {GpuGradeTables} from './grade-tables';
import {GpuIntermediateTargets} from './intermediate-targets';
import {DECAL_EDGE_PADDING_SHADER,postBlurPlan,postBlurUniforms,POST_BLUR_SHADER,POST_RESCALE_SHADER} from './post-blur-pass';
import {SMPTE_C_WGSL_MATRIX} from "../frame-runtime/source-primaries";
/** Bounded SDR compositor. Inputs must already satisfy the frame controller contract. */
export type GpuVideoDraw = {
  frame: VideoFrame | OffscreenCanvas;
  /** Column-major transform from local [-1,1] quad to clip space. Allows projective w. */
  transform: readonly number[];
  opacity: number;
  blend?:'normal'|'difference'|'exclusion'|'multiply';
  /** Complete neutral caption plane: local filter before projective placement. */
  captionPlane?:readonly number[];
  mediaSpiral?:import('./spiral-transform').GpuSpiralTransform;
  outerSpiral?:import('./spiral-transform').GpuSpiralTransform;
  viewportMask?:OffscreenCanvas;
  captionFill?:import('./canvaskit-caption-fill').GpuCaptionFill;
  /** Immutable canvas content identity; omit for mutable canvases. */
  textureVersion?: unknown;
  /** Single-channel mask in source UV coordinates. Absence means opaque RGB. */
  mask?: GPUTexture;
  boundaryPageTurn?:import('./canvaskit-page-turn').GpuPageTurnBoundary;
  boundaryProjective?:{quad:readonly (readonly [number,number])[];backfaceVisible:boolean;perspective:number};
  boundaryClip?:readonly [number,number,number,number];
  boundaryWash?:{opacity:number;background:string};
  /** transition_clip_to_media_bounds (timeline/transition-viewport.ts): fixed clip around the actor's
   * animation/transition wrapper, with the clip box's CSS box shadow outside it (CanvasKit only). */
  transitionViewport?:{rect:import('../timeline/transition-viewport').TransitionViewportRect;shadow?:{dx:number;dy:number;sigma:number;opacity:number}};
  radialBackdrop?:import('./canvaskit-backdrop').CanvasKitBackdropScope;
  radial?:CanvasKitRadialPlan;
  gridMatte?:{plan:CanvasKitGridMattePlan;rgba:Uint8Array};
  /** Composition-covering window alpha (grid size); null alpha is a uniform empty window. */
  subjectWindow?:{plan:import('../timeline/subject-window').SubjectWindowPlan;alpha:Uint8Array|null};
  captionMask?:{canvas:OffscreenCanvas;mapping:readonly[number,number,number,number]};
  featherMask?:readonly [number,number,number,number];
  /** Output-space pixel clip: left, top, right, bottom. */
  clip?: readonly [number,number,number,number];
  window?: {rect:{x:number;y:number;width:number;height:number};radius:number};
  recolor?: readonly number[];
  grade?:ColorGradeFilterDescriptor|null;
  lut?:GpuLutTexture&{intensity:number};
  chroma?:ChromaKey|null;
  /** Color map after grade/LUT, alpha preserved (CanvasKit only; timeline/gradient-map.ts). */
  gradientMap?:import('../timeline/gradient-map').GradientMap;
  /** Deterministic glitch blocks in composition pixels, after the colour stage (CanvasKit only; timeline/glitch.ts). */
  glitch?:import('../timeline/glitch').GlitchPlan;
  blur?:{x:number;y:number};
  /** Transparent-edge SVG smear on the complete actor, outside its media masks. */
  postBlur?:{x:number;y:number};
  flash?:number;
  /** Composition-space media drop shadow under the picture, inside actor filters (CanvasKit only). */
  shadow?:import('./media-shadow').GpuMediaShadow;
  /** Paper contour / traveling aura on a prepared distance field (CanvasKit only; PaperContourFilter). */
  contour?:import('./canvaskit-actor-filter').CanvasKitContour;
  /** Still `image_rendering: pixelated`: nearest-neighbour source sampling (CanvasKit only). */
  pixelated?:boolean;
  /** Inspector alpha-matte review: picture RGB flattened to white, alpha kept (CanvasKit only). */
  matte?:boolean;
  /** `only`: draw just the flooded dilation (outline layer), not the subject over it. */
  outline?:{radius:number;softness:number;color:readonly [number,number,number];only?:boolean};
  outlineAlpha?:GPUTexture;
  glow?:{strength:number;radius:number};
  glowUvScale?:readonly [number,number];
  glowAlpha?:GPUTexture;
  group?:GpuGroupTransform;
  groupOpacity?:number;
  /** write_on media wipe: fraction (0,1] of the output-sized group box hidden
   * from its right edge, clipped in group-local space before the group pose and
   * after postBlur (CSS clip-path on the wrapper). CanvasKit only. */
  wipeRight?:number;
  lineMask?:readonly [number,number,number,number];
  /** UV distance spanning one output pixel, for whole-actor edge coverage. */
  edgeAa?:readonly [number,number];
};
// Primary conversion derives from Skia Rec601/Rec709 D65 chromaticities:
// https://skia.googlesource.com/skia/+/main/include/core/SkColorSpace.h
// SDR transfer interpretation matches the existing native source-color owner.
const shader = /* wgsl */`
struct Params { transform: mat4x4f, opacity: vec4f, clip: vec4f, windowRect: vec4f, windowOptions: vec4f, recolorR: vec4f, recolorG: vec4f, recolorB: vec4f, ${GPU_GRADE_FIELDS} keyColor: vec4f, keyAmounts: vec4f, outlineColor:vec4f, glowOptions:vec4f, featherMask:vec4f, lutOptions:vec4f, lutMin:vec4f, lutMax:vec4f, maskMapping:vec4f, maskOptions:vec4f, lineMask:vec4f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var picture: texture_external;
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var<storage,read> gradeTransfer:array<vec4f>;
@group(0) @binding(5) var outlineAlpha:texture_2d<f32>;
@group(0) @binding(6) var glowAlpha:texture_2d<f32>;
@group(0) @binding(7) var colorLut:texture_3d<f32>;
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> Vertex {
  let corners = array<vec2f,6>(vec2f(-1,1),vec2f(-1,-1),vec2f(1,1),vec2f(1,1),vec2f(-1,-1),vec2f(1,-1));
  var out: Vertex;
  // windowOptions.zw reserve the outer quad footprint; expand half a pixel
  // so the fragment stage can cover fractional edges instead of hard clipping.
  let p = corners[i] * (vec2f(1.0) + params.windowOptions.zw);
  out.position = params.transform * vec4f(p,0,1);
  out.uv = vec2f((p.x+1)*0.5,(1-p.y)*0.5);
  return out;
}
${GPU_GRADE_SHADER}
${GPU_LUT_SHADER}
fn chroma(rgb:vec3f)->vec2f{
  return vec2f(dot(rgb,vec3f(-0.168736,-0.331264,0.5)),dot(rgb,vec3f(0.5,-0.418688,-0.081312)));
}
@fragment fn fs(v: Vertex) -> @location(0) vec4f {
  let localPosition=v.position.xy;
  if(localPosition.x < params.clip.x || localPosition.y < params.clip.y || localPosition.x >= params.clip.z || localPosition.y >= params.clip.w) { discard; }
  let color = textureSampleBaseClampToEdge(picture,linearSampler,v.uv);
  var rgb = color.rgb;
  if(params.opacity.z>0.5){rgb=select(vec3f(0),color.rgb/max(color.a,0.00001),color.a>0.0);}
  // Chromium's video surface converts SMPTE-C primaries to sRGB; decoded
  // Canvas/external-texture samples expose source RGB on our verified backend.
  // The existing WebGL keyer consumes those source samples too, so keyed
  // footage must not receive the CSS-video-only primary conversion. The LUT
  // owner likewise samples the raw canvas before its CSS display filter.
  if(params.opacity.y > 0.5 && params.keyColor.w < 0.5 && params.lutOptions.y < 0.5){
    let linear=select(rgb/12.92,pow((rgb+vec3f(0.055))/1.055,vec3f(2.4)),rgb>vec3f(0.04045));
    let matrix=${SMPTE_C_WGSL_MATRIX};
    let mapped=clamp(matrix*linear,vec3f(0),vec3f(1));
    rgb=select(mapped*12.92,1.055*pow(mapped,vec3f(1.0/2.4))-vec3f(0.055),mapped>vec3f(0.0031308));
  }
  var keyedAlpha=color.a;
  if(params.keyColor.w>0.5){
    let key=params.keyColor.xyz;
    let distance=length(chroma(rgb)-chroma(key));
    var mask=clamp((distance-params.keyAmounts.x)/max(params.keyAmounts.y,0.00001),0.0,1.0);
    mask=mask*mask*(3.0-2.0*mask);
    let direction=max(key-vec3f(dot(key,vec3f(0.299,0.587,0.114))),vec3f(0));
    let dominance=dot(direction,direction);
    let excess=max(0.0,dot(rgb-vec3f(dot(rgb,vec3f(0.299,0.587,0.114))),direction)/max(dominance,0.00001));
    rgb=max(vec3f(0),rgb-direction*excess*params.keyAmounts.z*(1.0-mask));
    // The shared keyer writes an RGBA8 canvas before its outer effects.
    rgb=floor(rgb*255.0+vec3f(0.5))/255.0;
    keyedAlpha=floor(color.a*mask*255.0+0.5)/255.0;
  }
  if(params.outlineColor.w>0.5){
    let edge=floor(clamp(textureSample(outlineAlpha,linearSampler,v.uv).r,0.0,1.0)*255.0+0.5)/255.0;
    let mergedAlpha=floor((keyedAlpha+edge*(1.0-keyedAlpha))*255.0+0.5)/255.0;
    let mergedRgb=floor((rgb*keyedAlpha+params.outlineColor.xyz*edge*(1.0-keyedAlpha))*255.0+vec3f(0.5))/255.0;
    rgb=select(vec3f(0),mergedRgb/max(mergedAlpha,0.00001),mergedAlpha>0.0);keyedAlpha=mergedAlpha;
  }
  let original=vec4f(rgb,1.0);
  rgb=clamp(vec3f(dot(params.recolorR,original),dot(params.recolorG,original),dot(params.recolorB,original)),vec3f(0.0),vec3f(1.0));
  if(params.opacity.w>0.5){rgb=floor(rgb*255.0+vec3f(0.5))/255.0;}
  if(params.keyAmounts.w>0.0){rgb=floor(mix(rgb,vec3f(1),params.keyAmounts.w)*255.0+vec3f(0.5))/255.0;}
  if(params.glowOptions.x>0.5){
    let haloUv=vec2f(0.5)+(v.uv-vec2f(0.5))*params.glowOptions.yz;
    let halo=transfer(textureSample(glowAlpha,linearSampler,haloUv).a,13u);
    let mergedAlpha=floor((keyedAlpha+halo*(1.0-keyedAlpha))*255.0+0.5)/255.0;
    let mergedRgb=floor((rgb*keyedAlpha+vec3f(halo*(1.0-keyedAlpha)))*255.0+vec3f(0.5))/255.0;
    rgb=select(vec3f(0),mergedRgb/max(mergedAlpha,0.00001),mergedAlpha>0.0);keyedAlpha=mergedAlpha;
  }
  if(params.lutOptions.y>0.5){rgb=applyLutGrade(rgb);}else{rgb=applyGrade(rgb);}
  var windowCoverage=1.0;
  if(params.windowOptions.x>0.5){
    var hole=0.0;
    // Match the shared quadratic corner path, not a circular rounded rectangle.
    // Pixel-area sampling antialiases the independently positioned opening.
    for(var sy=0;sy<4;sy++){for(var sx=0;sx<4;sx++){
      let p=v.position.xy+vec2f((f32(sx)+0.5)/4.0-0.5,(f32(sy)+0.5)/4.0-0.5);
      let d=min(p-params.windowRect.xy,params.windowRect.zw-p);
      let r=params.windowOptions.y;
      if(all(d>=vec2f(0.0))){
        if(r<=0.0 || any(d>=vec2f(r))){hole+=1.0;}
        else if(sqrt(d.x/r)+sqrt(d.y/r)>=1.0){hole+=1.0;}
      }
    }}
    windowCoverage=1.0-hole/16.0;
  }
  var feather=1.0;
  if(params.featherMask.z>0.0){
    let flags=u32(params.featherMask.w);
    if((flags&1u)!=0u){feather*=clamp((localPosition.y-params.featherMask.x)/params.featherMask.z,0.0,1.0);}
    if((flags&2u)!=0u){feather*=clamp((params.featherMask.y-localPosition.y)/params.featherMask.z,0.0,1.0);}
    feather=floor(feather*255.0+0.5)/255.0;
  }
  if(any(params.lineMask.xy!=vec2f(0.0))){
    let distance=dot(localPosition,params.lineMask.xy)-params.lineMask.z;
    feather=select(select(0.0,1.0,distance>=0.0),clamp(distance/max(params.lineMask.w,0.000001),0.0,1.0),params.lineMask.w>0.0);
    feather=floor(feather*255.0+0.5)/255.0;
  }
  var edgeCoverage=1.0;
  if(params.windowOptions.z>0.0){
    let footprint=max(fwidth(v.uv),vec2f(0.000001));
    let coverage=clamp(min(v.uv,vec2f(1.0)-v.uv)/footprint+vec2f(0.5),vec2f(0.0),vec2f(1.0));
    edgeCoverage=coverage.x*coverage.y;
  }
  let maskUv=v.uv*params.maskMapping.xy+params.maskMapping.zw;
  let maskSample=textureSample(mask,linearSampler,maskUv);
  var maskCoverage=select(maskSample.r,maskSample.a,params.maskOptions.x>0.5);
  if(params.maskOptions.x>0.5 && (any(maskUv<vec2f(0)) || any(maskUv>vec2f(1)))){maskCoverage=0.0;}
  let alpha = clamp(edgeCoverage * feather * keyedAlpha * maskCoverage * params.opacity.x * windowCoverage,0,1);
  return vec4f(rgb * alpha,alpha);
}`;

const GPU_DRAW_UNIFORM_BYTES=816;
function uniforms(layer:GpuVideoDraw,premultiplied:boolean,sourcePrimaries:boolean){
 const hole=layer.window?.rect,recolor=layer.recolor??[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];
 return new Float32Array([...groupGpuTransform(layer.transform,layer.group),layer.opacity,sourcePrimaries?1:0,premultiplied?1:0,recolor.some((v,i)=>v!==[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0][i])?1:0,...(layer.clip??[-1e9,-1e9,1e9,1e9]),
  ...(hole?[hole.x,hole.y,hole.x+hole.width,hole.y+hole.height]:[0,0,0,0]),hole&&hole.height>0?1:0,layer.window?.radius??0,...(layer.edgeAa??[0,0]),
  ...[0,5,10].flatMap(row=>[recolor[row],recolor[row+1],recolor[row+2],recolor[row+4]]),...gpuGradeUniforms(layer.grade),
  ...(layer.chroma?[...[1,3,5].map(offset=>parseInt(layer.chroma!.color.slice(offset,offset+2),16)/255),1,layer.chroma.tolerance,layer.chroma.softness,layer.chroma.spill,layer.flash??0]:[0,0,0,0,0,0,0,layer.flash??0]),...(layer.outlineAlpha&&layer.outline?[...layer.outline.color,1]:[0,0,0,0]),layer.glowAlpha?1:0,...(layer.glowUvScale??[1,1]),0,...(layer.featherMask??[0,0,0,0]),layer.lut?.intensity??0,layer.lut?1:0,0,0,...(layer.lut?.domainMin??[0,0,0]),0,...(layer.lut?.domainMax??[1,1,1]),0,...(layer.captionMask?.mapping??[1,1,0,0]),layer.captionMask?1:0,0,0,0,...(layer.lineMask??[0,0,0,0])]);
}

export class GpuVideoCompositor {
  private readonly targets: GpuIntermediateTargets;
  private readonly gradeTables:GpuGradeTables;
  private blendPipeline!: GPURenderPipeline;
  private pipeline!: GPURenderPipeline;
  private copyPipeline!: GPURenderPipeline;
  private actorPipeline!: GPURenderPipeline;
  private actorCopyPipeline!: GPURenderPipeline;
  private isolatedPipeline!: GPURenderPipeline;
  private isolatedCopyPipeline!: GPURenderPipeline;
  private morphologyPipeline!: GPURenderPipeline;
  private morphologySourcePipeline!: GPURenderPipeline;
  private alphaBlurPipeline!: GPURenderPipeline;
  private alphaBlurSourcePipeline!: GPURenderPipeline;
  private blurPipeline!: GPURenderPipeline;
  private postBlurPipeline!: GPURenderPipeline;
  private postCopyPipeline!: GPURenderPipeline;
  private postRescalePipeline!: GPURenderPipeline;
  private paddingPipeline!: GPURenderPipeline;
  private copies: Array<{texture: GPUTexture; canvas: OffscreenCanvas; width: number; height: number; source?: VideoFrame | OffscreenCanvas; version?: unknown}|undefined> = [];
  private maskCopies=new Map<number,{canvas:OffscreenCanvas;texture:GPUTexture}>();
  private readonly sampler: GPUSampler;
  private readonly white: GPUTexture;
  private readonly emptyLut:GPUTexture;
  private buffers: GPUBuffer[] = [];
  private closed = false;
  private pipelinesReady = false;
  readonly ready: Promise<void>;
  constructor(readonly device: GPUDevice, readonly context: GPUCanvasContext, readonly format: GPUTextureFormat) {
    this.targets=new GpuIntermediateTargets(device);this.gradeTables=new GpuGradeTables(device);
    const compilation: Promise<void>[]=[];
    const makePipeline=(code:string,targetFormat:GPUTextureFormat=format)=>{const module=device.createShaderModule({label:'DreamCut masked video',code});
    return device.createRenderPipelineAsync({label:'DreamCut SDR normal blend',layout:'auto',
      vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:targetFormat,blend:{
        color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},
        alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},
      }}]},primitive:{topology:'triangle-list'}});};
    const blendModule=device.createShaderModule({label:'DreamCut media blend',code:GPU_BLEND_SHADER});
    compilation.push(device.createRenderPipelineAsync({layout:'auto',vertex:{module:blendModule,entryPoint:'vs'},fragment:{module:blendModule,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}}).then(pipeline=>{this.blendPipeline=pipeline;}));
    compilation.push((makePipeline(shader)).then(pipeline=>{this.pipeline=pipeline;}));
    compilation.push((makePipeline(shader.replace('picture: texture_external','picture: texture_2d<f32>').replace('textureSampleBaseClampToEdge(picture,linearSampler,v.uv)','textureSample(picture,linearSampler,v.uv)'))).then(pipeline=>{this.copyPipeline=pipeline;}));
    compilation.push((makePipeline(shader,'rgba8unorm')).then(pipeline=>{this.actorPipeline=pipeline;}));
    compilation.push((makePipeline(shader.replace('picture: texture_external','picture: texture_2d<f32>').replace('textureSampleBaseClampToEdge(picture,linearSampler,v.uv)','textureSample(picture,linearSampler,v.uv)'),'rgba8unorm')).then(pipeline=>{this.actorCopyPipeline=pipeline;}));
    compilation.push((makePipeline(shader.replace('picture: texture_external','picture: texture_2d<f32>').replace('textureSampleBaseClampToEdge(picture,linearSampler,v.uv)','textureSample(picture,linearSampler,v.uv)').replace('return vec4f(rgb * alpha,alpha);','return floor(vec4f(rgb * alpha,alpha)*255.0+vec4f(0.5))/255.0;'),'rgba8unorm')).then(pipeline=>{this.postCopyPipeline=pipeline;}));
    compilation.push((makePipeline(shader,'rgba16float')).then(pipeline=>{this.isolatedPipeline=pipeline;}));
    compilation.push((makePipeline(shader.replace('picture: texture_external','picture: texture_2d<f32>').replace('textureSampleBaseClampToEdge(picture,linearSampler,v.uv)','textureSample(picture,linearSampler,v.uv)'),'rgba16float')).then(pipeline=>{this.isolatedCopyPipeline=pipeline;}));
    const blurModule=device.createShaderModule({label:'DreamCut separable Gaussian',code:GAUSSIAN_BLUR_SHADER});
    // Outline intermediates contain alpha only. R16F preserves the same half
    // precision as their former RGBA16F alpha channel at one quarter the size.
    const alphaPipeline=(code:string)=>{const module=device.createShaderModule({label:'DreamCut alpha-only filter',code});return device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'r16float'}]},primitive:{topology:'triangle-list'}});};
    const morphology=MORPHOLOGY_SHADER.replace('return vec4f(0,0,0,result);','return vec4f(result,0,0,1);');
    compilation.push((alphaPipeline(morphology)).then(pipeline=>{this.morphologySourcePipeline=pipeline;}));
    compilation.push((alphaPipeline(morphology.replace('textureLoad(picture,p,0).a','textureLoad(picture,p,0).r'))).then(pipeline=>{this.morphologyPipeline=pipeline;}));
    const alphaBlur=GAUSSIAN_BLUR_SHADER.replace('return color;','return vec4f(color.a,0,0,1);');
    compilation.push((alphaPipeline(alphaBlur)).then(pipeline=>{this.alphaBlurSourcePipeline=pipeline;}));
    compilation.push((alphaPipeline(alphaBlur.replace('return textureLoad(picture,p,0);','return vec4f(0,0,0,textureLoad(picture,p,0).r);'))).then(pipeline=>{this.alphaBlurPipeline=pipeline;}));
    compilation.push((device.createRenderPipelineAsync({layout:'auto',vertex:{module:blurModule,entryPoint:'vs'},fragment:{module:blurModule,entryPoint:'fs',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list'}})).then(pipeline=>{this.blurPipeline=pipeline;}));
    const postBlurModule=device.createShaderModule({label:'DreamCut paired transition Gaussian',code:POST_BLUR_SHADER});
    compilation.push((device.createRenderPipelineAsync({layout:'auto',vertex:{module:postBlurModule,entryPoint:'vs'},fragment:{module:postBlurModule,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}})).then(pipeline=>{this.postBlurPipeline=pipeline;}));
    const paddingModule=device.createShaderModule({label:'DreamCut decal filter input',code:DECAL_EDGE_PADDING_SHADER});
    compilation.push((device.createRenderPipelineAsync({layout:'auto',vertex:{module:paddingModule,entryPoint:'vs'},fragment:{module:paddingModule,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}})).then(pipeline=>{this.paddingPipeline=pipeline;}));
    const rescaleModule=device.createShaderModule({label:'DreamCut centered filter reduction',code:POST_RESCALE_SHADER});
    compilation.push((device.createRenderPipelineAsync({layout:'auto',vertex:{module:rescaleModule,entryPoint:'vs'},fragment:{module:rescaleModule,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}})).then(pipeline=>{this.postRescalePipeline=pipeline;}));
    this.ready=Promise.all(compilation).then(()=>{this.pipelinesReady=true;});
    // Initialization can outlive a cancelled session; observe failures now while
    // preserving rejection for the foreground readiness gate.
    void this.ready.catch(()=>{});
    this.sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
    this.emptyLut=device.createTexture({dimension:'3d',size:[1,1,1],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    device.queue.writeTexture({texture:this.emptyLut},new Uint8Array([0,0,0,255]),{bytesPerRow:4,rowsPerImage:1},[1,1,1]);
    this.white=device.createTexture({size:[1,1],format:'r8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    device.queue.writeTexture({texture:this.white},new Uint8Array([255]),{bytesPerRow:1},[1,1]);
  }
  /** All layers are submitted together. Caller retains frames until this call returns. */
  draw(layers: readonly GpuVideoDraw[]) {
    if(layers.some(layer=>layer.mediaSpiral||layer.outerSpiral))throw Error('WebGPU spiral wrapper is not implemented');
    if(layers.some(layer=>layer.captionFill))throw Error('WebGPU local caption fill is not implemented');
    if(layers.some(layer=>layer.viewportMask))throw Error('WebGPU viewport caption mask is not implemented');
    if(layers.some(layer=>layer.captionPlane))throw Error('WebGPU caption plane is not implemented');
    if(layers.some(layer=>layer.boundaryPageTurn||layer.boundaryProjective||layer.boundaryClip||layer.boundaryWash||layer.transitionViewport))throw Error('WebGPU boundary packet is not implemented');
    if(layers.some(layer=>layer.radial||layer.gridMatte||layer.subjectWindow))throw Error('WebGPU radial/grid/subject-window packet is not implemented');
    if(layers.some(layer=>layer.wipeRight))throw Error('WebGPU media wipe is not implemented; use CanvasKit');
    if(layers.some(layer=>layer.lut&&!layer.lut.texture))throw Error('WebGPU compositor requires GPU LUT textures');
    if(this.closed)throw Error('GPU compositor closed');
    if(!this.pipelinesReady)throw Error('GPU pipelines are not ready');
    for(const layer of layers)if(layer.shadow)throw Error('WebGPU media shadow is not implemented; use CanvasKit');
    for(const layer of layers)if(layer.blend&&!['normal','difference','exclusion'].includes(layer.blend))throw Error('Invalid GPU blend mode');
    for(const layer of layers)if(layer.captionMask&&!layer.captionMask.mapping.every(Number.isFinite))throw Error('Invalid caption mask mapping');
    const hasBlend=layers.some(layer=>layer.blend&&layer.blend!=='normal');
    if(hasBlend&&!['rgba8unorm','bgra8unorm'].includes(this.format))throw Error('Unsupported GPU blend target format');
    for(const layer of layers)if(layer.featherMask&&(!layer.featherMask.every(Number.isFinite)||layer.featherMask[2]<=0||![1,2,3].includes(layer.featherMask[3])))throw Error('Invalid GPU feather mask');
    for(const layer of layers)if(layer.transform.length!==16 || !layer.transform.every(Number.isFinite)
      || !Number.isFinite(layer.opacity) || layer.glow&&(![layer.glow.strength,layer.glow.radius].every(Number.isFinite)||layer.glow.strength<0||layer.glow.strength>3||layer.glow.radius<0) || layer.outline&&(![layer.outline.radius,layer.outline.softness,...layer.outline.color].every(Number.isFinite)||layer.outline.radius<0||layer.outline.softness<0||layer.outline.softness>41||layer.outline.color.length!==3||layer.outline.color.some(v=>v<0||v>1)) || layer.flash!==undefined&&(!Number.isFinite(layer.flash)||layer.flash<0||layer.flash>1) || layer.groupOpacity!==undefined&&(!Number.isFinite(layer.groupOpacity)||layer.groupOpacity<0||layer.groupOpacity>1) || layer.blur&&![layer.blur.x,layer.blur.y].every(v=>Number.isFinite(v)&&v>=0) || layer.postBlur&&![layer.postBlur.x,layer.postBlur.y].every(v=>Number.isFinite(v)&&v>=0) || layer.recolor&&(layer.recolor.length!==20||!layer.recolor.every(Number.isFinite)))throw Error('Invalid GPU draw parameters');
    const surfaces=layers.map(layer=>{
      const video=layer.frame instanceof VideoFrame?layer.frame:null,rect=video?.visibleRect;
      const copy=!video || ['RGBA','BGRA','I420A'].includes(video.format??'')
        || video.codedWidth!==video.displayWidth || video.codedHeight!==video.displayHeight
        || !!rect&&(rect.x!==0||rect.y!==0);
      return copy?{width:video?video.displayWidth:(layer.frame as OffscreenCanvas).width,height:video?video.displayHeight:(layer.frame as OffscreenCanvas).height}:null;
    });
    validateGpuCopyBudget(surfaces);
    const canvas=this.context.canvas;
    const plans=layers.map(layer=>layer.blur&&(layer.blur.x>0||layer.blur.y>0)?gaussianBlurPlan(canvas.width,canvas.height,layer.blur.x,layer.blur.y):null);
    const postPlans=layers.map(layer=>layer.postBlur&&(layer.postBlur.x>0||layer.postBlur.y>0)?postBlurPlan(canvas.width,canvas.height,layer.postBlur.x,layer.postBlur.y):null);
    const outlines=layers.map(layer=>layer.outline&&layer.outline.radius>0?outlinePassPlan(layer.outline.radius,layer.outline.softness,layer.blur):null);
    const subjects=layers.map((layer,index)=>outlines[index]||layer.glow&&layer.glow.strength>0?{
      padX:(outlines[index]?.padX??Math.ceil(3*(layer.blur?.x??0)))+Math.ceil(3*(layer.glow?.radius??0)),
      padY:(outlines[index]?.padY??Math.ceil(3*(layer.blur?.y??0)))+Math.ceil(3*(layer.glow?.radius??0))}:null);
    const outlinePadX=Math.max(0,...subjects.map(p=>p?.padX??0)),outlinePadY=Math.max(0,...subjects.map(p=>p?.padY??0));
    const outlineWidth=canvas.width+2*outlinePadX,outlineHeight=canvas.height+2*outlinePadY;
    const glows=layers.map(layer=>layer.glow&&layer.glow.strength>0?glowMaskPlan(outlineWidth,outlineHeight,layer.glow.radius):null);
    const subjectPasses=layers.map((_,index)=>subjects[index]?(outlines[index]?.passes??1)+(glows[index]?(outlines[index]?1:0)+glows[index]!.passes:0):0);
    const groups=layers.map((layer,index)=>(!!layer.blend&&layer.blend!=='normal')||gpuGroupParameters(layer.group)[3]!==0||(layer.groupOpacity??1)!==1||!!postPlans[index]);
    const scratch=new Map<string,{key:string;width:number;height:number;format:'rgba16float'|'rgba8unorm'|'bgra8unorm'|'r16float'}>();
    layers.forEach((layer,index)=>{if(layer.captionMask){const {width,height}=layer.captionMask.canvas;scratch.set(`caption-mask-${index}`,{key:`caption-mask-${index}`,width,height,format:'rgba8unorm'});}});
    if(hasBlend){
      for(const key of ['blend-scene','blend-backdrop'])scratch.set(key,{key,width:canvas.width,height:canvas.height,format:this.format as 'rgba8unorm'|'bgra8unorm'});
      scratch.set('blend-actor',{key:'blend-actor',width:canvas.width,height:canvas.height,format:'rgba8unorm'});
    }
    if(subjects.some(Boolean))scratch.set('outline-source',{key:'outline-source',width:outlineWidth,height:outlineHeight,format:'rgba8unorm'});
    if(outlines.some(Boolean))for(const [key,format] of [['outline-source','rgba8unorm'],['outline-a','r16float'],['outline-b','r16float']] as const)scratch.set(key,{key,width:outlineWidth,height:outlineHeight,format});
    if(glows.some(Boolean)&&outlines.some(Boolean))scratch.set('subject-source',{key:'subject-source',width:outlineWidth,height:outlineHeight,format:'rgba8unorm'});
    for(const glow of glows)if(glow){
      for(const [side,format] of [['a','rgba16float'],['b','rgba16float']] as const){const key=`glow-${glow.width}-${glow.height}-${side}`;scratch.set(key,{key,width:glow.width,height:glow.height,format});}
      for(const size of glow.reductions.slice(0,-1)){const key=`glow-reduce-${size.width}-${size.height}`;scratch.set(key,{key,...size,format:'rgba16float'});}
    }
    if(groups.some(Boolean))scratch.set('animated-actor',{key:'animated-actor',width:canvas.width,height:canvas.height,format:'rgba8unorm'});
    for(const plan of postPlans)if(plan){
      const upscaledKey=`post-upscale-${plan.outputWidth}-${plan.outputHeight}`;
      scratch.set(upscaledKey,{key:upscaledKey,width:plan.outputWidth,height:plan.outputHeight,format:'rgba8unorm'});
      for(const side of ['a','b']){const key=`post-blur-${plan.width}-${plan.height}-${side}`;scratch.set(key,{key,width:plan.width,height:plan.height,format:'rgba8unorm'});}
      plan.reductions.forEach(size=>{
        scratch.set(size.key,{key:size.key,width:size.width,height:size.height,format:'rgba8unorm'});
      });
    }
    for(const plan of plans)if(plan)for(const side of ['a','b']){
      const key=`blur-${plan.width}-${plan.height}-${side}`;scratch.set(key,{key,width:plan.width,height:plan.height,format:'rgba16float'});
    }
    for(const plan of plans)if(plan&&plan.reductions.length){
      for(const size of [{width:plan.extentWidth,height:plan.extentHeight},...plan.reductions.slice(0,-1)]){
        const key=`blur-reduce-${size.width}-${size.height}`;scratch.set(key,{key,...size,format:'rgba16float'});
      }
    }
    let targets:ReturnType<GpuIntermediateTargets['prepare']>;
    try {targets=this.targets.prepare([...surfaces.flatMap((surface,index)=>surface?[{key:`upload-${index}`,...surface}]:[]),...scratch.values()]);}
    catch(error){
      // A failed resize may retire target textures. Drop upload identities so a
      // later retry never reuses a canvas entry pointing at a destroyed texture.
      for(const entry of this.copies)if(entry){entry.canvas.width=1;entry.canvas.height=1;}
      this.copies=[];this.maskCopies.clear();throw error;
    }
    for(const index of this.maskCopies.keys())if(!layers[index]?.captionMask)this.maskCopies.delete(index);
    pruneGpuCopies(this.copies,surfaces,entry=>{entry.canvas.width=1;entry.canvas.height=1;});
    const gradeBuffers=this.gradeTables.prepare(layers.map(layer=>layer.lut?null:layer.grade),layers.map(layer=>layer.glow?.strength??0));
    let bufferCount=0;
    const offsets=plans.map((plan,index)=>{const offset=bufferCount;bufferCount+=(plan?4+plan.reductions.length:1)+(groups[index]?(postPlans[index]?5+postPlans[index]!.reductions.length:1):0)+subjectPasses[index]+(layers[index].blend&&layers[index].blend!=='normal'?1:0);return offset;});
    const presentationBuffer=bufferCount;if(hasBlend)bufferCount++;
    while(this.buffers.length>bufferCount)this.buffers.pop()!.destroy();
    while(this.buffers.length<bufferCount)this.buffers.push(this.device.createBuffer({size:GPU_DRAW_UNIFORM_BYTES,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));
    const encoder=this.device.createCommandEncoder();
    const presentation=this.context.getCurrentTexture();
    const screen=(hasBlend?targets.get('blend-scene')!.texture:presentation).createView();
    const screenPass=(loadOp:GPULoadOp)=>encoder.beginRenderPass({colorAttachments:[{view:screen,loadOp,storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
    let pass=screenPass('clear');
    const bind=(pipeline:GPURenderPipeline,buffer:GPUBuffer,picture:GPUExternalTexture|GPUTextureView,mask?:GPUTexture,grade:GPUBuffer=this.gradeTables.identity,outline?:GPUTexture,glow?:GPUTexture,lut?:GPUTexture)=>this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
      {binding:0,resource:{buffer}},{binding:1,resource:this.sampler},{binding:2,resource:picture},{binding:3,resource:(mask??this.white).createView()},{binding:4,resource:{buffer:grade}},{binding:5,resource:(outline??this.white).createView()},{binding:6,resource:(glow??this.white).createView()},{binding:7,resource:(lut??this.emptyLut).createView()}]});

    layers.forEach((initialLayer,index)=>{
      let layer=initialLayer;
      if(layer.captionMask){
        const mask=targets.get(`caption-mask-${index}`)!.texture,canvas=layer.captionMask.canvas;
        const previous=this.maskCopies.get(index);
        if(previous?.canvas!==canvas||previous.texture!==mask){
          this.device.queue.copyExternalImageToTexture({source:canvas},{texture:mask,premultipliedAlpha:true},[canvas.width,canvas.height]);
          this.maskCopies.set(index,{canvas,texture:mask});
        }
        layer={...layer,mask};
      }
      // Normalize alpha and padded decoder surfaces through browser visible-frame conversion.
      // Direct external textures differed at coded padding and transparent color edges.
      // Filter copied surfaces in premultiplied space, then unpremultiply the
      // sampled color for effects. Straight-alpha filtering distorts scaled glyph edges.
      const video=layer.frame instanceof VideoFrame?layer.frame:null;
      let copy=surfaces[index]!==null;
      let pipeline=copy?this.copyPipeline:this.pipeline;
      let picture: GPUExternalTexture | GPUTextureView;
      if(copy){
        const width=video?video.displayWidth:(layer.frame as OffscreenCanvas).width,height=video?video.displayHeight:(layer.frame as OffscreenCanvas).height;
        let entry=this.copies[index];
        if(!entry || entry.width!==width || entry.height!==height){entry={width,height,canvas:new OffscreenCanvas(width,height),texture:targets.get(`upload-${index}`)!.texture};this.copies[index]=entry;}
        if(entry.source!==layer.frame || (!video && (layer.textureVersion===undefined || entry.version!==layer.textureVersion))){
          const ctx=entry.canvas.getContext('2d')!;ctx.clearRect(0,0,width,height);ctx.drawImage(layer.frame,0,0,width,height);
          this.device.queue.copyExternalImageToTexture({source:entry.canvas},{texture:entry.texture,colorSpace:'srgb',premultipliedAlpha:true},[width,height]);
          entry.source=layer.frame;entry.version=layer.textureVersion;
        }
        picture=entry.texture.createView();
      }else picture=this.device.importExternalTexture({source:video!,colorSpace:'srgb'});
      const outline=outlines[index];
      const plan=plans[index],base=offsets[index]+subjectPasses[index],buffer=this.buffers[base];
      let primary=!!video&&video.colorSpace.primaries==='smpte170m';
      if(subjects[index]){
        pass.end();
        let source=targets.get('outline-source')!.texture;
        const a=outline?targets.get('outline-a')!.texture:undefined,b=outline?targets.get('outline-b')!.texture:undefined;
        let nextBuffer=offsets[index];
        const raw={...layer,transform:layer.transform.map((v,i)=>i%4===0?v*canvas.width/outlineWidth:i%4===1?v*canvas.height/outlineHeight:v),group:undefined,opacity:1,clip:undefined,window:undefined,featherMask:undefined,lineMask:undefined,recolor:outline?undefined:layer.recolor,grade:null,lut:undefined,flash:0,outline:undefined,outlineAlpha:undefined,glowAlpha:undefined};
        const rawBuffer=this.buffers[nextBuffer++];this.device.queue.writeBuffer(rawBuffer,0,uniforms(raw,copy,primary));
        const rawPipeline=copy?this.actorCopyPipeline:this.actorPipeline;
        const rawPass=encoder.beginRenderPass({colorAttachments:[{view:source.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
        rawPass.setPipeline(rawPipeline);rawPass.setBindGroup(0,bind(rawPipeline,rawBuffer,picture,layer.mask));rawPass.draw(6);rawPass.end();
        let alpha:GPUTexture=source;
        const filter=(pipeline:GPURenderPipeline,data:Float32Array<ArrayBuffer>)=>{
          const output=(alpha===a?b:a)!,filterBuffer=this.buffers[nextBuffer++];this.device.queue.writeBuffer(filterBuffer,0,data);
          const filterPass=encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
          filterPass.setPipeline(pipeline);filterPass.setBindGroup(0,this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:filterBuffer}},{binding:1,resource:alpha.createView()}]}));filterPass.draw(3);filterPass.end();alpha=output;
        };
        if(outline){for(const axis of [0,1])outline.steps.forEach((radius,step)=>filter(alpha===source?this.morphologySourcePipeline:this.morphologyPipeline,new Float32Array([axis===0?1:0,axis===1?1:0,radius,step>0?1:0])));
        filter(alpha===source?this.alphaBlurSourcePipeline:this.alphaBlurPipeline,gaussianBlurUniforms(outline.softness,false));filter(this.alphaBlurPipeline,gaussianBlurUniforms(outline.softness,true));}
        layer={...layer,transform:rectToGpuTransform({x:-outlinePadX,y:-outlinePadY,width:outlineWidth,height:outlineHeight},canvas.width,canvas.height)!,chroma:null,mask:undefined,outlineAlpha:outline?alpha:undefined};
        const glow=glows[index];
        if(glow){
          if(outline){
            const merged=targets.get('subject-source')!.texture,mergeBuffer=this.buffers[nextBuffer++];
            this.device.queue.writeBuffer(mergeBuffer,0,uniforms({...layer,transform:rectToGpuTransform({x:0,y:0,width:1,height:1},1,1)!,group:undefined,opacity:1,clip:undefined,window:undefined,featherMask:undefined,lineMask:undefined,grade:null,lut:undefined,flash:0},true,false));
            const merge=encoder.beginRenderPass({colorAttachments:[{view:merged.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
            merge.setPipeline(this.actorCopyPipeline);merge.setBindGroup(0,bind(this.actorCopyPipeline,mergeBuffer,source.createView(),undefined,undefined,alpha));merge.draw(6);merge.end();source=merged;
          }
          const ga=targets.get(`glow-${glow.width}-${glow.height}-a`)!.texture,gb=targets.get(`glow-${glow.width}-${glow.height}-b`)!.texture;
          let halo=source;
          for(let step=0;step<glow.reductions.length;step++){
            const size=glow.reductions[step],output=step===glow.reductions.length-1?ga:targets.get(`glow-reduce-${size.width}-${size.height}`)!.texture,reductionBuffer=this.buffers[nextBuffer++];
            this.device.queue.writeBuffer(reductionBuffer,0,uniforms({frame:layer.frame,transform:rectToGpuTransform({x:(size.width-(size.drawWidth??size.width))/2,y:(size.height-(size.drawHeight??size.height))/2,width:size.drawWidth??size.width,height:size.drawHeight??size.height},size.width,size.height)!,opacity:1},true,false));
            const reduction=encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
            reduction.setPipeline(this.isolatedCopyPipeline);reduction.setBindGroup(0,bind(this.isolatedCopyPipeline,reductionBuffer,halo.createView()));reduction.draw(6);reduction.end();halo=output;
          }
          for(const [input,output,sigma,vertical]of [[halo,gb,glow.sigmaX,false],[gb,ga,glow.sigmaY,true]] as const){
            const haloBuffer=this.buffers[nextBuffer++];this.device.queue.writeBuffer(haloBuffer,0,gaussianBlurUniforms(sigma,vertical));
            const haloPass=encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
            haloPass.setPipeline(this.blurPipeline);haloPass.setBindGroup(0,this.device.createBindGroup({layout:this.blurPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:haloBuffer}},{binding:1,resource:input.createView()}]}));haloPass.draw(3);haloPass.end();
          }
          layer={...layer,outline:undefined,outlineAlpha:undefined,recolor:undefined,glowAlpha:ga,glowUvScale:[glow.uvScaleX??1,glow.uvScaleY??1]};
        }
        picture=source.createView();copy=true;primary=false;pipeline=this.copyPipeline;pass=screenPass('load');
      }
      const group=groups[index],groupTarget=group?targets.get('animated-actor')!.texture:undefined;
      const finishGroup=(bufferIndex:number)=>{
        const post=postPlans[index];
        let picture=groupTarget!,transform=rectToGpuTransform({x:0,y:0,width:canvas.width,height:canvas.height},canvas.width,canvas.height)!;
        if(post){
          let next=bufferIndex;
          const a=targets.get(`post-blur-${post.width}-${post.height}-a`)!.texture,b=targets.get(`post-blur-${post.width}-${post.height}-b`)!.texture;
          let input=groupTarget!;
          post.reductions.forEach(size=>{
            const output=targets.get(size.key)!.texture;
            const buffer=this.buffers[next++];this.device.queue.writeBuffer(buffer,0,new Float32Array([size.inverseX,size.inverseY,size.sampleX,size.sampleY]));
            const reduce=encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
            reduce.setPipeline(this.postRescalePipeline);reduce.setBindGroup(0,this.device.createBindGroup({layout:this.postRescalePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}},{binding:1,resource:input.createView()}]}));reduce.draw(3);reduce.end();input=output;
          });
          const paddingBuffer=this.buffers[next++];this.device.queue.writeBuffer(paddingBuffer,0,new Float32Array([post.padX,post.padY,0,0]));
          const padded=encoder.beginRenderPass({colorAttachments:[{view:a.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
          padded.setPipeline(this.paddingPipeline);padded.setBindGroup(0,this.device.createBindGroup({layout:this.paddingPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:paddingBuffer}},{binding:1,resource:input.createView()}]}));padded.draw(3);padded.end();
          for(const [input,output,sigma,vertical] of [[a,b,post.sigmaX,false],[b,a,post.sigmaY,true]] as const){
            const buffer=this.buffers[next++];this.device.queue.writeBuffer(buffer,0,postBlurUniforms(sigma,vertical));
            const blur=encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
            blur.setPipeline(this.postBlurPipeline);blur.setBindGroup(0,this.device.createBindGroup({layout:this.postBlurPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}},{binding:1,resource:input.createView()},{binding:2,resource:this.sampler}]}));blur.draw(3);blur.end();
          }
          // The native filter re-expands to RGBA8 before its CSS transform and
          // opacity. Fusing upscale and composition loses that alpha/color
          // boundary and changes subsequent source-over blending.
          const upscaled=targets.get(`post-upscale-${post.outputWidth}-${post.outputHeight}`)!.texture;
          const upscaleBuffer=this.buffers[next++];
          this.device.queue.writeBuffer(upscaleBuffer,0,uniforms({frame:layer.frame,
            transform:rectToGpuTransform({x:post.outputPadX-post.sourcePadX,y:post.outputPadY-post.sourcePadY,width:post.extentWidth,height:post.extentHeight},post.outputWidth,post.outputHeight)!,opacity:1},true,false));
          const upscale=encoder.beginRenderPass({colorAttachments:[{view:upscaled.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
          upscale.setPipeline(this.postCopyPipeline);upscale.setBindGroup(0,bind(this.postCopyPipeline,upscaleBuffer,a.createView()));upscale.draw(6);upscale.end();
          picture=upscaled;transform=rectToGpuTransform({x:-post.outputPadX,y:-post.outputPadY,width:post.outputWidth,height:post.outputHeight},canvas.width,canvas.height)!;bufferIndex=next;
        }
        const groupBuffer=this.buffers[bufferIndex];
        // Post-filter surfaces already contain transparent padding. Apply edge
        // coverage only to the unpadded, transformed actor rectangle.
        this.device.queue.writeBuffer(groupBuffer,0,uniforms({frame:layer.frame,transform,group:layer.group,opacity:layer.groupOpacity??1,edgeAa:!layer.postBlur&&gpuGroupParameters(layer.group)[3]!==0?[1/(canvas.width*layer.group!.scale),1/(canvas.height*layer.group!.scale)]:undefined},true,false));
        if(layer.blend&&layer.blend!=='normal'){
          const source=targets.get('blend-actor')!.texture,backdrop=targets.get('blend-backdrop')!.texture;
          const actor=encoder.beginRenderPass({colorAttachments:[{view:source.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
          actor.setPipeline(this.actorCopyPipeline);actor.setBindGroup(0,bind(this.actorCopyPipeline,groupBuffer,picture.createView()));actor.draw(6);actor.end();
          encoder.copyTextureToTexture({texture:targets.get('blend-scene')!.texture},{texture:backdrop},[canvas.width,canvas.height]);
          const blendBuffer=this.buffers[bufferIndex+1];this.device.queue.writeBuffer(blendBuffer,0,new Float32Array([layer.blend==='difference'?1:2,0,0,0]));
          pass=screenPass('load');pass.setPipeline(this.blendPipeline);pass.setBindGroup(0,this.device.createBindGroup({layout:this.blendPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:blendBuffer}},{binding:1,resource:backdrop.createView()},{binding:2,resource:source.createView()}]}));pass.draw(3);
        }else{pass=screenPass('load');pass.setPipeline(this.copyPipeline);pass.setBindGroup(0,bind(this.copyPipeline,groupBuffer,picture.createView()));pass.draw(6);}
      };
      if(!plan&&group){
        pass.end();
        this.device.queue.writeBuffer(buffer,0,uniforms({...layer,group:undefined},copy,primary));
        const actorPipeline=copy?this.actorCopyPipeline:this.actorPipeline;
        const actor=encoder.beginRenderPass({colorAttachments:[{view:groupTarget!.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
        actor.setPipeline(actorPipeline);actor.setBindGroup(0,bind(actorPipeline,buffer,picture,layer.mask,gradeBuffers[index],layer.outlineAlpha,layer.glowAlpha,layer.lut?.texture));actor.draw(6);actor.end();
        finishGroup(base+1);return;
      }
      if(!plan){
        this.device.queue.writeBuffer(buffer,0,uniforms(layer,copy,primary));
        pass.setPipeline(pipeline);pass.setBindGroup(0,bind(pipeline,buffer,picture,layer.mask,gradeBuffers[index],layer.outlineAlpha,layer.glowAlpha,layer.lut?.texture));pass.draw(6);
        return;
      }
      pass.end();
      const a=targets.get(`blur-${plan.width}-${plan.height}-a`)!.texture;
      const b=targets.get(`blur-${plan.width}-${plan.height}-b`)!.texture;
      const transform=layer.transform.map((v,i)=>i%4===0?v*plan.innerScaleX:i%4===1?v*plan.innerScaleY:v);
      const inner={...layer,group:undefined,transform,opacity:1,clip:undefined,window:undefined,featherMask:undefined,lineMask:undefined};
      this.device.queue.writeBuffer(buffer,0,uniforms(inner,copy,primary));
      const isolated=copy?this.isolatedCopyPipeline:this.isolatedPipeline;
      let reduced=plan.reductions.length?targets.get(`blur-reduce-${plan.extentWidth}-${plan.extentHeight}`)!.texture:a;
      const actor=encoder.beginRenderPass({colorAttachments:[{view:reduced.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
      actor.setPipeline(isolated);actor.setBindGroup(0,bind(isolated,buffer,picture,layer.mask,gradeBuffers[index],layer.outlineAlpha,layer.glowAlpha,layer.lut?.texture));actor.draw(6);actor.end();
      const identity=rectToGpuTransform({x:0,y:0,width:1,height:1},1,1)!;
      plan.reductions.forEach((size,step)=>{
        const output=step===plan.reductions.length-1?a:targets.get(`blur-reduce-${size.width}-${size.height}`)!.texture;
        const reductionBuffer=this.buffers[base+1+step];
        this.device.queue.writeBuffer(reductionBuffer,0,uniforms({frame:layer.frame,transform:identity,opacity:1},true,false));
        const reduction=encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
        reduction.setPipeline(this.isolatedCopyPipeline);reduction.setBindGroup(0,bind(this.isolatedCopyPipeline,reductionBuffer,reduced.createView()));reduction.draw(6);reduction.end();
        reduced=output;
      });
      for(const [axis,input,output,sigma] of [[0,a,b,plan.sigmaX],[1,b,a,plan.sigmaY]] as const){
        const blurBuffer=this.buffers[base+plan.reductions.length+1+axis];
        this.device.queue.writeBuffer(blurBuffer,0,gaussianBlurUniforms(sigma,axis===1));
        const blur=encoder.beginRenderPass({colorAttachments:[{view:output.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
        blur.setPipeline(this.blurPipeline);blur.setBindGroup(0,this.device.createBindGroup({layout:this.blurPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:blurBuffer}},{binding:1,resource:input.createView()}]}));blur.draw(3);blur.end();
      }
      const outer:GpuVideoDraw={frame:layer.frame,transform:rectToGpuTransform({x:-plan.padX,y:-plan.padY,width:plan.extentWidth,height:plan.extentHeight},canvas.width,canvas.height)!,opacity:layer.opacity,clip:layer.clip,window:layer.window,featherMask:layer.featherMask,lineMask:layer.lineMask};
      const outerBuffer=this.buffers[base+plan.reductions.length+3];this.device.queue.writeBuffer(outerBuffer,0,uniforms(outer,true,false));
      if(group){
        const actor=encoder.beginRenderPass({colorAttachments:[{view:groupTarget!.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
        actor.setPipeline(this.actorCopyPipeline);actor.setBindGroup(0,bind(this.actorCopyPipeline,outerBuffer,a.createView()));actor.draw(6);actor.end();
        finishGroup(base+plan.reductions.length+4);
      }else{pass=screenPass('load');pass.setPipeline(this.copyPipeline);pass.setBindGroup(0,bind(this.copyPipeline,outerBuffer,a.createView()));pass.draw(6);}
    });
    pass.end();
    if(hasBlend){
      const buffer=this.buffers[presentationBuffer];this.device.queue.writeBuffer(buffer,0,uniforms({frame:layers[0].frame,transform:rectToGpuTransform({x:0,y:0,width:canvas.width,height:canvas.height},canvas.width,canvas.height)!,opacity:1},true,false));
      const present=encoder.beginRenderPass({colorAttachments:[{view:presentation.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
      present.setPipeline(this.copyPipeline);present.setBindGroup(0,bind(this.copyPipeline,buffer,targets.get('blend-scene')!.texture.createView()));present.draw(6);present.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }
  /** Owned payload bytes, excluding decoder/driver overhead and the swapchain. */
  get bytes(){return this.targets.bytes+this.gradeTables.bytes+this.copies.reduce((sum,entry)=>sum+(entry?entry.width*entry.height*4:0),0)+this.buffers.length*GPU_DRAW_UNIFORM_BYTES+(this.closed?0:5);}
  close(){if(this.closed)return;this.closed=true;this.white.destroy();this.emptyLut.destroy();for(const buffer of this.buffers)buffer.destroy();this.buffers=[];this.maskCopies.clear();this.targets.close();this.gradeTables.close();for(const entry of this.copies)if(entry){entry.canvas.width=1;entry.canvas.height=1;}this.copies=[];}
}
