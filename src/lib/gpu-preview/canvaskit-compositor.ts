import {drawCanvasKitScaledImage,makeCanvasKitScaledSurface,validCanvasKitPixelScale} from './canvaskit-pixel-scale';
import {canvasKitCaptionFillPlan,canvasKitAssembleCaptionFill} from './canvaskit-caption-fill';
import {withCanvasKitViewportMask} from './canvaskit-viewport-mask';
import {canvasKitBlendMode} from './canvaskit-blend';
import {canvasKitComposeSceneBackdrop} from './canvaskit-backdrop';
import type {CanvasKit,Canvas,Surface,GrDirectContext,WebGLContextHandle,ColorFilter,TextureSource} from 'canvaskit-wasm';
import type {GpuFrameCompositor} from './frame-compositor';
import type {GpuVideoDraw} from './compositor';
import {canvasKitSourceMatrix} from './canvaskit-geometry';
import {gpuGroupParameters} from './geometry';
import {SMPTE_C_TO_SRGB} from '../frame-runtime/source-primaries';
import {canvasKitActorFilter,canvasKitActorPlan} from './canvaskit-actor-filter';
import {gpuMediaShadowPad} from './media-shadow';
import {CanvasKitColorShaderCache,validateCanvasKitGradientMap} from './canvaskit-grade';
import {canvasKitDrawGlitch,validateCanvasKitGlitch} from './canvaskit-glitch';
import {CanvasKitMasks,canvasKitMaskPlan} from './canvaskit-masks';
import {CanvasKitRadialEffects} from './canvaskit-radial-effects';
import {makeCanvasKitGridMatteImage,applyCanvasKitGridMatte,drawCanvasKitGridLines} from './canvaskit-grid-matte';
import {applyCanvasKitSubjectWindow} from './canvaskit-subject-window';
import {canvasKitPageTurnPlan,canvasKitDrawPageTurn} from './canvaskit-page-turn';
import {canvasKitProjectiveBoundaryPlan,canvasKitDrawProjectiveBoundary} from './canvaskit-projective-boundary';
import {canvasKitBoundaryPlan,canvasKitClipBoundary,canvasKitDrawBoundaryWash} from './canvaskit-boundary';
import {canvasKitTransitionViewport,validateCanvasKitTransitionViewport} from './canvaskit-transition-viewport';

export const CANVASKIT_EXPORT_BUDGET_BYTES=256*1024*1024;

/** Experimental drawing adapter. Decode, clocks and frame leases remain in the
 * existing runtime. A private GPU surface prevents partial packets reaching the
 * visible canvas. The additional canvas copy is intentional and must be measured.
 */
export class CanvasKitCompositor implements GpuFrameCompositor {
 readonly ready=Promise.resolve();
 readonly cpuLuts=true;
 private readonly stage:OffscreenCanvas;
 private readonly surface:Surface;
 private readonly graphics:GrDirectContext;
 private readonly contextHandle:WebGLContextHandle;
 private readonly output:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
 private readonly masks:CanvasKitMasks;
 private readonly radialEffects:CanvasKitRadialEffects;
 private readonly colors:CanvasKitColorShaderCache;
 private readonly colorBudgetBytes:number;
 private closed=false;
 private lost=false;
 private activeBytes=0;
 private readonly baseBytes:number;
 private readonly cacheBudgetBytes:number;
 private readonly scale:number;
 private readonly onLost=()=>{if(this.closed||this.lost)return;this.lost=true;this.onFailure?.(Error('CanvasKit GPU context lost'));};
 constructor(private readonly kit:CanvasKit,private readonly canvas:HTMLCanvasElement|OffscreenCanvas,
  private readonly budgetBytes=128*1024*1024,private readonly onFailure?:(error:Error)=>void,pixelScale=1){
  const {width,height}=canvas;
  // Supersampled export: the canvas holds pixelScale device pixels per logical
  // composition pixel. Scenes, plans and transforms stay in logical units.
  this.scale=validCanvasKitPixelScale(pixelScale);
  if(![width/this.scale,height/this.scale].every(Number.isSafeInteger))throw Error('CanvasKit canvas is not a whole multiple of its pixel scale');
  if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isSafeInteger(budgetBytes)||budgetBytes<=0)
   throw Error('Invalid CanvasKit surface budget');
  this.baseBytes=width*height*8;
  if(this.baseBytes>budgetBytes)throw Error('CanvasKit surface exceeds budget');
  const output=canvas.getContext('2d',{alpha:false});if(!output||!('drawImage' in output))throw Error('CanvasKit output unavailable');
  this.output=output;this.stage=new OffscreenCanvas(width,height);
  const handle=kit.GetWebGLContext(this.stage,{majorVersion:2});
  if(!handle)throw Error('CanvasKit WebGL2 unavailable');
  const graphics=kit.MakeWebGLContext(handle);
  if(!graphics){kit.deleteContext(handle);throw Error('CanvasKit GPU context unavailable');}
  this.cacheBudgetBytes=Math.min(32*1024*1024,Math.floor((budgetBytes-this.baseBytes)/2));
  graphics.setResourceCacheLimitBytes(this.cacheBudgetBytes);
  const surface=kit.MakeOnScreenGLSurface(graphics,width,height,kit.ColorSpace.SRGB);
  if(!surface){graphics.releaseResourcesAndAbandonContext();graphics.delete();kit.deleteContext(handle);throw Error('CanvasKit GPU surface unavailable');}
  this.masks=new CanvasKitMasks(kit);this.radialEffects=new CanvasKitRadialEffects(kit);
  this.colorBudgetBytes=Math.max(1,Math.min(4*1024*1024,Math.floor((budgetBytes-this.baseBytes)/8)));
  this.colors=new CanvasKitColorShaderCache(kit,this.colorBudgetBytes);
  this.contextHandle=handle;this.graphics=graphics;this.surface=surface;this.stage.addEventListener('webglcontextlost',this.onLost);
 }
 get bytes(){
  if(this.closed)return 0;
  // CanvasKit 0.42's JS wrapper omits the return despite declaring number.
  // Reserve the configured cache when telemetry is unavailable; never emit NaN.
  const usage=this.graphics.getResourceCacheUsageBytes();
  return this.baseBytes+this.activeBytes+this.colors.bytes+(Number.isFinite(usage)&&usage>=0?usage:this.cacheBudgetBytes);
 }
 draw(layers:readonly GpuVideoDraw[]){
  if(this.closed||this.lost)throw Error('CanvasKit compositor unavailable');
  const k=this.kit,s=this.scale,s2=s*s,w=this.canvas.width/s,h=this.canvas.height/s;
  if(this.canvas.width!==this.stage.width||this.canvas.height!==this.stage.height)throw Error('CanvasKit output resized; recreate session');
  // Validate every actor before allocating or changing even the private surface.
  const plans=layers.map(input=>{
   // A subject window isolates the whole actor; its blend applies when the windowed result composites.
   const layer=input.subjectWindow&&input.blend&&input.blend!=='normal'?{...input,blend:'normal' as const}:input;
   for(const key of ['outlineAlpha','glowUvScale','glowAlpha','edgeAa'] as const)
    if(layer[key]!=null)throw Error(`CanvasKit effect not implemented: ${key}`);
   canvasKitActorPlan(layer);
   if(layer.radial&&(layer.radial.width!==w||layer.radial.height!==h||!Number.isFinite(layer.radial.edgeBlurSigma)||layer.radial.edgeBlurSigma<0))throw Error('Invalid CanvasKit radial dimensions');
   if(layer.radial&&layer.radial.edgeBlurSigma>0){
    if(!['actor','scene'].includes(layer.radialBackdrop??''))throw Error('CanvasKit edge blur requires an explicit backdrop scope');
    if(layer.radialBackdrop==='scene'&&(layer.gridMatte||layer.subjectWindow||layer.opacity!==1||(layer.groupOpacity??1)!==1||layer.postBlur||layer.blend&&layer.blend!=='normal'))throw Error('CanvasKit scene backdrop combination requires isolated wrapper evaluation');
   }
   if(layer.gridMatte&&layer.gridMatte.rgba.length!==layer.gridMatte.plan.columns*layer.gridMatte.plan.rows*4)throw Error('Invalid CanvasKit grid packet');
   if(layer.chroma&&(!/^#[0-9a-f]{6}$/i.test(layer.chroma.color)||![layer.chroma.tolerance,layer.chroma.softness,layer.chroma.spill].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid CanvasKit chroma');
   if(layer.grade&&(!Object.values(layer.grade).flat().every(v=>typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))||layer.grade.toneTable.length!==65||layer.grade.masterCurveTable.length!==17))throw Error('Invalid CanvasKit grade');
   if(layer.gradientMap)validateCanvasKitGradientMap(layer.gradientMap);
   if(layer.glitch)validateCanvasKitGlitch(layer.glitch,w,h);
   if(layer.lut&&(!layer.grade||!layer.lut.rgba||layer.lut.rgba.length!==layer.lut.size**3*4||!Number.isFinite(layer.lut.intensity)||layer.lut.intensity<0||layer.lut.intensity>1))throw Error('CanvasKit LUT requires a complete portable grade resource');
   canvasKitBlendMode(this.kit,layer.blend);
    if(layer.shadow&&(![layer.shadow.dx,layer.shadow.dy,layer.shadow.sigma,layer.shadow.opacity].every(Number.isFinite)||layer.shadow.sigma<0||layer.shadow.opacity<0||layer.shadow.opacity>1))throw Error('Invalid CanvasKit media shadow');
   if(![layer.opacity,layer.groupOpacity??1].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid CanvasKit opacity');
   if(layer.clip&&(layer.clip.length!==4||!layer.clip.every(Number.isFinite)))throw Error('Invalid CanvasKit clip');
   validateCanvasKitTransitionViewport(layer.transitionViewport);
   for(const blur of [layer.blur,layer.postBlur])if(blur&&![blur.x,blur.y].every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid CanvasKit blur');
   gpuGroupParameters(layer.group);
   if(layer.wipeRight!=null&&!(Number.isFinite(layer.wipeRight)&&layer.wipeRight>0&&layer.wipeRight<=1))throw Error('Invalid CanvasKit media wipe');
   if(layer.group&&(layer.group.width!==w||layer.group.height!==h))throw Error('CanvasKit group dimensions differ from output');
   const video=typeof VideoFrame!=='undefined'&&layer.frame instanceof VideoFrame?layer.frame:null;
   const rawWidth=video?video.displayWidth:(layer.frame as OffscreenCanvas).width,rawHeight=video?video.displayHeight:(layer.frame as OffscreenCanvas).height;
   const fill=layer.captionFill?canvasKitCaptionFillPlan(layer.captionFill):undefined;
   const sw=fill?.width??rawWidth,sh=fill?.height??rawHeight;
   // Colour stage: grade/LUT, color map and glitch share one padded actor intermediate.
   const colorStage=!!(layer.grade||layer.lut||layer.gradientMap||layer.glitch);
   const pad=colorStage?Math.ceil((layer.outline?.radius??0)+3*(layer.outline?.softness??0)+3*(layer.glow?.radius??0))+gpuMediaShadowPad(layer.shadow):0;
   const actorBytes=colorStage?(w+2*pad)*(h+2*pad)*8*s2*(layer.glitch?2:1):0;
   if(layer.subjectWindow){const sw=layer.subjectWindow;if(sw.alpha&&sw.alpha.length!==sw.plan.gridWidth*sw.plan.gridHeight)throw Error('Invalid CanvasKit subject window packet');}
   return {layer,windowBlend:input.blend,video,sw,sh,rawWidth,rawHeight,fill,pad,actorBytes,captionPlane:layer.captionPlane?canvasKitSourceMatrix(layer.captionPlane,w,h,w,h):undefined,pageTurn:layer.boundaryPageTurn?canvasKitPageTurnPlan(layer.boundaryPageTurn):undefined,projective:layer.boundaryProjective?canvasKitProjectiveBoundaryPlan(layer.boundaryProjective,w,h):undefined,boundary:canvasKitBoundaryPlan(layer,w,h),mask:canvasKitMaskPlan(layer,sw,sh),matrix:canvasKitSourceMatrix(layer.transform,sw,sh,w,h)};
  });
  // Count transient source canvas + uploaded image; driver overhead is separate.
  const layerBytes=plans.map(p=>(p.fill?.bytes??0)+(p.layer.viewportMask?(p.layer.viewportMask.width*p.layer.viewportMask.height*4+w*h*4*s2):0)+((p.pageTurn?.bytes??0)+(p.projective?.bytes??0))*s2+(p.layer.radial?.edgeBlurSigma?w*h*s2*(p.layer.radialBackdrop==='scene'?24:12):0)+(p.layer.gridMatte?p.layer.gridMatte.rgba.byteLength+w*h*4*s2:0)+(p.layer.subjectWindow?(p.layer.subjectWindow.alpha?.byteLength??0)*5+w*h*4*s2:0)+p.actorBytes+p.rawWidth*p.rawHeight*(p.layer.chroma?16:8)+(p.layer.captionMask?p.layer.captionMask.canvas.width*p.layer.captionMask.canvas.height*4:0));
  const sourceBytes=Math.max(0,...layerBytes);
  const availableCache=this.budgetBytes-this.baseBytes-sourceBytes-this.colorBudgetBytes;
  if(availableCache<0)throw Error(`CanvasKit layer exceeds budget: needs ${Math.ceil((this.baseBytes+sourceBytes+this.colorBudgetBytes)/1048576)} MB, limit ${Math.floor(this.budgetBytes/1048576)} MB`);
  // Source uploads are released after each actor. Reserve only the largest live
  // actor, and let Skia surrender reusable cache before rejecting valid media.
  this.graphics.setResourceCacheLimitBytes(Math.floor(Math.min(this.cacheBudgetBytes,availableCache)));
  const owned:Array<{delete():void}>=[],copies:OffscreenCanvas[]=[];
  const c=this.surface.getCanvas(),initial=c.getSaveCount();this.activeBytes=sourceBytes;
  try{
   c.clear(k.BLACK);
   if(s!==1){c.save();c.scale(s,s);}
   plans.forEach((p,i)=>{
    const layerOwnedStart=owned.length,layerCopiesStart=copies.length;
    try{
    const copy=new OffscreenCanvas(p.rawWidth,p.rawHeight);copies.push(copy);
    const ctx=copy.getContext('2d');if(!ctx)throw Error('CanvasKit source copy unavailable');
    ctx.drawImage(p.layer.frame,0,0,p.rawWidth,p.rawHeight);
    let sourceImage=this.surface.makeImageFromTextureSource(copy as unknown as TextureSource);if(!sourceImage)throw Error('CanvasKit source upload failed');owned.push(sourceImage);
    if(p.fill){const mask=this.surface.makeImageFromTextureSource(p.layer.captionFill!.mask as unknown as TextureSource);if(!mask)throw Error('CanvasKit local caption mask upload failed');owned.push(mask);sourceImage=canvasKitAssembleCaptionFill(k,this.surface,sourceImage,mask,p.fill);owned.push(sourceImage);}
    const caption=p.layer.captionMask?this.surface.makeImageFromTextureSource(p.layer.captionMask.canvas as unknown as TextureSource):null;
    if(p.layer.captionMask&&!caption)throw Error('CanvasKit caption upload failed');if(caption)owned.push(caption);
    const viewportMask=p.layer.viewportMask?this.surface.makeImageFromTextureSource(p.layer.viewportMask as unknown as TextureSource):null;
    if(p.layer.viewportMask&&!viewportMask)throw Error('CanvasKit viewport mask upload failed');if(viewportMask)owned.push(viewportMask);
    const grid=p.layer.gridMatte?makeCanvasKitGridMatteImage(k,p.layer.gridMatte.plan,p.layer.gridMatte.rgba):null;if(grid)owned.push(grid);
    const actorSaveCount=c.getSaveCount();
    const drawActor=(mainCanvas:Canvas,pageContext?:{matrix:number[];isolated:boolean})=>{
    const actorOwnedStart=owned.length;try{
    const original=pageContext?.isolated?{...p.layer,radialBackdrop:'actor' as const}:p.layer;
    if(original.mediaSpiral?.hidden||original.outerSpiral?.hidden){if(original.gridMatte)drawCanvasKitGridLines(k,mainCanvas,original.gridMatte.plan);return;}
    const edge=original.radial&&original.radial.edgeBlurSigma>0;
    let previousScene:ReturnType<Surface['makeImageSnapshot']>|undefined;
    if(edge&&original.radialBackdrop==='scene'){this.surface.flush();previousScene=this.surface.makeImageSnapshot();owned.push(previousScene);}
    const backdropSurface=edge?makeCanvasKitScaledSurface(k,this.surface,w,h,s):null;
    if(edge&&!backdropSurface)throw Error('CanvasKit backdrop surface unavailable');
    if(backdropSurface)owned.push(backdropSurface);
    const c=backdropSurface?.getCanvas()??mainCanvas;
    if(backdropSurface)c.clear(k.TRANSPARENT);
    // Local CSS backdrop is sampled before the outer mask/opacity and parent
    // animation. Defer those operations until the edge sibling has been drawn.
    const layer=backdropSurface?{...original,group:undefined,mediaSpiral:undefined,opacity:1,groupOpacity:1,postBlur:undefined,clip:undefined,wipeRight:undefined}:original;
    const group=layer.group,paint=new k.Paint();owned.push(paint);
    paint.setAlphaf(layer.opacity*(layer.groupOpacity??1));
    paint.setBlendMode(layer.viewportMask?k.BlendMode.SrcOver:canvasKitBlendMode(k,layer.blend));
    if(layer.postBlur){const f=k.ImageFilter.MakeBlur(layer.postBlur.x,layer.postBlur.y,k.TileMode.Decal,null);if(!f)throw Error('CanvasKit blur allocation failed');owned.push(f);paint.setImageFilter(f);}
    if(layer.gridMatte&&!backdropSurface)c.saveLayer();
    // A projective boundary transforms the whole drawn actor, so its fixed viewport is
    // applied outside that transform; an edge-blur backdrop applies it when presented.
    c.save();if(!p.projective&&!backdropSurface)canvasKitTransitionViewport(k,c,layer.transitionViewport,layer.viewportMask?k.BlendMode.SrcOver:canvasKitBlendMode(k,layer.blend),!p.pageTurn);canvasKitClipBoundary(k,c,p.boundary);
    if(group){c.translate(w/2+group.translateX,h/2+group.translateY);c.rotate(group.rotateZDeg,0,0);c.scale(group.scale,group.scale);c.translate(-w/2,-h/2);}
    if(p.captionPlane)c.concat(p.captionPlane);
    // write_on: CSS clip-path on the transformed wrapper clips its filtered
    // result in the wrapper's own (group-local, output-sized) box.
    if(layer.wipeRight)canvasKitClipWipe(k,c,layer.wipeRight,w,h);
    c.saveLayer(paint);
    if(layer.mediaSpiral){c.save();c.concat([...layer.mediaSpiral.matrix]);}
    this.masks.clipWindow(c,p.mask);
    if(layer.clip)c.clipRect(k.LTRBRect(...layer.clip),k.ClipOp.Intersect,true);
    // Grade follows outline/recolor/flash/glow but precedes inner blur. The
    // intermediate has transparent padding so group motion can reveal halos.
    const grading=!!(layer.grade||layer.lut||layer.gradientMap||layer.glitch);
    const actorSurface=grading?makeCanvasKitScaledSurface(k,this.surface,w+2*p.pad,h+2*p.pad,s):null;
    if(grading&&!actorSurface)throw Error('CanvasKit graded actor surface unavailable');
    if(actorSurface)owned.push(actorSurface);
    const actor=actorSurface?.getCanvas()??c;
    if(actorSurface){actor.clear(k.TRANSPARENT);actor.save();actor.translate(p.pad,p.pad);}
    const effects=canvasKitActorFilter(k,grading?{...layer,blur:undefined}:layer);owned.push(effects);
    const effectPaint=new k.Paint();owned.push(effectPaint);effectPaint.setImageFilter(effects.filter);
    actor.saveLayer(effectPaint);
    // Standard's drop-shadow sits on the picture element itself, so the shadow is
    // inside outline/recolor/glow and grade, and under every outer mask.
    if(layer.shadow){const shadow=k.ImageFilter.MakeDropShadow(layer.shadow.dx,layer.shadow.dy,layer.shadow.sigma,layer.shadow.sigma,k.Color4f(0,0,0,layer.shadow.opacity),null);if(!shadow)throw Error('CanvasKit media shadow allocation failed');owned.push(shadow);
     const shadowPaint=new k.Paint();owned.push(shadowPaint);shadowPaint.setImageFilter(shadow);actor.saveLayer(shadowPaint);}
    actor.save();actor.concat(p.matrix);
    // Chrome antialiases a picture edge at a fractional rect (half coverage at x.5);
    // unantialiased Skia rect sampling snaps it to pixel centres instead.
    const sourcePaint=new k.Paint();owned.push(sourcePaint);sourcePaint.setAntiAlias(true);
    let sourceFilter:ColorFilter|null=null;
    if(p.video?.colorSpace.primaries==='smpte170m'&&!layer.chroma&&!layer.lut){
     const linear=k.ColorFilter.MakeSRGBToLinearGamma(),matrix=k.ColorFilter.MakeMatrix([...SMPTE_C_TO_SRGB.flatMap(row=>[...row,0,0]),0,0,0,1,0]),gamma=k.ColorFilter.MakeLinearToSRGBGamma();owned.push(linear,matrix,gamma);
     const inner=k.ColorFilter.MakeCompose(matrix,linear),filter=k.ColorFilter.MakeCompose(gamma,inner);owned.push(inner,filter);sourceFilter=filter;
    }
    // Review matte: CSS brightness(0) invert(1) on the keyed picture is white at its alpha.
    if(layer.matte){const matte=k.ColorFilter.MakeMatrix([0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0]);owned.push(matte);sourceFilter=matte;}
    sourcePaint.setColorFilter(sourceFilter);
    if(layer.chroma){
     // Key in source pixels before geometric interpolation, matching the
     // source-sized shared keyer rather than keying blended edge pixels.
     const keyedSurface=this.surface.makeSurface({width:p.sw,height:p.sh,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Premul,colorSpace:k.ColorSpace.SRGB});
     if(!keyedSurface)throw Error('CanvasKit keyed source surface unavailable');owned.push(keyedSurface);
     const source=sourceImage.makeShaderOptions(k.TileMode.Decal,k.TileMode.Decal,k.FilterMode.Nearest,k.MipmapMode.None);owned.push(source);
     const keyed=this.colors.chroma(source,layer.chroma);owned.push(keyed);
     const keyedPaint=new k.Paint();owned.push(keyedPaint);keyedPaint.setShader(keyed.shader);
     keyedSurface.getCanvas().clear(k.TRANSPARENT);keyedSurface.getCanvas().drawRect(k.LTRBRect(0,0,p.sw,p.sh),keyedPaint);keyedSurface.flush();
     const keyedImage=keyedSurface.makeImageSnapshot();owned.push(keyedImage);
     actor.drawImageRectOptions(keyedImage,k.LTRBRect(0,0,p.sw,p.sh),k.LTRBRect(0,0,p.sw,p.sh),k.FilterMode.Linear,k.MipmapMode.None,sourcePaint);
    }else actor.drawImageRectOptions(sourceImage,k.LTRBRect(0,0,p.sw,p.sh),k.LTRBRect(0,0,p.sw,p.sh),layer.pixelated?k.FilterMode.Nearest:k.FilterMode.Linear,k.MipmapMode.None,sourcePaint);
    if(caption)this.masks.applyCaption(actor,p.mask,caption!);
    if(layer.shadow)actor.restore();
    actor.restore();actor.restore();
    if(actorSurface){
     actor.restore();actorSurface.flush();
     const snapshot=actorSurface.makeImageSnapshot();owned.push(snapshot);
     const input=snapshot.makeShaderOptions(k.TileMode.Decal,k.TileMode.Decal,k.FilterMode.Nearest,k.MipmapMode.None,[1/s,0,-p.pad,0,1/s,-p.pad,0,0,1]);owned.push(input);
     // Colour order: grade or LUT, then color map; the glitch then displaces the coloured actor.
     const graded=layer.lut?this.colors.lut(input,layer.grade!,{size:layer.lut.size,domainMin:layer.lut.domainMin,domainMax:layer.lut.domainMax,rgba:layer.lut.rgba!},layer.lut.intensity):layer.grade?this.colors.grade(input,layer.grade):null;if(graded)owned.push(graded);
     const mapped=layer.gradientMap?this.colors.gradientMap(graded?.shader??input,layer.gradientMap):null;if(mapped)owned.push(mapped);
     const gradePaint=new k.Paint();owned.push(gradePaint);gradePaint.setShader(mapped?.shader??graded?.shader??input);
     const blurPaint=new k.Paint();owned.push(blurPaint);
     if(layer.blur&&(layer.blur.x||layer.blur.y)){const blur=k.ImageFilter.MakeBlur(layer.blur.x,layer.blur.y,k.TileMode.Decal,null);if(!blur)throw Error('CanvasKit grade blur unavailable');owned.push(blur);(layer.glitch?blurPaint:gradePaint).setImageFilter(blur);}
     if(layer.glitch){
      const colored=makeCanvasKitScaledSurface(k,this.surface,w+2*p.pad,h+2*p.pad,s);
      if(!colored)throw Error('CanvasKit glitch surface unavailable');owned.push(colored);
      const target=colored.getCanvas();target.clear(k.TRANSPARENT);target.save();target.translate(p.pad,p.pad);
      target.drawRect(k.LTRBRect(-p.pad,-p.pad,w+p.pad,h+p.pad),gradePaint);target.restore();colored.flush();
      const coloredImage=colored.makeImageSnapshot();owned.push(coloredImage);
      canvasKitDrawGlitch(k,c,coloredImage,layer.glitch,p.pad,s,blurPaint,owned);
     }else c.drawRect(k.LTRBRect(-p.pad,-p.pad,w+p.pad,h+p.pad),gradePaint);
    }
    if(layer.radial)this.radialEffects.applyIris(c,layer.radial);
    if(!backdropSurface)this.masks.applyFeather(c,p.mask);
    if(layer.mediaSpiral)c.restore();
    c.restore();c.restore();
    if(backdropSurface){
     backdropSurface.flush();const backdrop=backdropSurface.makeImageSnapshot();owned.push(backdrop);
     if(previousScene){
      const composed=canvasKitComposeSceneBackdrop(k,this.surface,previousScene,backdrop,original.group,pageContext?.matrix??p.projective?.matrix,original.mediaSpiral?.matrix,s);owned.push(composed);
      this.radialEffects.drawEdgeBlur(c,original.radial!,composed.image,s);
     }else this.radialEffects.drawEdgeBlur(c,original.radial!,backdrop,s);
     // The radial overlay is a sibling of window/iris, so only outer masks
     // constrain it; the iris must not be applied a second time here.
     if(original.clip){c.save();c.clipRect(k.LTRBRect(...original.clip),k.ClipOp.Difference,true);c.clear(k.TRANSPARENT);c.restore();}
     this.masks.applyFeather(c,p.mask);
    }
    if(layer.gridMatte){applyCanvasKitGridMatte(k,c,layer.gridMatte.plan,grid!);if(!backdropSurface)c.restore();drawCanvasKitGridLines(k,c,layer.gridMatte.plan);}
    if(backdropSurface){
     backdropSurface.flush();const completed=backdropSurface.makeImageSnapshot();owned.push(completed);
     const present=new k.Paint();owned.push(present);present.setAlphaf(original.opacity*(original.groupOpacity??1));
     present.setBlendMode(canvasKitBlendMode(k,original.blend));
     if(original.postBlur){const blur=k.ImageFilter.MakeBlur(original.postBlur.x,original.postBlur.y,k.TileMode.Decal,null);if(!blur)throw Error('CanvasKit backdrop post blur unavailable');owned.push(blur);present.setImageFilter(blur);}
     mainCanvas.save();if(!p.projective)canvasKitTransitionViewport(k,mainCanvas,original.transitionViewport,canvasKitBlendMode(k,original.blend),!p.pageTurn);canvasKitClipBoundary(k,mainCanvas,p.boundary);
     const pose=original.group;
     if(pose){mainCanvas.translate(w/2+pose.translateX,h/2+pose.translateY);mainCanvas.rotate(pose.rotateZDeg,0,0);mainCanvas.scale(pose.scale,pose.scale);mainCanvas.translate(-w/2,-h/2);}
     if(original.wipeRight)canvasKitClipWipe(k,mainCanvas,original.wipeRight,w,h);
     if(original.mediaSpiral){mainCanvas.saveLayer(present);mainCanvas.concat([...original.mediaSpiral.matrix]);drawCanvasKitScaledImage(k,mainCanvas,completed,0,0,s);mainCanvas.restore();}else drawCanvasKitScaledImage(k,mainCanvas,completed,0,0,s,present);mainCanvas.restore();
    }
    }finally{for(const resource of owned.splice(actorOwnedStart).reverse())resource.delete();}
    };
    const windowed=p.layer.subjectWindow;
    if(windowed){const windowPaint=new k.Paint();owned.push(windowPaint);windowPaint.setBlendMode(canvasKitBlendMode(k,p.windowBlend));c.saveLayer(windowPaint);}
    if(p.layer.outerSpiral)c.save();if(p.layer.outerSpiral)c.concat([...p.layer.outerSpiral.matrix]);
    if(p.pageTurn)canvasKitDrawPageTurn(k,this.surface,c,p.pageTurn,drawActor,!!p.layer.radial?.edgeBlurSigma&&p.layer.radialBackdrop==='scene',s);else if(p.projective){c.save();canvasKitTransitionViewport(k,c,p.layer.transitionViewport,canvasKitBlendMode(k,p.layer.blend),true);canvasKitDrawProjectiveBoundary(k,this.surface,c,p.projective,w,h,drawActor,s);c.restore();}else if(p.layer.viewportMask)withCanvasKitViewportMask(k,c,viewportMask!,w,h,canvasKitBlendMode(k,p.layer.blend),()=>drawActor(c));else drawActor(c);
    if(p.layer.outerSpiral)c.restore();
    canvasKitDrawBoundaryWash(k,c,p.boundary,w,h);
    if(windowed){applyCanvasKitSubjectWindow(k,c,windowed,w,h);c.restore();}
    if(c.getSaveCount()!==actorSaveCount)throw Error('CanvasKit actor left an unbalanced canvas stack');
    this.surface.flush();
    }finally{
     for(const resource of owned.splice(layerOwnedStart).reverse())resource.delete();
     for(const copy of copies.splice(layerCopiesStart)){copy.width=1;copy.height=1;}
    }
   });
   this.surface.flush();if(this.lost)throw Error('CanvasKit context lost during frame');
   this.output.drawImage(this.stage,0,0);
  }finally{c.restoreToCount(initial);for(const resource of owned.reverse())resource.delete();for(const copy of copies){copy.width=1;copy.height=1;}this.activeBytes=0;}
 }
 close(){if(this.closed)return;this.closed=true;this.colors.close();this.masks.close();this.radialEffects.close();this.stage.removeEventListener('webglcontextlost',this.onLost);this.surface.delete();this.graphics.releaseResourcesAndAbandonContext();this.graphics.delete();this.kit.deleteContext(this.contextHandle);this.stage.width=1;this.stage.height=1;}
}
/** Right-edge write_on wipe in the current (group-local) canvas space. */
function canvasKitClipWipe(k:CanvasKit,c:Canvas,wipeRight:number,w:number,h:number){c.clipRect(k.LTRBRect(0,0,w*(1-wipeRight),h),k.ClipOp.Intersect,true);}
