import {originalMediaSampleUs,previewMatchedSourceSampleUs} from '@/lib/timeline/source-sampling';
import type {CaptionElementProps} from '../timeline/captions';
import {mediaTextImagePhase,mediaTextImageMotion,mediaTextVideoClock} from '../timeline/media-text-fill';

/** Shared image/video dependencies for media-filled text. Video source admission
 * additionally requires the same verified preview authority as picture layers. */
export function gpuCaptionFillPlan(text:CaptionElementProps,frame:number,fps:number,timelineStart:number,rendering=false){
 if(text.styleVariant!=='image_fill')return undefined;
 const handwriting=text.animationIn==='handwriting'||text.animationOut==='handwriting'||text.animationIn==='write_on';
 // Moving video fills handwriting strokes and ordinary block glyphs alike: the caption raster is the mask.
 if(text.mediaFillVideoUrl){
  const clock=mediaTextVideoClock(frame,fps,text.mediaFillScene?Math.max(0,timelineStart-text.mediaFillScene.startSeconds):0,text.mediaFillVideoPlaybackRate);
  // Preserve Standard preview authority: an absent prepared video is not
  // permission to decode the export original instead.
  // Export decodes the original, so it samples where the preview proxy's frame came from;
  // preview samples its proxy inside the same slot (see gpuSourceSampleUs).
  return {kind:'video' as const,url:rendering?text.mediaFillVideoUrl:text.mediaFillVideoPreviewUrl,sourceTimeSeconds:clock.sourceTimeSeconds,
   timeUs:rendering?originalMediaSampleUs(clock.sourceTimeSeconds,fps,fps):previewMatchedSourceSampleUs(clock.sourceTimeSeconds,fps),scene:text.mediaFillScene};
 }
 const phase=mediaTextImagePhase(text.mediaFillUrls.length,frame/fps,text.mediaFillSecondsPerImage,text.mediaFillCrossfadeSeconds);
 if(!phase)return undefined;
 const motion=mediaTextImageMotion(phase,text.mediaFillScale,text.mediaFillPanPercent,handwriting?'handwriting':'background');
 const layers=[{url:text.mediaFillUrls[phase.currentIndex]!,opacity:motion.currentOpacity,positionX:motion.positionX}];
 if(motion.nextOpacity>0&&(!handwriting||text.mediaFillUrls.length>1))layers.push({url:text.mediaFillUrls[phase.nextIndex]!,opacity:motion.nextOpacity,positionX:motion.nextPositionX});
 // Key actual visual dependencies, not an advancing clock that may produce
 // identical pixels (for example one handwriting image at scale 1).
 return {kind:'images' as const,mode:handwriting?'handwriting' as const:'background' as const,layers,scale:motion.scale};
}
