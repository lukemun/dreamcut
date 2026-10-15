import {gpuMediaShadow} from './media-shadow';
import {canvasKitContour} from './canvaskit-actor-filter';
import {gpuSpiralTransform} from './spiral-transform';
import type {GpuCaptionFill} from './canvaskit-caption-fill';
import {gpuTickerWidth} from './text-bounds';
import {captionTickerTranslation} from '../timeline/caption-special-motion';
import {resolveTransitionViewportRect,transitionViewportBoxShadow} from '../timeline/transition-viewport';
import {captionPlaneTransform,projectCaptionPlanePoint} from '../timeline/caption-plane-transform';
import {gpuCaptionBlend} from './caption-surface';
import {gpuMediaBoundaryAnimation} from './media-boundary-animation';
import {canvasKitBackdropScope,canvasKitBackdropAncestor} from './canvaskit-backdrop';
import {gpuMediaAnimationDraw} from './media-animation-draw';
import {canvasKitRadialPlan} from './canvaskit-radial-effects';
import {canvasKitGridMattePlan} from './canvaskit-grid-matte';
import type {GpuGridMatteResource,GpuSubjectWindowResource} from './grid-matte-assets';
import {resolveMediaBlendMode} from '../timeline/media-blend';
import {resolveColorGradeLutAtTime} from '../timeline/cube-lut';
import type {GpuLutTexture} from './lut-textures';
import {gpuFeatherMask,gpuRotatedLineMask} from './feather-mask';
import {resolveMediaEffectAtTime,readLineMaskRotation} from '../timeline/media-transform';
import {resolveStickerOutline} from '../timeline/sticker-outline';
import {gpuOutlineLayerDraw} from './outline-pass';
import {resolveSubjectGlow} from '../timeline/subject-glow';
import {gpuTextBounds,gpuTextAnchor,gpuTextFillRegions,gpuTextRasterScale} from './text-bounds';
import {projectSourceToComposition,resolveCompositionTransformLayout} from '../timeline/source-projection';
import {rectToGpuTransform,quadToGpuTransform,orientedRectToGpuTransform} from './geometry';
import {resolveSourceOrientation} from '../timeline/resolved-media-scene';
import {resolveWindowOpening,resolveTransitionEffects} from '../timeline/transition-effects';
import {quantizeVisualFrameSpan} from '../timeline/frame-quantization';
import {resolveChromaKeyAtTime} from '../timeline/chroma-key';
import {resolveGradientMapAtTime} from '../timeline/gradient-map';
import {resolveGlitchAtTime,glitchPlan} from '../timeline/glitch';
import {buildColorGradeFilterDescriptor,resolveColorGradeAtTime,hasColorGradeData} from '../timeline/color-grade';
import {recolorMatrix,resolveRecolor} from '../timeline/recolor';
import {gpuTextQuad,type GpuScene,type GpuRasterTextLayer} from './scene';
import type {CachedFrame} from './frame-store';
import type {GpuVideoDraw} from './compositor';

/** Ordinary seeks reuse glyph pixels. Handwriting additionally keys its reveal phase;
 * letter fall keys its shared fall clock, constant before release and after settling. */
export function gpuTextTextureKey(layer:GpuRasterTextLayer,fontIdentity:string){
  return JSON.stringify([fontIdentity,layer.kind,layer.planeWidth,layer.planeHeight,layer.kind==='text'?layer.rasterScale:undefined,layer.text,layer.kind==='caption'?[layer.sourceAspectRatio??null,layer.text.styleVariant==='camera_reveal'?[layer.rasterFrame,layer.fps]:undefined,layer.specialMotion?.kind==='scan'?{kind:'scan',height:layer.specialMotion.height,width:layer.specialMotion.width}:layer.specialMotion?.kind,layer.speechPhase,layer.benchmark,layer.handwritingProgress,layer.wordProgress,layer.typedCharacters,layer.revealProgress,layer.inverseProgress,layer.letterFallElapsed,layer.motionLayer,layer.fill?.kind==='video'?{kind:'video-mask',scene:layer.fill.scene}:layer.fill]:undefined]);
}

/** The same element-local clock as keyframes; Standard's GlitchFilter draws this plan too. */
function gpuGlitchPlan(props:Record<string,unknown>|null|undefined,time:number,width:number,height:number){
  const glitch=resolveGlitchAtTime(props,time);
  return glitch?glitchPlan(glitch,width,height):undefined;
}

/** Build every draw before submitting any GPU commands. Missing dependencies throw;
 * the caller retains the previous complete frame and keeps transport unready.
 */
export function gpuSceneDraws(scene:GpuScene,frames:ReadonlyMap<string,Readonly<CachedFrame<VideoFrame>>>,
  textTexture:(layer:GpuRasterTextLayer)=>OffscreenCanvas|undefined,lutTexture?:(id:string)=>GpuLutTexture|undefined,gridResource?:(id:string)=>GpuGridMatteResource|undefined,maskResource?:(id:string)=>OffscreenCanvas|undefined,windowResource?:(id:string)=>GpuSubjectWindowResource|undefined):GpuVideoDraw[]{
  const draws:GpuVideoDraw[]=[];
  for(const layer of scene.layers){
    if(layer.kind==='video'){
      const decoded=frames.get(layer.element.id);
      if(!decoded||decoded.sourceKey!==layer.source.key||layer.timeUs<decoded.timestampUs||layer.timeUs>=decoded.timestampUs+decoded.durationUs)throw Error('GPU scene packet is missing its exact source frame');
      const frame=decoded.value;
      const geometry={composition_width:scene.width,composition_height:scene.height,
        media_scale:layer.transform.scale,media_offset_x:layer.transform.offsetX,media_offset_y:layer.transform.offsetY,mask_inset:layer.mask};
      const projection=projectSourceToComposition({...geometry,source_width:frame.displayWidth,source_height:frame.displayHeight,
        fit:'contain',timeline_time_seconds:0,timeline_start_seconds:0});
      const transform=orientedRectToGpuTransform(projection.transformed_rect,scene.width,scene.height,resolveSourceOrientation(layer.element.props));
      if(!transform)continue;
      const r=resolveCompositionTransformLayout(geometry).mask_rect;
      // CSS overflow clipping covers the outward-rounded device-pixel bounds.
      const span=quantizeVisualFrameSpan(layer.element.timeline_start,layer.element.duration,{fps:scene.fps});
      const effectTime=layer.effectTime??(scene.frame-span.startFrame)/scene.fps;
      const lut=resolveColorGradeLutAtTime(layer.element.props,effectTime);
      const lutResource=lut?lutTexture?.(layer.element.id):undefined;
      if(lut&&!lutResource)throw Error("GPU scene packet is missing its LUT");
      const window=resolveWindowOpening(layer.element.props,effectTime,scene);
      const effects=resolveTransitionEffects(layer.element.props,effectTime,scene);
      const radial=canvasKitRadialPlan(effects,scene.width,scene.height);
      const gridPlan=canvasKitGridMattePlan(layer.element.props,layer.sourceTimeSeconds,scene.width,scene.height);
      const gridMatte=gridPlan?gridResource?.(layer.element.id):undefined;
      if(gridPlan&&(!gridMatte||JSON.stringify(gridMatte.plan)!==JSON.stringify(gridPlan)))throw Error('GPU scene packet is missing its exact grid matte');
      const windowPlan=layer.subjectWindow,windowAsset=windowPlan?.url?windowResource?.(layer.element.id):undefined;
      if(windowPlan?.url&&(!windowAsset||JSON.stringify(windowAsset.plan)!==JSON.stringify(windowPlan)))throw Error('GPU scene packet is missing its exact subject window');
      const subjectWindow=windowPlan?{plan:windowPlan,alpha:windowAsset?.alpha??null}:undefined;
      const radius=resolveStickerOutline(layer.element.props,effectTime)*scene.width/1080*layer.transform.scale;
      const color=String(layer.element.props?.sticker_outline_color??'#ffffff');
      const subject=resolveSubjectGlow(layer.element.props,effectTime);
      const nativeAnimation=gpuMediaAnimationDraw(layer.animation,scene.width,scene.height);
      const wrapperAnimation=gpuMediaBoundaryAnimation(nativeAnimation,layer.transition);
      // Review matte replaces the picture's CSS filter, so Standard drops its drop shadow too.
      const viewport=resolveTransitionViewportRect(layer.element.props,layer.viewportTime??effectTime,scene.width,scene.height);
      const matte=layer.element.type==='video_clip'&&(layer.element.props?.cutout_review_mode==='matte'||layer.element.props?.chroma_key_review_mode==='matte');
      draws.push({frame,transform,...(matte?{matte}:{shadow:gpuMediaShadow(layer.element.props,layer.transform.scale)}),...(viewport?{transitionViewport:{rect:viewport,shadow:transitionViewportBoxShadow(layer.element.props)}}:{}),contour:canvasKitContour(layer.element.props,effectTime),...(layer.element.type==='still'&&layer.element.props?.image_rendering==='pixelated'?{pixelated:true}:{}),mediaSpiral:gpuSpiralTransform(layer.element.props?.spiral_group,effectTime,scene.width,scene.height),boundaryPageTurn:layer.transition?.boundaryPageTurn,boundaryProjective:layer.transition?.boundaryProjective,boundaryClip:layer.transition?.boundaryClip,boundaryWash:layer.transition?.boundaryWash,...(radial.iris||radial.edgeBlurSigma>0?{radial,radialBackdrop:canvasKitBackdropScope(layer.element.props,effectTime,scene,canvasKitBackdropAncestor({grid:!!gridMatte||!!subjectWindow,animationOpacity:layer.animation.opacity,animationBlur:!!nativeAnimation.postBlur,animationClip:!!nativeAnimation.wipeRight,blend:resolveMediaBlendMode(layer.element.props?.media_blend_mode),spiral:!!layer.element.props?.spiral_group,transition:layer.transition?{type:(layer.transition.phase==='in'?layer.element.transition_in:layer.element.transition_out)?.type??'unknown',opacity:layer.transition.opacity??1,filtered:!!layer.transition.postBlur,clipped:!!layer.transition.boundaryClip}:undefined}))}:{}),...(gridMatte?{gridMatte}:{}),...(subjectWindow?{subjectWindow}:{}),blend:resolveMediaBlendMode(layer.element.props?.media_blend_mode),lut:lut&&lutResource?{...lutResource,intensity:lut.intensity}:undefined,featherMask:gpuFeatherMask(layer.mask,resolveMediaEffectAtTime(layer.element.props,effectTime).maskFeather,scene.height),glow:subject.strength>0?{strength:subject.strength,radius:subject.radius*scene.width/1080*layer.transform.scale}:undefined,outline:radius>0?{radius,softness:.6*scene.width/1080*layer.transform.scale,color:[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)/255) as [number,number,number]}:undefined,flash:subject.flash,postBlur:wrapperAnimation.postBlur,group:wrapperAnimation.group,...(nativeAnimation.wipeRight?{wipeRight:nativeAnimation.wipeRight}:{}),blur:{x:Math.hypot(effects.blurX,effects.blur*scene.width/1080),y:Math.hypot(effects.blurY,effects.blur*scene.width/1080)},opacity:layer.opacity,groupOpacity:layer.animation.opacity*(layer.transition?.opacity??1),gradientMap:resolveGradientMapAtTime(layer.element.props,effectTime)??undefined,glitch:gpuGlitchPlan(layer.element.props,effectTime,scene.width,scene.height),chroma:resolveChromaKeyAtTime(layer.element.props,effectTime),grade:buildColorGradeFilterDescriptor(resolveColorGradeAtTime(layer.element.props,effectTime),{includeIdentity:!!lut||hasColorGradeData(layer.element.props)}),recolor:recolorMatrix(resolveRecolor(layer.element.props)),window:window.active?window:undefined,clip:[Math.floor(r.x),Math.floor(r.y),Math.ceil(r.x+r.width),Math.ceil(r.y+r.height)]});
      const lineMask=gpuRotatedLineMask(layer.mask,resolveMediaEffectAtTime(layer.element.props,effectTime).maskFeather,readLineMaskRotation(layer.element.props),scene.width,scene.height);
      if(lineMask){const draw=draws.at(-1)!;draw.lineMask=lineMask;draw.featherMask=undefined;draw.clip=[0,0,scene.width,scene.height];}
      // Outline layer: its prepared silhouette, dilated in composition pixels and
      // flooded with the outline color, replaces the picture. Standard's outline
      // branch skips the chroma keyer; wrapper effects still apply to the result.
      if(layer.source.kind==='image'&&layer.element.type==='video_clip'&&typeof layer.element.props?.outline_parent_id==='string'){const draw=draws.at(-1)!;draw.outline=gpuOutlineLayerDraw(layer.element.props,layer.transform.scale);draw.chroma=undefined;}
    }else if(layer.kind==='caption'){
      const outerSpiral=gpuSpiralTransform(layer.element.props?.spiral_group,layer.rasterFrame/layer.fps,scene.width,scene.height);
      const frame=textTexture(layer);
      if(!frame)throw Error('GPU caption layout is not ready');
      const bounds=gpuTextBounds(frame,scene.width,scene.height);
      if(layer.specialMotion?.kind==='scan'){draws.push({frame,outerSpiral,transform:rectToGpuTransform({...bounds,y:bounds.y+(layer.specialMotion.y-.5)*scene.height},scene.width,scene.height)!,opacity:1,textureVersion:frame});continue;}
      const viewportMask=layer.viewportMaskUrl&&layer.text.styleVariant!=='camera_reveal'?maskResource?.(layer.element.id):undefined;
      if(layer.viewportMaskUrl&&layer.text.styleVariant!=='camera_reveal'&&!viewportMask)throw Error('Caption viewport mask is not ready');
      let sourceFrame:VideoFrame|OffscreenCanvas=frame;
      let captionFill:GpuCaptionFill|undefined;
      let translation=layer.translation;
      if(layer.specialMotion?.kind==='ticker'){const width=gpuTickerWidth(frame);if(width===undefined)throw Error('Ticker layout width is unavailable');translation={x:captionTickerTranslation(layer.specialMotion.progress,scene.width,width),y:translation?.y??0};}
      if(layer.fill?.kind==='video'){
        const fill=layer.fill,decoded=frames.get(layer.element.id),timeUs=fill.timeUs;
        if(!decoded||timeUs<decoded.timestampUs||timeUs>=decoded.timestampUs+decoded.durationUs)throw Error('GPU caption is missing its exact video frame');
        const localAssembly=layer.text.surfaceMode==='wall'||layer.specialMotion?.kind==='ticker';
        const fillTranslation=localAssembly?undefined:translation;
        const regions=gpuTextFillRegions(frame)?.map(box=>{
          const scale=Math.max(box.width/decoded.value.displayWidth,box.height/decoded.value.displayHeight);
          const width=decoded.value.displayWidth*scale,height=decoded.value.displayHeight*scale;
          const x=box.x+(fillTranslation?.x??0),y=box.y+(fillTranslation?.y??0);
          return {rect:fill.scene?box.videoRect:{x:x+(box.width-width)/2,y:y+(box.height-height)/2,width,height},clip:[Math.floor(x),Math.floor(y),Math.ceil(x+box.width),Math.ceil(y+box.height)] as const};
        });
        if(!regions?.length)throw Error('GPU video fill is missing its shared text layout');
        if(localAssembly){sourceFrame=decoded.value;captionFill={mask:frame,bounds,regions};}
        else {for(const {rect,clip} of regions)draws.push({frame:decoded.value,outerSpiral,viewportMask,transform:rectToGpuTransform(rect,scene.width,scene.height)!,opacity:layer.opacity??1,clip,
          captionMask:{canvas:frame,mapping:[rect.width/bounds.width,rect.height/bounds.height,(rect.x-bounds.x-(translation?.x??0))/bounds.width,(rect.y-bounds.y-(translation?.y??0))/bounds.height]}});
        continue;}
      }
      if(layer.specialMotion?.kind!=='ticker'&&layer.text.surfaceMode==='wall'&&layer.text.styleVariant!=='camera_reveal'){
       const anchor=gpuTextAnchor(frame);if(!anchor)throw Error('GPU wall caption anchor is not ready');
       const plane=captionPlaneTransform(layer.text,layer.scale??1,layer.rotateZDeg??0);
       // One complete local caption wrapper: glyph clip and blur before its
       // perspective, then opacity/blend against the destination scene.
       const quad=([[0,0],[scene.width,0],[scene.width,scene.height],[0,scene.height]] as const).map(point=>projectCaptionPlanePoint(plane,point,anchor,[translation?.x??0,translation?.y??0])) as import('../timeline/surface-track').SurfaceQuad;
       const captionPlane=quadToGpuTransform(quad,scene.width,scene.height);if(!captionPlane)throw Error('Degenerate caption plane');
       const blur=(layer.blurPx??0)+layer.text.surfaceBlurPx;
       draws.push({frame:sourceFrame,captionFill,outerSpiral,viewportMask,transform:rectToGpuTransform(bounds,scene.width,scene.height)!,captionPlane,blend:gpuCaptionBlend(layer.text),postBlur:blur>0?{x:blur,y:blur}:undefined,opacity:(layer.opacity??1)*layer.text.surfaceOpacity,textureVersion:captionFill?undefined:frame});
       continue;
      }
      let group:GpuVideoDraw['group'];
      let transform=rectToGpuTransform({...bounds,x:bounds.x+(translation?.x??0),y:bounds.y+(translation?.y??0)},scene.width,scene.height)!;
      if(layer.blurPx||(layer.scale??1)!==1||(layer.rotateZDeg??0)!==0){
       const anchor=gpuTextAnchor(frame);if(!anchor)throw Error('GPU caption transform anchor is not ready');
       const angle=(layer.rotateZDeg??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),scale=layer.scale??1;
       if(layer.blurPx){
        // CSS filters precede the actor transform and opacity. Keep the blur
        // in neutral glyph pixels, then transform the complete filtered actor.
        const dx=anchor[0]-scene.width/2,dy=anchor[1]-scene.height/2;
        group={width:scene.width,height:scene.height,scale,rotateZDeg:layer.rotateZDeg??0,translateX:(translation?.x??0)+dx-scale*(c*dx-s*dy),translateY:(translation?.y??0)+dy-scale*(s*dx+c*dy)};
        transform=rectToGpuTransform(bounds,scene.width,scene.height)!;
       }else{
       const quad=[[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y],[bounds.x+bounds.width,bounds.y+bounds.height],[bounds.x,bounds.y+bounds.height]].map(([x,y])=>{
        const dx=(x-anchor[0])*scale,dy=(y-anchor[1])*scale;
        return [anchor[0]+c*dx-s*dy+(translation?.x??0),anchor[1]+s*dx+c*dy+(translation?.y??0)];
       }) as import('../timeline/surface-track').SurfaceQuad;
       transform=quadToGpuTransform(quad,scene.width,scene.height)!;
       }
      }
      draws.push({frame:sourceFrame,captionFill,outerSpiral,viewportMask,transform,blend:gpuCaptionBlend(layer.text),group,postBlur:layer.blurPx?{x:layer.blurPx,y:layer.blurPx}:undefined,opacity:layer.blurPx?1:(layer.opacity??1),groupOpacity:layer.blurPx?(layer.opacity??1):undefined,textureVersion:captionFill?undefined:frame});
    }else{
      const parent=frames.get(layer.parent.id);
      if(!parent)throw Error('GPU text is missing its parent frame');
      // A still has no presented source clock; Standard samples the track on the parent's timeline clock.
      const quad=gpuTextQuad(scene,layer,layer.parent.type==='still'?undefined:parent.timestampUs/1e6);
      if(!quad)continue;
      const frame=textTexture(layer);
      if(!frame)throw Error('GPU text layout is not ready');
      const rasterScale=gpuTextRasterScale(frame)??layer.rasterScale;
      const transform=quadToGpuTransform(quad,scene.width,scene.height,[frame.width/(layer.planeWidth*rasterScale),frame.height/(layer.planeHeight*rasterScale)]);
      if(!transform)continue;
      // TrackedSurfaceText uses surfaceTextLayout, without ordinary caption style effects.
      draws.push({frame,transform,blend:'normal',opacity:1,textureVersion:frame});
    }
  }
  return draws;
}
