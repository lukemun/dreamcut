import {currentFrameRate} from '@/lib/timeline/frame-rate-scope';
import {gpuBoundaryVisual} from './boundary-visual';
import type {CompositionElement} from '../render/composition-adapters';
import type {TimelineTransition} from '../../components/studio/timeline/types';
import {resolveTransitionNumber} from '../timeline/transition-controls';
import {COMPOSITION_FPS,toVisualFrame} from '../timeline/frame-quantization';
import {mediaPictureTrimWindow} from '../timeline/media-picture-plan';
import {isPlaybackReversed} from '../timeline/speed-steps';
import {transitionProgress} from '../timeline/transition-frame';
import {deriveTransitionWindow,resolveIncomingTransitionPreroll,resolveSmearTransitionVisualStyle,resolveSlideTransitionVisualStyle,resolveTransitionDirection,resolveWhipTransitionVisualStyle,resolveWhipBlurStrength} from '../timeline/transitions';

/** Incremental admission follows the retained full raw/encoded fixtures. Keep
 * unverified variants explicit until they meet the same conformance gate. */
export function gpuTransitionCapabilityIssue(transition:TimelineTransition|null|undefined):string|null{
  if(!transition||transition.type==='fade')return null;
  if(transition.type==='slide'){
    if((transition.params?.motion==null||transition.params.motion==='travel')
      &&resolveTransitionDirection(transition.params)!=='from-top'
      &&(transition.params?.whip_blur_strength==null||resolveTransitionNumber(transition.params,'params.whip_blur_strength')===0))return null;
    return 'Upward, in-place, blurred and smear slides have not passed GPU verification yet.';
  }
  if(transition.type==='whip'&&transition.params?.motion==='smear'){
    if(resolveTransitionDirection(transition.params)==='from-right'
      &&resolveTransitionNumber(transition.params,'params.smear_zoom_percent')===0
      &&resolveTransitionNumber(transition.params,'params.smear_travel_percent')===100
      &&resolveTransitionNumber(transition.params,'params.whip_blur_strength')===2)return null;
    return 'This smear direction, zoom, travel or blur setting has not passed GPU verification yet.';
  }
  return `${transition.type} transitions have not passed GPU verification yet.`;
}

export function gpuTransitionVisual(element:CompositionElement,frame:number,totalFrames:number,width:number,height:number,phase:'in'|'out'){
  return {...gpuTransitionVisualState(element,frame,totalFrames,width,height,phase),phase};
}
function gpuTransitionVisualState(element:CompositionElement,frame:number,totalFrames:number,width:number,height:number,phase:'in'|'out'){
  const transition=phase==='in'?element.transition_in:element.transition_out;
  const frames=transition?Math.max(1,toVisualFrame(transition.duration_seconds)):0;
  const local=phase==='in'?frame:frame-totalFrames+frames;
  const progress=transitionProgress(local,transition,totalFrames)??0;
  const smear=(transition?.type==='slide'||transition?.type==='whip')&&transition.params?.motion==='smear';
  const identity={scale:1,translateX:0,translateY:0,rotateZDeg:0,width,height};
  if(transition?.type==='page_turn')return {pose:undefined,postBlur:undefined,opacity:1};
  if(transition&&['wipe','cube','film_burn','camera_flash','blackout'].includes(transition.type)){
    const boundary=gpuBoundaryVisual(transition,progress,phase,width,height,element.type)!;
    return {pose:undefined,postBlur:undefined,opacity:boundary.opacity,boundaryClip:boundary.clip,boundaryWash:boundary.wash,boundaryProjective:boundary.projective};
  }
  if(transition?.type==='slide'&&!smear){
    const travel=element.props?.transition_travel_percent;
    const visual=resolveSlideTransitionVisualStyle(progress,phase,resolveTransitionDirection(transition.params),transition.params,typeof travel==='number'&&Number.isFinite(travel)?travel:100);
    return {pose:{...identity,scale:visual.scale,translateX:visual.translateXPercent*width/100,translateY:visual.translateYPercent*height/100},opacity:visual.opacity,cssBlurPx:visual.blurPx,postBlur:visual.blurPx>.01?{x:visual.blurPx,y:visual.blurPx}:undefined};
  }
  if(transition?.type==='whip'&&!smear){
    const direction=resolveTransitionDirection(transition.params),visual=resolveWhipTransitionVisualStyle(progress,phase,direction,resolveWhipBlurStrength(transition.params),transition.params);
    if(visual.rotateYDeg!==0)throw Error('GPU whip requires a projective rotation packet');
    const active=visual.blurPx>(phase==='out'?.001:.01),vertical=direction==='from-top'||direction==='from-bottom',sigma=visual.blurPx*width/1080;
    return {pose:{...identity,scale:visual.scale,translateX:visual.translateXPercent*width/100,translateY:visual.translateYPercent*height/100,rotateZDeg:visual.rotateZDeg},opacity:visual.opacity,cssBlurPx:visual.blurPx,replaceNativeBlur:active,postBlur:active?{x:vertical?2:sigma,y:vertical?sigma:2}:undefined};
  }
  if(!smear)return {pose:phase==='in'?identity:undefined,opacity:phase==='in'&&transition?.type==='fade'?progress:1,postBlur:undefined};
  const visual=resolveSmearTransitionVisualStyle(progress,phase,resolveTransitionDirection(transition.params),transition.params,width);
  const active=phase==='in'?progress>0&&progress<1:Math.sin(Math.PI*progress)>.001;
  return {pose:{...identity,scale:visual.scale,translateX:visual.translateXPercent*width/100,translateY:visual.translateYPercent*height/100},
    opacity:visual.opacity,replaceNativePose:true,replaceNativeBlur:active,postBlur:active?{x:visual.vertical?2:visual.blurPx,y:visual.vertical?visual.blurPx:2}:undefined};
}

/** Incoming overlap has a distinct dependency slot but reuses the source cache.
 * Match the Standard boundary picture: normally frozen head/effects, or moving
 * source preroll for whip smear when sufficient authored source handles exist.
 */
export function gpuTransitionOverlays(elements:CompositionElement[],frame:number,width:number,height:number,fps: number = currentFrameRate()){
  const lanes=new Map<string,CompositionElement[]>();
  for(const element of elements)if(element.type==='video_clip'||element.type==='still'){
    const lane=lanes.get(element.lane_key)??[];lane.push(element);lanes.set(element.lane_key,lane);
  }
  const overlays=[];
  for(const lane of lanes.values()){
    lane.sort((a,b)=>a.timeline_start-b.timeline_start);
    for(let i=0;i<lane.length-1;i++){
      const outgoing=lane[i],incoming=lane[i+1],transition=outgoing.transition_out;
      if(!transition||transition.to_element_id!==incoming.id||!incoming.source_url)continue;
      const window=deriveTransitionWindow(outgoing,transition);
      if(frame<window.startFrame||frame>=window.endFrame)continue;
      const local=frame-window.startFrame;
      const trim=mediaPictureTrimWindow(incoming);
      const reversed=isPlaybackReversed(incoming);
      const preroll=incoming.type==='video_clip'&&!reversed&&transition.type==='whip'&&transition.params?.motion==='smear'
        ?resolveIncomingTransitionPreroll(trim.trimBefore,window.durationFrames,incoming.playback_rate):null;
      const sourceTime=incoming.type==='still'?0:preroll
        ?Math.min(preroll.trimAfter/fps-.00001,(preroll.trimBefore+local*incoming.playback_rate)/fps):(reversed?Math.max(0,trim.sourceEndFrame-1):trim.trimBefore)/fps;
      const effectTime=incoming.type==='still'||preroll?local/fps:0;
      overlays.push({element:{...incoming,id:`@gpu-transition:${transition.id}`,transition_in:transition},
        // Standard's boundary viewport (transition_clip_to_media_bounds) rests at the head pose.
        localFrame:local,effectTime,viewportTime:0,sourceTime,visual:gpuTransitionVisual({...incoming,transition_in:transition},local,window.durationFrames,width,height,'in')});
      if(transition.type==='page_turn'){
        const outgoingTrim=mediaPictureTrimWindow(outgoing);
        const progress=transitionProgress(local,transition,window.durationFrames)??0;
        const pageTurn=gpuBoundaryVisual(transition,progress,'out',width,height,outgoing.type)!.pageTurn!;
        overlays.push({element:{...outgoing,id:`@gpu-page-tail:${transition.id}`},localFrame:local,
          effectTime:outgoing.type==='still'?local/fps:0,viewportTime:Math.max(0,outgoing.duration),sourceTime:outgoing.type==='still'?0:(isPlaybackReversed(outgoing)?outgoingTrim.trimBefore:Math.max(0,outgoingTrim.sourceEndFrame-1))/fps,
          visual:{phase:'out' as const,pose:undefined,postBlur:undefined,opacity:1,boundaryPageTurn:{plan:pageTurn,width,height}}});
      }
    }
  }
  return overlays;
}
